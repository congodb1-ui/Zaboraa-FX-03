/**
 * Candle quality audit (FR-H5). Pure functions: no database, no bridge.
 * All times are UTC epoch SECONDS (FR-H9). If your stored candles use
 * milliseconds, divide by 1000 before calling.
 */

export type Timeframe = 'M1' | 'M5' | 'M10' | 'M15' | 'M30' | 'H1' | 'H3' | 'D1';

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

export function isTimeframe(v: string): v is Timeframe {
  return Object.prototype.hasOwnProperty.call(TIMEFRAME_SECONDS, v);
}

export interface Candle {
  time: number; // UTC epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  spread?: number;
}

export interface MarketHours {
  /** Friday close, UTC hour (default 22). */
  fridayCloseUtcHour: number;
  /** Sunday open, UTC hour (default 22). */
  sundayOpenUtcHour: number;
  /** Extra closed ranges [startSec, endSec) such as holidays. */
  closedRanges?: Array<[number, number]>;
}

export const DEFAULT_MARKET_HOURS: MarketHours = {
  fridayCloseUtcHour: 22,
  sundayOpenUtcHour: 22,
};

export function isMarketClosed(tsSec: number, hours: MarketHours = DEFAULT_MARKET_HOURS): boolean {
  const d = new Date(tsSec * 1000);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const h = d.getUTCHours();
  if (dow === 6) return true;
  if (dow === 5 && h >= hours.fridayCloseUtcHour) return true;
  if (dow === 0 && h < hours.sundayOpenUtcHour) return true;
  if (hours.closedRanges) {
    for (const [s, e] of hours.closedRanges) {
      if (tsSec >= s && tsSec < e) return true;
    }
  }
  return false;
}

export type IssueType = 'NON_FINITE' | 'OHLC_INVALID' | 'DUPLICATE_TIMESTAMP' | 'OUT_OF_ORDER' | 'GAP';

export interface AuditIssue {
  type: IssueType;
  index: number;
  time: number;
  detail: string;
  missingBars?: number;
}

export interface AuditResult {
  total: number;
  issues: AuditIssue[];
  counts: {
    nonFinite: number;
    ohlcInvalid: number;
    duplicates: number;
    outOfOrder: number;
    gaps: number;
    missingBars: number;
  };
  /** Gaps fully explained by weekend or holiday closure (not errors). */
  expectedClosedGaps: number;
  /** 0 to 100. */
  qualityScore: number;
}

const MAX_GAP_STEPS = 200000;

function countMissingBars(prevT: number, t: number, tf: number, hours: MarketHours): number {
  let missing = 0;
  let steps = 0;
  for (let x = prevT + tf; x < t; x += tf) {
    if (++steps > MAX_GAP_STEPS) {
      // Very large gap: count the rest by arithmetic (ignores closures; flagged as a gap anyway).
      missing += Math.floor((t - x) / tf);
      break;
    }
    if (!isMarketClosed(x, hours)) missing++;
  }
  return missing;
}

export function auditCandles(
  candles: Candle[],
  timeframe: Timeframe,
  hours: MarketHours = DEFAULT_MARKET_HOURS,
): AuditResult {
  const tf = TIMEFRAME_SECONDS[timeframe];
  const issues: AuditIssue[] = [];
  const counts = { nonFinite: 0, ohlcInvalid: 0, duplicates: 0, outOfOrder: 0, gaps: 0, missingBars: 0 };
  let expectedClosedGaps = 0;
  let prevT: number | null = null;

  candles.forEach((c, i) => {
    const vals = [c.time, c.open, c.high, c.low, c.close];
    if (!vals.every((v) => Number.isFinite(v))) {
      counts.nonFinite++;
      issues.push({ type: 'NON_FINITE', index: i, time: c.time, detail: 'time or price is not a finite number' });
      return;
    }

    if (c.high < c.low) {
      counts.ohlcInvalid++;
      issues.push({ type: 'OHLC_INVALID', index: i, time: c.time, detail: `high ${c.high} is below low ${c.low}` });
    } else if (c.high < Math.max(c.open, c.close)) {
      counts.ohlcInvalid++;
      issues.push({ type: 'OHLC_INVALID', index: i, time: c.time, detail: 'high is below open or close' });
    } else if (c.low > Math.min(c.open, c.close)) {
      counts.ohlcInvalid++;
      issues.push({ type: 'OHLC_INVALID', index: i, time: c.time, detail: 'low is above open or close' });
    }

    if (prevT !== null) {
      const dt = c.time - prevT;
      if (dt === 0) {
        counts.duplicates++;
        issues.push({ type: 'DUPLICATE_TIMESTAMP', index: i, time: c.time, detail: 'same timestamp as previous bar' });
        return;
      }
      if (dt < 0) {
        counts.outOfOrder++;
        issues.push({ type: 'OUT_OF_ORDER', index: i, time: c.time, detail: 'timestamp earlier than previous bar' });
        return;
      }
      if (dt > tf) {
        const missing = countMissingBars(prevT, c.time, tf, hours);
        if (missing > 0) {
          counts.gaps++;
          counts.missingBars += missing;
          issues.push({
            type: 'GAP',
            index: i,
            time: c.time,
            detail: `${missing} missing bar(s) before this bar`,
            missingBars: missing,
          });
        } else {
          expectedClosedGaps++;
        }
      }
    }
    prevT = c.time;
  });

  const total = candles.length;
  const bad = counts.nonFinite + counts.ohlcInvalid + counts.duplicates + counts.outOfOrder;
  const denom = total + counts.missingBars;
  const raw = total === 0 ? 0 : 100 * (1 - (bad + counts.missingBars) / denom);
  const qualityScore = Math.max(0, Math.min(100, Math.round(raw * 10) / 10));

  return { total, issues, counts, expectedClosedGaps, qualityScore };
}

export interface FixLogEntry {
  action: 'SORTED' | 'DROPPED_DUPLICATE';
  time?: number;
  detail: string;
}

/**
 * Autofix (FR-H5). Only fixes ordering and exact duplicate timestamps (keeps the first).
 * It never alters prices; OHLC errors and gaps are reported, not invented away.
 * The caller MUST write the returned log to audit_log. Never silent.
 */
export function fixCandles(candles: Candle[]): { candles: Candle[]; log: FixLogEntry[] } {
  const log: FixLogEntry[] = [];
  const indexed = candles.map((c, i) => ({ c, i }));
  let sorted = false;
  for (let k = 1; k < indexed.length; k++) {
    if (indexed[k]!.c.time < indexed[k - 1]!.c.time) {
      sorted = true;
      break;
    }
  }
  if (sorted) {
    indexed.sort((a, b) => a.c.time - b.c.time || a.i - b.i);
    log.push({ action: 'SORTED', detail: 'candles re-ordered by time ascending' });
  }
  const out: Candle[] = [];
  let last: number | null = null;
  for (const { c } of indexed) {
    if (last !== null && c.time === last) {
      log.push({ action: 'DROPPED_DUPLICATE', time: c.time, detail: 'kept first bar with this timestamp' });
      continue;
    }
    out.push(c);
    last = c.time;
  }
  return { candles: out, log };
}
