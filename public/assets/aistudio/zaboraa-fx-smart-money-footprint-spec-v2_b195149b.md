# Zaboraa FX: Smart Money Footprint, One-Shot Implementation Spec v2

**28 Oct 2026. Supersedes the phased plan v1.** Give this whole file to AI Studio in one go.

**Who reads this.** The implementer (AI Studio). Follow it exactly. Where it conflicts with the code, stop and report the conflict instead of guessing. Where it is silent, choose the simplest option that respects the Hard Rules and say what you chose.

**Status of the feature.** Research and advisory only. It produces buy and sell **signals for a human to read**. It has no path to order placement. `ALLOW_TRADING=false` and `ALLOW_LIVE=false` stay in force. Do not touch live order placement, the bridge order routes, the risk manager or the bots. Not financial advice. Past results do not guarantee future results.

---

## 1. Scope (decided by the owner)

| Item | Decision |
|---|---|
| Name in the UI | **Smart Money Footprint**. Never "whale", "institutional flow", "buyers %" or "sellers %" |
| Instruments | **XAUUSD and EURUSD only** (canonical names; broker names come from the existing resolver, so XAUUSD finds XAUUSDm and EURUSD finds EURUSDm) |
| Data | **Free sources only**: CFTC Commitments of Traders (COT) and the MT5 candles already in SQLite. No paid feeds, no API keys, no new paid services |
| Signal timeframe | **H1**, computed on closed bars only |
| Trend context | **H4**, built by aggregating H1 bars into UTC-aligned 4-hour buckets. Reuse the aggregation code from `trendPullbackPro.ts`; do not write a second copy |
| Bias timeframe | **Weekly** (COT) |
| Evaluation horizons | +4h, +24h and +72h after the signal |

**Why H1 (reason for the owner and for later review).** M1 to M15 tick volume is noisy, broker-specific and dominated by spread cost. D1 gives too few signals to test. COT is weekly, so a multi-hour to multi-day horizon matches the slowest evidence layer. H1 also matches the H1 data already used by Trend Pullback Pro, so one dataset serves both. The timeframe is a config value (`signalTimeframe`); changing it needs no code change, but only H1 is accepted for this build.

## 2. Hard Rules (non-negotiable)

1. **Point-in-time COT.** A COT row is visible to a signal only from its `effective_at`, never from `report_date` (section 4.3).
2. **Closed bars only.** The forming bar is never read. A signal is stamped with the closed bar's time. A logged signal is never edited or deleted by the module.
3. **No lookahead anywhere**, in features, scoring, the event study and the baseline.
4. **Tick volume is an activity proxy.** Every place that shows it carries the exact text `TICK VOLUME: activity proxy, not traded volume`.
5. **COT is reported futures positioning, weekly.** The exact text is `COT: reported futures positioning, weekly, as of Tuesday`.
6. **Stale or bad data fails closed.** A layer with stale or low-quality input returns 0 (NEUTRAL) with a visible reason. Use `src/engine/data/candleQuality.ts`.
7. **The engine computes the signal. The LLM never does.** Gemini may only explain a signal that already exists in the database, and it cannot change direction or score.
8. **One AI client.** Use the existing Vertex AI client path only (D37). If the code has two Gemini clients, do not add a third; report it. The model id is read only from `GEMINI_MODEL`.
9. **Held-out data.** The final 20% of each symbol's H1 history is excluded from all tuning and from the first evaluation run. It is read once, by an explicit flag (section 10).
10. **Every result reports counts.** Fewer than 30 events means the label `INSUFFICIENT SAMPLE`, with no verdict.
11. **No profitability claims** anywhere in code, UI or logs. A null or negative result is a valid result and is reported as such.
12. **Fix nothing outside scope.** If you find a bug in other code, list it in the final report; do not change it.

## 3. Step 0: discovery (do this first, in the same run)

Read the code and write a short "Findings" block at the top of your final report, then continue unless something below is a blocker.

Confirm and record:
- Whether the `cot_reports` table exists, its columns, and whether it holds real rows. If it holds synthetic or placeholder rows, do not use them.
- Whether `ctx.positioning.cotBias` exists in the strategy sandbox and what it returns.
- How H1 candles are loaded, the candle `time` basis (broker-time epoch seconds), and how `trendPullbackPro.ts` builds H4.
- The symbol resolver used by `/api/data/bulk-download` and by Backtesting Lab. Use that one resolver. If two exist, report it and use the canonical one.
- Whether H1 research datasets for XAUUSD and EURUSD are eligible after a restart (D40).
- The existing AI tab (`AIAnalysisView.tsx`, `aiAdvisorService.ts`, `/api/ai/*`) and how it currently gets COT data.

**Blockers (stop and report, build nothing):** no H1 candles at all for either symbol; the database layer cannot add tables; the build is red before you start. Record the output of `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` **before your changes** so the final report can compare.

**Not a blocker:** an empty `cot_reports` table. Section 4 fills it.

## 4. COT ingestion (free source)

### 4.1 Source
The CFTC publishes COT data free of charge on cftc.gov, including a public reporting environment with a web API (Socrata-style) and downloadable yearly files. No key is needed; an optional app token may be read from `.env` if present.

- **Gold:** the Disaggregated report, futures-only, market for COMEX gold. Use **Managed Money** long and short.
- **Euro:** the Traders in Financial Futures (TFF) report, futures-only, market for Euro FX on the CME. Use **Leveraged Funds** long and short.
- Find the exact market names and dataset identifiers from the live data; put them in a config file `src/engine/smartMoney/cotConfig.ts` (market name, report family, group, pair, inversion flag). EURUSD is **not inverted** (the euro future is quoted in dollars per euro). Do not hard-code identifiers in several places.
- Do not take data from third-party sites.

### 4.2 Fetcher
`server.ts` route `POST /api/smartmoney/cot/refresh`, run as a `BackgroundJob`:
- Pull history from 2 years before the earliest stored H1 candle, then incremental updates.
- Normalise to: `market`, `report_date` (Tuesday, UTC date), `open_interest`, `long`, `short`, `net`, `net_pct_oi`, `source`, `fetched_at`, `effective_at`.
- Upsert on (`market`, `report_date`). Never delete rows.
- Retry with backoff; on failure keep old rows and record the error in `external_fetch_log`. Show last fetch time and last error in the UI.

### 4.3 Point-in-time rule (`effective_at`)
The CFTC normally releases data every Friday at 3:30 p.m. US Eastern time for the previous Tuesday. Holidays delay some releases, and there were shutdown-related delays in late 2025, so a fixed Friday rule is not safe for history.

- **History rows:** `effective_at` = **the Monday 00:00 UTC after the normal Friday release**, which is `report_date` + 6 days at 00:00 UTC. This is deliberately conservative: it can only be later than the real release, never earlier.
- **Live rows:** `effective_at` = the later of the rule above and the time the row was first fetched.
- No code path may read a row before its `effective_at`.

### 4.4 COT features (pure functions in `src/engine/smartMoney/cotFeatures.ts`)
For each market, as of time T, using only rows with `effective_at <= T`:
- `netPctOi` for the latest row.
- `z156`: z-score of `netPctOi` over the last 156 weekly rows (about 3 years); if fewer than 52 rows, return null.
- `chg4`: 4-week change in `netPctOi`, and `chg4z`: its z-score over the same window.
- `stale`: true if the latest row is more than 12 days older than T.

**COT component `cCot` (range −1 to +1):**
- `cCot = clamp(chg4z / 2, −1, +1)`, i.e. follows the direction institutional futures positioning has been moving. Config `cotMode` can be `"follow_change"` (default) or `"contrarian_extreme"` (`cCot = −clamp(z156 / 2, −1, +1)`). Both modes must be evaluated by the event study (section 10); the default stays `follow_change` until the owner decides.
- If `|z156| >= 2` set flag `crowded=true`. This **reduces confidence** and shows a warning; it does not flip the direction.
- If stale or null, `cCot = 0` with reason.

## 5. Activity events (H1, closed bars) (`activityEvents.ts`)

Inputs: H1 candles with tick volume. Compute on closed bars only.

- `atr14`: Wilder ATR(14), reuse the existing helper.
- `volZ`: tick-volume z-score against the **same UTC hour-of-day** over the previous 20 trading days (baseline excludes the current bar). If fewer than 10 samples, fall back to a rolling 50-bar z-score and set `baselineFallback=true`.
- `range = high − low`; `closeLoc = (close − low) / range` (0 to 1; skip bars with `range == 0`).
- Skip any bar that follows a gap or market closure flagged by `candleQuality.ts`, and any bar in the first H1 bar after the weekend open.

**Event types** (all thresholds are config values with these defaults, which are untested guesses):
- **Displacement up:** `volZ >= 2`, `range >= 1.5 * atr14`, `closeLoc >= 0.75`, close above open. Component `cAct = +1`.
- **Displacement down:** same with `closeLoc <= 0.25`, close below open. `cAct = −1`.
- **Absorption (possible reversal):** `volZ >= 2`, `range <= 0.8 * atr14`, and the prior 3 closed bars moved at least `1.5 * atr14` in one direction. `cAct` = opposite sign of the prior move, **magnitude 0.5**.
- Otherwise `cAct = 0`.
Each event output carries `type`, `volZ`, `rangeInAtr`, `closeLoc`, `baselineFallback` and the proxy label text.

## 6. Trend component (`trendContext.ts`)
Call the existing H4 trend logic from `trendPullbackPro.ts` (EMA 50 and EMA 200 on H4 with slope confirmation). Export it as a shared function if needed, with **no behaviour change** to Trend Pullback Pro (its existing tests must still pass unchanged).
- Trend up: `cTrend = +1`; trend down: `−1`; flat or insufficient data: `0`.
- Trend agreement is only used as a component; it does not block a signal by itself.

## 7. Scorer (`scorer.ts`)

```
score = 100 * ( wCot*cCot + wAct*cAct + wTrend*cTrend )
defaults: wCot = 0.35, wAct = 0.40, wTrend = 0.25, threshold T = 50
```
**Minimum-agreement rule.** A BUY or SELL needs at least **two** components non-zero, **no component pointing the opposite way** to the signal direction, and `|score| >= T`. Otherwise NEUTRAL with a reason.

**Confidence (0 to 100, display only):** start from `|score|`; subtract 15 if `crowded`; subtract 10 if `baselineFallback`; subtract 20 if any layer was stale. Confidence is never used to size anything.

**Signal record** (one per symbol per closed H1 bar, written only if direction is BUY or SELL, plus a heartbeat row per bar with NEUTRAL stored in a separate `smartmoney_bars` table if you need the history for charts):
`symbol`, `bar_time` (closed bar open time), `direction`, `score`, `confidence`, `components` (cCot, cAct, cTrend, event type), `flags` (crowded, stale, baselineFallback), `invalidation_price` (entry reference = the closed bar's close; invalidation = close ∓ 1.5 × ATR14), `expires_at` (bar_time + 24h), `config_hash`, `strategy_version = "smart_money_footprint_v1"`, `created_at`, `disclaimer`.

Determinism: the same inputs and config must give byte-identical output. Unique key (`symbol`, `bar_time`, `strategy_version`). Re-running a bar never duplicates or edits a row.

## 8. Persistence and API

New tables, created by the existing migration approach:
- `smartmoney_signals` (append-only, columns above).
- `smartmoney_outcomes` (separate table: `signal_id`, `horizon_hours`, `entry_price` (next bar open), `exit_price`, `return_pips_or_points`, `cost_applied`, `computed_at`). Outcomes are written later by a job; they never modify the signal row.
- `external_fetch_log` (source, started_at, ok, rows, error).
- COT rows go into the existing `cot_reports` if its schema can hold the columns in 4.2; otherwise add `smartmoney_cot` and report why.

Routes (all behind the existing `apiSecurityMiddleware`, JSON-only errors, symbol regex and length checks):
- `GET /api/smartmoney/status`: data freshness per layer, last fetch, last error, signal counts.
- `GET /api/smartmoney/signals?symbol=&limit=&from=&to=`: history.
- `GET /api/smartmoney/latest?symbol=`: current score, components, flags, labels.
- `POST /api/smartmoney/cot/refresh`: section 4.2.
- `POST /api/smartmoney/compute`: compute and log signals for closed H1 bars not yet processed (idempotent). Also run it automatically shortly after each H1 bar close while the portal runs, as a `BackgroundJob`; if the portal was offline, catch up over missed bars, which are real closed bars and are stamped with their own `bar_time`.
- `POST /api/smartmoney/outcomes/update`: fill outcomes for signals whose horizon has passed.
- `POST /api/smartmoney/eval`: runs the event study (section 10).
No route may call the bridge order endpoints.

## 9. UI

New navigation tab **Smart Money Footprint** (follow the style of the existing tabs; every button has `type="button"` and `e.preventDefault()` where needed, D36). It contains:
1. **Symbol selector:** XAUUSD, EURUSD.
2. **Current reading card:** direction (BUY / SELL / NEUTRAL), score gauge −100 to +100, confidence, bar time, invalidation level, expiry, crowded warning.
3. **Component breakdown:** COT, Activity, Trend, each with value, reason, and its exact label text from Hard Rules 4 and 5.
4. **Data-freshness panel:** COT last report date, effective time, last fetch, last error; H1 last closed bar; stale flags; "Refresh COT" button.
5. **Signal history table** with filters, and an outcomes column filled when available.
6. **Chart** of H1 price with signal markers (reuse the existing chart component).
7. **Event study panel:** run button, results table with n, mean return, hit rate, confidence interval, baseline difference, `INSUFFICIENT SAMPLE` labels, and a clear banner "Research result, not a trading recommendation".
8. **"Explain this signal" button** (section 9.1).
9. Permanent disclaimer line: "Research and advisory tool, not financial advice. A signal is not an order."

### 9.1 AI explanation
Add one server route that sends the stored signal record (and nothing else about trading) to the existing Vertex client and returns a short plain-language explanation. The prompt must say: "Explain only what the numbers show. Do not change the direction or score. Do not predict prices. Do not claim profitability." On any Vertex error, show a clear error message, not a fake explanation. The existing Market & COT Synthesis tab must be changed (minimally) to read the engine's COT figures for XAUUSD and EURUSD instead of producing its own bias; report if this proves larger than a small change and leave it unchanged.

## 10. Event study (the evidence step) (`eventStudy.ts`, pure and seeded)

For each symbol, over the **non-held-out** 80% of H1 history:
1. Generate the signals exactly as live code would, bar by bar, with COT visible only from `effective_at`.
2. For each BUY or SELL, entry = the **next bar's open** after `bar_time`. Exit at +4h, +24h and +72h (bar opens). Return is signed by direction, in price units and in ATR units, **after cost** (use the spread, commission and slippage defaults of the existing backtester cost model; report which values were used).
3. **Baseline:** 1,000 random draws of the same number of timestamps, matched by hour-of-day and by weekday, with a fixed seed (`seed = 20261028`), same cost, same direction rule (random sign matched to the signal mix).
4. Report per symbol and per horizon: n, mean return, median, hit rate, bootstrap 95% confidence interval of the mean (fixed seed), mean minus baseline mean, split by calendar year, split by event type.
5. Run it for both `cotMode` values and for **each component alone** (COT-only, Activity-only, Trend-only), so the report shows which layer, if any, adds anything.
6. **Held-out run:** a separate function runs the same frozen config on the final 20% and is callable only with `confirmHeldOut=true`. It records a log line each time it is used. The held-out result must not influence any default value in this build.
7. Mark `INSUFFICIENT SAMPLE` when n < 30. Never write the words "profitable", "edge" or "works" in output text.

**Optional ablation (do only if everything else passes):** add a config flag `useSmartMoneyFilter` to Trend Pullback Pro that skips entries when the Smart Money direction opposes the trade. Default **off**. With the flag off, Trend Pullback Pro results and tests must be identical to before. If this makes any existing test change, skip the ablation and say so.

## 11. Tests (name each one in the final report)

Add these as Vitest files under the existing test layout, and extend `knownAnswerTests.ts` where it fits:
- `cotFeatures.test.ts`: z-score and 4-week change known answers; fewer than 52 rows returns null; stale flag; inversion flag handling; **a report whose `effective_at` is after T is invisible**; `effective_at` rule (report_date + 6 days) for several dates.
- `cotIngest.test.ts`: normalisation of a sample CFTC payload (use a saved fixture, no network); upsert idempotence; failed fetch keeps old rows and logs the error.
- `activityEvents.test.ts`: hand-built candle series for displacement up and down, absorption, and no event; hour-of-day baseline and the fallback; bars after a gap are skipped; the forming bar is never read.
- `trendContext.test.ts`: H4 aggregation is UTC-aligned; Trend Pullback Pro tests still pass unchanged.
- `scorer.test.ts`: weights and threshold arithmetic; minimum-agreement rule; opposing component blocks a signal; confidence deductions; deterministic output (run twice, compare); config change changes `config_hash`.
- `smartMoneyApi.test.ts`: routes reject bad symbols and lengths with JSON errors; idempotent compute (run twice, no duplicate rows); outcomes never modify signal rows; no route reaches the bridge order endpoints.
- `eventStudy.test.ts`: fixed seed gives identical output on two runs; next-bar-open entry (no lookahead); cost applied; `INSUFFICIENT SAMPLE` below 30; held-out run refuses without `confirmHeldOut=true`.
- `smartMoneyLabels.test.ts`: the exact proxy and COT label strings are present in the API payload for the UI.
- A UI test or manual note for the new tab: Refresh, Explain and Run buttons do not reload the page.

## 12. Order of work inside this single run

1. Step 0 discovery and the "before" gate record.
2. Types, config files, tables.
3. COT fetcher, `effective_at`, COT features, with tests.
4. Activity events and trend context, with tests.
5. Scorer, signal log, outcomes job, routes, with tests.
6. Event study and held-out guard, with tests.
7. UI tab and AI explanation.
8. Optional ablation.
9. Final gate: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Bridge pytest is not expected to change; run it only if the environment has Python and the bridge folder.

If you run out of room, **stop at the end of a complete step**, do not leave half-written files, and say exactly which steps are done and which are not.

## 13. Final report format

1. Findings from Step 0 (section 3), including conflicts and anything you chose differently.
2. A table: step, files changed or added, tests added (names), result.
3. Gate output before and after, pasted exactly.
4. Config values and where they live.
5. Anything not done and why. Anything you found out of scope (bugs, risks).
6. A line stating: "Not verified live. No order was sent. ALLOW_TRADING and ALLOW_LIVE unchanged."
Do not describe anything as verified unless a named test passes or you ran it and pasted the output.

## 14. Out of scope (do not build)

Paid data feeds, futures large-print or order-book data, ETF or central-bank flows, retail sentiment, crypto wallets, alerts or notifications, any order, position or bot integration, changes to the bridge, `ALLOW_TRADING` or `ALLOW_LIVE`, any other symbol.

## 15. After this build (for the owner, not for AI Studio)

1. Run the gate yourself and keep the output.
2. Run **Refresh COT**, then the event study, and read the table with the counts. Treat a null result as an answer.
3. Let the module log signals on the demo data for **at least four weeks with no orders**, then review outcomes before deciding anything else.
4. Decide on the held-out run only once, after you have frozen the settings.
5. Open items already in your status (D28, D36, D37, D40 to D42, live checks D29 to D32, key rotation D22) are not fixed by this work.
