import { Candle } from '../../types/forex';
import { TICK_VOLUME_LABEL } from './cotConfig';

export type ActivityEventType = 'DISPLACEMENT_UP' | 'DISPLACEMENT_DOWN' | 'ABSORPTION' | 'NONE';

export interface ActivityEventResult {
  cAct: number; // +1, -1, +0.5, -0.5, 0
  eventType: ActivityEventType;
  volZ: number;
  rangeInAtr: number;
  closeLoc: number;
  baselineFallback: boolean;
  atr14: number;
  skipped: boolean;
  skipReason?: string;
  label: string;
}

/**
 * Calculates Wilder ATR(14) over an array of closed candles up to a specific index.
 */
export function calculateWilderAtr14(candles: Candle[], barIndex: number, period = 14): number | null {
  if (barIndex < period) return null;

  const trs: number[] = [];
  for (let i = 1; i <= barIndex; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }

  if (trs.length < period) return null;

  // Initial SMA
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trs[i];
  }
  atr /= period;

  // Wilder smoothing
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return Number.isFinite(atr) ? atr : null;
}

/**
 * Evaluates activity events on a closed H1 bar.
 * Never reads forming or future bars.
 */
export function detectActivityEvent(
  closedCandles: Candle[],
  barIndex: number,
  config = {
    displacementVolZ: 2.0,
    displacementRangeAtr: 1.5,
    displacementCloseLocUp: 0.75,
    displacementCloseLocDown: 0.25,
    absorptionVolZ: 2.0,
    absorptionRangeAtr: 0.8,
    absorptionPriorMoveAtr: 1.5,
  }
): ActivityEventResult {
  if (barIndex < 20 || barIndex >= closedCandles.length) {
    return {
      cAct: 0,
      eventType: 'NONE',
      volZ: 0,
      rangeInAtr: 0,
      closeLoc: 0.5,
      baselineFallback: false,
      atr14: 0,
      skipped: true,
      skipReason: 'Insufficient bar history for warmup',
      label: TICK_VOLUME_LABEL,
    };
  }

  const bar = closedCandles[barIndex];
  const prevBar = closedCandles[barIndex - 1];

  // Skip bars after weekend or long market gaps (> 4 hours)
  const diffTime = bar.time - prevBar.time;
  if (diffTime > 14400) {
    return {
      cAct: 0,
      eventType: 'NONE',
      volZ: 0,
      rangeInAtr: 0,
      closeLoc: 0.5,
      baselineFallback: false,
      atr14: 0,
      skipped: true,
      skipReason: 'First H1 bar following weekend or session gap',
      label: TICK_VOLUME_LABEL,
    };
  }

  const range = bar.high - bar.low;
  if (range <= 0) {
    return {
      cAct: 0,
      eventType: 'NONE',
      volZ: 0,
      rangeInAtr: 0,
      closeLoc: 0.5,
      baselineFallback: false,
      atr14: 0,
      skipped: true,
      skipReason: 'Zero range candle',
      label: TICK_VOLUME_LABEL,
    };
  }

  const closeLoc = (bar.close - bar.low) / range;
  const atr14 = calculateWilderAtr14(closedCandles, barIndex, 14);

  if (!atr14 || atr14 <= 0) {
    return {
      cAct: 0,
      eventType: 'NONE',
      volZ: 0,
      rangeInAtr: 0,
      closeLoc,
      baselineFallback: false,
      atr14: 0,
      skipped: true,
      skipReason: 'ATR14 unavailable',
      label: TICK_VOLUME_LABEL,
    };
  }

  const rangeInAtr = range / atr14;

  // Calculate volume z-score against same UTC hour over previous 20 trading days
  const targetHour = new Date(bar.time * 1000).getUTCHours();
  const sameHourVolumes: number[] = [];

  for (let i = barIndex - 1; i >= 0 && sameHourVolumes.length < 20; i--) {
    const c = closedCandles[i];
    if (new Date(c.time * 1000).getUTCHours() === targetHour) {
      sameHourVolumes.push(c.tickVolume);
    }
  }

  let baselineFallback = false;
  let sampleVolumes = sameHourVolumes;

  if (sameHourVolumes.length < 10) {
    // Fallback to rolling 50 closed bars
    baselineFallback = true;
    sampleVolumes = [];
    const start = Math.max(0, barIndex - 50);
    for (let i = barIndex - 1; i >= start; i--) {
      sampleVolumes.push(closedCandles[i].tickVolume);
    }
  }

  let volZ = 0;
  if (sampleVolumes.length >= 5) {
    const mean = sampleVolumes.reduce((acc, v) => acc + v, 0) / sampleVolumes.length;
    const variance = sampleVolumes.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sampleVolumes.length;
    const std = Math.sqrt(variance);
    const effStd = std > 0.001 ? std : Math.max(1, mean * 0.1);
    volZ = (bar.tickVolume - mean) / effStd;
  }

  // Detect Events
  let eventType: ActivityEventType = 'NONE';
  let cAct = 0;

  // 1. Displacement Up
  if (
    volZ >= config.displacementVolZ &&
    rangeInAtr >= config.displacementRangeAtr &&
    closeLoc >= config.displacementCloseLocUp &&
    bar.close > bar.open
  ) {
    eventType = 'DISPLACEMENT_UP';
    cAct = 1.0;
  }
  // 2. Displacement Down
  else if (
    volZ >= config.displacementVolZ &&
    rangeInAtr >= config.displacementRangeAtr &&
    closeLoc <= config.displacementCloseLocDown &&
    bar.close < bar.open
  ) {
    eventType = 'DISPLACEMENT_DOWN';
    cAct = -1.0;
  }
  // 3. Absorption (High volume, narrow range after prior move)
  else if (volZ >= config.absorptionVolZ && rangeInAtr <= config.absorptionRangeAtr && barIndex >= 4) {
    const b3 = closedCandles[barIndex - 3];
    const priorMove = closedCandles[barIndex - 1].close - b3.open;

    if (Math.abs(priorMove) >= config.absorptionPriorMoveAtr * atr14) {
      eventType = 'ABSORPTION';
      // Opposite sign of prior move, magnitude 0.5
      cAct = priorMove > 0 ? -0.5 : 0.5;
    }
  }

  return {
    cAct,
    eventType,
    volZ: Number(volZ.toFixed(2)),
    rangeInAtr: Number(rangeInAtr.toFixed(2)),
    closeLoc: Number(closeLoc.toFixed(3)),
    baselineFallback,
    atr14: Number(atr14.toFixed(5)),
    skipped: false,
    label: TICK_VOLUME_LABEL,
  };
}
