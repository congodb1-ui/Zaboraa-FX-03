import hmac
import os
from contextlib import asynccontextmanager
import MetaTrader5 as mt5
from fastapi import FastAPI, Header, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Modern lifespan context manager for startup and shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not mt5.initialize():
        print("Failed to initialize MetaTrader5 during startup.")
    else:
        print("MetaTrader5 initialized successfully in bridge.")
    yield
    mt5.shutdown()

app = FastAPI(title="Zaboraa FX MT5 Bridge", version="1.0.0", lifespan=lifespan)

# CORS configuration to allow browser requests
raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows GET, POST, OPTIONS, etc.
    allow_headers=["*"],  # Allows custom headers like x-bridge-token and Authorization
)

BRIDGE_TOKEN = os.getenv("BRIDGE_TOKEN", "")
ALLOW_TRADING = os.getenv("ALLOW_TRADING", "false").lower() == "true"
ALLOW_LIVE = os.getenv("ALLOW_LIVE", "false").lower() == "true"

def verify_token(
    x_bridge_token: str = Header(default=""),
    authorization: str = Header(default="")
):
    # Extract token from 'Authorization: Bearer TOKEN' if x-bridge-token isn't provided
    token_to_check = x_bridge_token
    if not token_to_check and authorization.startswith("Bearer "):
        token_to_check = authorization.split("Bearer ")[1].strip()

    if not BRIDGE_TOKEN or not token_to_check or not hmac.compare_digest(token_to_check, BRIDGE_TOKEN.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bridge token",
        )
    return True

@app.get("/health")
def health_check(authorized: bool = Depends(verify_token)):
    return {"status": "healthy", "trading_allowed": ALLOW_TRADING}

@app.get("/account")
def get_account(authorized: bool = Depends(verify_token)):
    if not mt5.initialize():
        raise HTTPException(status_code=500, detail="MT5 not initialized")
    acc = mt5.account_info()
    if acc is None:
        raise HTTPException(status_code=500, detail="Failed to fetch account info")
    
    return {
        "login": acc.login,
        "balance": acc.balance,
        "equity": acc.equity,
        "margin": acc.margin,
        "profit": acc.profit,
        "trade_mode": acc.trade_mode,
        "is_demo": acc.trade_mode == mt5.ACCOUNT_TRADE_MODE_DEMO
    }

@app.get("/positions")
def get_positions(authorized: bool = Depends(verify_token)):
    if not mt5.initialize():
        raise HTTPException(status_code=500, detail="MT5 not initialized")
    
    positions = mt5.positions_get()
    if positions is None:
        return []
    
    return [
        {
            "ticket": pos.ticket,
            "symbol": pos.symbol,
            "type": pos.type,
            "volume": pos.volume,
            "price_open": pos.price_open,
            "sl": pos.sl,
            "tp": pos.tp,
            "profit": pos.profit,
        }
        for pos in positions
    ]