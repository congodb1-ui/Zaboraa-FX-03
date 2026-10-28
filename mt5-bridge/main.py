"""Zaboraa FX MT5 bridge (v4.1 draft: real MT5 behaviour, no mock data).

Design rules
- No invented data. If MT5 is unavailable the bridge answers HTTP 503 with a JSON error.
- /kill really closes positions, removes pending orders, then re-reads MT5 before it
  reports allFlat true.
- Account type is UNKNOWN (never DEMO) unless MT5 says so.
- Broker server time is converted to UTC using a measured offset (or BROKER_UTC_OFFSET_HOURS).
Status: CHANGED-UNRUN until the owner runs pytest and the demo checks.
"""
import os
import hmac
import time
import re
import threading
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

BRIDGE_TOKEN = os.getenv("BRIDGE_TOKEN", "")
if not BRIDGE_TOKEN or len(BRIDGE_TOKEN) < 24:
    raise RuntimeError("BRIDGE_TOKEN missing or shorter than 24 characters in bridge .env")

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]

try:
    import MetaTrader5 as mt5
except ImportError:
    mt5 = None  # tests replace this with a fake module


def _env_bool(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


kill_engaged = False
allow_trading_env = _env_bool("ALLOW_TRADING")
allow_live_env = _env_bool("ALLOW_LIVE")
DEFAULT_DEVIATION = int(os.getenv("ORDER_DEVIATION_POINTS", "20"))
OFFSET_REFERENCE_SYMBOLS = [s.strip() for s in os.getenv("OFFSET_REFERENCE_SYMBOLS", "XAUUSDm,EURUSDm,EURUSD,XAUUSD").split(",") if s.strip()]

# MT5 retcodes used here (numeric so tests do not depend on the real package)
RET_DONE = 10009
RET_PLACED = 10008
RET_PARTIAL = 10010
RET_REQUOTE = 10004
RET_PRICE_CHANGED = 10020
RET_OFF_QUOTES = 10021
RET_INVALID_FILL = 10030
RETRYABLE = {RET_REQUOTE, RET_PRICE_CHANGED, RET_OFF_QUOTES}

mt5_lock = threading.RLock()  # the MT5 Python API is not safe for concurrent trading calls
_last_connect_attempt = 0.0


def connect_mt5(force: bool = False) -> bool:
    """Attach to the running terminal. Throttled to one attempt per 5 s unless forced."""
    global _last_connect_attempt
    if mt5 is None:
        return False
    now = time.time()
    if not force and now - _last_connect_attempt < 5:
        return False
    _last_connect_attempt = now
    kwargs = {}
    path = os.getenv("MT5_PATH")
    if path:
        kwargs["path"] = path
    login, password, server = os.getenv("MT5_LOGIN"), os.getenv("MT5_PASSWORD"), os.getenv("MT5_SERVER")
    if login and password and server:
        try:
            kwargs.update(login=int(login), password=password, server=server)
        except ValueError:
            pass
    try:
        ok = bool(mt5.initialize(**kwargs))
    except Exception:
        ok = False
    if not ok:
        try:
            print(f"MT5 initialize() failed, error = {mt5.last_error()}")
        except Exception:
            print("MT5 initialize() failed")
    return ok


@asynccontextmanager
async def lifespan(app: FastAPI):
    if mt5 is None:
        print("MetaTrader5 package not installed: the bridge will answer 503 for market data and trading.")
    else:
        connect_mt5(force=True)
    yield
    if mt5 is not None:
        try:
            mt5.shutdown()
        except Exception:
            pass


app = FastAPI(title="Zaboraa FX MT5 Bridge", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def verify_token(authorization: Optional[str] = Header(None)):
    token_to_check = None
    if authorization and authorization.startswith("Bearer "):
        token_to_check = authorization[7:]
    if not token_to_check or not hmac.compare_digest(token_to_check.encode("utf-8"), BRIDGE_TOKEN.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Invalid or missing Bearer token"},
        )
    return True


SYMBOL_REGEX = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_symbol(symbol: str):
    # D34: the regex alone accepts "." and ".."; reject those, leading dots and long values too.
    if (not symbol or len(symbol) > 32 or symbol.startswith(".") or not SYMBOL_REGEX.match(symbol)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_SYMBOL", "message": "Invalid symbol format or forbidden characters"},
        )
    return symbol


def get_account_type_str(trade_mode) -> str:
    """DEMO, CONTEST, REAL, or UNKNOWN. Never guesses DEMO."""
    if mt5 is None or trade_mode is None:
        return "UNKNOWN"
    # MT5 values: DEMO 0, CONTEST 1, REAL 2 (the old fallbacks had CONTEST and REAL swapped)
    if trade_mode == getattr(mt5, "ACCOUNT_TRADE_MODE_DEMO", 0):
        return "DEMO"
    if trade_mode == getattr(mt5, "ACCOUNT_TRADE_MODE_CONTEST", 1):
        return "CONTEST"
    if trade_mode == getattr(mt5, "ACCOUNT_TRADE_MODE_REAL", 2):
        return "REAL"
    return "UNKNOWN"


def mt5_ready(retry: bool = True) -> bool:
    if mt5 is None:
        return False
    try:
        def ok() -> bool:
            ti = mt5.terminal_info()
            return ti is not None and bool(getattr(ti, "connected", True)) and mt5.account_info() is not None
        if ok():
            return True
        if retry and connect_mt5():
            return ok()
        return False
    except Exception:
        return False


def require_mt5():
    if not mt5_ready():
        raise HTTPException(
            status_code=503,
            detail={"error": "MT5_DISCONNECTED", "message": "MetaTrader 5 is not installed, not running, not logged in or not connected"},
        )


# ---------- broker time offset (D32) ----------
_offset_state = {"hours": None, "measured_at": 0.0}


def _offset_override() -> Optional[int]:
    raw = os.getenv("BROKER_UTC_OFFSET_HOURS", "").strip()
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


def note_tick_time(tick_time: int):
    """A fresh tick has broker time = UTC + offset. Accept only if it lines up with a whole hour."""
    now = time.time()
    diff = tick_time - now
    cand = round(diff / 3600)
    if -12 <= cand <= 14 and abs(diff - cand * 3600) <= 120:
        _offset_state["hours"] = int(cand)
        _offset_state["measured_at"] = now


def get_broker_offset() -> Optional[int]:
    override = _offset_override()
    return override if override is not None else _offset_state["hours"]


def refresh_offset():
    if _offset_override() is not None or time.time() - _offset_state["measured_at"] < 3600:
        return
    for sym in OFFSET_REFERENCE_SYMBOLS:
        try:
            if mt5.symbol_select(sym, True):
                tick = mt5.symbol_info_tick(sym)
                if tick is not None:
                    note_tick_time(int(tick.time))
                    if _offset_state["measured_at"] and time.time() - _offset_state["measured_at"] < 5:
                        return
        except Exception:
            continue


# ---------- read endpoints ----------
@app.get("/health")
def health_check(authorized: bool = Depends(verify_token)):
    connected = mt5_ready()
    ti = mt5.terminal_info() if connected else None
    acc = mt5.account_info() if connected else None
    acc_type = get_account_type_str(acc.trade_mode) if acc is not None else "UNKNOWN"
    if connected:
        refresh_offset()
    return {
        "status": "ok",
        "mt5_package_installed": mt5 is not None,
        "terminal_running": ti is not None,
        "mt5_initialized": ti is not None,
        "broker_connected": connected,
        "algo_trading_enabled": bool(getattr(ti, "trade_allowed", False)) if ti is not None else False,
        "server_name": acc.server if acc is not None else "",
        "account_type": acc_type,
        "is_demo": acc_type == "DEMO",
        "trade_mode": acc.trade_mode if acc is not None else -1,  # -1 = unknown
        "login": acc.login if acc is not None else 0,
        "broker_utc_offset_hours": get_broker_offset(),  # null until measured or set by env
        "allow_trading": allow_trading_env and not kill_engaged,
        "kill_engaged": kill_engaged,
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@app.get("/account")
def get_account(authorized: bool = Depends(verify_token)):
    require_mt5()
    acc = mt5.account_info()
    acc_type = get_account_type_str(acc.trade_mode)
    return {
        "login": acc.login,
        "server": acc.server,
        "account_type": acc_type,
        "is_demo": acc_type == "DEMO",
        "trade_mode": acc.trade_mode,
        "balance": acc.balance,
        "equity": acc.equity,
        "margin": acc.margin,
        "free_margin": acc.margin_free,
        "leverage": acc.leverage,
        "currency": acc.currency,
        "utc_offset_hours": get_broker_offset(),
        "status": "ok",
    }


@app.get("/symbols")
def get_symbols(authorized: bool = Depends(verify_token)):
    require_mt5()
    symbols = mt5.symbols_get()
    if symbols is None:
        raise HTTPException(status_code=502, detail={"error": "MT5_ERROR", "message": str(mt5.last_error())})
    return [{"symbol": s.name, "symbol_broker": s.name, "digits": s.digits, "point": s.point, "spread": s.spread} for s in symbols]


@app.get("/tick")
def get_tick(symbol: str = "EURUSD", authorized: bool = Depends(verify_token)):
    validate_symbol(symbol)
    require_mt5()
    if not mt5.symbol_select(symbol, True):
        raise HTTPException(status_code=404, detail={"error": "SYMBOL_NOT_FOUND", "message": f"Symbol not available on this broker: {symbol}"})
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(status_code=404, detail={"error": "NO_TICK", "message": f"No tick available for {symbol}"})
    info = mt5.symbol_info(symbol)
    note_tick_time(int(tick.time))
    offset = get_broker_offset()
    # "time" is UTC epoch seconds so the portal can compute tick age; null when the offset is unknown
    # (the portal then treats the market as closed, which is the safe reading).
    time_utc = int(tick.time) - offset * 3600 if offset is not None else None
    return {
        "symbol": symbol,
        "bid": tick.bid,
        "ask": tick.ask,
        "last": tick.last,
        "volume": tick.volume,
        "time": time_utc,
        "time_broker": int(tick.time),
        "utc_offset_hours": offset,
        "spread": info.spread if info is not None else None,
    }


TIMEFRAME_DEFAULTS = {"M1": 1, "M5": 5, "M10": 10, "M15": 15, "M30": 30, "H1": 16385, "H3": 16387, "D1": 16408}


@app.get("/candles")
def get_candles(symbol: str = "EURUSD", timeframe: str = "H1", count: int = 500,
                date_from: str | None = None, date_to: str | None = None,
                authorized: bool = Depends(verify_token)):
    validate_symbol(symbol)
    if timeframe not in TIMEFRAME_DEFAULTS:
        raise HTTPException(status_code=400, detail={"error": "INVALID_TIMEFRAME", "message": f"Unsupported timeframe: {timeframe}"})
    if count < 1 or count > 100000:
        raise HTTPException(status_code=400, detail={"error": "INVALID_COUNT", "message": "count must be between 1 and 100000"})
    require_mt5()
    tf_val = getattr(mt5, f"TIMEFRAME_{timeframe}", TIMEFRAME_DEFAULTS[timeframe])
    if not mt5.symbol_select(symbol, True):
        raise HTTPException(status_code=404, detail={"error": "SYMBOL_NOT_FOUND", "message": f"Symbol not available on this broker: {symbol}"})
    # Exclude position 0: it is the currently-forming candle and must never be persisted.
    if date_from or date_to:
        try:
            start = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc) if date_from else datetime(2000, 1, 1, tzinfo=timezone.utc)
            end = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) if date_to else datetime.now(timezone.utc)
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": "INVALID_DATE_RANGE"})
        rates = mt5.copy_rates_range(symbol, tf_val, start, end)
        if rates is not None and len(rates) > count:
            rates = rates[-count:]
    else:
        rates = mt5.copy_rates_from_pos(symbol, tf_val, 1, count)
    if rates is None or len(rates) == 0:
        # A date-bounded history page can legitimately be empty when MT5 has no
        # older bars available. Return an empty page so the bulk downloader can
        # stop pagination cleanly instead of treating normal end-of-history as
        # a gateway failure. Keep the existing error for a non-range/latest-bars
        # request, where an empty response usually indicates a retrieval problem.
        if date_from or date_to:
            offset = get_broker_offset()
            return {
                "symbol": symbol,
                "timeframe": timeframe,
                "count": 0,
                "utc_offset_hours": offset,
                "utc_offset_measured": offset is not None,
                "time_basis": "broker",
                "earliest_available": None,
                "candles": [],
            }
        # never invent bars (D33)
        raise HTTPException(status_code=502, detail={"error": "NO_DATA", "message": f"MT5 returned no candles: {mt5.last_error()}"})
    candles = [
        {
            "time": int(r["time"]),  # broker server time as epoch seconds (not UTC)
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "tick_volume": int(r["tick_volume"]),
            "spread": int(r["spread"]),
        }
        for r in rates
    ]
    offset = get_broker_offset()
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "count": len(candles),
        "utc_offset_hours": offset,
        "utc_offset_measured": offset is not None,
        "time_basis": "broker",
        "earliest_available": candles[0]["time"] if candles else None,
        "candles": candles,
    }


def _position_dict(p) -> dict:
    buy = p.type == getattr(mt5, "POSITION_TYPE_BUY", 0)
    return {
        "ticket": p.ticket,
        "time": p.time,
        "type": p.type,
        "side": "BUY" if buy else "SELL",
        "magic": p.magic,
        "volume": p.volume,
        "price_open": p.price_open,
        "sl": p.sl,
        "tp": p.tp,
        "price_current": p.price_current,
        "swap": p.swap,
        "profit": p.profit,
        "symbol": p.symbol,
        "comment": p.comment,
    }


@app.get("/positions")
def get_positions(authorized: bool = Depends(verify_token)):
    require_mt5()  # an unreachable MT5 must never look like "no positions"
    positions = mt5.positions_get()
    if positions is None:
        raise HTTPException(status_code=502, detail={"error": "MT5_ERROR", "message": f"positions_get failed: {mt5.last_error()}"})
    return [_position_dict(p) for p in positions]


# ---------- trading helpers ----------
def _filling_candidates(info) -> list:
    mode = int(getattr(info, "filling_mode", 0) or 0) if info is not None else 0
    out = []
    if mode & 2:
        out.append(getattr(mt5, "ORDER_FILLING_IOC", 1))
    if mode & 1:
        out.append(getattr(mt5, "ORDER_FILLING_FOK", 0))
    out.append(getattr(mt5, "ORDER_FILLING_RETURN", 2))
    seen, uniq = set(), []
    for f in out:
        if f not in seen:
            seen.add(f)
            uniq.append(f)
    return uniq


def _send_deal(request: dict, info):
    """order_send, trying other filling modes only when the broker says the fill mode is invalid."""
    last = None
    for fill in _filling_candidates(info):
        req = dict(request)
        req["type_filling"] = fill
        result = mt5.order_send(req)
        if result is None:
            return None
        last = result
        if result.retcode != RET_INVALID_FILL:
            return result
    return last


def _clean_comment(text: Optional[str]) -> str:
    return (text or "zfx").encode("ascii", "ignore").decode()[:31]


def _close_position_obj(p, deviation: int, attempts: int = 3) -> dict:
    """Close one position with an opposite market deal. Returns {ok, retcode, comment}."""
    mt5.symbol_select(p.symbol, True)
    info = mt5.symbol_info(p.symbol)
    buy = p.type == getattr(mt5, "POSITION_TYPE_BUY", 0)
    last = {"ok": False, "retcode": None, "comment": "no attempt"}
    for _ in range(attempts):
        tick = mt5.symbol_info_tick(p.symbol)
        if tick is None:
            last = {"ok": False, "retcode": None, "comment": "no tick"}
            time.sleep(0.3)
            continue
        request = {
            "action": getattr(mt5, "TRADE_ACTION_DEAL", 1),
            "symbol": p.symbol,
            "volume": p.volume,
            "type": getattr(mt5, "ORDER_TYPE_SELL", 1) if buy else getattr(mt5, "ORDER_TYPE_BUY", 0),
            "position": p.ticket,
            "price": tick.bid if buy else tick.ask,
            "deviation": deviation,
            "magic": p.magic,
            "comment": "zfx-close",
            "type_time": getattr(mt5, "ORDER_TIME_GTC", 0),
        }
        result = _send_deal(request, info)
        if result is None:
            last = {"ok": False, "retcode": None, "comment": str(mt5.last_error())}
            time.sleep(0.3)
            continue
        last = {"ok": result.retcode == RET_DONE, "retcode": result.retcode, "comment": getattr(result, "comment", "")}
        if result.retcode in (RET_DONE, RET_PARTIAL):
            return last
        if result.retcode not in RETRYABLE:
            return last
        time.sleep(0.3)
    return last


def _remove_pending(order_ticket: int) -> dict:
    request = {"action": getattr(mt5, "TRADE_ACTION_REMOVE", 8), "order": order_ticket}
    result = mt5.order_send(request)
    if result is None:
        return {"ok": False, "retcode": None, "comment": str(mt5.last_error())}
    return {"ok": result.retcode == RET_DONE, "retcode": result.retcode, "comment": getattr(result, "comment", "")}


# ---------- orders ----------
class OrderRequest(BaseModel):
    symbol: str
    side: str
    volume: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    magic: Optional[int] = 1001
    comment: Optional[str] = "zfx"
    deviation: Optional[int] = None


def _bad(code: int, error: str, message: str, **extra):
    return HTTPException(status_code=code, detail={"error": error, "message": message, **extra})


@app.post("/orders")
def send_order(req: OrderRequest, authorized: bool = Depends(verify_token)):
    validate_symbol(req.symbol)
    if not allow_trading_env or kill_engaged:
        raise _bad(403, "TRADING_DISABLED", "Trading is disabled or kill switch engaged")
    if req.sl is None or req.sl <= 0:
        raise _bad(400, "MANDATORY_STOP_LOSS_REQUIRED", "Stop loss is required")
    side = (req.side or "").upper()
    if side not in ("BUY", "SELL"):
        raise _bad(400, "INVALID_SIDE", "side must be BUY or SELL")
    if req.volume is None or req.volume <= 0:
        raise _bad(400, "INVALID_VOLUME", "volume must be positive")

    require_mt5()
    with mt5_lock:
        acc = mt5.account_info()
        acc_type = get_account_type_str(acc.trade_mode)
        if acc_type == "UNKNOWN":
            raise _bad(503, "ACCOUNT_TYPE_UNKNOWN", "Cannot determine account type; refusing to trade")
        if acc_type != "DEMO" and not allow_live_env:
            raise _bad(403, "LIVE_NOT_ALLOWED", f"{acc_type} account requires ALLOW_LIVE=true on the bridge")

        if not mt5.symbol_select(req.symbol, True):
            raise _bad(404, "SYMBOL_NOT_FOUND", f"Symbol not available on this broker: {req.symbol}")
        info = mt5.symbol_info(req.symbol)
        if info is None:
            raise _bad(404, "SYMBOL_NOT_FOUND", f"No symbol info for {req.symbol}")

        # symbol trade permission: 0 disabled, 1 long only, 2 short only, 3 close only, 4 full
        tm = getattr(info, "trade_mode", 4)
        if tm in (0, 3) or (tm == 1 and side == "SELL") or (tm == 2 and side == "BUY"):
            raise _bad(403, "SYMBOL_TRADING_RESTRICTED", f"Symbol trade mode {tm} does not allow {side}")

        vmin, vmax, vstep = info.volume_min, info.volume_max, info.volume_step
        steps = req.volume / vstep if vstep else 1.0
        if req.volume < vmin - 1e-9 or req.volume > vmax + 1e-9 or abs(steps - round(steps)) > 1e-6:
            raise _bad(400, "INVALID_VOLUME", f"volume must be within {vmin}..{vmax} in steps of {vstep}")

        tick = mt5.symbol_info_tick(req.symbol)
        if tick is None:
            raise _bad(503, "NO_TICK", f"No tick available for {req.symbol}")
        buy = side == "BUY"
        price = tick.ask if buy else tick.bid
        digits = getattr(info, "digits", 5)
        sl = round(req.sl, digits)
        tp = round(req.tp, digits) if req.tp else 0.0
        min_dist = getattr(info, "trade_stops_level", 0) * getattr(info, "point", 0.0)
        wrong_side = (buy and (sl >= price or (tp and tp <= price))) or ((not buy) and (sl <= price or (tp and tp >= price)))
        if wrong_side:
            raise _bad(400, "INVALID_STOPS", "Stop loss must be on the losing side and take profit on the winning side of the price")
        if abs(price - sl) < min_dist or (tp and abs(price - tp) < min_dist):
            raise _bad(400, "INVALID_STOPS", f"Stops are closer than the broker minimum distance ({min_dist})")

        request = {
            "action": getattr(mt5, "TRADE_ACTION_DEAL", 1),
            "symbol": req.symbol,
            "volume": req.volume,
            "type": getattr(mt5, "ORDER_TYPE_BUY", 0) if buy else getattr(mt5, "ORDER_TYPE_SELL", 1),
            "price": price,
            "sl": sl,
            "tp": tp,
            "deviation": req.deviation if req.deviation is not None else DEFAULT_DEVIATION,
            "magic": req.magic if req.magic is not None else 1001,
            "comment": _clean_comment(req.comment),
            "type_time": getattr(mt5, "ORDER_TIME_GTC", 0),
        }
        first_fill = _filling_candidates(info)[0]
        check_req = dict(request, type_filling=first_fill)
        check = mt5.order_check(check_req)
        if check is None:
            raise _bad(502, "ORDER_CHECK_FAILED", f"order_check returned nothing: {mt5.last_error()}")
        if check.retcode not in (0, RET_DONE):
            raise _bad(400, "ORDER_CHECK_FAILED", getattr(check, "comment", "order_check rejected the request"), retcode=check.retcode)

        # Exactly one send; the portal never retries an order. If the outcome is unknown the portal
        # must reconcile against /positions.
        result = _send_deal(request, info)
        if result is None:
            raise _bad(502, "ORDER_OUTCOME_UNKNOWN", f"order_send returned nothing: {mt5.last_error()}. Reconcile positions before retrying.")
        if result.retcode in (RET_DONE, RET_PLACED, RET_PARTIAL):
            return {
                "status": "SUCCESS" if result.retcode != RET_PARTIAL else "PARTIAL",
                "message": getattr(result, "comment", "") or "Order executed",
                "ticket": result.order,
                "deal": getattr(result, "deal", None),
                "fill_price": result.price,
                "volume": result.volume,
                "symbol": req.symbol,
                "retcode": result.retcode,
            }
        raise _bad(502, "ORDER_REJECTED", getattr(result, "comment", "") or "Broker rejected the order", retcode=result.retcode)


@app.delete("/orders/{ticket}")
def cancel_pending_order(ticket: int, authorized: bool = Depends(verify_token)):
    if not allow_trading_env:
        raise _bad(403, "TRADING_DISABLED", "Trading is disabled")
    require_mt5()
    with mt5_lock:
        found = mt5.orders_get(ticket=ticket)
        if found is None:
            raise _bad(502, "MT5_ERROR", f"orders_get failed: {mt5.last_error()}")
        if len(found) == 0:
            raise _bad(404, "ORDER_NOT_FOUND", f"No pending order {ticket}")
        out = _remove_pending(ticket)
    if not out["ok"]:
        raise _bad(502, "CANCEL_FAILED", out["comment"] or "Broker refused the cancel", retcode=out["retcode"])
    return {"status": "SUCCESS", "message": f"Pending order {ticket} cancelled", "ticket": ticket}


@app.delete("/positions/{ticket}")
def close_position(ticket: int, authorized: bool = Depends(verify_token)):
    if not allow_trading_env:
        raise _bad(403, "TRADING_DISABLED", "Trading is disabled")
    require_mt5()
    with mt5_lock:  # closing stays possible while the kill switch is engaged
        found = mt5.positions_get(ticket=ticket)
        if found is None:
            raise _bad(502, "MT5_ERROR", f"positions_get failed: {mt5.last_error()}")
        if len(found) == 0:
            raise _bad(404, "POSITION_NOT_FOUND", f"No open position {ticket}")
        out = _close_position_obj(found[0], DEFAULT_DEVIATION * 2)
    if not out["ok"]:
        raise _bad(502, "CLOSE_FAILED", out["comment"] or "Broker refused the close", retcode=out["retcode"])
    return {"status": "SUCCESS", "message": f"Position {ticket} closed", "ticket": ticket, "retcode": out["retcode"]}


# ---------- kill switch ----------
@app.post("/kill")
def trip_kill_switch(authorized: bool = Depends(verify_token)):
    """Engage the kill state, close every position, remove pending orders, then verify by re-reading MT5.
    Works even when ALLOW_TRADING is false. allFlat is true only if MT5 itself shows nothing left."""
    global kill_engaged
    kill_engaged = True  # first: no new orders from here on, whatever happens next
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    if not mt5_ready():
        raise HTTPException(status_code=503, detail={
            "error": "MT5_DISCONNECTED", "success": False, "allFlat": False,
            "kill_state_engaged": True,
            "message": "Kill state engaged, but MT5 is unreachable: nothing was closed",
        })

    failures = {}
    with mt5_lock:
        initial = mt5.positions_get()
        if initial is None:
            raise HTTPException(status_code=502, detail={
                "error": "POSITIONS_UNREADABLE", "success": False, "allFlat": False,
                "kill_state_engaged": True, "message": f"positions_get failed: {mt5.last_error()}",
            })
        initial_tickets = [p.ticket for p in initial]

        pending_before = mt5.orders_get()
        cancelled = []
        if pending_before:
            for o in pending_before:
                out = _remove_pending(o.ticket)
                if out["ok"]:
                    cancelled.append(o.ticket)
                else:
                    failures[f"order:{o.ticket}"] = out

        for _ in range(3):  # rounds also cover partial closes
            current = mt5.positions_get()
            if current is None or len(current) == 0:
                break
            for p in current:
                out = _close_position_obj(p, DEFAULT_DEVIATION * 2)
                if not out["ok"] and out["retcode"] != RET_PARTIAL:
                    failures[f"position:{p.ticket}"] = out
            time.sleep(0.2)

        final_positions = mt5.positions_get()
        final_orders = mt5.orders_get()

    if final_positions is None or final_orders is None:
        raise HTTPException(status_code=502, detail={
            "error": "VERIFICATION_FAILED", "success": False, "allFlat": False,
            "kill_state_engaged": True, "message": "Could not re-read MT5 to verify the flat state",
        })

    remaining = [p.ticket for p in final_positions]
    remaining_orders = [o.ticket for o in final_orders]
    all_flat = len(remaining) == 0 and len(remaining_orders) == 0
    if all_flat:
        failures = {}  # a close that failed once but succeeded on a later round is not a failure
    return {
        "success": all_flat,
        "allFlat": all_flat,
        "closed": [t for t in initial_tickets if t not in remaining],
        "unclosed": remaining,
        "pending_cancelled": cancelled,
        "pending_remaining": remaining_orders,
        "failures": failures,
        "kill_state_engaged": True,
        "timestamp": stamp,
    }


@app.post("/kill/reset")
def reset_kill_switch(authorized: bool = Depends(verify_token)):
    global kill_engaged
    kill_engaged = False
    return {"success": True, "kill_state_engaged": False, "message": "Kill switch reset successfully"}


@app.get("/deals")
def get_deals(magic: Optional[int] = None, from_date: Optional[int] = None, to_date: Optional[int] = None, authorized: bool = Depends(verify_token)):
    """Deal history. Window edges are widened by one day because MT5 history uses broker time.
    Deal times are returned as broker-time epoch seconds (see time_basis)."""
    require_mt5()
    now = int(time.time())
    start = from_date if from_date is not None else now - 7 * 86400
    end = to_date if to_date is not None else now
    if start > end:
        raise _bad(400, "INVALID_RANGE", "from_date must not be after to_date")
    dt_from = datetime.fromtimestamp(start - 86400, tz=timezone.utc)
    dt_to = datetime.fromtimestamp(end + 86400, tz=timezone.utc)
    deals = mt5.history_deals_get(dt_from, dt_to)
    if deals is None:
        raise _bad(502, "MT5_ERROR", f"history_deals_get failed: {mt5.last_error()}")
    out = []
    for d in deals:
        if magic is not None and d.magic != magic:
            continue
        out.append({
            "ticket": d.ticket, "order": d.order, "time": d.time, "type": d.type, "entry": d.entry,
            "magic": d.magic, "position_id": d.position_id, "volume": d.volume, "price": d.price,
            "commission": d.commission, "swap": d.swap, "profit": d.profit, "symbol": d.symbol,
            "comment": d.comment, "time_basis": "broker",
        })
    return out
