import { Candle, ForexSymbol } from '../types/forex';

export type ActionSignal = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell' | 'Less Volatility';

export interface IndicatorRow {
  name: string;
  value: number;
  action: ActionSignal;
}

export interface MovingAverageRow {
  name: string;
  simple: number;
  simpleAction: ActionSignal;
  exponential: number;
  exponentialAction: ActionSignal;
}

export interface PivotPointsRow {
  name: string;
  s3: number | string;
  s2: number | string;
  s1: number | string;
  pivot: number | string;
  r1: number | string;
  r2: number | string;
  r3: number | string;
}

export interface TechnicalAnalysisReport {
  symbol: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  price: number;
  change24h: number;
  change24hPct: number;
  dayRangeLow: number;
  dayRangeHigh: number;
  yearRangeLow: number;
  yearRangeHigh: number;
  timeframe: string;
  summaryAction: ActionSignal;
  summaryBuyCount: number;
  summarySellCount: number;
  summaryNeutralCount: number;
  maAction: ActionSignal;
  maBuyCount: number;
  maSellCount: number;
  indicatorsAction: ActionSignal;
  indicatorsBuyCount: number;
  indicatorsSellCount: number;
  indicatorsNeutralCount: number;
  indicators: IndicatorRow[];
  movingAverages: MovingAverageRow[];
  pivotPoints: PivotPointsRow[];
  lastUpdated: string;
}

// ============================================================================
// HELPER MATH & SMOOTHING UTILITIES (Zero Lookahead, NaN Protected)
// ============================================================================

function isFiniteNum(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

/**
 * Wilder's Smoothing (standard TA-Lib / Wilder definition)
 * Initial value = Simple Average of first `period` items.
 * Subsequent = (previousSmoothed * (period - 1) + currentValue) / period
 */
export function wilderSmoothing(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    sum += isFiniteNum(v) ? v : 0;
  }
  let prevSmoothed = sum / period;
  result[period - 1] = prevSmoothed;

  for (let i = period; i < values.length; i++) {
    const v = values[i];
    const val = isFiniteNum(v) ? v : prevSmoothed;
    prevSmoothed = (prevSmoothed * (period - 1) + val) / period;
    result[i] = prevSmoothed;
  }

  return result;
}

// ============================================================================
// OVERLAY INDICATORS (13)
// ============================================================================

/**
 * 1. Simple Moving Average (SMA)
 */
export function calculateSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += isFiniteNum(values[i]) ? values[i] : 0;
  }
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    const addVal = isFiniteNum(values[i]) ? values[i] : 0;
    const dropVal = isFiniteNum(values[i - period]) ? values[i - period] : 0;
    sum += addVal - dropVal;
    result[i] = sum / period;
  }

  return result;
}

/**
 * 2. Exponential Moving Average (EMA)
 */
export function calculateEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += isFiniteNum(values[i]) ? values[i] : 0;
  }
  let prevEMA = sum / period;
  result[period - 1] = prevEMA;

  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    const v = isFiniteNum(values[i]) ? values[i] : prevEMA;
    prevEMA = (v - prevEMA) * k + prevEMA;
    result[i] = prevEMA;
  }

  return result;
}

/**
 * 3. Weighted Moving Average (WMA)
 */
export function calculateWMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;

  const denominator = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let weightedSum = 0;
    for (let j = 0; j < period; j++) {
      const v = values[i - period + 1 + j];
      weightedSum += (isFiniteNum(v) ? v : 0) * (j + 1);
    }
    result[i] = weightedSum / denominator;
  }

  return result;
}

/**
 * 4. Hull Moving Average (HMA)
 * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
 */
export function calculateHullMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 1) return result;

  const halfPeriod = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));

  const wmaHalf = calculateWMA(values, halfPeriod);
  const wmaFull = calculateWMA(values, period);

  const rawDiff: number[] = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    const h = wmaHalf[i];
    const f = wmaFull[i];
    if (h !== null && f !== null) {
      rawDiff[i] = 2 * h - f;
    } else {
      rawDiff[i] = 0;
    }
  }

  // Calculate WMA of diff over sqrtPeriod starting where wmaFull became valid
  const finalWma = calculateWMA(rawDiff, sqrtPeriod);
  const minValidIdx = period - 1 + sqrtPeriod - 1;
  for (let i = 0; i < values.length; i++) {
    if (i >= minValidIdx) {
      result[i] = finalWma[i];
    }
  }

  return result;
}

/**
 * 5. Bollinger Bands
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMult = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
} {
  const middle = calculateSMA(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const bandwidth: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null) continue;

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = (isFiniteNum(closes[j]) ? closes[j] : mid) - mid;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / period);
    upper[i] = mid + stdDevMult * stdDev;
    lower[i] = mid - stdDevMult * stdDev;
    bandwidth[i] = mid !== 0 ? ((upper[i]! - lower[i]!) / mid) * 100 : 0;
  }

  return { upper, middle, lower, bandwidth };
}

/**
 * 6. Keltner Channels
 */
export function calculateKeltnerChannels(
  candles: Candle[],
  emaPeriod = 20,
  atrPeriod = 10,
  multiplier = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const closes = candles.map((c) => c.close);
  const middle = calculateEMA(closes, emaPeriod);
  const atr = calculateATR(candles, atrPeriod);

  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = 0; i < candles.length; i++) {
    const mid = middle[i];
    const a = atr[i];
    if (mid !== null && a !== null) {
      upper[i] = mid + multiplier * a;
      lower[i] = mid - multiplier * a;
    }
  }

  return { upper, middle, lower };
}

/**
 * 7. Donchian Channels
 */
export function calculateDonchianChannels(
  candles: Candle[],
  period = 20
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const middle: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);

  if (candles.length < period || period <= 0) return { upper, middle, lower };

  for (let i = period - 1; i < candles.length; i++) {
    let maxHigh = -Infinity;
    let minLow = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > maxHigh) maxHigh = candles[j].high;
      if (candles[j].low < minLow) minLow = candles[j].low;
    }
    if (maxHigh > -Infinity && minLow < Infinity) {
      upper[i] = maxHigh;
      lower[i] = minLow;
      middle[i] = (maxHigh + minLow) / 2;
    }
  }

  return { upper, middle, lower };
}

/**
 * 8. Ichimoku Cloud (9, 26, 52)
 */
export function calculateIchimoku(
  candles: Candle[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52
): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
  chikou: (number | null)[];
} {
  const n = candles.length;
  const tenkan: (number | null)[] = new Array(n).fill(null);
  const kijun: (number | null)[] = new Array(n).fill(null);
  const senkouA: (number | null)[] = new Array(n).fill(null);
  const senkouB: (number | null)[] = new Array(n).fill(null);
  const chikou: (number | null)[] = new Array(n).fill(null);

  const getExtremes = (startIdx: number, endIdx: number) => {
    let h = -Infinity;
    let l = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      if (candles[i].high > h) h = candles[i].high;
      if (candles[i].low < l) l = candles[i].low;
    }
    return (h + l) / 2;
  };

  for (let i = 0; i < n; i++) {
    chikou[i] = candles[i].close;

    if (i >= tenkanPeriod - 1) {
      tenkan[i] = getExtremes(i - tenkanPeriod + 1, i);
    }
    if (i >= kijunPeriod - 1) {
      kijun[i] = getExtremes(i - kijunPeriod + 1, i);
    }
    if (tenkan[i] !== null && kijun[i] !== null) {
      senkouA[i] = (tenkan[i]! + kijun[i]!) / 2;
    }
    if (i >= senkouBPeriod - 1) {
      senkouB[i] = getExtremes(i - senkouBPeriod + 1, i);
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

/**
 * 9. Supertrend
 */
export function calculateSupertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3
): {
  supertrend: (number | null)[];
  direction: (1 | -1 | null)[];
} {
  const n = candles.length;
  const supertrend: (number | null)[] = new Array(n).fill(null);
  const direction: (1 | -1 | null)[] = new Array(n).fill(null);

  const atr = calculateATR(candles, period);

  let prevFinalUpper = 0;
  let prevFinalLower = 0;
  let prevDir: 1 | -1 = 1;

  for (let i = 0; i < n; i++) {
    const curAtr = atr[i];
    if (curAtr === null) continue;

    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicUpper = hl2 + multiplier * curAtr;
    const basicLower = hl2 - multiplier * curAtr;

    let finalUpper = basicUpper;
    let finalLower = basicLower;

    if (i > 0 && supertrend[i - 1] !== null) {
      const prevClose = candles[i - 1].close;
      if (basicUpper < prevFinalUpper || prevClose > prevFinalUpper) {
        finalUpper = basicUpper;
      } else {
        finalUpper = prevFinalUpper;
      }

      if (basicLower > prevFinalLower || prevClose < prevFinalLower) {
        finalLower = basicLower;
      } else {
        finalLower = prevFinalLower;
      }
    }

    let curDir: 1 | -1 = prevDir;
    if (candles[i].close > finalUpper) {
      curDir = 1;
    } else if (candles[i].close < finalLower) {
      curDir = -1;
    }

    direction[i] = curDir;
    supertrend[i] = curDir === 1 ? finalLower : finalUpper;

    prevFinalUpper = finalUpper;
    prevFinalLower = finalLower;
    prevDir = curDir;
  }

  return { supertrend, direction };
}

/**
 * 10. Parabolic SAR
 */
export function calculateParabolicSAR(
  candles: Candle[],
  step = 0.02,
  maxStep = 0.20
): (number | null)[] {
  const n = candles.length;
  const sar: (number | null)[] = new Array(n).fill(null);
  if (n < 2) return sar;

  let isLong = candles[1].close >= candles[0].close;
  let af = step;
  let ep = isLong ? Math.max(candles[0].high, candles[1].high) : Math.min(candles[0].low, candles[1].low);
  let curSar = isLong ? Math.min(candles[0].low, candles[1].low) : Math.max(candles[0].high, candles[1].high);

  sar[0] = null;
  sar[1] = curSar;

  for (let i = 2; i < n; i++) {
    let nextSar = curSar + af * (ep - curSar);

    if (isLong) {
      nextSar = Math.min(nextSar, candles[i - 1].low, candles[i - 2].low);
      if (candles[i].low < nextSar) {
        isLong = false;
        curSar = ep;
        ep = candles[i].low;
        af = step;
      } else {
        curSar = nextSar;
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      nextSar = Math.max(nextSar, candles[i - 1].high, candles[i - 2].high);
      if (candles[i].high > nextSar) {
        isLong = true;
        curSar = ep;
        ep = candles[i].high;
        af = step;
      } else {
        curSar = nextSar;
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + step, maxStep);
        }
      }
    }

    sar[i] = curSar;
  }

  return sar;
}

/**
 * 11. Tick VWAP (Volume Weighted Average Price, daily reset with broker UTC offset)
 */
export function calculateTickVWAP(candles: Candle[], utcOffsetHours = 2): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length === 0) return result;

  let cumTypicalVolume = 0;
  let cumVolume = 0;
  let currentDay = -1;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const adjustedTime = c.time + utcOffsetHours * 3600;
    const day = Math.floor(adjustedTime / 86400);

    if (day !== currentDay) {
      currentDay = day;
      cumTypicalVolume = 0;
      cumVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = Math.max(1, isFiniteNum(c.tickVolume) ? c.tickVolume : 1);

    cumTypicalVolume += typicalPrice * vol;
    cumVolume += vol;

    result[i] = cumVolume > 0 ? cumTypicalVolume / cumVolume : typicalPrice;
  }

  return result;
}

/**
 * 12. Pivot Points (Classic, Fibonacci, Camarilla, Woodie, DeMark)
 */
export function calculatePivotPoints(
  candles: Candle[],
  type: 'classic' | 'fibonacci' | 'camarilla' | 'woodie' | 'demark' = 'classic'
): {
  pivot: (number | null)[];
  s1: (number | null)[];
  s2: (number | null)[];
  s3: (number | null)[];
  r1: (number | null)[];
  r2: (number | null)[];
  r3: (number | null)[];
} {
  const n = candles.length;
  const pivot: (number | null)[] = new Array(n).fill(null);
  const s1: (number | null)[] = new Array(n).fill(null);
  const s2: (number | null)[] = new Array(n).fill(null);
  const s3: (number | null)[] = new Array(n).fill(null);
  const r1: (number | null)[] = new Array(n).fill(null);
  const r2: (number | null)[] = new Array(n).fill(null);
  const r3: (number | null)[] = new Array(n).fill(null);

  if (n === 0) return { pivot, s1, s2, s3, r1, r2, r3 };

  // Rolling 24-period high, low, close benchmark
  const lookback = Math.min(24, n);
  for (let i = lookback - 1; i < n; i++) {
    let h = -Infinity;
    let l = Infinity;
    for (let j = i - lookback + 1; j <= i; j++) {
      if (candles[j].high > h) h = candles[j].high;
      if (candles[j].low < l) l = candles[j].low;
    }
    const c = candles[i].close;
    const o = candles[i - lookback + 1].open;
    const range = h - l;

    if (type === 'classic') {
      const pp = (h + l + c) / 3;
      pivot[i] = pp;
      r1[i] = 2 * pp - l;
      s1[i] = 2 * pp - h;
      r2[i] = pp + range;
      s2[i] = pp - range;
      r3[i] = h + 2 * (pp - l);
      s3[i] = l - 2 * (h - pp);
    } else if (type === 'fibonacci') {
      const pp = (h + l + c) / 3;
      pivot[i] = pp;
      r1[i] = pp + 0.382 * range;
      s1[i] = pp - 0.382 * range;
      r2[i] = pp + 0.618 * range;
      s2[i] = pp - 0.618 * range;
      r3[i] = pp + 1.0 * range;
      s3[i] = pp - 1.0 * range;
    } else if (type === 'camarilla') {
      const pp = (h + l + c) / 3;
      pivot[i] = pp;
      r1[i] = c + (range * 1.1) / 12;
      s1[i] = c - (range * 1.1) / 12;
      r2[i] = c + (range * 1.1) / 6;
      s2[i] = c - (range * 1.1) / 6;
      r3[i] = c + (range * 1.1) / 4;
      s3[i] = c - (range * 1.1) / 4;
    } else if (type === 'woodie') {
      const pp = (h + l + 2 * c) / 4;
      pivot[i] = pp;
      r1[i] = 2 * pp - l;
      s1[i] = 2 * pp - h;
      r2[i] = pp + range;
      s2[i] = pp - range;
      r3[i] = h + 2 * (pp - l);
      s3[i] = l - 2 * (h - pp);
    } else if (type === 'demark') {
      let x = 0;
      if (c < o) x = h + 2 * l + c;
      else if (c > o) x = 2 * h + l + c;
      else x = h + l + 2 * c;
      const pp = x / 4;
      pivot[i] = pp;
      r1[i] = x / 2 - l;
      s1[i] = x / 2 - h;
      r2[i] = null;
      s2[i] = null;
      r3[i] = null;
      s3[i] = null;
    }
  }

  return { pivot, s1, s2, s3, r1, r2, r3 };
}

/**
 * 13. Trading Session Boxes (Asian, London, New York)
 */
export interface SessionBox {
  name: 'Asian' | 'London' | 'New York';
  startTime: number;
  endTime: number;
  high: number;
  low: number;
  color: string;
}

export function calculateSessionBoxes(candles: Candle[], utcOffsetHours = 0): SessionBox[] {
  const boxes: SessionBox[] = [];
  if (candles.length === 0) return boxes;

  const sessionDefs = [
    { name: 'Asian' as const, startH: 0, endH: 9, color: 'rgba(56, 189, 248, 0.15)' },
    { name: 'London' as const, startH: 7, endH: 16, color: 'rgba(234, 179, 8, 0.15)' },
    { name: 'New York' as const, startH: 12, endH: 21, color: 'rgba(99, 102, 241, 0.15)' },
  ];

  // Group candles by Day and Session
  for (const s of sessionDefs) {
    let inSession = false;
    let sTime = 0;
    let eTime = 0;
    let sHigh = -Infinity;
    let sLow = Infinity;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const d = new Date((c.time + utcOffsetHours * 3600) * 1000);
      const hour = d.getUTCHours();

      const isInside = hour >= s.startH && hour < s.endH;

      if (isInside) {
        if (!inSession) {
          inSession = true;
          sTime = c.time;
          sHigh = c.high;
          sLow = c.low;
        } else {
          if (c.high > sHigh) sHigh = c.high;
          if (c.low < sLow) sLow = c.low;
        }
        eTime = c.time;
      } else if (inSession) {
        boxes.push({
          name: s.name,
          startTime: sTime,
          endTime: eTime,
          high: sHigh,
          low: sLow,
          color: s.color,
        });
        inSession = false;
        sHigh = -Infinity;
        sLow = Infinity;
      }
    }
    if (inSession) {
      boxes.push({
        name: s.name,
        startTime: sTime,
        endTime: eTime,
        high: sHigh,
        low: sLow,
        color: s.color,
      });
    }
  }

  return boxes.sort((a, b) => a.startTime - b.startTime);
}

// ============================================================================
// SUB-PANE INDICATORS (12)
// ============================================================================

/**
 * 14. Relative Strength Index (RSI) with Wilder Smoothing
 */
export function calculateRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period || period <= 0) return result;

  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }

  // Initial average gain and loss (SMA over first `period` changes)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - 100 / (1 + rs);
  }

  // Wilder smoothing for subsequent periods
  for (let i = period + 1; i < closes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

/**
 * 15. Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const n = closes.length;
  const macd: (number | null)[] = new Array(n).fill(null);
  const signal: (number | null)[] = new Array(n).fill(null);
  const histogram: (number | null)[] = new Array(n).fill(null);

  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const validMacdValues: number[] = [];
  const macdIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    const f = fastEMA[i];
    const s = slowEMA[i];
    if (f !== null && s !== null) {
      const val = f - s;
      macd[i] = val;
      validMacdValues.push(val);
      macdIndices.push(i);
    }
  }

  if (validMacdValues.length >= signalPeriod) {
    const sigEMA = calculateEMA(validMacdValues, signalPeriod);
    for (let j = 0; j < validMacdValues.length; j++) {
      const originalIdx = macdIndices[j];
      const sigVal = sigEMA[j];
      if (sigVal !== null) {
        signal[originalIdx] = sigVal;
        histogram[originalIdx] = macd[originalIdx]! - sigVal;
      }
    }
  }

  return { macd, signal, histogram };
}

/**
 * 16. Stochastic Oscillator (14, 3, 3)
 */
export function calculateStochastic(
  candles: Candle[],
  kPeriod = 14,
  kSmooth = 3,
  dPeriod = 3
): {
  k: (number | null)[];
  d: (number | null)[];
} {
  const n = candles.length;
  const rawK: (number | null)[] = new Array(n).fill(null);

  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    rawK[i] = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100;
  }

  // Smooth rawK with SMA(kSmooth)
  const smoothedKValues: (number | null)[] = new Array(n).fill(null);
  for (let i = kPeriod - 1 + kSmooth - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      sum += rawK[j] ?? 50;
    }
    smoothedKValues[i] = sum / kSmooth;
  }

  // %D = SMA(smoothedK, dPeriod)
  const dValues: (number | null)[] = new Array(n).fill(null);
  for (let i = kPeriod - 1 + kSmooth - 1 + dPeriod - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      sum += smoothedKValues[j] ?? 50;
    }
    dValues[i] = sum / dPeriod;
  }

  return { k: smoothedKValues, d: dValues };
}

/**
 * 17. Stochastic RSI
 */
export function calculateStochRSI(
  closes: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3
): {
  k: (number | null)[];
  d: (number | null)[];
} {
  const n = closes.length;
  const k: (number | null)[] = new Array(n).fill(null);
  const d: (number | null)[] = new Array(n).fill(null);

  const rsi = calculateRSI(closes, rsiPeriod);
  const rawK: (number | null)[] = new Array(n).fill(null);

  for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
    let minRsi = Infinity;
    let maxRsi = -Infinity;
    let hasNull = false;

    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const r = rsi[j];
      if (r === null) {
        hasNull = true;
        break;
      }
      if (r < minRsi) minRsi = r;
      if (r > maxRsi) maxRsi = r;
    }

    if (!hasNull) {
      const range = maxRsi - minRsi;
      rawK[i] = range === 0 ? 50 : ((rsi[i]! - minRsi) / range) * 100;
    }
  }

  // Smooth K
  for (let i = rsiPeriod + stochPeriod - 1 + kSmooth - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      sum += rawK[j] ?? 50;
    }
    k[i] = sum / kSmooth;
  }

  // Smooth D
  for (let i = rsiPeriod + stochPeriod - 1 + kSmooth - 1 + dSmooth - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) {
      sum += k[j] ?? 50;
    }
    d[i] = sum / dSmooth;
  }

  return { k, d };
}

/**
 * 18. Average Directional Index (ADX) with Wilder Smoothing
 */
export function calculateADX(
  candles: Candle[],
  period = 14
): {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
} {
  const n = candles.length;
  const adx: (number | null)[] = new Array(n).fill(null);
  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);

  if (n <= period || period <= 0) return { adx, plusDI, minusDI };

  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  tr[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < n; i++) {
    const highDiff = candles[i].high - candles[i - 1].high;
    const lowDiff = candles[i - 1].low - candles[i].low;

    plusDM[i] = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM[i] = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;

    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  const smoothTR = wilderSmoothing(tr, period);
  const smoothPlusDM = wilderSmoothing(plusDM, period);
  const smoothMinusDM = wilderSmoothing(minusDM, period);

  const dx: (number | null)[] = new Array(n).fill(null);
  const dxValues: number[] = [];
  const dxIndices: number[] = [];

  for (let i = period - 1; i < n; i++) {
    const sTR = smoothTR[i];
    const sPDM = smoothPlusDM[i];
    const sMDM = smoothMinusDM[i];

    if (sTR !== null && sPDM !== null && sMDM !== null && sTR > 0) {
      const pDI = (sPDM / sTR) * 100;
      const mDI = (sMDM / sTR) * 100;
      plusDI[i] = pDI;
      minusDI[i] = mDI;

      const sumDI = pDI + mDI;
      const dxVal = sumDI > 0 ? (Math.abs(pDI - mDI) / sumDI) * 100 : 0;
      dx[i] = dxVal;
      dxValues.push(dxVal);
      dxIndices.push(i);
    }
  }

  if (dxValues.length >= period) {
    const smoothDX = wilderSmoothing(dxValues, period);
    for (let j = 0; j < dxValues.length; j++) {
      const originalIdx = dxIndices[j];
      const val = smoothDX[j];
      if (val !== null) {
        adx[originalIdx] = val;
      }
    }
  }

  return { adx, plusDI, minusDI };
}

/**
 * 19. Average True Range (ATR) with Wilder Smoothing
 */
export function calculateATR(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period || period <= 0) return result;

  const tr: number[] = new Array(n).fill(0);
  tr[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < n; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  return wilderSmoothing(tr, period);
}

/**
 * 20. Commodity Channel Index (CCI)
 */
export function calculateCCI(candles: Candle[], period = 20): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period || period <= 0) return result;

  const tp: number[] = candles.map((c) => (c.high + c.low + c.close) / 3);
  const tpSMA = calculateSMA(tp, period);

  for (let i = period - 1; i < n; i++) {
    const mid = tpSMA[i];
    if (mid === null) continue;

    let meanDevSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      meanDevSum += Math.abs(tp[j] - mid);
    }
    const meanDev = meanDevSum / period;
    result[i] = meanDev === 0 ? 0 : (tp[i] - mid) / (0.015 * meanDev);
  }

  return result;
}

/**
 * 21. Williams %R
 */
export function calculateWilliamsR(candles: Candle[], period = 14): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < period || period <= 0) return result;

  for (let i = period - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    result[i] = range === 0 ? -50 : ((hh - candles[i].close) / range) * -100;
  }

  return result;
}

/**
 * 22. Rate of Change (ROC) / Momentum
 */
export function calculateROC(closes: number[], period = 12): (number | null)[] {
  const n = closes.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n <= period || period <= 0) return result;

  for (let i = period; i < n; i++) {
    const prev = closes[i - period];
    if (prev && prev !== 0) {
      result[i] = ((closes[i] - prev) / prev) * 100;
    } else {
      result[i] = 0;
    }
  }

  return result;
}

/**
 * 23. On-Balance Volume (Tick OBV)
 */
export function calculateOBV(candles: Candle[]): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return result;

  let currentOBV = isFiniteNum(candles[0].tickVolume) ? candles[0].tickVolume : 0;
  result[0] = currentOBV;

  for (let i = 1; i < n; i++) {
    const vol = isFiniteNum(candles[i].tickVolume) ? candles[i].tickVolume : 0;
    if (candles[i].close > candles[i - 1].close) {
      currentOBV += vol;
    } else if (candles[i].close < candles[i - 1].close) {
      currentOBV -= vol;
    }
    result[i] = currentOBV;
  }

  return result;
}

/**
 * 24. Tick Volume + Moving Average
 */
export function calculateVolumeMA(
  candles: Candle[],
  period = 20
): {
  volume: number[];
  ma: (number | null)[];
} {
  const volume = candles.map((c) => (isFiniteNum(c.tickVolume) ? c.tickVolume : 0));
  const ma = calculateSMA(volume, period);
  return { volume, ma };
}

/**
 * 25. Awesome Oscillator (AO)
 * AO = SMA(MedianPrice, 5) - SMA(MedianPrice, 34)
 */
export function calculateAwesomeOscillator(candles: Candle[]): (number | null)[] {
  const n = candles.length;
  const result: (number | null)[] = new Array(n).fill(null);
  if (n < 34) return result;

  const medianPrices = candles.map((c) => (c.high + c.low) / 2);
  const sma5 = calculateSMA(medianPrices, 5);
  const sma34 = calculateSMA(medianPrices, 34);

  for (let i = 33; i < n; i++) {
    const s5 = sma5[i];
    const s34 = sma34[i];
    if (s5 !== null && s34 !== null) {
      result[i] = s5 - s34;
    }
  }

  return result;
}

// ============================================================================
// CONVENIENCE BATCH COMPUTATION FOR 25 INDICATORS
// ============================================================================

export interface AllIndicatorsResult {
  overlays: {
    sma20: (number | null)[];
    ema20: (number | null)[];
    wma20: (number | null)[];
    hull20: (number | null)[];
    bollinger: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
    keltner: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
    donchian: { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] };
    ichimoku: { tenkan: (number | null)[]; kijun: (number | null)[]; senkouA: (number | null)[]; senkouB: (number | null)[] };
    supertrend: { supertrend: (number | null)[]; direction: (1 | -1 | null)[] };
    parabolicSAR: (number | null)[];
    tickVWAP: (number | null)[];
    pivots: { pivot: (number | null)[]; s1: (number | null)[]; r1: (number | null)[] };
    sessionBoxes: SessionBox[];
  };
  subPanes: {
    rsi: (number | null)[];
    macd: { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] };
    stochastic: { k: (number | null)[]; d: (number | null)[] };
    stochRSI: { k: (number | null)[]; d: (number | null)[] };
    adx: { adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] };
    atr: (number | null)[];
    cci: (number | null)[];
    williamsR: (number | null)[];
    roc: (number | null)[];
    obv: (number | null)[];
    volumeMA: { volume: number[]; ma: (number | null)[] };
    awesomeOscillator: (number | null)[];
  };
}

export function computeAllIndicators(candles: Candle[]): AllIndicatorsResult {
  const closes = candles.map((c) => c.close);

  return {
    overlays: {
      sma20: calculateSMA(closes, 20),
      ema20: calculateEMA(closes, 20),
      wma20: calculateWMA(closes, 20),
      hull20: calculateHullMA(closes, 20),
      bollinger: calculateBollingerBands(closes, 20, 2),
      keltner: calculateKeltnerChannels(candles, 20, 10, 2),
      donchian: calculateDonchianChannels(candles, 20),
      ichimoku: calculateIchimoku(candles, 9, 26, 52),
      supertrend: calculateSupertrend(candles, 10, 3),
      parabolicSAR: calculateParabolicSAR(candles),
      tickVWAP: calculateTickVWAP(candles),
      pivots: calculatePivotPoints(candles, 'classic'),
      sessionBoxes: calculateSessionBoxes(candles),
    },
    subPanes: {
      rsi: calculateRSI(closes, 14),
      macd: calculateMACD(closes, 12, 26, 9),
      stochastic: calculateStochastic(candles, 14, 3, 3),
      stochRSI: calculateStochRSI(closes, 14, 14, 3, 3),
      adx: calculateADX(candles, 14),
      atr: calculateATR(candles, 14),
      cci: calculateCCI(candles, 20),
      williamsR: calculateWilliamsR(candles, 14),
      roc: calculateROC(closes, 12),
      obv: calculateOBV(candles),
      volumeMA: calculateVolumeMA(candles, 20),
      awesomeOscillator: calculateAwesomeOscillator(candles),
    },
  };
}

// ============================================================================
// ORIGINAL COMPUTE TECHNICAL REPORT (Preserved for compatibility)
// ============================================================================

const TIMEFRAME_PROFILE: Record<
  string,
  {
    rsiOffset: number;
    trendBias: number;
    volatilityScale: number;
    buySkew: number;
    periodFactor: number;
  }
> = {
  M1: { rsiOffset: -4.5, trendBias: 0.1, volatilityScale: 0.25, buySkew: 0, periodFactor: 0.2 },
  M5: { rsiOffset: 2.1, trendBias: 0.2, volatilityScale: 0.45, buySkew: 1, periodFactor: 0.4 },
  M15: { rsiOffset: -1.2, trendBias: -0.1, volatilityScale: 0.65, buySkew: -1, periodFactor: 0.6 },
  M30: { rsiOffset: 5.4, trendBias: 0.4, volatilityScale: 0.85, buySkew: 2, periodFactor: 0.8 },
  H1: { rsiOffset: 9.1, trendBias: 0.6, volatilityScale: 1.0, buySkew: 3, periodFactor: 1.0 },
  H3: { rsiOffset: 12.3, trendBias: 0.8, volatilityScale: 1.4, buySkew: 4, periodFactor: 1.5 },
  D1: { rsiOffset: 16.5, trendBias: 1.2, volatilityScale: 2.2, buySkew: 5, periodFactor: 2.5 },
  W1: { rsiOffset: 18.2, trendBias: 1.5, volatilityScale: 4.0, buySkew: 6, periodFactor: 4.0 },
  MN1: { rsiOffset: 14.0, trendBias: 1.1, volatilityScale: 7.5, buySkew: 4, periodFactor: 8.0 },
};

export function computeTechnicalReport(
  symbol: string,
  timeframe: string,
  candles: Candle[] = []
): TechnicalAnalysisReport {
  const isGold = symbol.toUpperCase() === 'XAUUSD';
  const cleanSymbol = symbol.toUpperCase().replace(/M$/, '');
  const tf = timeframe.toUpperCase();
  const profile = TIMEFRAME_PROFILE[tf] || TIMEFRAME_PROFILE['H1'];

  const basePrices: Record<string, number> = {
    XAUUSD: 2650.0,
    EURUSD: 1.0852,
    GBPUSD: 1.2965,
    USDJPY: 151.34,
  };
  const nominalPrice = basePrices[cleanSymbol] || (isGold ? 2650.0 : 1.0852);

  let currentPrice = nominalPrice;
  let dayHigh = nominalPrice * (1 + 0.006 * profile.volatilityScale);
  let dayLow = nominalPrice * (1 - 0.006 * profile.volatilityScale);

  if (candles.length > 0) {
    const lastBar = candles[candles.length - 1];
    currentPrice = lastBar.close;
    const recent = candles.slice(-24);
    dayHigh = Math.max(...recent.map((c) => c.high));
    dayLow = Math.min(...recent.map((c) => c.low));
  }

  const decimals = isGold ? 2 : cleanSymbol === 'USDJPY' ? 3 : 5;
  const round = (n: number) => Number(n.toFixed(decimals));

  const changePct = Number((0.15 * profile.trendBias).toFixed(2));
  const changeValue = round(currentPrice * (changePct / 100));

  let rsi = 50 + profile.rsiOffset;
  rsi = Math.min(85, Math.max(25, Number(rsi.toFixed(2))));
  const rsiAction: ActionSignal = rsi > 70 ? 'Sell' : rsi > 55 ? 'Buy' : rsi < 30 ? 'Buy' : rsi < 45 ? 'Sell' : 'Neutral';

  const stochK = Number(Math.min(95, Math.max(10, rsi - 3.5 + profile.trendBias * 4)).toFixed(2));
  const stochAction: ActionSignal = stochK > 80 ? 'Sell' : stochK > 52 ? 'Buy' : stochK < 20 ? 'Buy' : 'Neutral';

  const macdVal = Number((currentPrice * 0.0012 * profile.trendBias).toFixed(isGold ? 2 : 5));
  const macdAction: ActionSignal = macdVal > 0 ? 'Buy' : macdVal < -0.001 ? 'Sell' : 'Neutral';

  const atrVal = isGold
    ? Number((10.5 * profile.volatilityScale).toFixed(2))
    : Number((0.0045 * profile.volatilityScale).toFixed(4));

  const adxVal = Number((24 + profile.trendBias * 8).toFixed(1));
  const adxAction: ActionSignal = adxVal > 30 ? 'Buy' : 'Neutral';

  const willR = Number((-100 + stochK).toFixed(1));
  const willAction: ActionSignal = willR > -20 ? 'Sell' : willR > -50 ? 'Buy' : 'Neutral';

  const cci = Number((profile.trendBias * 45).toFixed(1));
  const cciAction: ActionSignal = cci > 100 ? 'Buy' : cci < -100 ? 'Sell' : 'Neutral';

  const bbPower = Number((atrVal * 0.4 * (profile.trendBias > 0 ? 1 : -1)).toFixed(isGold ? 2 : 4));
  const bbAction: ActionSignal = bbPower > 0 ? 'Buy' : 'Sell';

  const uo = Number((48 + profile.trendBias * 6).toFixed(1));
  const uoAction: ActionSignal = uo > 55 ? 'Buy' : uo < 45 ? 'Sell' : 'Neutral';

  const roc = Number((changePct * 0.8).toFixed(3));
  const rocAction: ActionSignal = roc > 0 ? 'Buy' : 'Sell';

  const indicators: IndicatorRow[] = [
    { name: 'RSI(14)', value: rsi, action: rsiAction },
    { name: 'STOCH(9,6)', value: stochK, action: stochAction },
    { name: 'STOCHRSI(14)', value: Number((((rsi - 20) / 60) * 100).toFixed(2)), action: rsiAction },
    { name: 'MACD(12,26)', value: macdVal, action: macdAction },
    { name: 'ADX(14)', value: adxVal, action: adxAction },
    { name: 'Williams %R', value: willR, action: willAction },
    { name: 'CCI(14)', value: cci, action: cciAction },
    { name: 'ATR(14)', value: atrVal, action: 'Less Volatility' },
    { name: 'Highs/Lows(14)', value: Number((atrVal * 0.35).toFixed(decimals)), action: profile.trendBias >= 0 ? 'Buy' : 'Sell' },
    { name: 'Ultimate Oscillator', value: uo, action: uoAction },
    { name: 'ROC', value: roc, action: rocAction },
    { name: 'Bull/Bear Power(13)', value: bbPower, action: bbAction },
  ];

  const periods = [5, 10, 20, 50, 100, 200];
  const movingAverages: MovingAverageRow[] = periods.map((p) => {
    const lagFactor = (p / 200) * profile.volatilityScale * 0.008;
    const trendDrift = (profile.trendBias >= 0 ? -1 : 1) * lagFactor * currentPrice;
    const simple = round(currentPrice + trendDrift);
    const exp = round(currentPrice + trendDrift * 0.85);

    const simpleAction: ActionSignal = currentPrice > simple ? 'Buy' : 'Sell';
    const expAction: ActionSignal = currentPrice > exp ? 'Buy' : 'Sell';

    return {
      name: `MA${p}`,
      simple,
      simpleAction,
      exponential: exp,
      exponentialAction: expAction,
    };
  });

  const high = dayHigh;
  const low = dayLow;
  const close = currentPrice;
  const pp = (high + low + close) / 3;

  const pivotPoints: PivotPointsRow[] = [
    {
      name: 'Classic',
      s3: round(low - 2 * (high - pp)),
      s2: round(pp - (high - low)),
      s1: round(2 * pp - high),
      pivot: round(pp),
      r1: round(2 * pp - low),
      r2: round(pp + (high - low)),
      r3: round(high + 2 * (pp - low)),
    },
    {
      name: 'Fibonacci',
      s3: round(pp - 1.0 * (high - low)),
      s2: round(pp - 0.618 * (high - low)),
      s1: round(pp - 0.382 * (high - low)),
      pivot: round(pp),
      r1: round(pp + 0.382 * (high - low)),
      r2: round(pp + 0.618 * (high - low)),
      r3: round(pp + 1.0 * (high - low)),
    },
    {
      name: 'Camarilla',
      s3: round(close - ((high - low) * 1.1) / 4),
      s2: round(close - ((high - low) * 1.1) / 6),
      s1: round(close - ((high - low) * 1.1) / 12),
      pivot: round(pp),
      r1: round(close + ((high - low) * 1.1) / 12),
      r2: round(close + ((high - low) * 1.1) / 6),
      r3: round(close + ((high - low) * 1.1) / 4),
    },
    {
      name: 'Woodie',
      s3: round(low - 2 * (high - pp)),
      s2: round(pp - (high - low)),
      s1: round(2 * pp - high),
      pivot: round(pp),
      r1: round(2 * pp - low),
      r2: round(pp + (high - low)),
      r3: round(high + 2 * (pp - low)),
    },
    {
      name: 'DeMark',
      s3: '-',
      s2: '-',
      s1: round(pp - (high - low) * 0.5),
      pivot: round(pp),
      r1: round(pp + (high - low) * 0.5),
      r2: '-',
      r3: '-',
    },
  ];

  let indBuy = 0;
  let indSell = 0;
  let indNeutral = 0;
  indicators.forEach((i) => {
    if (i.action === 'Buy' || i.action === 'Strong Buy') indBuy++;
    else if (i.action === 'Sell' || i.action === 'Strong Sell') indSell++;
    else indNeutral++;
  });

  let maBuy = 0;
  let maSell = 0;
  movingAverages.forEach((m) => {
    if (m.simpleAction === 'Buy') maBuy++;
    else if (m.simpleAction === 'Sell') maSell++;
    if (m.exponentialAction === 'Buy') maBuy++;
    else if (m.exponentialAction === 'Sell') maSell++;
  });

  const totalBuy = indBuy + maBuy;
  const totalSell = indSell + maSell;
  const totalNeutral = indNeutral;

  const determineAction = (buy: number, sell: number): ActionSignal => {
    const diff = buy - sell;
    if (diff >= 10) return 'Strong Buy';
    if (diff >= 3) return 'Buy';
    if (diff <= -10) return 'Strong Sell';
    if (diff <= -3) return 'Sell';
    return 'Neutral';
  };

  const summaryAction = determineAction(totalBuy, totalSell);
  const maAction = determineAction(maBuy, maSell);
  const indicatorsAction = determineAction(indBuy, indSell);

  return {
    symbol: isGold ? 'XAU/USD - Gold Spot US Dollar' : `${cleanSymbol} - Spot FX`,
    canonicalSymbol: cleanSymbol,
    brokerSymbol: `${cleanSymbol}m`,
    price: currentPrice,
    change24h: changeValue,
    change24hPct: changePct,
    dayRangeLow: round(dayLow),
    dayRangeHigh: round(dayHigh),
    yearRangeLow: round(nominalPrice * 0.88),
    yearRangeHigh: round(nominalPrice * 1.35),
    timeframe: tf,
    summaryAction,
    summaryBuyCount: totalBuy,
    summarySellCount: totalSell,
    summaryNeutralCount: totalNeutral,
    maAction,
    maBuyCount: maBuy,
    maSellCount: maSell,
    indicatorsAction,
    indicatorsBuyCount: indBuy,
    indicatorsSellCount: indSell,
    indicatorsNeutralCount: indNeutral,
    indicators,
    movingAverages,
    pivotPoints,
    lastUpdated: new Date().toISOString(),
  };
}
