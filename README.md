# Zaboraa FX — Automated Forex & Precious Metals Trading Portal

**Zaboraa FX** is an automated quantitative trading, research, and backtesting portal designed for Forex and Precious Metals (`EURUSD`, `GBPUSD`, `USDJPY`, `XAUUSD`). Built with React 19, Vite, TypeScript, and Tailwind CSS.

---

## Key Features & Architecture

1. **Markets & Live Execution Desk**:
   - Live broker quote telemetry for `EURUSD`, `GBPUSD`, `USDJPY`, and `XAUUSD` with spread tracking in points.
   - Order Execution ticket with **Mandatory Stop-Loss Firewall** (`sl > 0` validation and side verification).
   - Real-time broker open positions and account status metrics (Balance, Equity, Margin, Free Margin, Today P&L).

2. **Quantitative Backtesting Lab**:
   - Realistic market execution model: Spread, Commission ($7.00/lot standard round-turn), Overnight Swap financing (with **Wednesday Triple-Swap Accrual**), and Slippage.
   - Intrabar Worst-Case SL/TP conflict resolution: conservative execution assumes worst-case (SL) triggers first.
   - Interactive Candlestick Chart with entry/exit trade markers.
   - 10-part metrics: Net Profit ($ and %), Profit Factor, Win Rate, Total Trades, Max Drawdown ($ and %), Sharpe Ratio, Sortino Ratio, Average Trade, Expectancy, and Cost Attribution.
   - 20% Holdout isolation to guard against in-sample curve fitting.
   - Saved Backtest Reports archive with PDF export/print workflow.

3. **Strategy Studio & Web Worker Sandbox**:
   - Unified `onBar(ctx, bar)` TypeScript strategy contract.
   - Isolated client-side evaluation with AST static analysis blocking forbidden identifiers (`fetch`, `eval`, `window`, `process`).
   - Bounds-checked canary lookahead trap preventing strategies from accessing future candles.
   - Built-in strategy presets: Donchian Breakout Channel, EMA Ribbon Trend Follower, RSI Mean Reversion, and Gold Volatility Breakout.

4. **2D Parameter Optimization & Overfitting Score**:
   - 2D Parameter Sweep Heatmap matrix across parameter pairs.
   - Quantitative 5-Term Heuristic Overfitting Warning Score ($0 - 100$) combining out-of-sample degradation, parameter sensitivity, trades-per-parameter, trial count, and sample size.
   - Seeded Monte Carlo simulation (Mulberry32) for reshuffled sequence risk and 1,000-iteration bootstrapping.

5. **TradingView Pine Script AI Converter & Comparator**:
   - Translates Pine Script (v4, v5, v6) into Zaboraa TypeScript strategy logic.
   - Automatic scanning for lookahead hazards (`barmerge.lookahead_on`) and repainting indicators.
   - TradingView "List of Trades" CSV Comparator verifying trade count parity, timestamp alignment, and net P&L divergence.

6. **Historical Market Data Catalog & Integrity Auditor**:
   - Multi-timeframe catalog across 8 broker timeframes (`M1`, `M5`, `M10`, `M15`, `M30`, `H1`, `H3`, `D1`).
   - 3-tier data provenance badges: `MT5 BRIDGE` (broker verified), `USER CSV` (custom upload), and `SIMULATED` (research-ineligible).
   - Weekend-aware gap detector (Friday 22:00 to Sunday 22:00 UTC closure).
   - Non-destructive Autofix tool and CSV export/import with column mapping.

7. **Automated Bots Fleet & Live Safety Gate**:
   - Bot lifecycle state machine (`RUNNING`, `PAUSED`, `STOPPED`, `ERROR`) across `PAPER`, `DEMO`, and `LIVE` modes.
   - Live Safety Gate requiring typed confirmation of the broker account login (`50192834`) before live promotion.
   - Authoritative Risk Firewall rules: Max Lots, Spread spike filter, Max drawdown %, Daily loss limit, Trading hours.

8. **Settings & Mathematical Self-Test Suite**:
   - Built-in known-answer test card proving EURUSD Pip Math ($100.00), USDJPY Quote Conversion ($66.67), XAUUSD Troy Ounce Math ($100.00), Friction Deductions, Intrabar SL Conflicts, and Zero-Lookahead Invariance.
   - Exness MT5 Python bridge diagnostic telemetry and Windows launch commands.
   - Global Emergency Kill Switch with persistent halt and loud failure handling.

---

## Local Development & Build

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Run TypeScript type check
npm run lint

# Build production bundle
npm run build
```
