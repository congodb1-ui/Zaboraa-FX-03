# Zaboraa FX: Master Plan v4.3

**Updated 27 Oct 2026.** Supersedes the earlier staged prompt (Stages 0 to 6) and folds in the resume prompt, the fix-stage list, Stage 7 and the backtest-first plan. Companion documents: *Zaboraa FX Requirements and Status v4.3* (PDF) and *Zaboraa FX Implementation Summary 4.5* (DOCX). If this plan and the code disagree, **the code is the source of truth**; if a status line here disagrees with a passing test, correct this file.

**What changed in v4.3 (27 Oct 2026).** Everything below is **OWNER-REPORTED** from the owner's chat of 27 Oct unless it says "seen in `server.ts`". The editor saw the uploaded `server.ts` (it contains the changes in items 1 and 2) but the uploaded `main.py` is the **pre-fix** copy, so the bridge fix in item 3 has not been seen in code. No test, lint, build or pytest was run by the editor. **(1) Broker symbol mapping in bulk download (new D38).** The portal sent canonical names (`EURUSD`) while the Exness demo terminal only knows suffixed names (`EURUSDm`), so the bridge answered 404. `/api/data/bulk-download` now appends `brokerState.symbolSuffix` (default `m`) when it is missing, sends the broker symbol to the bridge and **stores candles under the canonical symbol** (seen in `server.ts`: `runBulkSave(symbol, ...)`; the job record keeps both). The 404 is reported gone. **(2) Pagination date format.** The page loop now sends `date_to` as an ISO-8601 string with an explicit `+00:00` offset instead of epoch seconds (seen in `server.ts`); the bridge's `fromisoformat` no longer answers 400 `INVALID_DATE_RANGE`. **(3) Bridge paging bug (new D39) and a diagnosis correction.** After (1) and (2), page 2 still failed with 502 `MT5 returned no candles: (-2, 'Terminal: Invalid params')`. The earlier explanation (timezone-aware datetimes and URL encoding) was **not the cause and is withdrawn**: FastAPI already decodes query strings, so `unquote` is unnecessary, and the naive-UTC conversion did not change the outcome. The cause was the range call: with `date_to` and no `date_from`, `get_candles` ran `copy_rates_range(symbol, tf, datetime(2000, 1, 1), date_to)`, a 26-year M1 range that the terminal rejects. Fix advised and reported resolved: with only `date_to`, call `copy_rates_from(symbol, tf, end, count)` using a timezone-aware UTC `end`; `copy_rates_range` only when `date_from` is also given; page 1 keeps `copy_rates_from_pos(symbol, tf, 1, count)` so the forming bar stays excluded. Candle `time` stays broker-time epoch seconds; `date_to` is derived from the earliest stored epoch minus one second and read back as the same number, so no broker-offset conversion belongs in this path. The owner did not state which symbols, timeframes or how many pages were tested; treat the fix as confirmed for the failing EURUSDm M1 case only. **(4) Active Research Dataset activation (new D40).** Candles existed in SQLite but Backtesting Lab reported zero active research datasets and blocked simulations. The owner replaced the relevant files with those in the supplied ZIP and reports the problem fixed. The changed files were not named or shown. Still unproven: that eligible datasets and their provenance survive a full restart (the 4.4 summary says provenance lived only in in-memory `DatasetRecord` state), and that `XAUUSD` and `XAUUSDm` select each other consistently across Data Manager and Backtesting Lab. **(5) Two points found by reading `server.ts` (new D41, D42; not tested).** The page loop ends cleanly on a short page or an empty `candles` array, but the bridge answers 502 `NO_DATA` for an empty result and the loop treats every non-OK reply as failure, so a timeframe whose history ends exactly on a full page fails the whole job after saving its data (D41). The loop also stops at 200 pages of 5,000 bars, which is 1,000,000 bars per timeframe per job; with the plan's figure of about 370,000 M1 bars a year that is about 2.7 years, and a repeat job restarts from the newest bar, so older M1 history stays out of reach (D42). Both are proposals for the next round, not owner-reported defects. **(6) Gate figures.** The status notes the owner supplied on 27 Oct record an earlier project version as passing **260 of 260** tests with lint and the production build clean; the ZIP, date and command output are not recorded, and this supersedes the "257+" of v4.2 only as a reported number. The 4.4 implementation summary records its own environment as bridge pytest 61 passed and a 64-file TypeScript syntax transpile, with the full type-check, Vitest and Vite build **not run** there. Nothing was re-run for v4.3, so the current integrated project (after the three fixes above) has **no recorded gate**; that is the first task in the pointer. **(7) New in this edition:** an acceptance tracker (section 3B) that lists, per requirement, what is implemented, what has a named test, what the owner has confirmed live and what evidence is still missing, plus checklist item 0e. **(8) Unchanged:** D29 to D32 live checks (checklist 8, 21, 27 and the weekday offset), D18, D20, D25, D26, D36 and D37 stay open; `ALLOW_TRADING=false` and `ALLOW_LIVE=false` stay in force; no live order was sent and no position was closed in this round. The owner's overall reading is advanced development moving into integration validation; it is not certified for unattended automation or live trading.

**What changed in v4.2 (26 Oct 2026).** All of the following is **OWNER-REPORTED** from the owner's progress notes and chat of 26 Oct; the changed files and new tests were described, not shown to the editor, and the notes cite no named tests, so nothing here is VERIFIED. **(1) AI backend moved to Vertex AI.** The owner reports that `/api/pine/convert` returned HTTP 500 (the owner's notes give two accounts of the cause: a retired model name, and 402 and 404 billing and model errors; only the fix is recorded). `server.ts` now initialises `GoogleGenAI` in Vertex AI mode (`vertexai: true`, the owner's Google Cloud project, region `us-central1`) using local Application Default Credentials from `gcloud auth application-default login`, with `GEMINI_MODEL=gemini-2.5-flash`, so calls draw on the project's Google Cloud credits instead of an AI Studio key. A manual Pine-to-`StrategyContract` conversion is reported working, with pre-pass `validateStrategyAST` and `transpileStrategyCode` checks. Consequences: see the fixed-decision note in section 1, new D37, and the D22 update. **(2) UI page-jump bug (new D36).** Buttons without `type="button"` caused implicit form submits and full reloads that reset React state and sent the user to the dashboard. The fix (`type="button"` and `e.preventDefault()` on modal and view buttons, `PineConverterView.tsx` first) was provided; the owner's own notes list "confirm the fix is saved" and the browser end-to-end convert test as still pending, so D36 is **OPEN until that test is reported**. **(3) Phase 2 UI wiring reported done:** D35 (the success message now waits for a real ticket from the bridge), D19 (live tick spread passed into `botRunner.ts` so a wide spread blocks an order), and part of D28 (chart and Data Viewer wired to `/api/data/load` and `/api/data/audit`, a market status indicator, download controls with cancel, M1 file-size warning). No named tests are cited, and ground rule 8 and the D19 and D35 acceptance texts require them, so these move to **CLOSED IN CODE, NAMED TEST TO CONFIRM**, not to DONE. D28 still lacks resume, retry with backoff, earliest-bar report, the data-exists switch UI (not mentioned), confirmation that the market indicator is the Market closed label, the weekday acceptance and the weekend gap test on real data. **(4) Round 4 started: backtest engine hardening.** `tradingViewComparator.ts`: CSV parsing with short trades and zero-profit rows, and `Number.isFinite` guards so no `NaN` reaches the alignment score (this fixed the failing integration test of 26 Oct, where a non-finite trade `pnl` reached the comparator). `backtester.ts`: lot size, dollar P&L and cost components (spread, commission, slippage) sanitised, with default pip value, lot bounds and a default cost model when symbol specs are missing. `backtestValidation.test.ts`: parser test, comparator test, a `runBacktest()` integration test and a 70/30 split test. **Limits of this evidence:** the integration test compares the portal trades against a TradingView-style list built from the same trades, so it proves the comparator and the engine output are well-formed, not that the engine matches TradingView; and the 70/30 test slices generated candles and checks lengths and order, so it does not prove that ranking, optimisation or walk-forward cannot read held-out bars (FR-N3). Stage B items 1 (real 3-sample TradingView comparison), 4 (held-out guard in code) and 5 (walk-forward) therefore stay **OPEN**. Recommended before closing: assert that every `runBacktest()` trade has finite `pnl`, `entryPrice` and `exitPrice`, that the trade count is above zero, and remove the fallback `sim_1` trade so the test cannot pass on fake data. **(5) Gate (OWNER-REPORTED):** "257+" tests passing (the exact count is needed; v4.1 was 253), `npx tsc --noEmit` 0 errors and 0 warnings, `npm run build` into `dist/` clean. Lint, bridge pytest and the math self-tests were not re-reported and stay as last recorded (v4.1). **(6) Unchanged:** D29 to D32 live checks (checklist 8, 21, 27, weekday offset) are still OPEN; `ALLOW_TRADING=false` and `ALLOW_LIVE=false` stay in force. D18, D20, D25 and D26 stay open. **(7) Secret handling:** on 26 Oct the values of `ENCRYPTION_MASTER_KEY` and `BRIDGE_TOKEN` were pasted into a chat. They are loopback-only, so the risk is low, but D22 now covers them: rotate (the bridge token in both the portal `.env` and the bridge config; rotating the master key makes already-encrypted stored credentials unreadable, so re-enter them).

**What changed in v4.1 (25 Oct 2026).** The owner reports the bridge and portal hardening patch (called the "round 5 patch" in the owner's messages; this is not roadmap Round 5, which is reports) with this gate: **bridge pytest 61 of 61** (was 8), **vitest 253 of 253** (was 194; the patch added 59 checks), **`tsc --noEmit` 0 errors and 0 warnings**, and, in the owner's latest message, **`npm run lint` and `npm run build` clean** (all OWNER-REPORTED; the changed files and the new tests were described, not shown to the editor, so nothing here is VERIFIED in the strict sense of this plan). The owner also reports a live `/kill` call on `127.0.0.1:8001` with a 64-character Bearer token; it ran on a **Sunday with no positions open**, so it proves authentication and the empty case only, not a real close. **Status consequences.** D29 to D33 are CLOSED IN CODE AND TESTS (owner-reported) with the live checks still OPEN: D29 needs `/kill` on a demo position (checklist 21); D30 needs an order rejected with `ALLOW_TRADING=false` and a market-closed reject (checklist 8); D31 needs the terminal-closed test (checklist 27); D32 needs the offset measured on a weekday. D33 (synthetic candles) is closed in code and tests; the portal guard stays. D34 (dot symbols) is CLOSED: the portal routes reject `.` and `..` with tests and the bridge `validate_symbol` was patched earlier. D18 stays PARTIAL until the portal-side fail-closed query is confirmed in code. D19, D25 and D26 stay OPEN. **New D35:** `MarketsView` shows a false "Order executed" message (OPEN). The owner's wording "fully closed, tested and verified" for D29 to D32 is not adopted: the three-state wording above keeps checklist 21 from looking done when it is not. `ALLOW_TRADING=false` and `ALLOW_LIVE=false` stay in force until the live checks pass. Rounds 2 and 3 remain GATE-PARTIAL (chart and Data Viewer wiring, data-exists and Market closed UI, D28 remainder, weekday acceptance).

**What changed in v4.0 (25 Oct 2026).** The owner reports the data layer of Rounds 2 and 3 as tested: **vitest 194 of 194 in 12 files** (was 119 in 9), **lint 0 errors** (`tsc --noEmit`), **production build clean** (OWNER-REPORTED; the figures for bridge pytest 8/8 and the math self-tests were not re-reported and stay as last recorded). Three new test files carry it: `src/engine/marketdata/__tests__/dataApi.test.ts` (38), `candleCsv.test.ts` (17) and `candleQuality.test.ts` (20). Fixes and additions reported: `/api/data/check` now sums the stored per-year `candle_count` rows; `/api/data/audit` uses the weekend-aware engine in `candleQuality.ts` instead of a hard-coded `gapCount` of 0; the bulk download keeps `tick_volume` (the bridge field name) instead of storing 0; candle merging de-duplicates and no longer lets a partial download overwrite a full year file; symbol and timeframe parameters are validated before any disk access on load, save, audit and export; the download job rejects synthetic fallback bars; new routes `POST /api/data/import` (two-phase CSV import: preview, then commit) and `POST /api/data/autofix` (non-destructive, logged repair). **Status consequences:** D27 is CLOSED (named tests exist, owner-reported). D28 is PARTIAL, not closed: the reported work covers weekend-aware gaps, audit, CSV import, logged autofix and de-duplication, but cancel, resume, retry with backoff, earliest-bar report, measured broker UTC offset, M1 size warning, the UI for the data-exists switch and the Market closed label, the chart wiring and the weekday acceptance are not reported. Rounds 2 and 3 are therefore **GATE-PARTIAL (server side tested; UI wiring and weekday acceptance open)**, not 100% complete. **Bridge review findings (new D29 to D33, from the owner's review of `main.py`):** `/kill` reports `allFlat: true` and `closed: []` without calling MT5 (the earlier "verified-flat" claim and the pytest result do not prove a real close; **safety critical**); `POST /orders` and the cancel route return mock success tickets without MT5 execution (breaks ground rule 7); the account type is reported as DEMO when MT5 is disconnected (bridge side of D18); `utc_offset_hours` is hard-coded to 0 (conflicts with the measured-offset rule and with the +2 fallback in earlier notes); the bridge returns synthetic candles when MT5 loses its connection (the portal now rejects them, but the bridge should return an error). New D34: the symbol regex `/^[A-Za-z0-9._-]+$/` accepts `.` and `..`, so path-traversal safety needs an explicit rejection test, not the regex alone. `ALLOW_TRADING=false` limits the exposure for now. D18, D19, D20, D25, D26 stay open.

**What changed in v3.9 (25 Oct 2026).** The owner reports **Round 3** as built: `/api/data/load` (stored candles for the viewer and chart, FR-N6), `/api/data/audit` (OHLC logic errors, duplicate timestamps, gaps, quality score, FR-H5) and `/api/data/export` (CSV: time, open, high, low, close, tickVolume, spread). Gate figures are the same as after Round 2 (**pytest 8/8, vitest 119/119, lint 0, build clean**), so **Rounds 2 and 3 have no named tests** (D27 widened) and are **BUILT-UNTESTED**; the owner's phrase "built and verified" is not supported by the evidence. Gaps against Round 3's own acceptance (D28 widened): CSV **import** with mapping and timezone (FR-H6) not reported (the owner's summary lists export as FR-H6; export is FR-H7), weekend- and holiday-aware gap detection not reported, chart wiring to `/api/data/load` not reported, audit autofix not reported. D18, D19, D20, D25, D26 stay open. Files were described, not shown.

**What changed in v3.8 (25 Oct 2026).** The owner reports **Round 1** (bridge hardening and safety tests) and **Round 2** (timeframes, bulk download, data catalog, market-closed flag) as built, with this gate: **bridge pytest 8 of 8, `npm test` 119 of 119, `npm run lint` 0 errors, `npm run build` successful** (OWNER-REPORTED; files not shown to the editor). Round 1: Bearer-only auth with `hmac.compare_digest` on the bridge and the portal bridge client (D24, NFR-S4), symbol regex `/^[A-Za-z0-9._-]+$/` on `/tick` and `/candles` (NFR-S2), JSON-only errors (NFR-S3), HTML pre-checks returning 502 `BRIDGE_BAD_RESPONSE` on `/api/bridge/tick`, `/candles` and `/test` (D23), `maskSecret`, and `test_bridge.py` grown from 2 to 8 tests. Round 2: all 8 timeframes mapped in the bridge, storage and API validation (FR-H10); `/api/data/check` (FR-N5); `/api/data/bulk-download` background job with chunked requests, progress and partitioned SQLite storage (FR-H1); `/api/bridge/tick` computes `ageSeconds` and sets `marketClosed` above 300 s or when the timestamp is missing (NFR-W1). **Caution:** the vitest count did not change (119 before and after), so Round 2 has **no named tests** (new D27) and is **BUILT-UNTESTED**; the weekday acceptance has not run; cancel, resume, retry, de-duplication, earliest bar, measured UTC offset, M1 warning and the UI for data-exists and Market closed are not reported (new D28). D18, D19, D20, D25 and D26 stay open. Per ground rule 8 a bullet is DONE only with a named test.

**What changed in v3.7 (25 Oct 2026).** The owner reports **119 of 119 tests passing in 9 files, `npm run lint` with no errors and `npm run build` successful** (OWNER-REPORTED; pytest and math self-tests not reported). Two fixes produced it. (1) Bot runner: `runnerAndRisk.test.ts` "DEMO bot refuses order dispatch if authoritative broker account is non-demo (REAL or CONTEST)" received `DUPLICATE_ORDER_INTENT` instead of `REJECTED`, because the account-type check sat after the order intent was logged. The order is now: signal, risk evaluation, account-type check for `DEMO_LIVE` bots (REAL, CONTEST, missing or unknown is rejected with a critical risk event), then intent logging, duplicate protection, bridge dispatch; the old check in the dispatch block was removed. (2) `server.ts`: TS2339 on `job.result` and `job.error`; the optimization job now has an explicit `BackgroundJob` interface (fields typed `any` for now). The earlier failing tick test (D23) passes in the 119/119 run, but its fix was not shown. Build warnings: bundle 660.90 kB (over 500 kB) and an ephemeral encryption key allowed in the test environment (new D26). D18 is now PARTIAL. None of this has run against a real bridge. Round 0 closes after the code recheck listed in section 3A.

**What changed in v3.6 (25 Oct 2026).** The owner reports **118 of 119 local tests passing** (OWNER-REPORTED; lint and build for the current code not yet reported). One test fails: `stageD1Security.test.ts`, "`/api/bridge/tick` returns the quote and rejects invalid symbols" (defect **D23**). The owner also reports hardening of the bridge (`main.py`: Bearer-only auth, JSON-only errors, symbol regex on `/tick` and `/candles`, `/kill` with a verified-flat result, `/positions`) and of the server (`server.ts`: `apiSecurityMiddleware`, token and login-number masking, HTML-response guards, account-type check before the idempotency log in `/api/broker/order`). Neither file was re-read by the editor, so these items are **OWNER-REPORTED, not VERIFIED**, and the bridge changes have no pytest yet. Round 0 moves from CHANGED-UNRUN to **GATE-PARTIAL** (edited; the owner's run passes except D23; closes after lint, build and the code recheck). Round 1 is in progress. New defects D23 to D25 and requirements NFR-S2 to NFR-S4 are below. A paste-and-retest fix loop is allowed inside a round (ground rule 17).

**What changed in v3.5.** The code is no longer produced in AI Studio. It is edited in **rounds**: the owner uploads a zip, Claude edits it and returns a full project zip, and the owner runs the gate on the laptop. Round 0 already made the fix-stage edits D1 to D8; they are **CHANGED-UNRUN** (no lint, test or build was possible in the editing environment). New defects D18 to D22 are in section 4. The AI Studio sessions of v3.3/v3.4 are replaced by the round plan in section 3A. Stage content (D, B, W, S, L and the later stages) is unchanged unless marked.

**How to use.** Give Claude this file, the Requirements and Status PDF v4.3 and a fresh zip. Claude works **one round at a time**, only the round named in the pointer below, and stops at the checkpoint.

---

## 0. Current stage pointer (the owner edits this line)

```
CURRENT ROUND: (1) stabilise and record (v4.3): back up the project and `data/zaboraa.sqlite`; on the current integrated project run `npm ci`, `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build` and `python -m pytest test_bridge.py -v`, and record the exact counts (the last recorded figure, 260/260, has no date or ZIP); send the zip (no `.env`, no Google credential files) and `mt5-bridge` so the fixed `main.py` and the dataset-activation files can be rechecked in code; (2) data acceptance on the Exness demo (D38 to D42, checklist 0e): all 8 timeframes for EURUSDm and XAUUSDm, repeat download adds nothing, page-boundary audit, forming candle absent, restart keeps the active research dataset and its provenance, XAUUSD and XAUUSDm select each other; (3) confirm and record: save the `type="button"` fix in `PineConverterView.tsx` and run the browser end-to-end convert test (D36); name the tests behind D19 and D35; (4) owner live checks that close D29 to D32 (checklist 8, 21, 27 and the weekday offset); (5) finish D28: resume, retry, earliest bar, data-exists switch UI, Market closed label, weekday acceptance and weekend gap test; (6) round 4: real 3-sample Pine comparison with TradingView, held-out guard in code (FR-N3), walk-forward.
NEXT ROUND: rest of round 1 (confirm CORS and demo-detection pytest cases; D18, D20, D25, D26), D41 and D42 (end-of-history handling, download depth), D37 (Vertex AI config, `.env.example`, route tests), then rounds 5 and 6 (Stage B reports and saved reports)
THEN: 5 and 6 (Stage B), 7 (Stage W), soak test (S), 8 (Stage L)
LATER (only if the owner says so): rounds 9 to 13 (Stages 5, 6, 7, 10)
```

Do not start any round other than the CURRENT or NEXT ROUND named above, even if a later one looks small. The owner edits this block after each gate.

## 1. Fixed decisions (do not revisit without the owner)

- **Product:** local-first web portal on one Windows laptop. Node/Express + React/Vite (TypeScript) portal on `127.0.0.1:3000`; small Python/FastAPI MT5 bridge on `127.0.0.1:8001`; SQLite via `better-sqlite3` is the source of truth; strategies run in the QuickJS sandbox; Gemini is called server-side only (Pine conversion and analysis, cached), **since v4.2 through Vertex AI with local Application Default Credentials** (`gcloud auth application-default login`; no API key in the Pine route; model id in `GEMINI_MODEL`). ADC is a local credential file: never commit or upload it. Hosting the server elsewhere would need a service account and is a Stage 10 decision.
- **Delivery workflow (new in v3.5):** code is edited in rounds on project zips, not in AI Studio. Each round the owner uploads src, server.ts, package.json, package-lock.json, docs, configs **and the `mt5-bridge` folder**; Claude returns the full project zip without `.env`, `data/` and `dist/`; the owner unzips over the project, keeps their own `.env` files and `node_modules`, runs `npm install` (if package.json changed), `npm run lint`, `npm test`, `npm run build` and `python -m pytest test_bridge.py -v`, and sends back error text (no secrets). Never uploaded: `.env` files (variable names live in `.env.example`), `node_modules`, `.git`, `data/`, `dist/`, the bridge `.venv`. **Fix loop inside a round (v3.6):** the owner may run `npm test`, paste the exact failing output (no secrets) with the relevant source and test files, and receive code blocks to paste, then re-run and report the new counts. The editing environment has **no network and no node_modules**, so it cannot run npm, pytest or MT5; nothing is VERIFIED until the owner reports real results.
- **Machine:** Windows laptop only. Node v24 (package.json requires >= 22.13), Python 3.13. **No VPS for now.** Live runs will be attended sessions of 1 to 2 hours on the laptop; a VPS is reconsidered only after several clean sessions.
- **No Vercel.** It cannot run this server, the SQLite file or the loopback bridge. Add no code or variables for it. **Supabase is a later stage (10)** and only receives a one-way copy of report summaries; candles never leave local SQLite.
- **Broker:** Exness via MT5 (login, trading password, server name; no REST key). Demo symbols are suffixed (for example `XAUUSDm`, `EURUSDm`); always go through the symbol resolver. **Since v4.3:** the bulk download appends the configured suffix (`brokerState.symbolSuffix`) before calling the bridge and stores candles under the **canonical** symbol, so the catalog, Data Manager and Backtesting Lab must all match on the canonical symbol (D40). Everything defaults to demo or paper.
- **Symbols:** EURUSD, GBPUSD, USDJPY, XAUUSD (broker suffix handled by the resolver).
- **Timeframes (all must work end to end: download, store, chart, backtest):** M1, M5, M10, M15, M30, H1, H3, D1. MT5 provides M10 and H3 natively; confirm in the bridge's timeframe map.
- **Download order:** D1, H1, M15 first; then M30, H3, M10, M5; **M1 last** (largest; roughly 370,000 bars per symbol per year). Broker history depth varies, so detect and report the earliest available bar instead of assuming five years. If M1 over several years proves too slow in SQLite, report it and propose options; keep SQLite until measured evidence says otherwise. Do not add Parquet on your own.
- **Weekends and holidays:** ticks return the last close. The UI must show "Market closed", never present stale prices as live (NFR-W1).
- **Bridge authentication (v3.6):** the bridge accepts `Authorization: Bearer <token>` only (owner-reported). The `x-bridge-token` header is no longer accepted; every portal-to-bridge call must send Bearer (D24).
- **Loopback rule (v3.6):** `apiSecurityMiddleware` allows only `localhost` and `127.0.0.1` Host and Origin values. Preview domains (`.run.app`, `aistudio`) are accepted only when `AI_STUDIO_PREVIEW === 'true'`; keep it unset (D25).
- **Secrets:** never print, log, commit or ask for real values of `ENCRYPTION_MASTER_KEY`, `BRIDGE_TOKEN`, `MT5_PASSWORD`, API keys or account login numbers. Refer to them by variable name only.

## 2. Ground rules (apply to every stage)

1. Do only the current round. When it is finished, run `npm run lint`, `npm test` and `npm run build` (and `python -m pytest` in `mt5-bridge` when the bridge changed) **if the environment allows it; if not, say so plainly, label the work CHANGED-UNRUN and list the exact commands the owner must run.** Then stop and report. Wait for the owner's gate results before starting the next round.
2. Do not change unrelated code, UI styling or behaviour. Keep diffs small and reviewable. Do not rewrite or restart working work.
3. Never claim a feature works against a real broker unless it was exercised against the MT5 bridge. If no bridge is connected, the UI must say "SIMULATION: no broker connected".
4. Every safety rule needs an automated test, and a test that only checks the happy path does not count. Include a failing-case test for each. **Never delete or weaken a test to make it pass.**
5. No hard-coded secrets, tokens, passwords or default keys anywhere. Fail at startup if a required secret is missing.
6. Default everything to demo/paper. LIVE must stay impossible unless every gate passes.
7. **No fake data.** Nothing may invent prices, positions, tickets, balances or results. Anything simulated carries a visible SIMULATED badge and is research-ineligible.
8. **A bullet is DONE only if it has a named test** (or a recorded manual bridge check). Otherwise list it as NOT DONE or UNVERIFIED. Never write "complete" in `docs/PROGRESS.md` or `docs/STATUS.md` for something the code does not do; correct earlier wrong lines.
9. **Resume protocol** (use at the start of any session that follows an interrupted run): run `git status` and `git diff --stat`; read `docs/PROGRESS.md` and `docs/STATUS.md` and treat their "complete" lines as unproven; run `npm install`, lint, test, build and record the exact test count and failures; fix compile errors and failing tests first with the smallest change; audit the stage bullet by bullet as EXISTS+TESTED / EXISTS+UNTESTED / PARTIAL / MISSING; finish **only** the gaps; do not touch EXISTS+TESTED items.
10. **Keep output short.** Do not print whole files. Use the report format at the end of section 3.
11. Update `docs/STATUS.md` (three tables) and add one line per stage to `docs/PROGRESS.md` (date, test count, status, NOT DONE items) at every checkpoint.
12. If budget runs short, stop cleanly at the end of a finished unit of work, update the docs, and print the completion matrix.
13. Local files and `.env` files are never committed; run `git status` before declaring a stage finished and confirm no `.env` is listed.
14. **Never request, open, copy or return a real `.env`.** If one arrives in an upload, leave it out of the returned zip, say so, and tell the owner which keys to rotate (D22).
15. **Unrun is not verified.** A test file that was written but not executed is listed as UNVERIFIED by name. Test counts are recorded from real runs only, never predicted, in `PROGRESS.md`.
16. **Ask for the files you need.** If a task depends on a file that was not uploaded (for example `mt5-bridge/main.py`), say so and do not guess its contents.
17. **Fix loop rule (v3.6).** When a test fails, ask for the full failure output and the current source and test files; do not guess. Fix the code, not the test. Change a test expectation only if the expectation is demonstrably wrong, say so, and get the owner's agreement. Never skip, delete or loosen a test to reach a pass count.

## 3. Build order and status

| Order | Stage | Scope | Status (27 Oct 2026) |
|---|---|---|---|
| done | 0 | Repository hygiene | DONE |
| done | 1 | Safety fixes (kill switch logic, token, CORS, demo/real, live gate, local API protection, master key, sandbox) | DONE, caveats D5, D13 |
| done | 2 / 2B | One real strategy execution path, QuickJS, costs, jobs, AI cache | DONE |
| done | 3A | Typed bridge client, order lifecycle, idempotency, reconciliation | DONE (mocked bridge only) |
| 1 | **D** | **Data and safety**: token out of the browser, live ticks, bridge tests, 8 timeframes, bulk download, data-exists switch, data viewer, market-closed indicator | **IN PROGRESS.** Round 1 mostly done (pytest 61/61, owner-reported v4.1). Rounds 2 and 3 server side GATE-PARTIAL (vitest 194/194, owner-reported 25 Oct): check, bulk download, load, audit, export, import, autofix. UI wiring reported done 26 Oct (chart, Data Viewer, market indicator, cancel, M1 warning; named tests to confirm). Open: resume, retry, earliest bar, data-exists UI, weekday acceptance, live checks for D29 to D32. **v4.3 (owner-reported 27 Oct): the EURUSDm paging failure (D38, D39) and the Active Research Dataset activation (D40) are fixed; restart persistence, provenance, all-timeframe acceptance, end-of-history handling (D41) and download depth (D42) are open; no gate recorded since the three fixes** |
| 2 | **B** | **Backtest track**: Pine 3-sample comparison, full report, saved reports, held-out data, walk-forward, batch runner, comparison | NOT STARTED |
| 3 | **W** | **Bot wiring** (finish 3B, finish 4): runner started by the server, watchdog fed, no client-side fake execution, kill-switch failure path, docs corrected | **PARTLY EDITED in round 0** (D1 to D4: botScheduler.ts, server-routed order and close, kill-switch failure state; GATE-PARTIAL, 119/119; bridge `/kill` is a stub per the v4.0 review (D29), not a real close; `/positions` owner-reported). Audit table, D9 to D12, D21 and the live-gate end-to-end test NOT STARTED |
| 4 | **S** | Demo soak test, 1+ week, owner-run | NOT STARTED |
| 5 | **L** | Live pilot: final backtest of the chosen strategy, small attended laptop session | NOT STARTED |
| later | 5 | Fundamentals (5A, 5B) | NOT STARTED, optional |
| later | 6 | Market Structure and Positioning (6A to 6C) | NOT STARTED, optional |
| later | 7 | Portfolio Flow view (read-only) | NOT STARTED, optional |
| later | 8 | Spec gaps (section 11) | NOT STARTED |
| later | 10 | Supabase sync, authentication, hosting decision | NOT STARTED |

Stages D and B do not need the bot runner, so backtesting can start before Stage W. **No bot runs on the demo or live account until Stage W has passed its gate.** Stage 7 must never start before Stage 6C has passed, and must never delay Stage W.

**Report format (every checkpoint, compact):**
1. Gate result: lint / tests (count) / build / pytest (count).
2. Audit table for the stage: bullet, file, test name, status (DONE / NOT DONE / UNVERIFIED: needs live MT5).
3. Files changed in this session (list only).
4. What is still NOT DONE or UNVERIFIED.
5. The next stage you will start. At the very end, print the full completion matrix for every stage worked on.

## 3A. Round plan (replaces the AI Studio sessions)

Each round is one upload from the owner and one zip back. About 8 rounds reach a small live pilot; about 13 in total with the later features. A round may need a short fix pass if the gate shows errors, which can add a round.

| Round | Scope | Stage | Gate / acceptance |
|---|---|---|---|
| 0 | Fix stage D1 to D8 (done; GATE-PARTIAL: 119/119, lint and build pass, owner-reported 25 Oct; code recheck open) | D/W | Code recheck of D1 to D8 and of the two v3.7 fixes; real counts go in `PROGRESS.md` |
| 1 | **MOSTLY DONE (v4.1: pytest 61/61 and vitest 253/253, owner-reported; D29 to D34 closed in code and tests; open: live checks for D29 to D32, D18 portal-side confirmation, D20, D25, D26; v4.2: D19 and D35 closed in code, named tests to confirm).** Bridge tests and safety: Bearer-only auth (D24), CORS, symbol regex, JSON-only errors, `/kill`, `/positions`, demo detection, order rejection (D13, D17); tick invalid-symbol test (D23); preview-domain switch (D25); account type fails closed (D18); feed the spread filter (D19); check the `/tick` time field (D20) | D | pytest and Vitest counts; a failing-case test for each |
| 2 | **GATE-PARTIAL (v4.0).** All 8 timeframes in the bridge; bulk download with progress; data-exists switch; market-closed indicator in the UI. Server side tested (`dataApi.test.ts`, 38 tests, owner-reported); UI, cancel, resume, retry, earliest bar and weekday acceptance open (D28). **v4.3:** broker-symbol mapping and bridge paging fixed (D38, D39, owner-reported, EURUSDm M1); D41 and D42 proposed | D | 8 timeframes download for XAUUSDm on a weekday; second run says "data exists"; second run adds 0 bars |
| 3 | **GATE-PARTIAL (v4.0).** Data viewer and quality: load, audit (weekend-aware), CSV import (preview and commit), export, logged autofix built and tested (`candleQuality.test.ts` 20, `candleCsv.test.ts` 17, `dataApi.test.ts`; owner-reported). Chart and Data Viewer wiring to `/api/data/load` and `/api/data/audit` NOT DONE; weekend gap test on real data not run | D | Chart shows stored data; gap test across a weekend |
| 4 | **STARTED (v4.2, owner-reported): comparator and backtester hardened, 4-test validation file; real TradingView comparison, held-out guard and walk-forward OPEN.** Backtest correctness: 3-sample Pine comparison with TradingView; held-out data rule; walk-forward | B | Held-out guard failing-case test; walk-forward fixture |
| 5 | Reports: full 10-part report, PDF export, saved-reports page | B | Saved-report round trip; each section checked on a known fixture |
| 6 | Batch runner (50 to 100 scripts), side-by-side comparison, shortlist rules | B | 5-script batch with one failure; ranking excludes held-out data |
| 7 | Bot wiring and audit: D9 to D12, D21, 3B audit table, docs corrected, live-gate end-to-end test, alerts | W | Kill switch shows a failure with the bridge stopped; a RUNNING bot evaluates a closed bar |
| soak | Demo soak test on the laptop, 1+ week, between rounds 7 and 8 | S | No duplicate orders; correct reconciliation after 3 restarts |
| 8 | Live pilot preparation: laptop-session rules, final backtest of the chosen strategy, go/no-go checklist | L | Manual checklist complete; owner sign-off |
| 9 | Fundamentals data: FRED, economic calendar, COT | 5A | Series IDs confirmed by the owner |
| 10 | Fundamentals use: news-blackout rule, currency bias score | 5B | Blackout blocks an order in a test |
| 11 | Market structure: swings, BOS/CHoCH, FVG, order blocks, strength meter | 6 | No look-ahead; no institutional-flow claims |
| 12 | Portfolio Flow: read-only Sankey of this account | 7 | Seven named tests |
| 13 | Supabase one-way report sync and login (only if a website is wanted) | 10 | Free-tier limits checked first |

**Round 0 gate (do this first).** Unzip Zaboraa-FX-02 over the project, keep your own `.env` files and `node_modules`, run `npm install`, `npm run lint`, `npm test`, `npm run build`. Send any error text (no secrets). **Result (owner-reported, 25 Oct): 119 of 119 tests pass in 9 files; lint no errors; build succeeded.** An earlier run had 118 of 119 (D23). The earlier prediction was about 108 (103 plus 5 in `botScheduler.test.ts`); the real total is higher because `stageD1Security.test.ts` and other Stage D1 tests were added. 119 is the number of tests (9 files). Still to report: math self-tests and bridge pytest. Send the `mt5-bridge` folder (without `.env` and `.venv`) with round 1.

**Round 0 changes to recheck in code (not in reports):**
- D1/D2: `src/engine/botScheduler.ts` is started by `server.ts` when `BRIDGE_URL` is set. Every 10 s it polls bridge `/health` and feeds the watchdog only on a real response. It reconciles once, fetches candles, drops the still-forming bar and runs bots on the latest closed bar. It does nothing if the bridge is down, the watchdog has tripped, reconciliation failed, or the last closed bar is stale. The fake manual heartbeat route was removed.
- D3: Place order and close position in `App.tsx` call `/api/broker/order` and `/api/positions/:ticket/close`; state refreshes from the server; random tickets and local balance changes are gone.
- D4: `KillSwitchModal.tsx` shows a loud "NOTHING WAS CLOSED" failure when the server is unreachable.
- D5: `HOST` defaults to `127.0.0.1`; `npm start` uses `tsx`.
- D6: new server routes `/api/bridge/status`, `/api/bridge/candles`, `/api/bridge/tick`; the Settings token field is removed.
- D7 (partial): generated demo datasets are research-ineligible. Static prices in Markets and Dashboard still need confirming.
- D8: `.env.example` and `mt5-bridge/.env.example` added.
- Also: the portal no longer starts out showing ONLINE before the bridge is confirmed; `/api/bridge/tick` flags ticks older than 5 minutes as `marketClosed` (the UI does not use it yet).

## 3B. Acceptance tracker (new in v4.3)

One row per requirement. Evidence columns use the labels at the top of the Requirements and Status PDF. A blank cell means no evidence is on record. This table replaces reading several status notes side by side; update it at every checkpoint.

| Requirement | Implemented | Named test on record | Owner-confirmed live | Evidence still missing |
|---|---|---|---|---|
| Broker-symbol mapping, canonical storage (D38) | Yes, seen in `server.ts` | None cited | Download no longer 404s (EURUSDm) | Test with and without suffix; XAUUSD, GBPUSD, USDJPY; one resolver for every route |
| Bridge candle paging with `date_to` (D39) | Reported; `main.py` not seen | None cited | Page-2 error gone (EURUSDm M1) | Recheck `main.py`; pytest for the `date_to` branch; page-boundary audit (no overlap, no gap) |
| End of history is a normal completion (D41) | No | | | Implement and test both cases |
| Download depth (D42) | Cap of 200 pages | | | Measure broker M1 depth; decide on extend mode |
| Eight timeframes download and store (FR-H10) | Yes (per 4.4 summary) | `dataApi.test.ts` (server side) | | M1, M5, M10, M15, M30, H1, H3, D1 on the demo terminal, twice |
| Append-only storage, forming candle excluded | Yes (per 4.4 summary) | | | Repeat download adds 0 bars; newest stored bar is older than the current bar |
| Active Research Dataset (D40) | Files replaced from the supplied ZIP | None cited | Backtesting Lab sees active datasets | Restart persistence; persisted provenance; XAUUSD and XAUUSDm matching; named tests |
| Backtest validation and 20% holdout (per 4.4 summary) | Yes | `backtestValidation.test.ts` (4 tests per v4.2) | | Run against the current build; FR-N3 guard that stops ranking from reading held-out bars |
| Reports, chart markers, print to PDF | Yes (per 4.4 summary) | | | Browser run: save, reopen, delete a report; markers; PDF |
| Engine versus TradingView (Stage B item 1) | Comparator built | Well-formed output only | | Three real Pine samples with TradingView exports |
| Pine conversion on Vertex AI (D36, D37) | Yes | | Manual conversion reported | Browser convert test; failing-case route test; `.env.example` |
| Bridge safety, live checks (D29 to D32) | Closed in code | pytest 61 (last recorded) | Sunday empty `/kill` only | Checklist 8, 21, 27; weekday offset |
| Local gate | | 260/260 reported without date or ZIP; pytest 61; 4.4 summary: 64-file syntax transpile only | | Fresh `npm ci`, lint, test, tsc, build, pytest on the current project |
| Stage B, W, S, L entry criteria | See the stage sections | | | Stage B needs rounds 4 to 6; W needs the audit table; S needs W and a one-week demo; L needs all of them and explicit owner approval |

## 4. Defect register (code review 24 Oct 2026; updated 27 Oct 2026)

| ID | Defect | Fix | Stage | Status (25 Oct) |
|---|---|---|---|---|
| D1 | Bot runner is never started; starting a bot only sets a database flag | Server-side scheduler for RUNNING bots, started only after startup reconciliation | W | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D2 | Watchdog gets no real heartbeat | Poll bridge `/health` on an interval, feed the watchdog, auto-pause, banner | W | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D3 | `handlePlaceOrder`, `handleClosePosition`, `handleExecuteKillSwitch` simulate locally (random tickets, local balance) | Call server routes; update state only from server responses | W | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D4 | Kill-switch modal shows success when the server is unreachable | Loud failure with Retry; simulation text "SIMULATION: nothing was closed" | W | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D5 | `HOST` defaults to `0.0.0.0`; `npm start` uses `node` | Default `127.0.0.1` (`0.0.0.0` only if `AI_STUDIO_PREVIEW=true`); start via `tsx` | D | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D6 | Browser holds the bridge token and calls the bridge directly | All bridge calls go through server routes; token only in server env | D | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D7 | Static prices and generated SIMULATED datasets (marked research-eligible) | Live ticks from bridge; remove generated datasets or mark research-ineligible and block in bots | D | PARTIAL (datasets research-ineligible; static prices unconfirmed) |
| D8 | README references a missing `mt5-bridge/.env.example`; `.env.example` lacks guidance | Add the file, add comments (required vs optional), document `ALLOWED_ORIGINS` | D | GATE-PARTIAL (119/119, lint, build pass; recheck in code) |
| D9 | `STATUS.md` and `PROGRESS.md` contain unproven "complete" lines | Correct after each stage proves its items | W (and every stage) | PARTIAL (round 0 added an UNVERIFIED line) |
| D10 | Stage 4 closed with only 3 tests | A named test for every removed fake path and every server-routed order handler | W | OPEN |
| D11 | An interrupted 3B run edited 15 files without any gate | Resume protocol and the 3B audit table (Stage W) | W | OPEN (audit table) |
| D12 | Origin of the 103/103 test count was unknown | Owner re-ran locally: 103/103 (owner-reported). Record date and count in `PROGRESS.md` | W | RESOLVED for old code; re-record after round 0 |
| D13 | Local, untested edits to `mt5-bridge/main.py`: CORS middleware, token check (now Bearer only per the owner, see D24), lifespan handlers, `/positions`, `/kill`, symbol regex, JSON-only error handlers | **Keep these edits.** Add tests (below), commit | D | PARTIAL (v4.1: pytest grew from 8 to 61, owner-reported; which of CORS, demo detection and order rejection are among the new cases was not itemized; `main.py` and the tests not seen by the editor) |
| D14 | Bridge token was shared in a chat | RESOLVED (owner rotated it). Never paste secrets into chats | done | RESOLVED |
| D15 | Browser showed BRIDGE OFFLINE | RESOLVED (`ALLOWED_ORIGINS`, CORS middleware, Bearer support, token pasted in Settings). The pasted token is a workaround until D6 | done | RESOLVED |
| D16 | Public Vercel deployment with no login; repo privacy unconfirmed | Owner action: delete or protect the Vercel project, make the repo private, search history for secrets | owner | OPEN (owner) |
| D17 | Bridge test suite has only 2 tests (`test_health_unauthorized`, `test_health_authorized`) | Add the missing cases (Stage D, item 2) | D | PARTIAL (v3.8: now 8 tests; missing CORS, demo/contest/real detection, order rejected with `ALLOW_TRADING=false`, order validation) |
| D18 | `queryBridgeAccountType` assumes DEMO when the bridge cannot be reached | Fail closed: unknown account type is treated as non-demo; failing-case test | D (round 1) | PARTIAL (v3.7: the bot runner rejects a DEMO_LIVE order unless the authoritative account mode is DEMO, before intent logging; confirm `queryBridgeAccountType` itself no longer defaults to DEMO) ; v4.1: the bridge side is fixed in code and tests (D31, owner-reported); confirm the portal query fails closed |
| D19 | The bot spread filter gets no spread value, so it is skipped | Feed the live spread from the tick; a wide spread must block an order (test) | D/W | **CLOSED IN CODE (v4.2, owner-reported: spread passed into `botRunner.ts`); named test to confirm** |
| D20 | The `/api/bridge/tick` code assumes the bridge `/tick` response has a time field; `main.py` was not seen | Check against `main.py`; the `marketClosed` flag depends on it | D (round 1) | OPEN (Round 2 computes `ageSeconds`; check the time field name against `main.py`, test stale and fresh ticks) ; v4.0: `main.py` was reviewed by the owner but the `/tick` time field name was not reported; confirm |
| D21 | Modify-position is still local-only | Server route and bridge call, or remove the button | W (round 7) | OPEN |
| D22 | The uploaded zip contained a real `.env` (Gemini key, master key, bridge token) | Owner: rotate the Gemini key and bridge token if the zip went anywhere public; back up `ENCRYPTION_MASTER_KEY` privately; never upload `.env` again | owner | OPEN (owner). v4.2: `ENCRYPTION_MASTER_KEY` and `BRIDGE_TOKEN` values were pasted into a chat on 26 Oct; rotate both (bridge token in portal and bridge, master key invalidates stored encrypted credentials) |

| D23 | `stageD1Security.test.ts`: "`/api/bridge/tick` returns the quote and rejects invalid symbols" fails with `SyntaxError: Unexpected token '<'`. The mock bridge answers an invalid symbol with HTML (or throws) and the server runs `JSON.parse` on it. The v3.6 notes list HTML guards as added, so find out why this route bypasses them | In the `/api/bridge/tick` handler: (1) validate the symbol with the same regex as the bridge and return 400 `{ error: 'INVALID_SYMBOL' }` before calling the bridge; (2) read the bridge reply as text; if it starts with `<!DOCTYPE` or `<html` or is not valid JSON, return a JSON error (502 `{ error: 'BRIDGE_BAD_RESPONSE' }`), never a thrown SyntaxError; (3) map a bridge JSON error for an invalid symbol to `INVALID_SYMBOL`; (4) make sure the test's mock returns what the real bridge now returns (JSON). Needs the full failure output, `server.ts` and the test file to confirm. Do not weaken the test | D (round 1) | RESOLVED by test run (119/119); fix not shown, confirm in code |
| D24 | The bridge now accepts `Authorization: Bearer` only; `x-bridge-token` is rejected. Any caller still using it (`bridgeClient.ts`, the scheduler health poll, old curl scripts) gets 401 | Confirm every portal-to-bridge call sends Bearer; tests: scheduler `/health` poll authenticates, missing, malformed and wrong token give a JSON 401; update curl commands in the checklist | D (round 1) | RESOLVED pending code check (v3.8, owner-reported; pytest covers the bridge side: Bearer accepted, legacy header rejected; confirm scheduler health poll and `bridgeClient.ts` send Bearer) |
| D25 | `apiSecurityMiddleware` accepts preview domains (`.run.app`, `aistudio`) when `AI_STUDIO_PREVIEW === 'true'`, which widens the loopback-only rule; AI Studio is no longer used. The same variable also gates `HOST=0.0.0.0` in D5 | Keep it unset; owner decides whether to remove both branches. Failing-case test: with the variable unset or false a `.run.app` Origin is rejected | D (round 1) | OPEN (owner decision) |
| D26 | The test environment lets the server use an ephemeral encryption key; credentials encrypted with it are lost on restart. The master-key refusal rule must still hold outside tests | Real `.env`: persistent `ENCRYPTION_MASTER_KEY`, `ALLOW_EPHEMERAL_KEY` unset; test that the server refuses to start without the key when not under test; keep the key backed up (D22) | D | OPEN |
| D27 | Round 2 and Round 3 routes had no named tests (vitest stayed at 119 through Rounds 1 to 3) | Named tests with a failing case each | D | **CLOSED (v4.0, owner-reported):** 194/194; `dataApi.test.ts` (38: data routes, catalog summing, path guards, import and autofix validation), `candleCsv.test.ts` (17), `candleQuality.test.ts` (20). Not seen by the editor; recheck in code. Still no test for the 8-timeframe bridge mapping on the bridge side (pytest) or for `ageSeconds` and `marketClosed` unless named in `dataApi.test.ts`; confirm |
| D28 | Stage D items not reported for Round 2 and 3 | Report each as DONE (with a test) or NOT DONE; run the weekday acceptance | D | **PARTIAL (v4.2).** Reported done 26 Oct (owner-reported, named tests to confirm): chart and Data Viewer wired to `/api/data/load` and `/api/data/audit`, market status indicator, download cancel, M1 size warning. Still open: resume, retry with backoff, earliest bar, data-exists switch UI, confirm the indicator is the Market closed label, weekday acceptance, weekend gap test. Earlier (v4.0): Reported done: weekend-aware gap detection, OHLC and duplicate audit, CSV import with mapping (preview then commit), logged non-destructive autofix, merge and de-duplication, UTC ISO export format, tick volume kept. NOT reported (stay open): download cancel, resume, retry with backoff, earliest bar returned by the broker, measured broker UTC offset (see D32), M1 size warning, UI for the data-exists switch, UI Market closed label, chart wiring to `/api/data/load` and `/api/data/audit`, the weekday acceptance (all 8 timeframes for `XAUUSDm`; second run shows "data exists"). **v4.3:** the paging failure that blocked the weekday acceptance (D38, D39) is reported fixed; the acceptance itself has not been run on all 8 timeframes |
| D29 | `main.py` `/kill` reported `allFlat: true` and `closed: []` without calling the MT5 position-close API (v4.0 review). **Safety critical** | Real close loop with re-read of positions, failure on a failed close; pytest with a mocked `MetaTrader5`; then the manual check with a demo position (checklist 21) | D (round 1) / W | **CLOSED IN CODE AND TESTS (v4.1, owner-reported; pytest 61/61). LIVE CHECK OPEN:** `/kill` ran on 127.0.0.1:8001 on a Sunday with no positions open, which proves auth and the empty case only. Run checklist 21 with a demo position, then mark verified |
| D30 | `POST /orders` and the cancel/delete route returned mock success tickets without issuing MT5 commands (v4.0 review). Broke ground rule 7 | Wire to `order_send` with validation and `ALLOW_TRADING` rejection, or a clear not-implemented error; tests with a mocked `MetaTrader5` | D (round 1) | **CLOSED IN CODE AND TESTS (v4.1, owner-reported). LIVE CHECK OPEN:** no real order and no market-closed reject has been reported; run checklist 8 (and a weekday demo order with a stop-loss before any ALLOW_TRADING=true session) |
| D31 | The bridge reported `account_type: DEMO` when MT5 was disconnected (bridge side of D18) | Return UNKNOWN or a JSON error; portal treats it as non-demo; failing-case tests | D (round 1) | **CLOSED IN CODE AND TESTS (v4.1, owner-reported; now UNKNOWN when MT5 is down). LIVE CHECK OPEN:** terminal-closed test (checklist 27) not reported |
| D32 | `utc_offset_hours` was hard-coded to 0 in `main.py`; FR-H9 requires a measured offset | Measure from the broker server time against UTC, record it with the dataset, test; if measurement fails mark the dataset 'offset unknown' | D | **CLOSED IN CODE AND TESTS (v4.1, owner-reported). LIVE MEASUREMENT OPEN:** record the measured offset on a weekday; confirm the fallback behaviour in code |
| D33 | `main.py` returned synthetic candles when the MT5 terminal lost its connection (rule 7) | JSON error instead of fake bars; pytest; keep the portal guard and its test | D (round 1) | **CLOSED IN CODE AND TESTS (v4.1, owner-reported).** Mock data removed in `main.py`; the portal guard stays. Checklist 27 covers the terminal-closed case on real MT5 |
| D34 | The symbol regex `/^[A-Za-z0-9._-]+$/` also matched `.` and `..`; no length cap | Explicit rejection of `.`, `..`, leading dots and over-long symbols on the data routes and the bridge, with named failing-case tests | D | **CLOSED AND VERIFIED BY TESTS (v4.1, owner-reported):** fixed and tested on the portal routes; the bridge `validate_symbol` was patched earlier. Code recheck still applies like every owner-reported item |
| D35 | `MarketsView` shows an "Order executed" message that does not depend on the server result (found in the v4.1 patch review) | Show success only after the server confirms a real ticket; show the rejection reason otherwise; named test | W / D | **CLOSED IN CODE (v4.2, owner-reported: success waits for a real ticket); named test to confirm** |
| D36 | Buttons without `type="button"` triggered implicit form submits and page reloads, resetting React state and returning to the dashboard after convert or save (found 26 Oct) | `type="button"` and `e.preventDefault()` on modal and view buttons; browser end-to-end convert test; a component test that clicking Convert does not submit a form | W / B | **OPEN: fix provided; applied and tested not yet reported** |
| D37 | AI auth moved to Vertex AI with local ADC (26 Oct). `.env.example` and the docs still list `GEMINI_API_KEY`; other Gemini routes (analysis) may still use the key; no named test for the Pine route failing cleanly when ADC or the model is missing; promotional credits can expire; the model id may have a retirement date | Update `.env.example` and docs; confirm every Gemini call uses one client; failing-case test (no ADC, bad model returns JSON with a clear error, not HTML or a bare 500); check the model lifecycle page and keep the id only in `GEMINI_MODEL`; note the credit expiry date | B | OPEN |
| D38 | The bulk download sent canonical symbols (`EURUSD`) to the bridge; the Exness demo terminal only knows suffixed names (`EURUSDm`), so `/candles` answered 404 `SYMBOL_NOT_FOUND` | Append `brokerState.symbolSuffix` when missing, call the bridge with the broker symbol, store under the canonical symbol, keep both in the job record; named test with and without the suffix and a failing case for a symbol the broker lacks | D | **CLOSED IN CODE (v4.3, owner-reported; seen in `server.ts`); named test and all-symbol acceptance to confirm.** Another route (`server.ts`, `normalizedSymbol`) applies the same suffix rule; confirm all callers use one resolver |
| D39 | After D38 and the ISO date fix, page 2 of a bulk download failed with 502 `(-2, 'Terminal: Invalid params')`. With `date_to` and no `date_from`, `get_candles` called `copy_rates_range` from `datetime(2000, 1, 1)`, a 26-year range. The earlier tz-aware and `unquote` explanation was wrong and is withdrawn | With only `date_to`, call `copy_rates_from(symbol, tf, end_utc_aware, count)`; use `copy_rates_range` only when `date_from` is given; drop `unquote`; pytest with a mocked `MetaTrader5` for the `date_to` branch (asserts `copy_rates_from` is used, with a tz-aware UTC datetime and the requested count) and a failing case for a bad date | D | **CLOSED (v4.3, owner-reported: fixed).** The uploaded `main.py` is still the pre-fix copy, so the fix is **not seen in code** and has no named test; recheck. Scope tested: EURUSDm M1 only, as far as stated |
| D40 | Stored candles did not become active research datasets, so Backtesting Lab reported zero active datasets and blocked simulations. The 4.4 summary also records that provenance is held only in in-memory `DatasetRecord` state and that exact-symbol filtering can hide an `XAUUSDm` dataset from an `XAUUSD` context | Load eligible stored datasets into the research catalog at startup and after a download; persist provenance in SQLite; match on the canonical symbol; named tests including a restart fixture and a failing case for simulated data | D / B | **ACTIVATION CLOSED (v4.3, owner-confirmed after replacing files from the supplied ZIP; files not named or seen). OPEN:** restart persistence, provenance persistence, canonical-symbol matching across Data Manager and Backtesting Lab, named tests |
| D41 | The page loop treats the bridge's 502 `NO_DATA` (empty result) as a failure. When the broker's history ends exactly on a full page, the next page is empty and the job is marked FAILED after its data was saved (found by reading `server.ts`, not yet seen failing) | After at least one saved page, treat 502 with error `NO_DATA` as the end of history: finish the timeframe, record the earliest bar and the page count; on page 1 it stays a failure. Tests for both cases | D | OPEN (proposed 27 Oct; not owner-reported) |
| D42 | The page loop stops at 200 pages of 5,000 bars (1,000,000 bars per timeframe per job) and every job restarts from the newest bar, so M1 history deeper than about 2.7 years (at the plan's 370,000 bars a year) can never be reached, and the job reports success (derived from `server.ts` and the plan's figure, not tested) | Measure the broker's real M1 depth first; if deeper history is wanted, add an extend mode that starts from the earliest stored bar (FR-H3) or a configurable cap; report "depth capped" in the job result | D | OPEN (proposed 27 Oct; decide after measuring) |

## 5. Requirement additions since v1.0

- **FR-H10** Timeframes M1, M5, M10, M15, M30, H1, H3, D1 downloadable, stored, charted and backtestable.
- **FR-N1** Batch runner for 50 to 100 Pine scripts; one failure never stops the rest.
- **FR-N2** Side-by-side comparison of all results.
- **FR-N3** Held-out data reserved from selection, used once for the final check.
- **FR-N4** Saved reports page; reopen any past report.
- **FR-N5** Data-exists switch before every download.
- **FR-N6** View stored data visually for any symbol and timeframe.
- **NFR-W1** "Market closed" shown when ticks are stale.
- **NFR-S1** Bridge token and MT5 credentials never reach the browser.
- **NFR-L1** Laptop live-session rules (Stage L).
- **NFR-S2** (v3.6) Bridge input validation: strict symbol regex on `/tick` and `/candles`; invalid or malicious input is rejected before the MT5 terminal is called. The server applies the same check first.
- **NFR-S3** (v3.6) Bridge and portal server return JSON only, never HTML or plain text, including for upstream failures.
- **NFR-S4** (v3.6) Bridge authentication is `Authorization: Bearer` only.
- **NFR-S2 extension** (v4.0) Symbol and timeframe parameters are validated on every data route (load, save, audit, export, import) before any disk access; `.` and `..` must be rejected explicitly (D34).
- **FR-H5, FR-H6, FR-H7, FR-N5, FR-N6** (v4.0) Server side built and tested (owner-reported); UI wiring open.
- **FR-H11** (v4.3, derived from D38) A download request for a canonical symbol reaches the bridge with the broker suffix and is stored under the canonical symbol; a missing broker symbol is reported as such, never retried under another name.
- **FR-H12** (v4.3, derived from D39 and D41) A page is `count` bars ending at `date_to` (never a multi-year range); running out of history after at least one saved page is a normal completion with the earliest bar reported, not a failure.
- **FR-N7** (v4.3, derived from D40) Stored candles with genuine MT5 provenance become active research datasets after a download and again after a restart; provenance is persisted, not only held in memory; simulated or imported-unknown data stays ineligible.

The three v4.3 requirements are the editor's wording of what the fixes imply; the owner accepts, edits or drops them.

---
## Stage D: Data and safety (CURRENT)

**Goal.** From the portal the owner can connect to the MT5 terminal (demo or real, demo by default), request history for all 8 timeframes, save it locally, see whether it already exists, view it on a chart, and nothing about this path exposes a secret to the browser. The bridge is properly tested.

**Status (25 Oct, v3.6):** item 1 (D5 to D8) was edited in round 0 and is GATE-PARTIAL (119 of 119 tests pass, owner-reported). Stage D1 security work (Bearer-only auth, symbol regex, JSON-only errors, masking, `apiSecurityMiddleware`) is owner-reported and not yet covered by pytest. Items 2 to 8 are otherwise NOT STARTED. Item 1 still needs its named tests (no `/api` response contains the token; no direct bridge URL in browser code; `HOST` default). Items 2 and 3 need the `mt5-bridge` folder (rounds 1 and 2). **v3.8:** Round 1 and Round 2 built per the owner (pytest 8/8, vitest 119/119, lint 0, build ok). Items 3 (timeframes), 4 (bulk download) and 5 (data-exists) exist as code without named tests or the weekday acceptance (D27, D28); item 8 has the server-side `marketClosed` flag but no reported UI label; items 6 and 7 not reported.

**v4.0 status (25 Oct):** items 3 to 7 are tested on the server side (vitest 194/194, owner-reported): timeframes, bulk download with merge and de-duplication, data-exists check, audit with weekend-aware gaps, CSV import, export and logged autofix. Still NOT DONE or not reported: cancel, resume, retry with backoff, earliest-bar report, measured UTC offset, M1 warning, the data-exists UI, the chart wiring to `/api/data/load`, the Market closed label (item 8 UI), and the weekday acceptance. The bridge stubs D29 to D33 must be fixed before any order or kill-switch test is meaningful.

**v4.1 status (25 Oct):** the bridge stubs D29 to D33 are closed in code and tests (pytest 61/61, owner-reported) and D34 is closed. Live demo checks for D29 to D32 are still open. Still NOT DONE or not reported from v4.0: chart and Data Viewer wiring, data-exists UI, Market closed label, cancel, resume, retry, earliest bar, M1 warning, weekday acceptance.

**v4.2 status (26 Oct, owner-reported):** D19 and D35 closed in code and D28 partly wired (chart, Data Viewer, market indicator, cancel, M1 warning), named tests to confirm; resume, retry, earliest bar, data-exists UI, weekday acceptance and the live checks for D29 to D32 remain open.

**v4.3 status (27 Oct, owner-reported):** the bulk download now reaches the broker under the suffixed name and pages past page 1 (D38, D39), and stored candles activate as research datasets (D40). Not yet shown: all 8 timeframes for EURUSDm and XAUUSDm, a repeat download that adds nothing, a clean page boundary, restart persistence and provenance of the research dataset, end-of-history handling (D41), the depth cap (D42), and a recorded gate for the current project.

**Out of scope:** bots, risk manager wiring, kill switch UI (Stage W), Pine and backtests (Stage B), fundamentals, Supabase.

1. **Security and wiring fixes (D5, D6, D7, D8).**
   - D5: `HOST` defaults to `127.0.0.1`; `0.0.0.0` only if `AI_STUDIO_PREVIEW=true`; `npm start` runs through `tsx`.
   - D6: remove the bridge token field and every direct browser-to-bridge call (`handleTestBridge`, `handleFetchFromBridge` and similar). The browser calls only `/api/*`; the server calls the bridge with `BRIDGE_TOKEN` from its own environment. The Settings "Test connection" button calls a server route. The browser must never receive the token, not even masked in a response body. Test: no response from any `/api` route contains the token string.
   - D7: Markets and Dashboard show live ticks via a server route from the bridge; remove static `SYMBOL_SPECS` prices from anything displayed as a price. Remove the generated SIMULATED benchmark datasets at startup, or mark them `isResearchEligible: false` and block them in bots and in rankings.
   - D8: add `mt5-bridge/.env.example`; fix the README steps; add comments to the root `.env.example` saying which variables are required; document `ALLOWED_ORIGINS` (default `http://localhost:3000`; the owner sets `http://localhost:3000,http://127.0.0.1:3000`).
2. **Bridge tests (D13, D17).** Keep the existing local edits to `mt5-bridge/main.py`. Add pytest tests with a mocked `MetaTrader5` module for: missing, wrong and malformed `Authorization` headers rejected with a JSON 401 on every endpoint (`/health`, `/tick`, `/candles`, `/kill`, `/positions`); `Authorization: Bearer` accepted; `x-bridge-token` alone rejected (D24); an invalid or malicious symbol on `/tick` and `/candles` rejected before `MetaTrader5` is called, with a JSON body; a missing parameter returns JSON; no endpoint returns HTML or plain text on error; `/kill` closes all open positions and reports a verified-flat state, and reports failure when a close fails;  the comparison still uses constant-time `hmac.compare_digest`; CORS allows only the configured origins and never `"*"`; `/positions` needs auth and returns the expected shape; demo detection for DEMO, CONTEST and REAL (anything not DEMO is non-demo); an order is rejected while `ALLOW_TRADING=false`; order validation (stops level, volume step and limits). Server-side tests (Vitest): `/api/bridge/tick` rejects an invalid symbol with 400 `INVALID_SYMBOL` and turns an HTML bridge reply into a JSON error (D23); `/api/bridge/test` response never contains the token or an unmasked login number; a `.run.app` Origin is rejected unless `AI_STUDIO_PREVIEW` is `'true'` (D25); `/api/broker/order` rejects a non-DEMO or unknown account type before any idempotency intent is written, and an unreachable bridge counts as non-demo (D18). Update the README with the exact Windows command `python -m pytest test_bridge.py -v`.
3. **Timeframes (FR-H10).** Map all 8 timeframes to the MT5 `TIMEFRAME_*` constants in the bridge. The database, data catalog, chart and backtester accept all 8. Tests: each mapping, including M10 and H3; an unsupported timeframe is rejected with a clear error.
4. **Bulk history download job.** Per symbol and timeframe: chunked requests, progress, cancel, resume, retry with backoff, de-duplication, incremental extend (FR-H3). Report the earliest bar the broker actually returned. Store UTC timestamps and the **measured** broker UTC offset (do not rely on the default +2). Respect the download order in section 1. Warn before an M1 download that it is large. **Paging (v4.3):** the first page is `count` bars from the newest closed bar; each later page is `count` bars ending at `date_to`, sent as ISO-8601 with an explicit offset; the bridge never asks MT5 for a multi-year range. The symbol sent to the bridge carries the broker suffix; storage uses the canonical symbol (D38, D39).
5. **Data-exists switch (FR-N5).** Before a download, check the catalog and show: whether data exists, date range, bar count, quality score, last update. Offer: use existing, extend, re-download. When data exists, show it in a table and on the chart.
6. **Quality checks.** Weekend- and holiday-aware gap detection, duplicate bars, OHLC sanity, a quality report with a content hash. Autofix, if offered, is logged and never silent.
7. **Data viewer (FR-N6).** The candlestick chart reads stored data for any symbol and timeframe, with zoom and scroll. Existing overlays stay; RSI, MACD and ATR overlays are Stage 8.
8. **Market-closed indicator (NFR-W1).** If the latest tick timestamp is older than a configured threshold, or the market schedule says closed, show "Market closed" in Markets, Dashboard and the order ticket. Test with a stale-tick fixture and a fresh-tick fixture.

**Tests required (each with a failing-case counterpart):** token never in any `/api` response; no direct bridge URL in browser code; `HOST` default; every bridge test above; timeframe mapping; download job progress, cancel and resume; data-exists switch with existing and missing data; gap detection across a weekend; market-closed indicator.

**Acceptance (owner will verify on the laptop):** the 8 timeframes download for XAUUSDm on a weekday; the same download again shows "data exists"; the chart shows the stored data; lint, test, build and pytest pass with the counts reported; `git status` shows no `.env`.

**Checkpoint:** lint, test, build, pytest; update `docs/STATUS.md` and `docs/PROGRESS.md`; print the report and stop.

---

## Stage B: Backtest track

**Goal.** Paste Pine, convert, review, backtest on stored data, get a detailed saved report; then run 50 to 100 scripts, compare them, and choose candidates **without fooling ourselves**. Do the items in this order.

1. **Pine acceptance test.** With 3 sample scripts supplied by the owner: convert, review, backtest on stored data, and compare the trade list with a TradingView export using `tradingViewComparator.ts`. Document every difference (commission, slippage, pyramiding, `process_orders_on_close`, `strategy()` settings mapped to the backtest config). Unsupported Pine functions are flagged, never guessed. Store license, author and source URL with each script and show a reminder (FR-P9). Backtests on candles use bar-level spread, so state in every report that costs are approximate.
2. **Report completion (FR-R1, 10 parts).** HTML and PDF export; MAE/MFE; P and L by hour and weekday; monthly returns heatmap; return histogram; costs breakdown; drawdown detail (maximum drawdown, duration, underwater curve); Monte Carlo confidence bands; robustness section; the assumptions used.
3. **Saved reports page (FR-N4).** Persist every report in the database (large files under `data/reports/`). List, filter, reopen, export and delete. Each report stores the Pine source, converted code, parameters, dataset hash and range, cost model and engine version, so any result can be reproduced.
4. **Held-out data rule (FR-N3), before the batch runner.** Reserve the most recent N months per dataset (default 12) as held-out. Ranking, optimization and walk-forward functions cannot read it; enforce this in code and test it (a selection-mode run that touches a held-out bar fails). A "final check" run on held-out data is allowed **once per script** and logged; a second run requires an explicit override and is flagged in the report.
5. **Walk-forward (FR-B9).** Rolling or anchored in-sample / out-of-sample windows; parameters chosen in-sample, evaluated out-of-sample; aggregated out-of-sample equity in the report. Tests on fixtures with known answers. Random search and parallel workers (FR-B8) only if they keep the laptop responsive.
6. **Batch runner (FR-N1).** Queue 50 to 100 scripts. Per script: convert (AI, cached), then **wait for the owner's review and approval of the converted code** (never auto-approve), smoke test, backtest, store. Failures are isolated and reported. Progress, cancel, resume after restart. Limit concurrency to protect the laptop and respect free-tier AI rate limits. Record every script attempted, including failures, so the number of attempts is known.
7. **Comparison (FR-N2).** Ranking table with net result after costs, maximum drawdown, profit factor, expectancy, trade count, win rate, overfitting score and walk-forward result; filters (minimum trades, maximum drawdown); side-by-side equity curves; shortlist selection. **Held-out data never enters the ranking.** Show how many scripts were tried and warn about multiple comparisons.
8. **Selection protocol.** Rank on the earlier data; reject scripts with few trades; run walk-forward on the shortlist only; test the top few **once** on the held-out block; if a script fails there, it is not tuned and retried on the same block; the winner then goes to a demo forward test (Stage S) before any live session.

**Tests:** 3-sample comparison harness; each report section present and numerically checked on a known fixture; saved-report round trip; held-out guard (failing case); walk-forward fixture; batch of 5 scripts with one failing script; ranking excludes held-out data.

**Acceptance:** a 5-script batch runs end to end; the comparison page ranks them; no ranking number was computed from held-out bars; lint, test and build pass.

**Checkpoint:** as in Stage D.

---

## Stage W: Bot wiring (finish 3B and Stage 4)

**Goal.** What the reports called "complete" actually runs. Fix only these, each with a named failing-case test. Apply the resume protocol first (rule 9).

**Round 0 status (25 Oct):** items 1 to 4 were edited (botScheduler.ts with 5 tests, server-routed order/close, kill-switch failure state) and are GATE-PARTIAL (owner's run 25 Oct: 119 of 119 tests, lint and build pass). They count as done only when the full gate passes (tests, lint, build) and the code is rechecked. Items 5 and 6 are NOT STARTED. Also pending here: D21, D19 and the live-gate end-to-end test.

1. **Start the bot runner (D1).** A server-side scheduler loop in `server.ts` for RUNNING bots, evaluating closed bars from bridge candles, started **only after** startup reconciliation. Starting a bot must actually run it. Test: a RUNNING bot evaluates a new closed bar; a failing bot goes to `ERROR` without stopping the others; the idempotency key includes the bar time; `no_new_orders` is honoured.
2. **Feed the watchdog (D2).** Poll the bridge `/health` on an interval, feed `globalWatchdog`, auto-pause all bots when the heartbeat is missing, show a banner; resume only after a manual, confirmed resume.
3. **Remove client-side fake execution (D3).** `handlePlaceOrder`, `handleClosePosition` and `handleExecuteKillSwitch` call the server routes (`/api/broker/order`, close, `/api/kill-switch`) and update state only from server responses. No `Math.random` tickets, no local balance changes.
4. **Kill-switch modal (D4).** A fetch error or network failure shows a loud failure with Retry; it never shows success and never clears local state. In simulation mode show "SIMULATION: nothing was closed".
5. **Docs and tests (D9 to D12).** Correct `PROGRESS.md` and `STATUS.md`; add a named test for each removed fake path; record the real test count and date.
6. **3B audit table.** Fill it in and finish only gaps:

| # | Stage 3B bullet | Status to fill |
|---|---|---|
| 1 | Runner detects closed bars from bridge candles and passes the bar time into the idempotency key | |
| 2 | Runner honours `no_new_orders` | |
| 3 | One failing bot goes to `ERROR` without stopping the others | |
| 4 | PAPER never calls the bridge order endpoint | |
| 5 | DEMO refuses a non-demo account | |
| 6 | LIVE requires all gates (`ALLOW_LIVE`, token, typed confirmation) | |
| 7 | Bots stored in SQLite; resume only after reconciliation has run | |
| 8 | Risk manager has every rule: max risk per trade, max lot, max open total and per symbol, max daily loss (UTC day), max drawdown, spread filter, trading hours, allowed symbols, news-blackout hook | |
| 9 | Every allow and block is logged to `risk_events` | |
| 10 | Watchdog pauses all bots when the heartbeat is missing and shows a banner | |
| 11 | Watchdog resumes only after a manual confirmed resume | |
| 12 | Bridge tests: pytest in `requirements-dev.txt`; exact Windows command in the README | |

**Acceptance:** lint, test, build, pytest pass with real counts; the audit table has no MISSING rows (or lists them as NOT DONE); with the bridge stopped, the kill switch shows a failure; starting a bot on a **demo** account (with `ALLOW_TRADING=true` set by the owner for the soak test only) evaluates bars. Stage 4 is closed only now.

---

## Stage S: Demo soak test (owner-run, 1+ week)

Bots run on the **demo** account only. Success: no duplicate orders; correct reconciliation after at least three restarts of the portal and the bridge; the watchdog pauses and resumes correctly; the audit log is complete for every automated order (strategy, signal reason, risk outcome); the chosen strategy's forward results are compared with its backtest. The owner records the results; the next round fixes only what the soak test shows.

## Stage L: Live pilot (laptop only)

Starts only after Stage W, the soak test and the manual checklist (section 12), with `ALLOW_LIVE=true` and typed confirmation. **Laptop live-session rules (NFR-L1):**
- Attended sessions of 1 to 2 hours, owner present, laptop plugged in, sleep and hibernate disabled, stable internet.
- Small size. Every order carries a broker-side stop-loss (and take-profit), so a laptop or network failure never leaves an unprotected position.
- Test the kill switch with the bridge stopped before each session.
- At the end: close positions or confirm each has a broker-side stop-loss and take-profit; stop the bots; check reconciliation after the next start.
- Before the session, run the final backtest of the chosen strategy on the latest data and keep the report.
- A VPS is considered only after several clean sessions.

---

# Reference: completed and partial stages (kept as acceptance criteria for audits)

These stages were written in the earlier prompt. Their text is kept so audits can check each bullet. Do not redo DONE stages; only fix what the status line says is open.


## Stage 0: Repository hygiene (reference, DONE)

**Status: DONE** (docs/STATUS.md exists). Open leftovers: README still wrong about `mt5-bridge/.env.example` (defect D8, fixed in Stage D).


- Add `data/`, `.aistudio/` and `*.sqlite*` to `.gitignore`. Remove the committed `data/zaboraa.sqlite*` files and the test rows in them from the repo.
- Remove the requirements PDF from `public/assets/` (it is served publicly) and move it to `docs/`.
- Complete `.env.example` with: `PORT`, `HOST` (default `127.0.0.1`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `ENCRYPTION_MASTER_KEY`, `ALLOW_LIVE`, `BRIDGE_URL`, `BRIDGE_TOKEN`, `SANDBOX_MEMORY_MB`, `SANDBOX_BAR_TIMEOUT_MS`, `FRED_API_KEY`. Add comments saying which are required.
- Fix `package.json`: `start` must not run `node server.ts` directly. Either run it with `tsx`, or add an esbuild step that builds `dist/server.js`. Add `"engines": { "node": ">=22.13" }` (the data layer is now `better-sqlite3`, which replaced the legacy sqlite3 binding and `node:sqlite`).
- **Old plans are superseded.** The files under `.aistudio/artifacts/brain/*/implementation_plan.md` describe features that are not all implemented in the code (for example: kill switch "verifies flat", strategies "run in the sandbox", bots "execute"). Treat the code as the source of truth and these plans as history only. Move them to `docs/archive/` and do not use them to decide what is already done.
- Create `docs/STATUS.md`, a single living document with three tables: **Implemented and tested**, **Implemented but untested or simulated**, **Planned / not started**. Update it at the end of every stage. Never mark something as implemented unless a test or a manual bridge check proves it.
- Update `README.md` with exact Windows setup steps: install Node and Python, create `.env`, start the bridge, start the portal, and run the tests.

---

## Stage 1: Safety fixes (reference, DONE with caveats)

**Status: DONE** (proved by `safety.test.ts`, `bridgeClient.test.ts`). Caveats: server `HOST` still defaults to `0.0.0.0` (D5); bridge `main.py` was edited locally after this stage (D13) and has only 2 pytest tests (D17).


1. **Kill switch.** Rewrite `/api/kill-switch`:
   - Persist `no_new_orders = true`, stop all bots in the database, and cancel pending orders first.
   - Call the bridge `/kill`. If the bridge is unreachable, times out, returns 401 or any non-OK response, that is a FAILURE (`loudFailure: true`, reason `BRIDGE_UNREACHABLE`), never success.
   - Retry up to 5 times within 10 seconds. After each attempt call the bridge positions endpoint and only report `FLAT_VERIFIED` if the bridge itself returns an empty position list.
   - Add `POST /api/kill-switch/retry` and a "Retry now" button in the failure banner.
   - If no bridge is configured, return "SIMULATION: no broker connected" and never claim flat.
   - Tests: bridge down, bridge returns 401, partial close failure, market closed, success with verified-empty positions.
2. **Bridge token.** Remove both default tokens (`dev-bridge-token` and the hard-coded one in the bridge). Both sides read `BRIDGE_TOKEN` from the environment and refuse to start if it is missing or shorter than 24 characters. Compare tokens in constant time (`hmac.compare_digest`).
3. **Bridge CORS.** Remove `"*"`. Set `allow_credentials=False`. Read allowed origins from an env var that defaults to the portal's localhost origin. Set `reload=False` in `uvicorn.run`.
4. **Demo/real detection.** The MT5 account trade modes are DEMO, CONTEST and REAL. Compare against the named constants (`mt5.ACCOUNT_TRADE_MODE_DEMO`, `mt5.ACCOUNT_TRADE_MODE_REAL`), never bare numbers. The bridge currently treats `trade_mode == 0` as REAL in three places (account endpoint, health, order guard). Treat anything that is not DEMO as non-demo (fail safe). Add pytest tests with a mocked `MetaTrader5` module for DEMO, CONTEST and REAL. Also add a diagnostic print in the README: `print(mt5.account_info().trade_mode, mt5.ACCOUNT_TRADE_MODE_DEMO)` so I can verify on my own demo account.
5. **Server-side live gate.** The order route must not trust the `mode` sent by the client. Ask the bridge for the authoritative account type. If the account is not DEMO, require ALL of: `ALLOW_LIVE=true` on the server, a valid single-use token, and a stop-loss. Remove the ability of `/api/broker/connect` to set mode to LIVE. Tests: a request claiming `mode: 'DEMO'` against a REAL account must be rejected; a missing `ALLOW_LIVE` must be rejected.
6. **Local API protection.** Bind to `127.0.0.1` by default (use `HOST`). Generate a random session secret at boot and require it on every `/api` request (HttpOnly, SameSite=Strict cookie set when the page loads). Reject requests whose `Host` or `Origin` is not localhost. Tests for missing secret and for a foreign Origin.
7. **Master key.** If `ENCRYPTION_MASTER_KEY` is missing, refuse to start unless `NODE_ENV=development` AND `ALLOW_EPHEMERAL_KEY=true`, with a loud warning. Replace the fixed scrypt salt with a random per-install salt stored in the database. Prefix encrypted payloads with a version marker.
8. **Smoke test sandbox.** Delete the `new Function` path in `src/engine/workerSandbox.ts`. The Strategy Studio smoke test must call a server route that runs the strategy in the QuickJS sandbox. Keep the existing sandbox-escape tests and add tests for: `globalThis.constructor.constructor('return process')()`, dynamic `import()`, `while(true)`, a memory bomb, and a strategy trying to call `fetch`.

---

## Stage 2 / 2B: One real strategy execution path (reference, DONE)

**Status: DONE** (proved by `strategyExecution.test.ts`, `engine.test.ts`). Known gaps: walk-forward, PDF reports and multi-symbol runs are built in Stage B, not here.


1. Delete the `if strategyId === …` logic in `getStrategyExecutor`. Convert the four built-in strategies into real TypeScript contract code (`init` / `onBar`) so they run through the same path as user strategies.
2. Every backtest, optimization and bot must run strategy code through the QuickJS sandbox (transpile with source maps, then run). An unknown or invalid strategy must produce an error, never a silent fallback to the Donchian logic.
3. Rework the sandbox for speed and correctness: compile the strategy once, then call a persistent `onBar` function per bar (no building and evaluating a script string each bar). Update `ctx` each bar with the current equity, balance, and a read-only snapshot of open positions. Keep the bounds-checked history access and the canary look-ahead trap. Provide indicator helpers (SMA, EMA, RSI, ATR, crossover) so strategies don't recompute everything per bar.
4. Move backtests and optimizations to server-side jobs persisted in the `jobs` table. The server loads candles from storage by dataset ID (no 20 MB candles in the request body). Cancel must really stop the job (check a flag per trial and per N bars), and a cancelled job must never be overwritten with `COMPLETED`.
5. Fix costs: replace the fixed `1.5` swap multiplier with a configurable triple-swap weekday (default Wednesday for FX) and per-symbol swap rules. Use a single source for pip value (the symbol spec), not two.
6. Add the missing `/api/pine/analyze` route or remove the button. Make the Pine and AI cache key include code, title, notes, model name and prompt version, and persist it to an `ai_cache` table.
7. Tests: a custom strategy gives different trades than Donchian; a "buy on bar 30" strategy gives a hand-calculated known result; a strategy reading a future bar fails; cancel stops a long optimization.

---

## Stage 3: Real execution, reconciliation and bots (reference)

**Status: 3A DONE, 3B PARTIAL.** Items 1 to 4 and the typed bridge client, order lifecycle, idempotency and reconciliation (3A) are done and unit-tested with a mocked bridge only; no real demo order has been sent. Items 5 to 7 and 9 (bot runner, risk manager, watchdog = 3B) exist as tested modules but are **not wired into the server** (D1, D2). Item 8 (bridge) needs the tests in Stage D (D13, D17). Finish 3B in **Stage W**.


1. Create `bridgeClient.ts` with typed calls, timeouts and an error taxonomy (unreachable, unauthorized, rejected, timeout).
2. Order route: after the intent is logged, send the order to the bridge with magic number, short comment (25 characters or fewer), SL and TP. Filled maps to `FILLED` with a ticket, rejected maps to `REJECTED` with the return code, and a timeout or network error leaves the order as `UNKNOWN` and is never retried blindly. If no bridge is connected, mark the order `SIMULATED` and show a SIMULATED badge.
3. Idempotency key: derive it from `botId + symbol + closed-bar time + signal index + side`, supplied by the bot runner. Remove the wall-clock minute bucket.
4. Startup reconciliation: query the bridge for positions and recent deals by magic number.
   - Pending order found at the broker becomes `FILLED`, or is adopted.
   - Pending order not found after a grace period becomes `FAILED` (never auto-resent).
   - Broker position with a known bot's magic but no database record is adopted.
   - Broker position with an unknown magic is flagged as an `ORPHAN` risk event.
   - Database shows open but the broker closed it: mark it closed with the broker's price and time.
   - Adopted position with no stop-loss: raise a risk event and require manual action (configurable auto-close).
5. Bot runner (server-side, bots stored in SQLite, not React state): on each new closed bar, feed the strategy, then the risk manager, then the order route. Modes: PAPER (simulated fills at live bridge prices, no orders), DEMO (bridge account must be DEMO), LIVE (all gates).
6. Risk manager: max risk per trade, max lot, max open positions (total and per symbol), max daily loss, max drawdown, spread filter, trading hours, allowed symbols, and a news-blackout hook (used in Stage 5). Log every decision in `risk_events`.
7. Heartbeat watchdog: if the bridge heartbeat is missing for N seconds, pause all bots, log a risk event and show a banner. Broker-side SL stays in place.
8. Bridge: `/order` validates SL against the stops level and volume against step and limits, uses magic and comment, and picks a valid filling mode. Add `/positions`, `/deals?magic=`, cancel-pending, and make `/kill` cancel pendings and persist kill state across bridge restarts. Add pytest tests with a mocked `MetaTrader5` module.
9. Tests: duplicate bar signal produces one order; restart in each reconciliation direction; watchdog pause; risk manager rejections for every rule.

---

## Stage 4: Remove fake data (reference, PARTIAL)

**Status: PARTIAL.** Seeded fake bots, positions and audit entries are removed. Remaining: static prices and generated SIMULATED datasets (D7, fixed in Stage D) and client-side fake order, close and kill-switch handlers (D3, D4, fixed in Stage W). Stage 4 closes only when both are done and each removed fake path has a named test (D10).


Remove the hard-coded positions, bots and the `Math.random()` price simulator from `App.tsx`. The dashboard, positions and bots views read from the database and the bridge. With no bridge, show empty states with the banner "Not connected: simulation only". Anything that is simulated must be labelled SIMULATED.

---


---

# Later stages (do not start unless the owner says so)

## Stage 5: Fundamental data module (LATER, optional)

**Status: NOT STARTED.** Do not begin before Stage B has passed. Backtests run on price alone first. Roadmap IDs: 5A (storage and fetchers), 5B (blackout rule, bias score, UI). Series IDs must be confirmed by the owner, not guessed.


**Storage (SQLite):** `macro_series` (id, source, series_id, name, currency, frequency, unit), `macro_observations` (series_id, period_date, value, released_at UTC, vintage_note), `calendar_events` (id, time_utc, currency, title, impact, forecast, previous, actual, source, fetched_at), `cot_reports` (market, report_date, released_at, long, short, net), `fundamental_fetch_log` (source, time, status, rows, error). Every record keeps `released_at` in UTC.

**Fetchers (server-side, scheduled; all keys stay in `.env`):**
- **FRED API** (free key, about 120 requests per minute, respect it): for each currency (USD, EUR, GBP, JPY plus gold-relevant USD series) fetch policy rate, CPI, unemployment, GDP and 10-year yield. **Do not invent series IDs.** Search FRED for each, list the exact IDs you chose in a config file, and ask me to confirm them. Use the `realtime_start` / `realtime_end` vintage parameters so first-release values are kept as published, not the revised ones.
- **Economic calendar:** the unofficial Forex Factory weekly JSON feed (`cdn-nfs.faireconomy.media/ff_calendar_thisweek.json`) for upcoming events, forecast and previous. It has no "actual" values and may change or disappear; handle failure gracefully, cache it, and keep a snapshot history. Mark the source as unofficial in the UI.
- **CFTC Commitments of Traders:** weekly public reports, stored with the real release time (positions are as of Tuesday and published later; record both dates).
- Optional: an MQL5 script in the bridge folder that exports the MT5 built-in economic calendar (including actuals) for the bridge to serve. Mark it as unverified until I test it.
- Scheduler: daily macro refresh, weekly calendar and COT refresh, retry with backoff, log every run.

**API:** `/api/fundamentals/series`, `/api/fundamentals/observations?series=&asOf=`, `/api/fundamentals/calendar`, `/api/fundamentals/cot`. The `asOf` parameter returns only values with `released_at <= asOf`.

**UI:** a new **Fundamentals** tab with: a per-currency overview table (policy rate, latest CPI and trend, unemployment), an event calendar with an impact filter and local-time display, a chart of any series with optional price overlay, COT positioning view, and a data-freshness panel (source, last fetched, errors). Clean empty state when nothing is fetched yet.

**Decision layer (advisory, deterministic, documented):**
1. **News blackout rule** in the risk manager: block new entries N minutes before and after events of chosen impact for the symbol's currencies. In backtests it applies only if historical events exist; otherwise the report must state "news blackout not applied: no historical calendar".
2. **Currency bias score** per pair, from rate differential, inflation momentum and COT positioning z-score, output in the range −1 to +1 with a plain-language explanation of each component. Document the formula in the code and README as a heuristic, not a prediction.
3. **Strategy access:** expose `ctx.fundamentals.pairBias(symbol)` and `ctx.fundamentals.nextEvent(symbol)` inside the sandbox, returning only data released before the current bar time.
4. Backtest reports state whether fundamentals were used and which as-of policy applied. Run fundamental-based strategies through the same walk-forward, Monte Carlo and overfitting tools.

**Tests:** a value released after the current bar time is invisible to a strategy (look-ahead test); the vintage returns the first-release value, not the revised one; calendar fetch failure does not crash the app; the blackout blocks an order inside the window and allows one outside it.

**Rules:** fundamentals never place or approve a live order on their own. The AI summary, if added, is advisory and labelled AI-generated.

---

## Stage 6: Market Structure & Positioning module (forex and gold only) (LATER, optional)

**Status: NOT STARTED.** Roadmap IDs 6A, 6B, 6C. Do not begin before Stage 5B has passed.


Name the tab **"Market Structure"**, not "Smart Money". All copy must say these are *price-action patterns computed from candles* and that COT is *reported futures positioning, weekly*. Nothing in this module may claim to show what large investors are doing in real time. It is advisory only and must never place or approve an order on its own.

**1. Structure engine** (`src/engine/structure/`, pure deterministic functions, fully unit-tested):
- Swing highs and lows with a configurable confirmation lag of N bars. Every swing records `confirmedAt` (the bar close time at which it became known). Nothing may use a swing before `confirmedAt` (no repainting).
- **BOS** (close beyond the last confirmed swing in the trend direction) and **CHoCH** (close beyond the last confirmed swing against the trend). Write the exact definitions in a code comment and in `docs/structure-definitions.md`.
- **Fair value gap:** a three-candle gap with a minimum size expressed in ATR multiples. Track status: active, partially filled, filled.
- **Order block:** the last opposite-colour candle before a displacement candle (range above k times ATR) that causes a BOS or CHoCH. Track status: active, mitigated, expired.
- **Liquidity levels:** previous-day, previous-week and previous-month high and low, session highs and lows (Asia, London, New York, configurable in UTC), and equal highs and lows within a tolerance. A **sweep** is a wick beyond the level with a close back inside.
- Every event outputs: type, direction, `detectedAt` (bar close), anchor times, price levels, status.
- Tests: hand-built candle fixtures with known expected events; a **no-repaint test** (events for bars up to N are identical whether or not later bars exist); a no-look-ahead test through the sandbox API.

**2. Multi-pair market map:**
- Pairs: the majors and crosses available through the symbol resolver, plus XAUUSD. Computed from stored MT5 candles on each bar close (state the update latency in the UI).
- **Currency strength meter** from the % change since session open (configurable UTC day open), averaged across each currency's pairs. Show the ranking and each currency's rank path through the session.
- Per-pair cards: change %, last structure event with time, distance to the nearest active order block and FVG (in pips and in ATR), liquidity status (for example "PDH swept"), and a small trend indicator. Click opens the candlestick chart with the zones drawn on it.
- Computation runs in a server job with caching, never blocking the UI.

**3. Positioning panel:**
- **CFTC COT** (reuse the `cot_reports` table from Stage 5): for the currency futures and gold show net positions by trader category (dealers, asset managers, leveraged funds, other reportables, non-reportable small traders), the week-over-week change, and a 3-year and 5-year percentile. Label every chart "weekly, positions as of Tuesday, published later (usually Friday)".
- Map each futures contract to its forex pair and **handle quote inversion** (for example, a net long yen future is a net short USDJPY). Document each mapping in code and test it.
- **Retail sentiment:** build a pluggable provider interface with the default provider "none" (the UI shows "Retail sentiment: not configured"). Do not scrape any website. Do not implement a provider until I name one and you have checked and reported its terms of use. Any retail figure must show its source and say it reflects one broker's or community's clients, not the whole market.
- **Tick-volume activity** (optional): show MT5 tick volume only as "activity", labelled "TICK VOLUME: activity proxy, not traded volume". Do not label anything "buyers %" or "institutional" based on tick volume.

**4. Signal study tool (validate before use):**
- For each event type (BOS, CHoCH, FVG retest, order-block retest, liquidity sweep), per pair and timeframe, measure forward returns in ATR units at 5, 10, 20 and 50 bars after `detectedAt`, **net of the spread**.
- Compare against a baseline of random entry times with the same counts, seeded for reproducibility. Report sample size, mean, median, win rate and a bootstrap confidence interval.
- Warn on small samples and on multiple comparisons (many types times many pairs). Add an in-sample versus out-of-sample split.
- Until a pattern has passed this study, the UI shows every label for it as **UNVALIDATED**.

**5. Strategy access:** expose `ctx.structure.lastEvent(type)`, `ctx.structure.activeZones()` and `ctx.positioning.cotBias(symbol)` inside the sandbox, returning only information known at the current bar time (events at or after `detectedAt`, COT only after its publication time). Reports must state when these inputs were used.

**6. Tests:** all of the above, plus a COT contract-to-pair mapping test including inversion, a test that a COT report published after the bar time is invisible, and a test that the strength meter on a known fixture gives the hand-calculated ranking.

---

## Stage 7: Portfolio Flow view (read-only, visual only)

**Status: NOT STARTED.** Must not start before 6C has passed its gate, and must never delay Stage W. Same ground rules: lint, test and build pass; every bullet has a named test or is listed as NOT DONE; no fake data; default to demo.

**Purpose.** A new tab **"Portfolio Flow"** showing the user's OWN portfolio allocation and risk as a Sankey diagram. It does not show what large investors or "global capital" are doing. All copy must say it shows this account's allocation and risk. It is read-only: no button may place, modify, close or approve an order.

**Structure (left to right).**
1. **Equity node:** account equity from the bridge, split into used margin and free margin.
2. **Asset class nodes:** Majors, Minors, Exotics, Metals. The mapping lives in one config file and uses the symbol resolver so suffixed Exness symbols (`EURUSDm`, `XAUUSDm`) map correctly. Unknown symbols go to an "Other" node, never silently dropped.
3. **Instrument nodes:** one per symbol with an open position or an active bot (watchlist symbols optional, shown dimmed).
4. **Ticker cards** (right side), one per instrument: live spread, open P and L, pips to SL and TP, mini sparkline from stored candles, bot name and mode (PAPER / DEMO / LIVE), and tick volume only if shown as "TICK VOLUME: activity proxy, not traded volume".

**Rules for the numbers.**
- **Link width** = risk at stop-loss as a percentage of equity (default). Provide a switch for margin used and for notional exposure. A position without a stop-loss is shown with a warning marker and uses the margin basis, never zero width.
- **Colour** shows open P and L (green profit, red loss, neutral when flat). It is NOT the sign of an allocation. Width is size, colour is result.
- **Animation:** subtle, CSS-only, on a few paths. If not tied to real data, label it decorative. Respect `prefers-reduced-motion`.
- **Data sources:** only the database and the bridge. No bridge: show "Not connected: simulation only" and an empty state. Simulated data, if shown at all, carries a SIMULATED badge on every element. Never invent values. Stale ticks follow NFR-W1.
- **Never** label anything "institutional", "whales", "smart money" or "buyers %".

**Implementation notes.** Use the `d3-sankey` package for layout, with links as SVG paths; compute the layout once per data update. Ticker cards are normal HTML; virtualize the list above 50 cards; sparklines are SVG polylines. Throttle updates to about once per second. Keep layout and number logic in pure functions under `src/engine/portfolioFlow/`. Add the tab to the sidebar; do not change unrelated UI styling.

**Tests (each with a failing-case counterpart where sensible):** asset-class mapping including suffixed symbols and an unknown symbol going to "Other"; link width from known positions and equity (hand-calculated) for the risk, margin and notional bases; a position without a stop-loss gets a warning marker and non-zero width; empty state; no-bridge state shows the banner and no numbers; colour follows open P and L, not allocation (profit, loss, flat); a static check that the view contains no order-sending calls; update throttling (many rapid updates give at most one layout per interval).

**Checkpoint:** lint, test, build; update docs; print the completion matrix and stop.

---

## Stage 8: Spec gaps (owner prioritises item by item)

- **Reports:** anything left over from Stage B.
- **Data:** CSV and Parquet export; tick-data download; CSV import with column mapping and timezone selection; update-all.
- **Robustness:** multi-symbol portfolio backtest; run comparison beyond Stage B.
- **Trading:** Telegram or email alerts; daily and weekly summaries; live-versus-backtest degradation flag; audit fields (strategy, signal reason, risk outcome) on every automated order.
- **UI:** Monaco editor; RSI, MACD and ATR overlays; drawing tools; WebSocket or fast polling for ticks; light theme; tablet layout; read-only mobile view; skeleton loaders; accessibility pass.
- **Accounts and settings:** multiple broker accounts labelled DEMO/LIVE; per-account symbol resolver (suffix `m` on standard Exness accounts, none on raw); timezone and base currency; backup and export of settings and strategies.
- **Journal:** screenshots, tags and analytics by strategy, symbol, hour and weekday; optional AI assistant on own data.
- **Operations:** log rotation and a Logs page; troubleshooting section in the README.

## Stage 10: Supabase sync, authentication, hosting (last)

Only after Stage L has gone well, and only if the owner wants it.
- **The laptop's SQLite stays the source of truth.** Candles are never uploaded.
- **One-way push** of report summaries, metrics, equity curves, trade lists and the Pine source with its converted code, run by the local server; the Supabase service key lives only in the server `.env`. Check the free tier's current storage and row limits first.
- **Authentication and Row Level Security** (Supabase Auth) only if other users will access it; data isolated per user.
- **Website-to-engine commands:** the website writes a command row (for example "pause bot X"); the local engine polls and executes it through the same risk manager and confirmations as any order. The laptop only makes outbound calls and is never opened to the internet.
- **Hosting:** an always-on engine host (VPS) is a separate decision. A website on a host such as Vercel can only be a read-only or command-writing front end; it can never run the engine or reach the bridge.
- Regulatory note: offering automated trading to other people may need licensing.

---

## 12. Final manual test checklist (owner, Exness DEMO account, bridge running)

Done already (owner-reported): demo detection printed equal numbers (0 0); `/health` without token returns 401; `/health` and `/account` with token return 200; portal shows BRIDGE ONLINE (DEMO); pytest 2 passed at the time (8 passed on 25 Oct).

Still to do, in order:
0. **Round-0 gate:** unzip Zaboraa-FX-02 over the project, keep your own `.env` and `node_modules`, run `npm install`, lint, test, build; record real counts (25 Oct, v4.1: vitest 253/253, pytest 61/61, `tsc --noEmit` 0 errors and 0 warnings, lint and build clean; 26 Oct, v4.2: "257+" tests, `tsc` 0 errors, build clean, all owner-reported; exact count, lint and pytest to re-record; code recheck still to do); retest Settings, Test connection (the token is no longer typed into the browser); with the bridge stopped, press the kill switch and confirm it shows a failure. If the earlier zip was shared, rotate the Gemini key and bridge token (D22). v4.2: also run the browser Pine convert test (button click stays on the Pine view; code appears; strategy saves and opens in Strategy Studio) (D36), and confirm `gcloud auth application-default login` is still valid.
0a. **Bridge hardening checks (v3.6):** `curl` `/health` and `/account` with `Authorization: Bearer <token>` return 200; without a token 401 JSON; `x-bridge-token` alone fails (D24). `GET /tick` with an invalid symbol and `/candles` with a missing parameter return a JSON error, never HTML. With a demo test position open, `/kill` reports flat and `/positions` is empty. Request the portal with a `.run.app` Origin and confirm it is rejected (D25).
0b. **Round 2 checks (v3.8):** on a weekday call `/api/data/check` then `/api/data/bulk-download` for `XAUUSDm` on all 8 timeframes, then check again: data exists with counts and range. At the weekend or with a stale tick, `/api/bridge/tick` returns `marketClosed: true` with `ageSeconds` above 300. Record the real counts in `PROGRESS.md`.
0d. **Bridge stub live checks (v4.0 list; code and tests closed in v4.1, live checks OPEN):** with a demo test position open, `/kill` must actually close it and `/positions` must then be empty (the real close loop is built and tested, D29; only the Sunday flat case has run live); `POST /orders` must be rejected with `ALLOW_TRADING=false` and must not return a mock ticket (D30); with the MT5 terminal closed, `/account` must not report DEMO (D31) and `/candles` must return a JSON error, not bars (D33); record the measured broker UTC offset (D32).
0e. **Round 2 download acceptance (v4.3), Exness demo, weekday:** (a) start a bulk download for `EURUSD` and confirm the bridge log shows `EURUSDm` and 200 responses on every page; (b) repeat it: the job reports 0 added bars and no duplicate timestamps; (c) run `/api/data/audit` and confirm no gap or overlap where one page meets the next (the last bar of a page and the first bar of the previous page differ by one bar interval); (d) confirm the newest stored bar is older than the current forming bar; (e) repeat (a) to (d) for `XAUUSD` and for all 8 timeframes; (f) restart the portal and confirm the dataset appears in Backtesting Lab as an eligible, genuine-MT5 research dataset, and that an `XAUUSD` context finds the `XAUUSDm` data; (g) record the pages, bars and earliest bar per timeframe in `PROGRESS.md`.
0c. **Round 3 checks (v3.9; tests added in v4.0):** run `/api/data/audit` on a stored dataset and on a fixture with a high-below-low bar, a duplicate timestamp and a weekend; the weekend is not a gap. `/api/data/load` feeds the chart; `/api/data/export` opens cleanly in a spreadsheet. Server-side tests exist (v4.0); run the checks on real data and wire the chart.
1. `git status` shows no `.env`; commit and push the local state (including the `main.py` edits) on branch `local-verified`.
2. GitHub repo is private; the Vercel project is deleted or protected; no `.env` or token was ever committed.
3. On a weekday: fetch a tick and candles for `XAUUSDm`; prices are fresh.
4. With `ALLOW_TRADING=false`, an order is rejected.
5. Stage D acceptance (see 0e): all 8 timeframes download; the second download shows "data exists" and adds nothing; the chart shows the data; "Market closed" appears at the weekend.
6. Stage W acceptance: bridge down while pressing the kill switch shows a failure; wrong bridge token; stop the portal while an order is pending and restart; close a position manually in MT5 while the portal is down and restart; terminal closed; algo trading disabled; market closed; invalid stops; account type shown correctly for demo.
7. Demo soak test (Stage S), then the live pilot rules (Stage L).

## 13. What to hand over at the start of every round

This master plan; *Zaboraa FX Requirements and Status v4.3* (PDF); a fresh zip containing `src`, `server.ts`, `package.json`, `package-lock.json`, `docs`, configs **and `mt5-bridge`** (code, `requirements*.txt`, README, tests). Leave out: `.env` files, `node_modules`, `.git`, `data/`, `dist/`, the bridge `.venv`. After a failed gate, add the error text (no keys or tokens). Never upload real secrets; if one slips in, rotate it (D22).
