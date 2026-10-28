# Zaboraa FX round 5, patch 1 (CHANGED-UNRUN against your project)

Copy the files over the same paths in your project (paths are project-relative), then run:

    npx vitest run
    npx tsc --noEmit
    npm run lint
    npm run build

Report the counts. Expected: 194 existing + 59 new checks (the new files are listed below).

## Files changed
- server.ts
- src/services/bridgeClient.ts
- src/engine/botScheduler.ts
- src/engine/reconciliation.ts
- src/engine/marketdata/dataApi.ts

## New tests
- src/engine/__tests__/bridgeCompat.test.ts
- src/engine/__tests__/botSchedulerBrokerTime.test.ts
- src/engine/__tests__/reconciliationMatching.test.ts
- src/engine/marketdata/__tests__/dataApiBridgeTime.test.ts

## What I checked here
- Changed modules type-check under strict against stub dependencies. Your real types may differ.
- The 59 new checks all pass on the patched code and 33 of them fail on your original files.
  I ran them with a small stand-in runner, not vitest, so please treat your vitest run as the real result.
- server.ts parses (no syntax errors). Its changes have no new tests yet.

## Existing tests that may need a look (if one fails, it probably encodes the old behaviour)
- reconciliation.test.ts: any test that fills an order from a deal or position matching only on magic + symbol.
- stageD1Security.test.ts: kill-switch tests with a very short fetch timeout or a /kill body with pending_remaining.
- Any test that reads the old hard-coded balance (10000) from /api/bridge/test.

## Before the weekday download
Stored candles from earlier downloads are in broker time. Delete the stored files for each symbol/timeframe
before re-downloading, or old and new bars will interleave with a shifted time.

## Follow-up — Phase 2–4 guardrails (2026-10-26)
- Startup no longer seeds generated benchmark datasets into the data catalog.
- Optimization is restricted to eligible non-simulated datasets, requires at least 100 bars, and reserves the final 20% as untouched holdout data.
- Backtest rejects invalid candle data and missing executors; silent strategy substitution was removed.
- Data Manager cancellation now calls the persistent job cancellation API.
- See `docs/PHASE-2-4-IMPLEMENTATION-AND-ACCEPTANCE.md`. Live demo checks and a full npm build/test run remain pending.
