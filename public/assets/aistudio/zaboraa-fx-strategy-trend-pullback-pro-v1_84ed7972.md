# Zaboraa FX: Strategy Implementation Spec, Trend Pullback Pro (`trend_pullback_pro_v1`)

**Revision 2, 26 Oct 2026.** This is the ChatGPT draft v1.0, reviewed against the Zabura-FX-03 code and revised. The code facts in section 2 were found by reading the source, not by running it.

**Status.** Research strategy for backtesting and demo validation only. It is not proven profitable and not production-ready. `ALLOW_TRADING=false` and `ALLOW_LIVE=false` stay in force. Do not change either flag, and do not touch live order placement.

**Who reads this.** The implementer (AI Studio or a developer). Follow it exactly. Where something here conflicts with the code, stop and report the conflict instead of guessing.

---

## 1. Review of the draft: what was kept, what was changed

The draft is a good outline: clear entry rules, ATR stops, a fixed 2R target, a time exit, no martingale and a research-only framing. It cannot be built as written, because several things it assumes do not exist in this application.

| Draft item | Problem in this codebase | Decision in this spec |
|---|---|---|
| H4 trend timeframe | The bridge, data layer and screens support M1, M5, M10, M15, M30, H1, H3 and D1. There is no H4. A strategy also receives only one timeframe of candles. | Build H4 inside the strategy by aggregating H1 bars into UTC-aligned 4-hour buckets (section 4). H3 and D1 are the fallback if the owner prefers (section 15). |
| ADX(14) | No ADX helper exists. The helpers are `sma`, `ema`, `rsi`, `atr`, `donchian`, `bollinger` and `crossover`. | Implement Wilder ADX in a pure module, over a fixed window so it stays fast and deterministic (section 5). |
| Enter at the next available price | The backtester prices an order at the signal bar's close. | Engine change P0-1: fill at the next bar's open and keep the stop and target distances relative to the actual fill (section 8). |
| Size from tick value and contract specs | Strategies cannot see symbol specs. Sizing is done by the engine from `riskPctPerTrade`. | The strategy passes `undefined` for size. The 0.25% risk is an engine setting, not a strategy parameter. |
| Skip the trade if the minimum lot exceeds the risk cap | The engine does `Math.max(minVolume, ...)`, which silently takes more risk than the cap. | Engine change P0-2: skip and log the reason. |
| Max 3 positions, 0.75% aggregate risk, 1% daily loss account-wide | A backtest runs one symbol. The cap of 3 is hard-coded. A real account-wide limit belongs to `src/engine/riskManager.ts`. | Split the controls into three layers (section 9). Do not duplicate the risk manager. |
| RSI crosses 50 on the same bar as the EMA20 cross | Two cross events on one bar, plus ADX and the trend filter, will give very few trades. | Make the RSI condition "crossed within the last N bars" with N=3 by default. N=1 reproduces the draft exactly. Measure trade counts before accepting any result. |
| Spread "within the configured limit" | No default or unit was given. | `maxSpreadPips` default 2.0, with the unit check in section 2, item 8. |
| 24-bar hold | A 24-bar hold can span a weekend gap. | New rules: no late-Friday entries, and exit before the weekend (section 7). Both can be switched off for an ablation test. |
| Not mentioned | When a strategy cannot be resolved, the backtester silently runs a built-in RSI fallback and the results look real. | Engine change P0-3: fail loudly with `BACKTEST_STRATEGY_UNAVAILABLE`. |

---

## 2. Verified facts about the codebase

1. **Registration.** Built-in strategies live in `src/services/builtInStrategies.ts`: the `BUILT_IN_STRATEGIES` array, the `STRATEGY_CONTRACT_REGISTRY` map, and `registerStrategyContract(id, contract)`. `getStrategyExecutor(id)` throws `UNKNOWN_STRATEGY` if the id is not registered.
2. **Who calls it.** `getStrategyExecutor` is used by the backtester, the optimizer, the bot runner and the server's backtest job. Register the strategy there once and all four use it.
3. **Custom strategies do not backtest properly.** A strategy saved from Strategy Studio is not in the registry. The browser backtester then tries `new Function(code)`, which fails on `export const strategy`, and falls back to the built-in RSI strategy without telling anyone. So this strategy must be a native built-in contract, not a Studio-saved script.
4. **Helpers available in `ctx`.** `data`, `currentBar`, `barIndex`, `openPositions`, `accountBalance`, `accountEquity`, `params`, `buy`, `sell`, `close`, `modify`, plus `sma`, `ema`, `rsi`, `atr`, `donchian`, `bollinger` and `crossover`. The `offset` argument means bars back (0 = current bar). Helpers return `null` during warmup.
5. **Smoothing.** `rsi` is a simple average of gains and losses (not Wilder). `atr` is a simple average of true range (not Wilder). Use the helpers for consistency between backtest and bots, and note that values will differ slightly from TradingView or MT5.
6. **Backtester behaviour.** One position per strategy by this spec (the engine allows 3, hard-coded). When stop and target are both inside one bar, the engine takes the stop first (conservative, which is correct). `ctx.data` is a fresh `candles.slice(0, i + 1)` each bar, which is slow on large datasets (see P2).
7. **Timeframes.** 8 supported (list above). A strategy should refuse to trade if its data is not H1 (section 4).
8. **Spread units.** The backtester treats `Candle.spread` as pips, but MT5 reports spread in points. Unless something converts it, real-data costs are about 10x too high on 5-digit symbols. Check this before trusting any cost result. Typical EURUSDm spread in stored data should be about 10 to 20 (points).
9. **Position fields.** `openPrice`, `openTime`, `sl`, `tp`, `side`, `ticket`, `volume`. Track the entry bar index in strategy state rather than relying on the unit of `openTime`.
10. **Risk manager.** `src/engine/riskManager.ts` exists. Use it for account-wide controls.

---

## 3. Identity and parameters

- Name: Trend Pullback Pro
- ID: `trend_pullback_pro_v1`
- Version: `1.0.0`
- Direction: long and short
- Entry timeframe: H1 (strategy refuses other timeframes)
- Trend timeframe: H4 built from H1
- Evaluation: once per newly completed H1 bar
- Tags: `Trend Following`, `Pullback`, `Multi-Timeframe`, `Research`

All parameters go in `paramsSchema` with default, min, max, step and a description. Validation uses the existing schema system.

| Parameter | Default | Min | Max | Step | Note |
|---|---|---|---|---|---|
| `trendEmaFast` | 50 | 20 | 100 | 5 | H4 EMA, fixed in research |
| `trendEmaSlow` | 200 | 100 | 300 | 10 | H4 EMA, fixed in research |
| `trendSlopeBars` | 5 | 3 | 10 | 1 | H4 bars back for the EMA50 slope |
| `pullbackEma` | 20 | 10 | 30 | 1 | H1 EMA |
| `rsiPeriod` | 14 | 7 | 21 | 1 | fixed in research |
| `rsiLevel` | 50 | 45 | 55 | 1 | |
| `rsiCrossWindow` | 3 | 1 | 5 | 1 | 1 = draft behaviour |
| `adxPeriod` | 14 | 7 | 21 | 1 | fixed in research |
| `adxMin` | 18 | 12 | 25 | 1 | tunable |
| `adxMax` | 40 | 30 | 50 | 1 | |
| `atrPeriod` | 14 | 7 | 21 | 1 | fixed |
| `slAtr` | 1.5 | 1.0 | 2.5 | 0.1 | tunable |
| `rr` | 2.0 | 1.5 | 3.0 | 0.25 | tunable |
| `maxHoldBars` | 24 | 12 | 48 | 1 | completed H1 bars |
| `maxSpreadPips` | 2.0 | 0.5 | 4.0 | 0.1 | see section 2, item 8 |
| `noEntryFromUtcHour` | 21 | 0 | 23 | 1 | rollover block, inclusive |
| `noEntryToUtcHour` | 23 | 0 | 23 | 1 | |
| `fridayLastEntryUtcHour` | 15 | 0 | 24 | 1 | 24 = off |
| `closeBeforeWeekend` | true | | | | boolean |
| `weekendExitUtcHour` | 20 | 16 | 22 | 1 | Friday exit bar |
| `cooldownBars` | 2 | 0 | 10 | 1 | after any exit |
| `maxTradesPerDay` | 2 | 1 | 5 | 1 | per symbol, UTC day |

Not strategy parameters: risk per trade (0.25% of equity, set as `riskPctPerTrade` with `positionSizing: 'risk_pct'` in the Backtesting Lab), cost model, and account-wide limits.

**Tuning limit.** In research, optimise only `adxMin`, `slAtr`, `rr` and `rsiCrossWindow`. Everything else stays at its default.

---

## 4. Multi-timeframe: H4 built from H1

Create `src/engine/trendPullbackPro.ts` as a pure module (no I/O) holding the rules below, and import it from the contract.

**Timeframe guard.** On each bar, check that the spacing of the last bars is 3600 seconds apart from weekend gaps. If not, return without trading and record `WRONG_TIMEFRAME`.

**Buckets.** `bucket = floor(time / 14400) * 14400`, which gives 00, 04, 08, 12, 16 and 20 UTC. This can differ from the broker's own H4 bars by a fixed offset. That is accepted for v1.0.

**A bucket is complete when either:**
- the current H1 bar has `hourUtc % 4 === 3` (its close completes the bucket), or
- a bar from a later bucket arrives and the earlier bucket was never finalised (a missing last hour).

A bucket that is not complete is never used. Never use the current bucket's partial values.

**H4 series.** On completion, store the H4 close (the close of the bucket's last H1 bar). Update EMA(`trendEmaFast`) and EMA(`trendEmaSlow`) incrementally: seed each with the SMA of its first N closes, then `ema = prev + k * (close - prev)` with `k = 2 / (N + 1)`. Keep the last `trendSlopeBars + 1` values of the fast EMA.

**Warmup.** `ctx.warmupPeriod = 1300` H1 bars (about 325 H4 bars: 200 for the seed plus 100 for EMA settling). Do not signal before that.

**Contiguity.** If any gap in the last 30 H1 bars is not a normal weekend gap (previous bar Friday or Saturday, next bar Sunday or Monday, at most 74 hours), skip signals until history is contiguous again. Never fill or invent bars.

State lives in a closure and is reset in `init()`.

---

## 5. Indicators

- **EMA(pullbackEma)** on H1 closes: `ctx.ema(p, offset)`.
- **ATR(atrPeriod)**: `ctx.atr(p, 0)`, on completed bars only.
- **RSI(rsiPeriod)**: `ctx.rsi(p, offset)`.
- **ADX(adxPeriod)**: Wilder ADX computed over the last 150 H1 bars ending at the latest completed bar (no state carried between bars, so it is deterministic). Steps:
  1. For each bar: `upMove = high - prevHigh`, `downMove = prevLow - low`; `+DM = upMove if upMove > downMove and upMove > 0, else 0`; `-DM = downMove if downMove > upMove and downMove > 0, else 0`; `TR = max(high-low, |high-prevClose|, |low-prevClose|)`.
  2. Wilder smoothing: first value is the sum of the first N, then `S = S - S/N + x`.
  3. `+DI = 100 * smooth(+DM) / smooth(TR)`, `-DI` likewise, `DX = 100 * |+DI - -DI| / (+DI + -DI)` (0 if the denominator is 0).
  4. `ADX` = the first value is the mean of the first N DX values, then `ADX = (prevADX * (N-1) + DX) / N`.
  - Return `null` if fewer than `3 * adxPeriod` bars are available or any input is not finite.

Any invalid indicator value means no signal on that bar. A missing value never counts as a pass.

---

## 6. Signals

Evaluate once per newly completed H1 bar. Store the last processed bar time and ignore a repeat of the same bar.

### Long. All must pass:
1. Latest completed H4 close is above H4 EMA(`trendEmaSlow`).
2. H4 EMA(`trendEmaFast`) is above H4 EMA(`trendEmaSlow`).
3. H4 EMA(`trendEmaFast`) is greater than its value `trendSlopeBars` completed H4 bars earlier.
4. Previous H1 close is at or below `ema(pullbackEma, 1)`.
5. Current H1 close is above `ema(pullbackEma, 0)`.
6. RSI is above `rsiLevel` now, and RSI was at or below `rsiLevel` on at least one of the last `rsiCrossWindow` bars before this one (window 1 means a strict same-bar cross).
7. `adxMin <= ADX <= adxMax`.
8. `bar.spread <= maxSpreadPips`.
9. Time rules: UTC hour is outside `noEntryFromUtcHour..noEntryToUtcHour`; not Friday at or after `fridayLastEntryUtcHour`; trades today below `maxTradesPerDay`; at least `cooldownBars` bars since the last exit.
10. No open position for this symbol, and the risk layers in section 9 allow it.

### Short
Mirror every condition: H4 close below EMA slow, fast below slow, fast lower than `trendSlopeBars` bars ago, previous close at or above EMA, current close below EMA, RSI below the level now and at or above it within the window, same ADX band, spread and time rules.

---

## 7. Orders and exits

- `atr = ctx.atr(atrPeriod, 0)` at signal time. `stopDistance = slAtr * atr`. `targetDistance = rr * stopDistance`.
- Long: `sl = signalClose - stopDistance`, `tp = signalClose + targetDistance`. Short: mirrored.
- Call `ctx.buy(undefined, sl, tp, comment)` or `ctx.sell(...)`. Size is always `undefined`, so the engine sizes from the risk setting.
- The engine fills at the next bar's open and re-bases the stop and target to the same distances from the actual fill (P0-1), so the target stays exactly `rr` times the real stop distance.
- **Order comment format:** `TPP|L|ADX=23.4|RSI=52.1|ATR=0.00110|SLx=1.5|R=2.0` (use `S` for short). Reports and chart markers show it.
- **Exits, first to occur:**
  1. Stop-loss or take-profit, handled by the engine.
  2. Time: close at the close of the bar when `barIndex - entryBarIndex >= maxHoldBars` (exit reason `TIME`).
  3. Weekend: when `closeBeforeWeekend` is true, close on the Friday bar at or after `weekendExitUtcHour` UTC (exit reason `TIME`, comment `WEEKEND`).
- Never widen a stop. No partial exits, break-even moves, trailing stops, martingale, grid or averaging down in v1.0. No exit on trend flip in v1.0.

---

## 8. Engine changes required (`src/engine/backtester.ts`, `src/types/forex.ts`)

| # | Priority | Change |
|---|---|---|
| P0-1 | Must | Queue `buy` and `sell` at signal time and fill at the next bar's open. Add spread to buy fills and subtract it from sell fills (OHLC is bid), plus `slippagePips`. Preserve the stop and target distances from the signal and apply them to the actual fill. Compute lot size at fill time. |
| P0-2 | Must | If the risk-based lot size is below `minVolume`, skip the trade and record the reason (`RISK_BELOW_MIN_LOT`) instead of using the minimum lot. |
| P0-3 | Must | Remove the silent RSI fallback. If no executable strategy is found, throw `BACKTEST_STRATEGY_UNAVAILABLE` with the strategy id, and show the message in the Backtesting Lab. |
| P0-4 | Must | Add `'TIME'` to `BacktestTrade.exitReason` and show it in reports and chart markers. |
| P1-5 | Should | Short stops and targets trigger on the ask (`price + spread`). Verify and fix the spread unit first (section 2, item 8). |
| P1-6 | Should | Daily loss lock per run (section 9). |
| P1-7 | Should | Make the concurrent-position cap a config value instead of a hard-coded 3. |
| P1-8 | Should | Confirm swap charges per night, with triple swap on the broker's rollover day. |
| P2-9 | Later | Avoid copying `candles.slice(0, i + 1)` on every bar (use a view or bounded window). |
| P2-10 | Later | Portfolio (multi-symbol) backtests, needed to test account-wide limits properly. |

---

## 9. Risk controls in three layers

1. **Strategy.** One open position per symbol, `cooldownBars`, `maxTradesPerDay`, spread, session and time rules, time exit. No risk sizing here.
2. **Engine (per backtest run).**
   - Risk per trade: 0.25% of equity with `positionSizing: 'risk_pct'`.
   - Concurrent-position cap: 3 (configurable).
   - Aggregate open risk: 0.75% of equity, counting each open trade at its stop.
   - **Daily loss lock.** The day is the UTC calendar day. Start-of-day equity is equity at the first bar of that day. Lock when equity (realised plus floating) falls to 1% below it. While locked: no new entries until the next UTC day, and open positions keep their stops and are not force-closed. Log the lock.
3. **Account (demo and live-ready).** Use `src/engine/riskManager.ts` and the bot scheduler for account-wide position count, aggregate risk and daily loss across symbols. Persist the lock in the database so a restart never clears it. Do not create a second, conflicting implementation.

---

## 10. Data correctness rules

- Never use an incomplete H1 or H4 bar for a confirmed signal.
- Use only H4 buckets completed at the time of the H1 decision.
- Handle missing candles, duplicate timestamps, invalid OHLC, stale quotes and insufficient warmup by skipping signals, never by guessing.
- Use the project's symbol normalisation and broker suffix handling. Stored data is UTC.
- Research runs must use stored MT5 or CSV datasets marked research-eligible, never simulated data.

---

## 11. Required tests

Create `src/engine/__tests__/trendPullbackPro.test.ts` and extend the backtester tests. All fixtures are small, hand-built candle arrays.

1. A long signal with every condition satisfied, and the same for a short.
2. Each entry condition failing on its own (10 long cases and the mirror).
3. Incomplete H1 bar and incomplete H4 bucket excluded.
4. H4 bucket completion at `hour % 4 === 3`, a missing last hour, and a Sunday partial bucket.
5. No lookahead: the H4 values used at an H1 decision are identical when future bars are removed.
6. Insufficient warmup and a non-weekend gap in the last 30 bars (no signal).
7. Wrong timeframe guard (M15 data gives no trade).
8. ATR stop and `rr` target maths for long and short.
9. ADX against hand-computed reference values, and `null` handling.
10. `rsiCrossWindow` 1 reproduces the strict cross, and 3 accepts a cross one or two bars back.
11. Next-open fill, spread and slippage on buys and sells, and the target equal to `rr` times the real stop after a gap open.
12. Risk-based sizing, volume-step rounding, `RISK_BELOW_MIN_LOT` skip.
13. Daily loss lock, concurrent cap, aggregate risk cap, one position per symbol, and no duplicate entry from reprocessing the same bar.
14. Time exit after `maxHoldBars`, and the weekend exit.
15. The strategy appears in `BUILT_IN_STRATEGIES`, is returned by `getStrategyExecutor`, and runs end to end in `runBacktest` with a non-zero number of signals on a constructed trending dataset.
16. A strategy id that is not registered throws `BACKTEST_STRATEGY_UNAVAILABLE` (no silent fallback).
17. No regression: the existing built-in strategies and API routes still pass their current tests.

---

## 12. Validation protocol

Acceptance gates are screening thresholds I suggest, not guarantees of profit.

- **Data.** Stored MT5 H1 data for EURUSD, GBPUSD, USDJPY and XAUUSD (test gold separately for spread and sizing). At least 5 years where the broker provides it.
- **Split.** Keep the final 30% held out. Tune only the four tunable parameters, in sample.
- **Sample size.** At least 100 trades per symbol out of sample. Report the actual count. If trades are too few, report it, do not loosen rules quietly.
- **Costs.** Re-run with spread x1.5 and extra slippage. The edge must survive.
- **Stability.** Results must hold when each parameter moves 20%.
- **Baselines.** Compare against `strat_sma_cross` and `strat_donchian_breakout` on the same data and costs.
- **Reporting.** R-multiples, per-year and per-session results, maximum drawdown, Monte Carlo, and monthly-return correlation with other strategies.
- **Screening thresholds.** Net profit factor above 1.2 and expectancy above 0.1R out of sample, with no single year providing most of the profit.
- **Next stage.** Demo forward testing for at least 4 weeks, with `ALLOW_TRADING=false` until the manual checklist passes.

---

## 13. Files expected to change

| File | Why |
|---|---|
| `src/engine/trendPullbackPro.ts` (new) | Pure rules: H4 aggregation, EMA, ADX, signal logic, guards |
| `src/services/builtInStrategies.ts` | Contract, registry entry and `BUILT_IN_STRATEGIES` metadata with `paramsSchema` |
| `src/engine/backtester.ts` | P0-1 to P0-4 and the P1 items |
| `src/types/forex.ts` | `exitReason` includes `'TIME'`; any new skip-reason fields |
| `src/components/BacktestView.tsx` | Show `BACKTEST_STRATEGY_UNAVAILABLE`, skipped-trade reasons and `TIME` exits |
| `src/engine/__tests__/trendPullbackPro.test.ts` (new) and backtester tests | Section 11 |

Do not modify `mt5-bridge/` unless absolutely necessary and explicitly justified. Do not delete, reset or rewrite the SQLite database. Preserve every other strategy and stored dataset.

---

## 14. Delivery checklist

Run, and report the actual output of each: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Run the Python bridge tests only if bridge files changed. Do not claim a test passed unless it was run.

Return: a ZIP of changed files only, a list of changed files with the reason for each, test results and any failures, assumptions and blockers, and an explicit statement that `ALLOW_TRADING=false` and `ALLOW_LIVE=false` are unchanged. Do not claim profitability.

---

## 15. Open decisions for the owner

1. **Trend timeframe.** Aggregated H4 (this spec), or H3 or D1 data used directly. H3 and D1 need no aggregation and fewer bugs but differ from the original idea.
2. **RSI condition.** Window of 3 (this spec) or the strict same-bar cross (window 1). Decide after seeing trade counts.
3. **Weekend rules.** Keep them on by default, or run a first pass with both off to measure their effect.
4. **Gold.** Include XAUUSD from the start, or add it after the three currency pairs.
5. **Spread units.** Confirm and fix the points-versus-pips issue before any cost-sensitive conclusion.
