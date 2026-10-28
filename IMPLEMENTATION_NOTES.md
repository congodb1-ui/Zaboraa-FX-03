# Zaboraa FX implementation notes

## Changes in this update
- Added canonical SQLite candle storage keyed by `(symbol, timeframe, time)` with date-range indexes; old year-partition JSON data is migrated on first read.
- Bulk bridge downloads now save append-only (existing timestamps are retained), skip MT5's forming candle, and can download all eight bridge-supported timeframes sequentially with date-based history paging.
- The portal bridge candle response now forwards `count`, `utc_offset_hours`, `time_basis`, and earliest-history metadata.
- Added stored OHLC table in Data Manager with UTC timestamps, date filters, and CSV export.
- Added date filtering to stored candle load/export APIs and a grouped stored-data catalog endpoint.
- Added persistent backtest report save/list/read/delete APIs using the existing `backtest_results` table plus snapshot columns.
- Backtest view now has a chart with trade entry/exit markers, save-report action, saved report list, and a print-ready Save-as-PDF workflow without an extra dependency.
- Account status badge now reflects bridge-reported REAL / CONTEST / DEMO / UNKNOWN instead of presenting the local toggle as proof of a real account.
- Generated simulated benchmark data is marked research-ineligible.
- Added support for the eight MT5 bridge timeframes in the UI and synthetic-data interval generation.

## Verification
- `mt5-bridge/test_bridge.py`: 61 tests passed.
- TypeScript/TSX transpile syntax check: no syntax diagnostics.
- Full `tsc --noEmit` and Vite production build could not be run in this environment because npm dependencies could not be installed (the package registry install timed out). Run `npm ci`, `npm run lint`, `npm test`, and `npm run build` locally before deployment.

## Notes
- On startup, SQLite schema migrations run automatically. The original database and existing data files are preserved in the archive.
- Date paging is bounded to 200 pages per timeframe per job; MT5 broker history availability and terminal history settings still determine how far back data can be downloaded.
- The PDF workflow opens the report in a browser tab; choose Print → Save as PDF.

## Follow-up update — 2026-10-26
- Removed startup-seeded synthetic datasets from the App catalog; no generated dataset is presented as research-ready.
- Optimization now requires an explicitly research-eligible non-simulated dataset and at least 100 candles; the last 20% is reserved and excluded from all optimizer trials/ranking.
- Optimization reports expose the holdout bar count and start timestamp. Missing provenance remains research-ineligible.
- Backtests reject invalid candle input and missing strategy executors instead of silently substituting a fallback RSI/momentum strategy.
- Data Manager cancellation now requests cancellation of the persistent bulk-download job.
- See `docs/PHASE-2-4-IMPLEMENTATION-AND-ACCEPTANCE.md` for manual MT5/Data Manager/TradingView acceptance steps and verification limits.

## Parallel roadmap audit — 2026-10-26

- Added Open/Delete actions for saved backtest reports in BacktestView, using the existing persisted report endpoints.
- Added `docs/PARALLEL-ROADMAP-AUDIT-2026-10-26.md` with D36 source-review findings, Stage B batch-runner gap, Stage W audit notes, and manual acceptance items.
- D36 source wiring appears correct, but browser acceptance is still pending.
- Dedicated batch-runner implementation was not found in this archive; it remains Stage B work.
- The BacktestView change requires local lint, full tests, and production build to be rerun.
