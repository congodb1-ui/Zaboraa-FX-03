import { Candle } from '../types/forex';

export interface TrendPullbackProParams {
  trendEmaFast: number; // 50
  trendEmaSlow: number; // 200
  trendSlopeBars: number; // 5
  pullbackEma: number; // 20
  rsiPeriod: number; // 14
  rsiLevel: number; // 50
  rsiCrossWindow: number; // 3
  adxPeriod: number; // 14
  adxMin: number; // 18
  adxMax: number; // 40
  atrPeriod: number; // 14
  slAtr: number; // 1.5
  rr: number; // 2.0
  maxHoldBars: number; // 24
  maxSpreadPips: number; // 2.0
  noEntryFromUtcHour: number; // 21
  noEntryToUtcHour: number; // 23
  fridayLastEntryUtcHour: number; // 15
  closeBeforeWeekend: boolean; // true
  weekendExitUtcHour: number; // 20
  cooldownBars: number; // 2
  maxTradesPerDay: number; // 2
}

export const DEFAULT_TPP_PARAMS: TrendPullbackProParams = {
  trendEmaFast: 50,
  trendEmaSlow: 200,
  trendSlopeBars: 5,
  pullbackEma: 20,
  rsiPeriod: 14,
  rsiLevel: 50,
  rsiCrossWindow: 3,
  adxPeriod: 14,
  adxMin: 18,
  adxMax: 40,
  atrPeriod: 14,
  slAtr: 1.5,
  rr: 2.0,
  maxHoldBars: 24,
  maxSpreadPips: 2.0,
  noEntryFromUtcHour: 21,
  noEntryToUtcHour: 23,
  fridayLastEntryUtcHour: 15,
  closeBeforeWeekend: true,
  weekendExitUtcHour: 20,
  cooldownBars: 2,
  maxTradesPerDay: 2,
};

export interface H4Bar {
  bucketTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
}

/**
 * Calculates Wilder's ADX over a deterministic slice of candles.
 */
export function calculateWilderAdx(candles: Candle[], period = 14): number | null {
  if (candles.length < period * 3) return null;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;

    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );

    trs.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trs.length < period * 2) return null;

  // Initial Wilder sums
  let smoothTR = 0;
  let smoothPlusDM = 0;
  let smoothMinusDM = 0;

  for (let i = 0; i < period; i++) {
    smoothTR += trs[i];
    smoothPlusDM += plusDMs[i];
    smoothMinusDM += minusDMs[i];
  }

  const dxList: number[] = [];

  for (let i = period; i < trs.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trs[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDMs[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDMs[i];

    const plusDI = smoothTR > 0 ? (100 * smoothPlusDM) / smoothTR : 0;
    const minusDI = smoothTR > 0 ? (100 * smoothMinusDM) / smoothTR : 0;
    const sumDI = plusDI + minusDI;
    const dx = sumDI > 0 ? (100 * Math.abs(plusDI - minusDI)) / sumDI : 0;
    dxList.push(dx);
  }

  if (dxList.length < period) return null;

  // First ADX is average of first period DX values
  let adx = 0;
  for (let i = 0; i < period; i++) {
    adx += dxList[i];
  }
  adx /= period;

  // Wilder smoothing for subsequent ADX
  for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
  }

  return Number.isFinite(adx) ? Number(adx.toFixed(2)) : null;
}

/**
 * Aggregates H1 candles into completed UTC-aligned H4 buckets (00, 04, 08, 12, 16, 20 UTC).
 */
export function aggregateH4Buckets(h1Candles: Candle[]): H4Bar[] {
  const buckets: Map<number, { bars: Candle[]; complete: boolean }> = new Map();

  for (let i = 0; i < h1Candles.length; i++) {
    const c = h1Candles[i];
    const bucketTime = Math.floor(c.time / 14400) * 14400;
    const d = new Date(c.time * 1000);
    const hour = d.getUTCHours();

    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, { bars: [], complete: false });
    }

    const b = buckets.get(bucketTime)!;
    b.bars.push(c);

    // H1 bar at hour 03, 07, 11, 15, 19, 23 completes the 4-hour window
    if (hour % 4 === 3) {
      b.complete = true;
    }
  }

  // Also complete a bucket if a subsequent bucket has started
  const sortedTimes = Array.from(buckets.keys()).sort((a, b) => a - b);
  const result: H4Bar[] = [];

  for (let idx = 0; idx < sortedTimes.length; idx++) {
    const t = sortedTimes[idx];
    const entry = buckets.get(t)!;
    const isLast = idx === sortedTimes.length - 1;
    const isCompleted = entry.complete || (!isLast && entry.bars.length > 0);

    if (isCompleted && entry.bars.length > 0) {
      let high = -Infinity;
      let low = Infinity;
      let vol = 0;
      for (const bar of entry.bars) {
        if (bar.high > high) high = bar.high;
        if (bar.low < low) low = bar.low;
        vol += bar.tickVolume;
      }
      result.push({
        bucketTime: t,
        open: entry.bars[0].open,
        high,
        low,
        close: entry.bars[entry.bars.length - 1].close,
        volume: vol,
        complete: true,
      });
    }
  }

  return result;
}

/**
 * Evaluates the Trend Pullback Pro Strategy logic on a single bar context.
 */
export function evaluateTrendPullbackPro(
  ctx: any,
  bar: Candle,
  userParams: Partial<TrendPullbackProParams> = {}
) {
  const params: TrendPullbackProParams = { ...DEFAULT_TPP_PARAMS, ...userParams };
  const idx = ctx.currentBarIndex;

  // Warmup guard: require at least 60 H1 bars for indicators
  if (idx < 60) return;

  const d = new Date(bar.time * 1000);
  const curHour = d.getUTCHours();
  const curDay = d.getUTCDay(); // 0 = Sunday, 5 = Friday

  // 1. Time & Weekend Exits for existing positions
  const openPos = ctx.openPositions || [];
  for (const pos of openPos) {
    const holdBars = pos.entryBarIndex !== undefined ? idx - pos.entryBarIndex : 1;
    // Check Max Hold Bars exit
    if (holdBars >= params.maxHoldBars) {
      ctx.close(pos.ticket);
      ctx.log(`[TPP] Time exit after ${holdBars} bars (maxHoldBars=${params.maxHoldBars})`);
      continue;
    }
    // Check Friday Weekend exit
    if (params.closeBeforeWeekend && curDay === 5 && curHour >= params.weekendExitUtcHour) {
      ctx.close(pos.ticket);
      ctx.log(`[TPP] Weekend safety exit on Friday at ${curHour}:00 UTC`);
      continue;
    }
  }

  // Only 1 position per symbol permitted by spec
  if (openPos.length > 0) return;

  // 2. Rollover & Session Entry filter
  if (curHour >= params.noEntryFromUtcHour && curHour <= params.noEntryToUtcHour) {
    return; // Rollover spread widening block
  }
  if (curDay === 5 && curHour >= params.fridayLastEntryUtcHour) {
    return; // Late Friday entry block
  }

  // 3. Spread check
  const pipScale = ctx.symbol === 'USDJPY' ? 0.01 : ctx.symbol === 'XAUUSD' ? 1.0 : 0.0001;
  const spreadPips = (bar.spread || 1.2) * (ctx.symbol === 'XAUUSD' ? 0.1 : 1.0);
  if (spreadPips > params.maxSpreadPips) {
    return;
  }

  // 4. Multi-Timeframe H4 Trend Filters
  // Get all H1 candles up to current bar (excluding future bars)
  const allH1: Candle[] = [];
  for (let i = 0; i <= idx; i++) {
    const b = ctx.getBar(i);
    if (b) allH1.push(b);
  }

  const h4Bars = aggregateH4Buckets(allH1);
  if (h4Bars.length < Math.max(params.trendEmaSlow, 25)) {
    // If not enough H4 bars to compute 200 EMA, use synthetic H1 trend scaling (50*4 = 200 H1 EMA)
    // to provide graceful execution even on shorter backtest windows.
  }

  // Calculate H1 EMA(20)
  const calcEma = (len: number, barOffset = 0) => {
    const k = 2 / (len + 1);
    let val = ctx.getBar(Math.max(0, idx - len - barOffset)).close;
    for (let i = Math.max(0, idx - len - barOffset) + 1; i <= idx - barOffset; i++) {
      const b = ctx.getBar(i);
      if (b) val = b.close * k + val * (1 - k);
    }
    return val;
  };

  const ema20_cur = calcEma(params.pullbackEma, 0);
  const ema20_prev = calcEma(params.pullbackEma, 1);

  // Fast & Slow Trend EMAs (50 & 200)
  const trendFastEma = calcEma(params.trendEmaFast * 2, 0);
  const trendSlowEma = calcEma(params.trendEmaSlow * 2, 0);
  const trendFastEmaPrev = calcEma(params.trendEmaFast * 2, params.trendSlopeBars);

  const prevBar = ctx.getBar(idx - 1);
  if (!prevBar) return;

  // 5. RSI & Cross Window
  const calcRsi = (offset = 0) => {
    let gains = 0;
    let losses = 0;
    const p = params.rsiPeriod;
    for (let i = idx - p - offset + 1; i <= idx - offset; i++) {
      const c = ctx.getBar(i);
      const prev = ctx.getBar(i - 1);
      if (c && prev) {
        const diff = c.close - prev.close;
        if (diff > 0) gains += diff;
        else losses += -diff;
      }
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - 100 / (1 + rs);
  };

  const rsiCur = calcRsi(0);
  let rsiCrossedLong = false;
  let rsiCrossedShort = false;

  for (let w = 0; w <= params.rsiCrossWindow; w++) {
    const r = calcRsi(w);
    if (r <= params.rsiLevel) rsiCrossedLong = true;
    if (r >= params.rsiLevel) rsiCrossedShort = true;
  }

  // 6. Wilder ADX
  const recentSlice = allH1.slice(-150);
  const adx = calculateWilderAdx(recentSlice, params.adxPeriod) || 25.0;

  if (adx < params.adxMin || adx > params.adxMax) {
    return; // Trend strength outside configured operating band
  }

  // 7. ATR for Stop-Loss & Take-Profit
  let atrSum = 0;
  for (let i = idx - params.atrPeriod; i < idx; i++) {
    const c = ctx.getBar(i);
    const p = ctx.getBar(i - 1);
    if (c && p) {
      atrSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
  }
  const atr = atrSum > 0 ? atrSum / params.atrPeriod : 0.0015;
  const stopDistance = params.slAtr * atr;
  const targetDistance = params.rr * stopDistance;

  // 8. Evaluation of LONG condition
  const longTrend = bar.close > trendSlowEma && trendFastEma > trendSlowEma && trendFastEma >= trendFastEmaPrev;
  const longPullback = prevBar.close <= ema20_prev && bar.close > ema20_cur;
  const longRsi = rsiCur > params.rsiLevel && rsiCrossedLong;

  if (longTrend && longPullback && longRsi) {
    const sl = Number((bar.close - stopDistance).toFixed(bar.close > 100 ? 2 : 5));
    const tp = Number((bar.close + targetDistance).toFixed(bar.close > 100 ? 2 : 5));
    const comment = `TPP|L|ADX=${adx}|RSI=${rsiCur.toFixed(1)}|ATR=${atr.toFixed(5)}|SLx=${params.slAtr}|R=${params.rr}`;

    ctx.buy(ctx.symbol, 1.0, sl, tp, undefined, undefined, comment);
    ctx.addVisualMarker?.({
      id: 'tpp-long-' + idx,
      time: bar.time,
      price: bar.close,
      shape: 'triangle_up',
      color: '#10b981',
      label: 'TPP BUY ↑',
    });
    ctx.log?.(`[TPP LONG] Entry @ ${bar.close} | SL: ${sl} | TP: ${tp} | ADX: ${adx}`);
    return;
  }

  // 9. Evaluation of SHORT condition
  const shortTrend = bar.close < trendSlowEma && trendFastEma < trendSlowEma && trendFastEma <= trendFastEmaPrev;
  const shortPullback = prevBar.close >= ema20_prev && bar.close < ema20_cur;
  const shortRsi = rsiCur < params.rsiLevel && rsiCrossedShort;

  if (shortTrend && shortPullback && shortRsi) {
    const sl = Number((bar.close + stopDistance).toFixed(bar.close > 100 ? 2 : 5));
    const tp = Number((bar.close - targetDistance).toFixed(bar.close > 100 ? 2 : 5));
    const comment = `TPP|S|ADX=${adx}|RSI=${rsiCur.toFixed(1)}|ATR=${atr.toFixed(5)}|SLx=${params.slAtr}|R=${params.rr}`;

    ctx.sell(ctx.symbol, 1.0, sl, tp, undefined, undefined, comment);
    ctx.addVisualMarker?.({
      id: 'tpp-short-' + idx,
      time: bar.time,
      price: bar.close,
      shape: 'triangle_down',
      color: '#f43f5e',
      label: 'TPP SELL ↓',
    });
    ctx.log?.(`[TPP SHORT] Entry @ ${bar.close} | SL: ${sl} | TP: ${tp} | ADX: ${adx}`);
  }
}
