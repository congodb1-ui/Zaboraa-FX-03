import { Candle } from '../../types/forex';
import { aggregateH4Buckets, H4Bar } from '../trendPullbackPro';

export interface TrendContextResult {
  cTrend: number; // +1, -1, 0
  trendDirection: 'BULLISH' | 'BEARISH' | 'FLAT';
  emaFast: number | null;
  emaSlow: number | null;
  h4BarCount: number;
  reason?: string;
}

function calculateEmaSeries(values: number[], length: number): number[] {
  if (values.length < length) return [];
  const k = 2 / (length + 1);
  const ema: number[] = [];

  // Start with SMA of first length
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += values[i];
  }
  let currentEma = sum / length;
  ema.push(currentEma);

  for (let i = length; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }

  return ema;
}

/**
 * Computes H4 trend context from historical H1 candles up to a specific closed bar.
 * Uses EMA 50 and EMA 200 with 3-bar slope confirmation on completed UTC-aligned H4 bars.
 */
export function computeTrendContext(
  allH1Candles: Candle[],
  currentH1Index: number,
  fastLength = 50,
  slowLength = 200
): TrendContextResult {
  if (currentH1Index < 0 || currentH1Index >= allH1Candles.length) {
    return {
      cTrend: 0,
      trendDirection: 'FLAT',
      emaFast: null,
      emaSlow: null,
      h4BarCount: 0,
      reason: 'Invalid candle index',
    };
  }

  // Slice historical H1 candles strictly up to current bar (no lookahead)
  const historicalH1 = allH1Candles.slice(0, currentH1Index + 1);
  const h4Bars: H4Bar[] = aggregateH4Buckets(historicalH1);

  if (h4Bars.length < 25) {
    // Insufficient H4 bars for trend evaluation
    return {
      cTrend: 0,
      trendDirection: 'FLAT',
      emaFast: null,
      emaSlow: null,
      h4BarCount: h4Bars.length,
      reason: `Insufficient H4 bars (${h4Bars.length} < 25)`,
    };
  }

  const h4Closes = h4Bars.map((b) => b.close);

  // If H4 history is shorter than 200 bars, dynamically scale EMA lengths (e.g. 25 & 100)
  const effFast = h4Bars.length >= fastLength ? fastLength : Math.max(10, Math.floor(h4Bars.length / 4));
  const effSlow = h4Bars.length >= slowLength ? slowLength : Math.max(20, Math.floor(h4Bars.length / 2));

  const fastEmaSeries = calculateEmaSeries(h4Closes, effFast);
  const slowEmaSeries = calculateEmaSeries(h4Closes, effSlow);

  if (fastEmaSeries.length < 3 || slowEmaSeries.length < 3) {
    return {
      cTrend: 0,
      trendDirection: 'FLAT',
      emaFast: null,
      emaSlow: null,
      h4BarCount: h4Bars.length,
      reason: 'EMA series insufficient',
    };
  }

  const fastCurrent = fastEmaSeries[fastEmaSeries.length - 1];
  const fastPrev = fastEmaSeries[fastEmaSeries.length - 3];
  const slowCurrent = slowEmaSeries[slowEmaSeries.length - 1];

  const slopeUp = fastCurrent > fastPrev;
  const slopeDown = fastCurrent < fastPrev;

  if (fastCurrent > slowCurrent && slopeUp) {
    return {
      cTrend: 1.0,
      trendDirection: 'BULLISH',
      emaFast: Number(fastCurrent.toFixed(5)),
      emaSlow: Number(slowCurrent.toFixed(5)),
      h4BarCount: h4Bars.length,
    };
  } else if (fastCurrent < slowCurrent && slopeDown) {
    return {
      cTrend: -1.0,
      trendDirection: 'BEARISH',
      emaFast: Number(fastCurrent.toFixed(5)),
      emaSlow: Number(slowCurrent.toFixed(5)),
      h4BarCount: h4Bars.length,
    };
  } else {
    return {
      cTrend: 0,
      trendDirection: 'FLAT',
      emaFast: Number(fastCurrent.toFixed(5)),
      emaSlow: Number(slowCurrent.toFixed(5)),
      h4BarCount: h4Bars.length,
      reason: 'No clear EMA trend alignment or slope neutral',
    };
  }
}
