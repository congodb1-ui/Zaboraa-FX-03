# Zaboraa FX — Automated Forex & Precious Metals Trading Portal

**Zaboraa FX** is an automated trading, quantitative research, and backtesting portal designed for Forex and Precious Metals (Gold/XAUUSD). It connects to an **Exness MetaTrader 5 (MT5)** desktop terminal on Windows via a local Python bridge, evaluates algorithmic trading strategies in a secure **QuickJS sandbox**, models realistic transaction costs (spread, commission, swap, slippage), and provides automated execution with strict risk guardrails and an emergency kill switch.

> **Status: stabilisation and verification (28 Oct 2026).** The project is in advanced development, moving into integration validation. It is **not certified for unattended automation or live trading.** Keep `ALLOW_TRADING=false` and `ALLOW_LIVE=false` until the demo-account checks and acceptance gates in the master plan have passed. Code that passes unit tests does not certify trading safety.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   Zaboraa FX Portal                    │
├──────────────────────────┬─────────────────────────────┤
│ Frontend (React 19/Vite) │ Backend (Express/Node.js)   │
│ - Live Dashboard & Charts│ - REST API (/api/*)         │
│ - Strategy Studio        │ - QuickJS Strategy Sandbox  │
│ - Backtest & Optimizer   │ - SQLite (better-sqlite3)   │
│ - Realtime Risk Display  │ - Vite Development Server   │
└────────────┬─────────────┴──────────────┬──────────────┘
             │                            │
             │ HTTP Bearer Token          │ Local Filesystem
             ▼                            ▼
┌──────────────────────────┐    ┌─────────────────────────┐
│ MT5 Python Bridge        │    │ Local Storage           │
│ (FastAPI / 127.0.0.1)    │    │ - data/*.sqlite (WAL)   │
│ - Exness Terminal IPC    │    │ - docs/STATUS.md        │
└──────────────────────────┘    └─────────────────────────┘
```

The portal runs on `127.0.0.1:3000` and the bridge on `127.0.0.1:8001`. The browser only calls `/api/*`; the server calls the bridge with `BRIDGE_TOKEN` from its own environment. The browser never receives the token.

`ARCHITECTURE.md` (component boundaries, ports, request/response contracts, the Node-to-Python path) is the first file to give any AI coding session. Keep it aligned with the code; if the code and a document disagree, the code is the source of truth.

---

## Windows Local Setup Guide

Follow these steps to set up and run Zaboraa FX on a Windows 10/11 machine with Exness MetaTrader 5.

### 1. Prerequisites

1. **Operating System**: Windows 10 or 11 (64-bit).
2. **MetaTrader 5 Terminal**: Install the [Exness MetaTrader 5 Terminal](https://www.exness.com/metatrader-5/) and log in to your **Demo Account** (e.g. `Exness-MT5Trial9`).
   - Enable Algorithmic Trading in MT5: **Tools -> Options -> Expert Advisors**, check **"Allow algorithmic trading"**, and make sure the **"Algo Trading"** toolbar button is active/green.
   - Exness demo symbols are suffixed (for example `EURUSDm`, `XAUUSDm`). The portal stores candles under the canonical name (`EURUSD`) and adds the broker suffix when it calls the bridge.
3. **Node.js**: Install **Node.js >= 22.13** (`package.json` enforces this). Verify with:
   ```powershell
   node --version
   ```
4. **Python**: Install **Python 3.10 or newer** (the project is currently run on 3.13). Tick *"Add python.exe to PATH"* during installation. Verify with:
   ```powershell
   python --version
   ```
5. **Git** (for the GitHub workflow below).

---

### 2. Configure Environment (`.env`)

In the project root folder, copy `.env.example` to create your local `.env` file:

```powershell
copy .env.example .env
```

Open `.env` and configure (variable names and comments live in `.env.example`; never paste real values into chats, prompts, commits or screenshots):
- `BRIDGE_TOKEN`: a strong random secret, at least 24 characters. Generate one, for example:
  ```powershell
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- `ENCRYPTION_MASTER_KEY`: a persistent 32-byte hex key that encrypts stored credentials. Back it up privately. If you change it, stored credentials become unreadable and must be re-entered. Do not use `ALLOW_EPHEMERAL_KEY` outside development tests.
- `ALLOWED_ORIGINS`: `http://localhost:3000,http://127.0.0.1:3000`.
- `ALLOW_TRADING=false` and `ALLOW_LIVE=false`: keep both `false` for demo, paper and research work.
- AI (Pine conversion): the server calls Gemini through **Vertex AI** with local Application Default Credentials, not an API key. Run `gcloud auth application-default login` once and set the model in `GEMINI_MODEL`. See `.env.example` for the project and region settings. The ADC credential file is local: never commit or upload it.

Also copy the bridge environment file inside `mt5-bridge/`:
```powershell
cd mt5-bridge
copy .env.example .env
```
`BRIDGE_TOKEN` in `mt5-bridge/.env` must match the root `.env`. Return to root:
```powershell
cd ..
```

---

### 3. Launch MT5 Python Bridge (Terminal 1)

Open a Windows PowerShell terminal to start the local MT5 bridge:

```powershell
# 1. Navigate to the bridge directory
cd mt5-bridge

# 2. Create virtual environment
python -m venv .venv

# 3. Activate virtual environment
.venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start the bridge on 127.0.0.1:8001
uvicorn main:app --host 127.0.0.1 --port 8001
```

When successfully launched, you will see:
```text
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     MetaTrader5 connected: Exness-MT5Trial9, Account: [MASKED], Mode: DEMO
INFO:     Uvicorn running on http://127.0.0.1:8001 (Press CTRL+C to quit)
```

The bridge accepts `Authorization: Bearer <token>` only. The `x-bridge-token` header is rejected.

#### Diagnostic Demo Account Verification
To verify that your Exness account is recognised as a genuine DEMO account:
```powershell
python -c "import MetaTrader5 as mt5; mt5.initialize(); print('trade_mode:', mt5.account_info().trade_mode, 'DEMO_CONSTANT:', mt5.ACCOUNT_TRADE_MODE_DEMO)"
```
If both numbers match, your terminal is in DEMO mode. Anything that is not DEMO is treated as non-demo.

---

### 4. Launch Zaboraa FX Web Portal (Terminal 2)

Open a second Windows PowerShell terminal in the project root:

```powershell
# 1. Install the locked Node.js dependencies
npm ci

# 2. Start the development server
npm run dev
```

The server starts on `http://127.0.0.1:3000`. Open `http://localhost:3000` in your browser.

---

### 5. Running Automated Tests & Quality Checks

Run the full baseline and **record the exact output with the date** (test-file and test counts, failures, warnings):

```powershell
# Portal (project root)
npm ci
npm run lint            # TypeScript type-check
npx tsc --noEmit        # record separately from lint
npm test                # Vitest unit and safety tests
npm run build           # production Vite build; note any chunk-size warnings

# MT5 bridge (inside mt5-bridge, venv active)
cd mt5-bridge
python -m pytest test_bridge.py -v
cd ..
```

An earlier pass is historical evidence only; it does not replace a fresh run on the current working tree. If `npm ci` changes the dependency tree, inspect the lockfile diff before committing.

---

## Development Workflow (AI-assisted, local execution)

Code may be produced with AI assistance, but it is a **proposal, not a release**.

1. **Generate**: request focused changes against an approved blueprint; ask for the list of intended files and a summary of behaviour changes.
2. **Review and commit**: inspect the diff, reject unrelated edits, confirm no secrets or runtime database files are included, then commit and push to the (private) GitHub repository with a clear message. GitHub is the versioned hand-off, not a substitute for local validation.
3. **Pull locally**: confirm the branch and working tree first; do not overwrite local runtime data or uncommitted work.
4. **Run and test locally**: run the full stack (Vite/React frontend, Node/Express backend, SQLite, Python MT5 bridge) and the checks in section 5. Nothing counts as tested until it has run here.

Rules for AI-assisted work:
- UI-only tasks must not touch the MT5 bridge, order execution, risk controls or live-trading gates.
- Keep `.env` files, `data/`, `*.sqlite*` (including WAL sidecars), broker credentials, account identifiers, transaction histories and private datasets out of Git and out of every AI prompt. Share only schemas, migrations and sanitised examples.
- Give the AI `ARCHITECTURE.md` and the master plan as context; do not assume it remembers earlier sessions.
- Model names, availability and quotas change; check current provider documentation before relying on them.

---

## Current Phase Validation Notes

Open items at the time of writing (see the master plan for the full register):
- A fresh integrated local baseline (install, lint, `tsc`, tests, build, pytest) is still to be recorded; the last reported run had passing tests and build but a failing type-check.
- Historical download acceptance on the Exness demo: all eight timeframes (M1, M5, M10, M15, M30, H1, H3, D1) for `EURUSDm` and `XAUUSDm`, a repeat download that adds nothing, clean page boundaries, and end-of-history handling.
- Research datasets must reload after a full restart with valid provenance.
- Backtest strategy execution (`BACKTEST_STRATEGY_UNAVAILABLE`) and the `/candles`, `/audit`, `/load` routes need runtime acceptance.
- Live demo checks for the bridge safety fixes (kill switch with a real position, order rejection with `ALLOW_TRADING=false`, terminal closed, weekday UTC offset).

See [`docs/PHASE-2-4-IMPLEMENTATION-AND-ACCEPTANCE.md`](docs/PHASE-2-4-IMPLEMENTATION-AND-ACCEPTANCE.md) for the Phase 2–4 implementation summary, manual MT5 demo checklist and Data Manager acceptance steps. Live/demo checks must be completed locally; packaging the code does not certify trading safety.

---

## Safety Ground Rules

1. **Simulation Default**: If the MT5 bridge is offline or unreachable, the portal operates in simulation mode with visible `"SIMULATION: no broker connected"` indicators. Nothing may invent prices, positions, tickets or balances; simulated data is labelled and is not research-eligible.
2. **Mandatory Stop-Loss**: Every order must specify a valid, broker-verified Stop-Loss (`sl > 0`). Orders lacking SL are blocked immediately.
3. **Emergency Kill Switch**: One click closes all positions, cancels pending orders, and engages a persistent `no_new_orders` halt in SQLite. **It acts on the whole account:** confirm the account and its open positions before testing it, and test it only on the intended demo account.
4. **Sandboxed Strategies**: All strategies execute inside a restricted QuickJS WebAssembly sandbox with no access to system APIs, the filesystem, or outbound network calls. An unknown or unresolvable strategy fails closed; no other strategy runs in its place.
5. **Demo by Default**: Live trading stays impossible unless every gate passes (`ALLOW_LIVE`, a valid single-use token, a stop-loss, typed confirmation). The server asks the bridge for the authoritative account type and does not trust the client.
6. **Living Verification Status**: Refer to `docs/STATUS.md` for the current status of tested vs planned features.
