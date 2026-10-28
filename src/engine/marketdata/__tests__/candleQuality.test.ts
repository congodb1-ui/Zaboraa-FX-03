import { describe, it, expect } from 'vitest';
import {
  auditCandles,
  fixCandles,
  isMarketClosed,
  isTimeframe,
  TIMEFRAME_SECONDS,
  type Candle,
  type Timeframe,
} from '../candleQuality';

const t = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const bar = (time: number, o = 1.1, h = 1.2, l = 1.0, c = 1.15): Candle => ({ time, open: o, high: h, low: l, close: c });
// 2026-10-20 is a Tuesday; 2026-10-23 a Friday; 2026-10-25 a Sunday.
const series = (start: number, step: number, n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => bar(start + i * step));

describe('timeframes', () => {
  it('maps all 8 timeframes to the right seconds', () => {
    const expected: Record<Timeframe, number> = {
      M1: 60, M5: 300, M10: 600, M15: 900, M30: 1800, H1: 3600, H3: 10800, D1: 86400,
    };
    expect(TIMEFRAME_SECONDS).toEqual(expected);
  });
  it('rejects unsupported timeframes', () => {
    expect(isTimeframe('M10')).toBe(true);
    expect(isTimeframe('H3')).toBe(true);
    expect(isTimeframe('M2')).toBe(false);
    expect(isTimeframe('H4')).toBe(false);
    expect(isTimeframe('toString')).toBe(false);
  });
});

describe('market hours', () => {
  it('Friday 21:00 open, Friday 22:00 closed, Saturday closed, Sunday 21:00 closed, Sunday 22:00 open', () => {
    expect(isMarketClosed(t(2026, 10, 23, 21))).toBe(false);
    expect(isMarketClosed(t(2026, 10, 23, 22))).toBe(true);
    expect(isMarketClosed(t(2026, 10, 24, 12))).toBe(true);
    expect(isMarketClosed(t(2026, 10, 25, 21))).toBe(true);
    expect(isMarketClosed(t(2026, 10, 25, 22))).toBe(false);
  });
});

describe('auditCandles', () => {
  it('clean series scores 100 with no issues', () => {
    const r = auditCandles(series(t(2026, 10, 20, 10), 3600, 10), 'H1');
    expect(r.issues).toHaveLength(0);
    expect(r.qualityScore).toBe(100);
  });

  it('flags high below low', () => {
    const c = series(t(2026, 10, 20, 10), 3600, 10);
    c[4] = bar(c[4]!.time, 1.1, 1.0, 1.2, 1.1);
    const r = auditCandles(c, 'H1');
    expect(r.counts.ohlcInvalid).toBe(1);
    expect(r.issues[0]).toMatchObject({ type: 'OHLC_INVALID', index: 4 });
    expect(r.qualityScore).toBe(90); // 100 * (1 - 1/10)
  });

  it('flags high below close and low above open', () => {
    const c = series(t(2026, 10, 20, 10), 3600, 3);
    c[1] = bar(c[1]!.time, 1.1, 1.12, 1.0, 1.15); // high 1.12 < close 1.15
    c[2] = bar(c[2]!.time, 1.1, 1.2, 1.105, 1.15); // low 1.105 > open 1.1
    expect(auditCandles(c, 'H1').counts.ohlcInvalid).toBe(2);
  });

  it('a valid bar is not flagged', () => {
    expect(auditCandles([bar(t(2026, 10, 20, 10))], 'H1').counts.ohlcInvalid).toBe(0);
  });

  it('flags non-finite prices', () => {
    const c = series(t(2026, 10, 20, 10), 3600, 3);
    c[1] = bar(c[1]!.time, NaN);
    expect(auditCandles(c, 'H1').counts.nonFinite).toBe(1);
  });

  it('flags duplicate timestamps and does not call them gaps', () => {
    const c = series(t(2026, 10, 20, 10), 3600, 3);
    c.splice(2, 0, bar(c[1]!.time));
    const r = auditCandles(c, 'H1');
    expect(r.counts.duplicates).toBe(1);
    expect(r.counts.gaps).toBe(0);
  });

  it('flags out-of-order bars', () => {
    const c = [bar(t(2026, 10, 20, 11)), bar(t(2026, 10, 20, 10))];
    expect(auditCandles(c, 'H1').counts.outOfOrder).toBe(1);
  });

  it('midweek gap counts the missing bars and lowers the score', () => {
    const c = [bar(t(2026, 10, 20, 10)), bar(t(2026, 10, 20, 11)), bar(t(2026, 10, 20, 14))];
    const r = auditCandles(c, 'H1');
    expect(r.counts.gaps).toBe(1);
    expect(r.counts.missingBars).toBe(2);
    expect(r.issues[0]!.missingBars).toBe(2);
    expect(r.qualityScore).toBe(60); // 100 * (1 - 2/5)
  });

  it('weekend is NOT a false gap (H1: Fri 21:00 to Sun 22:00)', () => {
    const c = [bar(t(2026, 10, 23, 21)), bar(t(2026, 10, 25, 22))];
    const r = auditCandles(c, 'H1');
    expect(r.counts.gaps).toBe(0);
    expect(r.expectedClosedGaps).toBe(1);
    expect(r.qualityScore).toBe(100);
  });

  it('weekend gap with real missing bars before the close IS flagged', () => {
    const c = [bar(t(2026, 10, 23, 19)), bar(t(2026, 10, 25, 22))];
    const r = auditCandles(c, 'H1');
    expect(r.counts.missingBars).toBe(2); // Fri 20:00 and 21:00 are open hours
  });

  it('D1 weekend is not a gap (bars open 22:00 UTC)', () => {
    const c = [bar(t(2026, 10, 22, 22)), bar(t(2026, 10, 25, 22))];
    expect(auditCandles(c, 'D1').counts.gaps).toBe(0);
  });

  it('M10 and H3 steps are respected', () => {
    expect(auditCandles([bar(t(2026, 10, 20, 10, 0)), bar(t(2026, 10, 20, 10, 20))], 'M10').counts.missingBars).toBe(1);
    expect(auditCandles([bar(t(2026, 10, 20, 0)), bar(t(2026, 10, 20, 9))], 'H3').counts.missingBars).toBe(2);
  });

  it('a holiday range suppresses a gap; without it the gap is flagged', () => {
    const c = [bar(t(2026, 10, 20, 10)), bar(t(2026, 10, 20, 14))];
    expect(auditCandles(c, 'H1').counts.missingBars).toBe(3);
    const hours = { fridayCloseUtcHour: 22, sundayOpenUtcHour: 22, closedRanges: [[t(2026, 10, 20, 11), t(2026, 10, 20, 14)] as [number, number]] };
    expect(auditCandles(c, 'H1', hours).counts.missingBars).toBe(0);
  });

  it('empty input scores 0 and does not throw', () => {
    const r = auditCandles([], 'H1');
    expect(r.total).toBe(0);
    expect(r.qualityScore).toBe(0);
  });
});

describe('fixCandles', () => {
  it('drops duplicates (keeps first), sorts, and logs every change', () => {
    const a = bar(t(2026, 10, 20, 11), 1.5, 1.6, 1.4, 1.5);
    const dup = bar(t(2026, 10, 20, 11), 9, 9, 9, 9);
    const b = bar(t(2026, 10, 20, 10));
    const r = fixCandles([a, dup, b]);
    expect(r.candles.map((c) => c.time)).toEqual([b.time, a.time]);
    expect(r.candles[1]!.open).toBe(1.5);
    expect(r.log.map((l) => l.action)).toEqual(['SORTED', 'DROPPED_DUPLICATE']);
  });
  it('does nothing and logs nothing on clean data', () => {
    const c = series(t(2026, 10, 20, 10), 3600, 3);
    const r = fixCandles(c);
    expect(r.candles).toEqual(c);
    expect(r.log).toHaveLength(0);
  });
  it('never changes prices of an invalid bar', () => {
    const bad = bar(t(2026, 10, 20, 10), 1.1, 1.0, 1.2, 1.1);
    expect(fixCandles([bad]).candles[0]).toEqual(bad);
  });
});
