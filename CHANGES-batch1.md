# Zaboraa FX: Stage D, batch 1 (2026-10-25)

Copy these files over your project, keeping the same folder paths. Then:

    npm install
    npm run lint
    npm test
    npm run build

Paste any error (not any secret) back to Claude.

## Files in this update

NEW
- .gitignore                                   (your project had none: `git add .` would have committed .env, data/ and node_modules)
- .env.example                                 (root; names only, with comments)
- mt5-bridge/.env.example                      (was missing; README referred to it)
- src/engine/__tests__/stageD1Security.test.ts (12 new tests)

CHANGED
- server.ts                    D5 loopback default + strict host/origin; new /api/bridge/test, /tick/:symbol, /candles
                               proxy routes; fail-safe account type (UNKNOWN blocks orders); no fake "connected" state
- src/services/bridgeClient.ts adds getTick()
- package.json                 "start" now runs through tsx
- vite.config.ts               host/allowedHosts loopback unless AI_STUDIO_PREVIEW=true
- src/App.tsx                  bridge calls go through the server (no token in the browser); no generated datasets;
                               no fake chart candles; bridge verified on startup
- src/components/SettingsView.tsx      token field removed; one "Test Bridge Connection" button
- src/components/DataManagerView.tsx   generated data is marked diagnostic-only and NOT research-eligible; clearer errors
- src/components/OptimizationView.tsx  no synthetic fallback: needs real research-eligible data
- src/components/CandlestickChart.tsx  empty state instead of crashing/inventing candles
- src/components/MarketsView.tsx       live bridge quote, market-closed/stale indicator, honest "not sent to broker" wording
- README.md, docs/STATUS.md, docs/PROGRESS.md   corrected (earlier "COMPLETE" lines for 3B and 4 were not true)

## NOT in this batch (needs the next uploads / batches)
- mt5-bridge/main.py and test_bridge.py were not in your zip, so bridge tests (D13, D17) and
  bridge-side changes (8 timeframes, date-range download) are not done yet.
- 8 timeframes (M10, H3 need new types), bulk download, data-exists switch, saving datasets to disk.
- D1 to D4 (bot runner, watchdog, client-side fake orders, kill-switch error handling): Stage W.

## Known limits
- Downloaded datasets still live in browser memory only (lost on refresh) until the persistence batch.
- Placing an order in Markets is still a local simulation (now labelled "SIMULATION ONLY"). It is fixed in Stage W.
- This update was checked for syntax only. The author could not run npm install, lint, tests or the app.
