import os
os.environ["BRIDGE_TOKEN"] = "unit-test-bridge-token-0123456789abcdef-xyz"
os.environ["ALLOW_TRADING"] = "true"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:3000,http://127.0.0.1:3000"

import time
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

import main
from main import app

client = TestClient(app)
TEST_TOKEN = "unit-test-bridge-token-0123456789abcdef-xyz"
AUTH = {"Authorization": f"Bearer {TEST_TOKEN}"}


class FakeMT5:
    """Stands in for the MetaTrader5 package. Records every order_send request."""
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_CONTEST = 1
    ACCOUNT_TRADE_MODE_REAL = 2
    POSITION_TYPE_BUY = 0
    POSITION_TYPE_SELL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_REMOVE = 8
    ORDER_TIME_GTC = 0
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2

    def __init__(self):
        self.connected = True
        self.trade_mode = 0
        self.positions = []
        self.positions_error = False
        self.pending = []
        self.sent = []
        self.checked = []
        self.reject_close = set()       # position tickets whose close is rejected
        self.open_retcode = 10009
        self.send_returns_none = False
        self.known_symbols = {"EURUSD", "EURUSDm", "XAUUSDm"}
        self.tick_time = int(time.time())
        self.next_ticket = 5000
        self.symbol_trade_mode = 4

    def initialize(self, **kw):
        return self.connected

    def shutdown(self):
        pass

    def last_error(self):
        return (1, "fake error")

    def terminal_info(self):
        return NS(connected=True, trade_allowed=True) if self.connected else None

    def account_info(self):
        if not self.connected:
            return None
        return NS(login=1234, server="Fake-Server", trade_mode=self.trade_mode, balance=10000.0, equity=10000.0,
                  margin=0.0, margin_free=10000.0, leverage=200, currency="USD")

    def symbols_get(self):
        return []

    def symbol_select(self, sym, flag):
        return sym in self.known_symbols

    def symbol_info(self, sym):
        if sym not in self.known_symbols:
            return None
        return NS(point=0.00001, digits=5, volume_min=0.01, volume_max=100.0, volume_step=0.01,
                  trade_stops_level=10, trade_mode=self.symbol_trade_mode, filling_mode=3, spread=12)

    def symbol_info_tick(self, sym):
        if sym not in self.known_symbols:
            return None
        return NS(bid=1.0850, ask=1.0852, last=0.0, volume=1, time=self.tick_time)

    def copy_rates_from_pos(self, sym, tf, pos, count):
        return [{"time": 1_700_000_000 + i * 60, "open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05,
                 "tick_volume": 10 + i, "spread": 3} for i in range(min(count, 5))]

    def positions_get(self, ticket=None, **kw):
        if self.positions_error:
            return None
        if ticket is not None:
            return tuple(p for p in self.positions if p.ticket == ticket)
        return tuple(self.positions)

    def orders_get(self, ticket=None, **kw):
        if ticket is not None:
            return tuple(o for o in self.pending if o.ticket == ticket)
        return tuple(self.pending)

    def order_check(self, req):
        self.checked.append(req)
        return NS(retcode=0, comment="ok")

    def order_send(self, req):
        self.sent.append(req)
        if self.send_returns_none:
            return None
        if req["action"] == self.TRADE_ACTION_REMOVE:
            self.pending = [o for o in self.pending if o.ticket != req["order"]]
            return NS(retcode=10009, comment="removed", order=req["order"], deal=0, price=0.0, volume=0.0)
        if "position" in req:
            if req["position"] in self.reject_close:
                return NS(retcode=10006, comment="rejected", order=0, deal=0, price=0.0, volume=0.0)
            self.positions = [p for p in self.positions if p.ticket != req["position"]]
            return NS(retcode=10009, comment="closed", order=777, deal=778, price=req["price"], volume=req["volume"])
        if self.open_retcode != 10009:
            return NS(retcode=self.open_retcode, comment="no money", order=0, deal=0, price=0.0, volume=0.0)
        self.next_ticket += 1
        self.positions.append(pos(self.next_ticket, req["type"], req["volume"], req["symbol"]))
        return NS(retcode=10009, comment="done", order=self.next_ticket, deal=self.next_ticket + 1,
                  price=req["price"], volume=req["volume"])

    def history_deals_get(self, dt_from, dt_to):
        return (NS(ticket=1, order=2, time=1_700_000_000, type=0, entry=0, magic=1001, position_id=2, volume=0.01,
                   price=1.08, commission=0.0, swap=0.0, profit=0.0, symbol="EURUSDm", comment="zfx"),)


def pos(ticket, ptype, volume=0.01, symbol="EURUSDm", magic=1001):
    return NS(ticket=ticket, time=1, type=ptype, magic=magic, volume=volume, price_open=1.08, sl=1.07, tp=0.0,
              price_current=1.081, swap=0.0, profit=0.0, symbol=symbol, comment="zfx")


@pytest.fixture(autouse=True)
def fake(monkeypatch):
    f = FakeMT5()
    monkeypatch.setattr(main, "mt5", f)
    monkeypatch.setattr(main, "kill_engaged", False)
    monkeypatch.setattr(main, "allow_trading_env", True)
    monkeypatch.setattr(main, "allow_live_env", False)
    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.delenv("BROKER_UTC_OFFSET_HOURS", raising=False)
    main._offset_state.update(hours=None, measured_at=0.0)
    return f


def order(**kw):
    body = {"symbol": "EURUSDm", "side": "BUY", "volume": 0.01, "sl": 1.0800, "tp": 1.0900}
    body.update(kw)
    return client.post("/orders", json=body, headers=AUTH)


# ---------- auth and input ----------
def test_health_unauthorized():
    assert client.get("/health").status_code == 401


def test_health_authorized_bearer():
    r = client.get("/health", headers=AUTH)
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_x_bridge_token_rejected():
    assert client.get("/health", headers={"x-bridge-token": TEST_TOKEN}).status_code == 401


def test_wrong_and_malformed_tokens_rejected_with_json():
    for h in ({"Authorization": "Bearer wrong"}, {"Authorization": TEST_TOKEN}, {"Authorization": "Basic abc"}):
        r = client.get("/positions", headers=h)
        assert r.status_code == 401 and r.json()["detail"]["error"] == "UNAUTHORIZED"


@pytest.mark.parametrize("sym", ["EUR/USD<script>", "EURUSD;DROP", "..", ".", ".hidden"])
def test_invalid_symbol_rejected_before_mt5(fake, sym):
    for url in ("/tick", "/candles"):
        params = {"symbol": sym, "timeframe": "H1"}
        r = client.get(url, params=params, headers=AUTH)
        assert r.status_code == 400 and r.json()["detail"]["error"] == "INVALID_SYMBOL"
    assert fake.sent == []


def test_long_symbol_rejected():
    r = client.get("/tick?symbol=" + "A" * 40, headers=AUTH)
    assert r.status_code == 400 and r.json()["detail"]["error"] == "INVALID_SYMBOL"


def test_missing_parameter_returns_json():
    r = client.get("/candles", headers=AUTH)  # symbol defaults, so the result is JSON either way
    assert r.headers["content-type"].startswith("application/json")


# ---------- CORS ----------
def test_cors_allows_only_configured_origin():
    ok = client.get("/health", headers={**AUTH, "Origin": "http://localhost:3000"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.get("/health", headers={**AUTH, "Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    assert ok.headers.get("access-control-allow-origin") != "*"


# ---------- account type (D18, D31) ----------
@pytest.mark.parametrize("mode,expected", [(0, "DEMO"), (1, "CONTEST"), (2, "REAL"), (99, "UNKNOWN")])
def test_account_type_mapping(fake, mode, expected):
    fake.trade_mode = mode
    for url in ("/health", "/account"):
        assert client.get(url, headers=AUTH).json()["account_type"] == expected
    assert client.get("/health", headers=AUTH).json()["is_demo"] is (expected == "DEMO")


def test_disconnected_reports_unknown_not_demo(fake):
    fake.connected = False
    h = client.get("/health", headers=AUTH).json()
    assert h["account_type"] == "UNKNOWN" and h["is_demo"] is False and h["broker_connected"] is False
    r = client.get("/account", headers=AUTH)
    assert r.status_code == 503 and r.json()["detail"]["error"] == "MT5_DISCONNECTED"


def test_package_missing_reports_unknown(monkeypatch):
    monkeypatch.setattr(main, "mt5", None)
    h = client.get("/health", headers=AUTH).json()
    assert h["account_type"] == "UNKNOWN" and h["mt5_package_installed"] is False
    assert client.get("/account", headers=AUTH).status_code == 503


# ---------- market data (D33, D20, D32) ----------
@pytest.mark.parametrize("tf", ["M1", "M5", "M10", "M15", "M30", "H1", "H3", "D1"])
def test_all_eight_timeframes_accepted(tf):
    r = client.get(f"/candles?symbol=EURUSDm&timeframe={tf}&count=5", headers=AUTH)
    assert r.status_code == 200 and r.json()["count"] == 5


def test_unsupported_timeframe_rejected():
    r = client.get("/candles?symbol=EURUSDm&timeframe=W1", headers=AUTH)
    assert r.status_code == 400 and r.json()["detail"]["error"] == "INVALID_TIMEFRAME"


def test_candles_never_synthetic_when_disconnected(fake):
    fake.connected = False
    r = client.get("/candles?symbol=EURUSDm&timeframe=H1", headers=AUTH)
    assert r.status_code == 503 and "candles" not in r.json()


def test_candles_no_data_is_an_error(fake):
    fake.copy_rates_from_pos = lambda *a: None
    r = client.get("/candles?symbol=EURUSDm&timeframe=H1", headers=AUTH)
    assert r.status_code == 502 and r.json()["detail"]["error"] == "NO_DATA"


def test_date_bounded_empty_history_returns_empty_page(fake):
    fake.copy_rates_range = lambda *a: []
    r = client.get(
        "/candles?symbol=EURUSDm&timeframe=M1&count=5000&date_to=2026-10-21T18:09:59.000Z",
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json()["candles"] == []
    assert r.json()["count"] == 0


def test_date_bounded_missing_history_returns_empty_page(fake):
    fake.copy_rates_range = lambda *a: None
    r = client.get(
        "/candles?symbol=EURUSDm&timeframe=M1&count=5000&date_to=2026-10-21T18:09:59.000Z",
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json()["candles"] == []


def test_candle_fields_keep_tick_volume():
    c = client.get("/candles?symbol=EURUSDm&timeframe=H1&count=2", headers=AUTH).json()["candles"][0]
    assert c["tick_volume"] == 10 and set(c) >= {"time", "open", "high", "low", "close", "spread"}


def test_unknown_symbol_404():
    assert client.get("/tick?symbol=NOPE", headers=AUTH).status_code == 404


def test_tick_time_converted_to_utc_with_measured_offset(fake):
    fake.tick_time = int(time.time()) + 3 * 3600
    t = client.get("/tick?symbol=EURUSDm", headers=AUTH).json()
    assert t["utc_offset_hours"] == 3
    assert abs(t["time"] - int(time.time())) < 5 and t["time_broker"] == fake.tick_time


def test_stale_tick_gives_null_time_so_portal_says_market_closed(fake):
    fake.tick_time = int(time.time()) - 2 * 86400 + 1234
    t = client.get("/tick?symbol=EURUSDm", headers=AUTH).json()
    assert t["time"] is None and t["utc_offset_hours"] is None


def test_env_offset_override(fake, monkeypatch):
    monkeypatch.setenv("BROKER_UTC_OFFSET_HOURS", "2")
    fake.tick_time = int(time.time()) - 86400
    t = client.get("/tick?symbol=EURUSDm", headers=AUTH).json()
    assert t["utc_offset_hours"] == 2 and t["time"] == fake.tick_time - 7200


# ---------- positions ----------
def test_positions_returns_real_list(fake):
    fake.positions = [pos(11, 0), pos(12, 1)]
    r = client.get("/positions", headers=AUTH).json()
    assert [p["ticket"] for p in r] == [11, 12] and [p["side"] for p in r] == ["BUY", "SELL"]


def test_positions_disconnected_is_error_not_empty(fake):
    fake.connected = False
    assert client.get("/positions", headers=AUTH).status_code == 503


def test_positions_read_error_is_error_not_empty(fake):
    fake.positions_error = True
    assert client.get("/positions", headers=AUTH).status_code == 502


# ---------- orders (D30) ----------
def test_order_rejected_when_trading_disabled(monkeypatch, fake):
    monkeypatch.setattr(main, "allow_trading_env", False)
    r = order()
    assert r.status_code == 403 and r.json()["detail"]["error"] == "TRADING_DISABLED" and fake.sent == []


def test_order_requires_sl(fake):
    for sl in (None, 0.0, -1.0):
        r = order(sl=sl)
        assert r.status_code == 400 and r.json()["detail"]["error"] == "MANDATORY_STOP_LOSS_REQUIRED"
    assert fake.sent == []


def test_order_invalid_side_and_volume(fake):
    assert order(side="HOLD").json()["detail"]["error"] == "INVALID_SIDE"
    assert order(volume=0.005).json()["detail"]["error"] == "INVALID_VOLUME"   # below min
    assert order(volume=0.015).json()["detail"]["error"] == "INVALID_VOLUME"   # off step
    assert order(volume=500).json()["detail"]["error"] == "INVALID_VOLUME"     # above max
    assert fake.sent == []


def test_order_stops_on_wrong_side_rejected(fake):
    assert order(sl=1.0900).json()["detail"]["error"] == "INVALID_STOPS"            # BUY sl above price
    assert order(side="SELL", sl=1.0800, tp=None).json()["detail"]["error"] == "INVALID_STOPS"
    assert order(sl=1.08515).json()["detail"]["error"] == "INVALID_STOPS"           # inside min distance
    assert fake.sent == []


def test_order_success_sends_real_request_and_returns_real_ticket(fake):
    r = order()
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "SUCCESS" and body["ticket"] == 5001 and body["fill_price"] == 1.0852
    req = fake.sent[0]
    assert req["action"] == 1 and req["type"] == 0 and req["sl"] == 1.08 and req["tp"] == 1.09 and req["type_filling"] == 1
    assert fake.positions[0].ticket == 5001


def test_order_broker_reject_is_error(fake):
    fake.open_retcode = 10019
    r = order()
    assert r.status_code == 502 and r.json()["detail"]["error"] == "ORDER_REJECTED" and r.json()["detail"]["retcode"] == 10019


def test_order_send_none_is_outcome_unknown(fake):
    fake.send_returns_none = True
    r = order()
    assert r.status_code == 502 and r.json()["detail"]["error"] == "ORDER_OUTCOME_UNKNOWN"
    assert len(fake.sent) == 1  # never retried


def test_order_blocked_on_real_account_without_allow_live(fake, monkeypatch):
    fake.trade_mode = 2
    r = order()
    assert r.status_code == 403 and r.json()["detail"]["error"] == "LIVE_NOT_ALLOWED" and fake.sent == []
    monkeypatch.setattr(main, "allow_live_env", True)
    assert order().status_code == 200


def test_order_blocked_when_account_type_unknown(fake):
    fake.trade_mode = 99
    assert order().status_code == 503 and fake.sent == []


def test_order_disconnected_is_503_not_mock(fake):
    fake.connected = False
    r = order()
    assert r.status_code == 503 and "ticket" not in r.text


def test_order_blocked_when_symbol_close_only(fake):
    fake.symbol_trade_mode = 3
    assert order().json()["detail"]["error"] == "SYMBOL_TRADING_RESTRICTED"


# ---------- close and cancel ----------
def test_close_position_not_found(fake):
    assert client.delete("/positions/999", headers=AUTH).status_code == 404 and fake.sent == []


def test_close_position_real(fake):
    fake.positions = [pos(21, 0)]
    r = client.delete("/positions/21", headers=AUTH)
    assert r.status_code == 200 and fake.positions == []
    assert fake.sent[0]["position"] == 21 and fake.sent[0]["type"] == 1


def test_close_position_failure_reported(fake):
    fake.positions = [pos(22, 0)]
    fake.reject_close = {22}
    assert client.delete("/positions/22", headers=AUTH).status_code == 502


def test_cancel_pending_order(fake):
    fake.pending = [NS(ticket=9001)]
    assert client.delete("/orders/9001", headers=AUTH).status_code == 200 and fake.pending == []
    assert client.delete("/orders/9002", headers=AUTH).status_code == 404


# ---------- kill switch (D29) ----------
def test_kill_closes_everything_and_verifies(fake):
    fake.positions = [pos(31, 0), pos(32, 1)]
    r = client.post("/kill", headers=AUTH)
    assert r.status_code == 200
    d = r.json()
    assert d["allFlat"] is True and d["success"] is True and sorted(d["closed"]) == [31, 32] and d["unclosed"] == []
    assert fake.positions == []
    types = {q["position"]: q["type"] for q in fake.sent}
    assert types == {31: 1, 32: 0}                      # opposite side of each position
    assert client.get("/positions", headers=AUTH).json() == []


def test_kill_with_nothing_open_is_flat(fake):
    d = client.post("/kill", headers=AUTH).json()
    assert d["allFlat"] is True and d["closed"] == [] and fake.sent == []


def test_kill_partial_failure_is_not_flat(fake):
    fake.positions = [pos(41, 0), pos(42, 1)]
    fake.reject_close = {42}
    r = client.post("/kill", headers=AUTH)
    d = r.json()
    assert r.status_code == 200 and d["allFlat"] is False and d["success"] is False
    assert d["unclosed"] == [42] and d["closed"] == [41] and "position:42" in d["failures"]


def test_kill_when_disconnected_engages_state_and_reports_failure(fake):
    fake.connected = False
    r = client.post("/kill", headers=AUTH)
    assert r.status_code == 503 and r.json()["detail"]["allFlat"] is False
    assert main.kill_engaged is True


def test_kill_unreadable_positions_is_not_flat(fake):
    fake.positions_error = True
    r = client.post("/kill", headers=AUTH)
    assert r.status_code == 502 and r.json()["detail"]["allFlat"] is False


def test_kill_works_with_trading_disabled(fake, monkeypatch):
    monkeypatch.setattr(main, "allow_trading_env", False)
    fake.positions = [pos(51, 0)]
    assert client.post("/kill", headers=AUTH).json()["allFlat"] is True


def test_kill_removes_pending_orders(fake):
    fake.pending = [NS(ticket=9100)]
    d = client.post("/kill", headers=AUTH).json()
    assert d["pending_cancelled"] == [9100] and d["allFlat"] is True and fake.pending == []


def test_orders_blocked_after_kill_until_reset(fake):
    client.post("/kill", headers=AUTH)
    assert order().json()["detail"]["error"] == "TRADING_DISABLED"
    client.post("/kill/reset", headers=AUTH)
    assert order().status_code == 200


# ---------- deals ----------
def test_deals_real_and_magic_filter(fake):
    assert len(client.get("/deals", headers=AUTH).json()) == 1
    assert client.get("/deals?magic=5", headers=AUTH).json() == []
    fake.connected = False
    assert client.get("/deals", headers=AUTH).status_code == 503
