import { Candle, Timeframe } from '../../types/forex';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 300,
  M10: 600,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H3: 10800,
  D1: 86400,
};

export const VALID_TIMEFRAMES = new Set<Timeframe>([
  'M1',
  'M5',
  'M10',
  'M15',
  'M30',
  'H1',
  'H3',
  'D1',
]);

export function isTimeframe(val: string): val is Timeframe {
  return VALID_TIMEFRAMES.has(val as Timeframe);
}

export interface CandleAuditOptions {
  fridayCloseUtcHour?: number;
  sundayOpenUtcHour?: number;
  closedRanges?: { start: number; end: number }[];
}

export interface CandleAuditReport {
  qualityScore: number;
  isResearchEligible: boolean;
  anomalies: string[];
  gapCount: number;
  startTime?: string;
  endTime?: string;
  totalCandles: number;
  corruptCount: number;
  duplicateCount: number;
}

/**
 * Checks whether a gap in timestamps falls entirely over a standard weekend market closure.
 */
function isWeekendGap(t1: number, t2: number, fridayHour = 22, sundayHour = 22): boolean {
  const d1 = new Date(t1 * 1000);
  const d2 = new Date(t2 * 1000);
  const day1 = d1.getUTCDay(); // 5 = Friday
  const day2 = d2.getUTCDay(); // 0 = Sunday, 1 = Monday

  if (day1 === 5 && d1.getUTCHours() >= fridayHour - 1) {
    if (day2 === 0 && d2.getUTCHours() <= sundayHour + 2) return true;
    if (day2 === 1 && d2.getUTCHours() <= 2) return true;
  }
  return false;
}

/**
 * Audits a sequence of OHLCV candles for geometric anomalies, duplicates, negative prices, and gaps.
 */
export function auditCandles(
  candles: Candle[],
  timeframe: Timeframe | string,
  options: CandleAuditOptions = {}
): CandleAuditReport {
  if (!candles || candles.length === 0) {
    return {
      qualityScore: 0,
      isResearchEligible: false,
      anomalies: ['Dataset is empty'],
      gapCount: 0,
      totalCandles: 0,
      corruptCount: 0,
      duplicateCount: 0,
    };
  }

  const anomalies: string[] = [];
  const seenTimestamps = new Set<number>();
  let corruptCount = 0;
  let duplicateCount = 0;
  let gapCount = 0;

  const tfSeconds = isTimeframe(timeframe) ? TIMEFRAME_SECONDS[timeframe] : 3600;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // 1. Check for negative or non-finite prices
    if (
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.open <= 0 ||
      c.high <= 0 ||
      c.low <= 0 ||
      c.close <= 0
    ) {
      corruptCount++;
      anomalies.push(`Candle at index ${i} (t=${c.time}) has invalid or negative price values`);
    }

    // 2. Check geometric integrity: High must be >= Low, and High >= max(Open, Close), Low <= min(Open, Close)
    if (c.high < c.low) {
      corruptCount++;
      anomalies.push(`Candle at index ${i} (t=${c.time}) has High (${c.high}) < Low (${c.low})`);
    } else if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close)) {
      corruptCount++;
      anomalies.push(`Candle at index ${i} (t=${c.time}) has open/close outside high/low range`);
    }

    // 3. Check for duplicate timestamps
    if (seenTimestamps.has(c.time)) {
      duplicateCount++;
      anomalies.push(`Duplicate timestamp detected at t=${c.time} (index ${i})`);
    } else {
      seenTimestamps.add(c.time);
    }

    // 4. Check for gap between consecutive bars (if i > 0)
    if (i > 0) {
      const prev = candles[i - 1];
      const delta = c.time - prev.time;
      if (delta > tfSeconds * 1.5) {
        const isWeekend = isWeekendGap(
          prev.time,
          c.time,
          options.fridayCloseUtcHour,
          options.sundayOpenUtcHour
        );
        if (!isWeekend) {
          gapCount++;
        }
      }
    }
  }

  const startTime = new Date(candles[0].time * 1000).toISOString();
  const endTime = new Date(candles[candles.length - 1].time * 1000).toISOString();

  // Score calculation
  let score = 100;
  if (corruptCount > 0) score -= Math.min(60, corruptCount * 20);
  if (duplicateCount > 0) score -= Math.min(30, duplicateCount * 15);
  if (gapCount > 0) score -= Math.min(30, gapCount * 5);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Research eligibility requires clean geometry, no duplicates, and min size
  const isResearchEligible =
    corruptCount === 0 &&
    duplicateCount === 0 &&
    candles.length >= 50 &&
    score >= 80;

  return {
    qualityScore: score,
    isResearchEligible,
    anomalies,
    gapCount,
    startTime,
    endTime,
    totalCandles: candles.length,
    corruptCount,
    duplicateCount,
  };
}

/**
 * Non-destructively repairs common candle issues (removes duplicates, fixes high/low geometry, sorts).
 */
export function fixCandles(candles: Candle[]): { candles: Candle[]; log: string[] } {
  const log: string[] = [];
  const map = new Map<number, Candle>();

  // Filter and deduplicate
  for (const c of candles) {
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      log.push(`Removed candle with non-positive prices at t=${c.time}`);
      continue;
    }

    const high = Math.max(c.high, c.low, c.open, c.close);
    const low = Math.min(c.high, c.low, c.open, c.close);
    let modified = false;

    if (high !== c.high || low !== c.low) {
      modified = true;
    }

    const normalized: Candle = {
      time: Math.floor(c.time),
      open: c.open,
      high,
      low,
      close: c.close,
      tickVolume: Math.max(0, c.tickVolume || 0),
      spread: c.spread,
    };

    if (map.has(normalized.time)) {
      log.push(`Overwrote duplicate bar at timestamp ${normalized.time}`);
    } else if (modified) {
      log.push(`Normalized geometry bounds for bar at t=${normalized.time}`);
    }

    map.set(normalized.time, normalized);
  }

  const fixed = Array.from(map.values()).sort((a, b) => a.time - b.time);
  log.push(`Autofix completed. Returned ${fixed.length} clean candles.`);

  return {
    candles: fixed,
    log,
  };
}
