import { describe, it, expect } from 'vitest';
import { exportCandlesCsv, importCandlesCsv, parseTime, formatUtc } from '../candleCsv';
import type { Candle } from '../candleQuality';

const t = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) / 1000;

describe('exportCandlesCsv', () => {
  it('writes the exact header and an ISO UTC row', () => {
    const c: Candle = { time: t(2026, 10, 20, 10), open: 1.1, high: 1.2, low: 1.0, close: 1.15, tickVolume: 100, spread: 12 };
    expect(exportCandlesCsv([c])).toBe(
      'time,open,high,low,close,tickVolume,spread\n2026-10-20T10:00:00Z,1.1,1.2,1,1.15,100,12\n',
    );
  });
  it('leaves missing volume and spread empty rather than inventing zeros', () => {
    const c: Candle = { time: t(2026, 10, 20, 10), open: 1, high: 2, low: 1, close: 2 };
    expect(exportCandlesCsv([c]).split('\n')[1]).toBe('2026-10-20T10:00:00Z,1,2,1,2,,');
  });
  it('empty input gives the header only', () => {
    expect(exportCandlesCsv([])).toBe('time,open,high,low,close,tickVolume,spread\n');
  });
  it('formatUtc is zero padded', () => {
    expect(formatUtc(t(2026, 1, 2, 3, 4, 5))).toBe('2026-01-02T03:04:05Z');
  });
});

describe('parseTime', () => {
  it('applies the broker offset to text times', () => {
    expect(parseTime('2026.10.20 10:00', 3)).toBe(t(2026, 10, 20, 7));
    expect(parseTime('2026-10-20 10:00:00', 0)).toBe(t(2026, 10, 20, 10));
    expect(parseTime('2026-10-20', 2)).toBe(t(2026, 10, 19, 22));
  });
  it('uses the zone in the text and ignores the offset option', () => {
    expect(parseTime('2026-10-20T10:00:00Z', 3)).toBe(t(2026, 10, 20, 10));
    expect(parseTime('2026-10-20T10:00:00+02:00', 5)).toBe(t(2026, 10, 20, 8));
  });
  it('does not shift epoch values; milliseconds are converted', () => {
    expect(parseTime('1760954400', 3)).toBe(1760954400);
    expect(parseTime('1760954400000', 3)).toBe(1760954400);
  });
  it('rejects nonsense', () => {
    expect(parseTime('hello', 0)).toBeNull();
    expect(parseTime('2026-13-01 10:00', 0)).toBeNull();
    expect(parseTime('2026-10-20 25:00', 0)).toBeNull();
  });
});

describe('importCandlesCsv', () => {
  it('round-trips an export', () => {
    const src: Candle[] = [
      { time: t(2026, 10, 20, 10), open: 1.1, high: 1.2, low: 1, close: 1.15, tickVolume: 100, spread: 12 },
      { time: t(2026, 10, 20, 11), open: 1.15, high: 1.3, low: 1.1, close: 1.2, tickVolume: 90, spread: 11 },
    ];
    const r = importCandlesCsv(exportCandlesCsv(src));
    expect(r.errors).toHaveLength(0);
    expect(r.candles).toEqual(src);
  });

  it('handles MT5-style semicolon file with separate date/time and decimal commas', () => {
    const csv =
      '<DATE>;<TIME>;<OPEN>;<HIGH>;<LOW>;<CLOSE>;<TICKVOL>;<VOL>;<SPREAD>\r\n' +
      '2026.10.20;10:00:00;1,1;1,2;1,0;1,15;100;0;12\r\n';
    const r = importCandlesCsv(csv, { utcOffsetHours: 3 });
    expect(r.delimiter).toBe(';');
    expect(r.errors).toHaveLength(0);
    expect(r.candles[0]).toEqual({
      time: t(2026, 10, 20, 7), open: 1.1, high: 1.2, low: 1, close: 1.15, tickVolume: 100, spread: 12,
    });
  });

  it('uses an explicit mapping by name and by index', () => {
    const csv = 'Stamp,O,H,L,C\n2026-10-20 10:00,1,2,0.5,1.5\n';
    const r = importCandlesCsv(csv, { mapping: { time: 'Stamp', open: 'O', high: 2, low: 3, close: 'C' } });
    expect(r.errors).toHaveLength(0);
    expect(r.candles[0]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 1.5 });
  });

  it('keeps good rows, reports bad rows with line numbers', () => {
    const csv = 'time,open,high,low,close\n2026-10-20 10:00,1,2,1,2\n2026-10-20 11:00,1,2,1,abc\nnot-a-time,1,2,1,2\n2026-10-20 12:00,1,2,1,2\n';
    const r = importCandlesCsv(csv);
    expect(r.candles).toHaveLength(2);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it('missing required column imports nothing and says which', () => {
    const r = importCandlesCsv('time,open,high,low\n2026-10-20 10:00,1,2,1\n');
    expect(r.candles).toHaveLength(0);
    expect(r.errors[0]!.message).toContain('close');
  });

  it('a mapping to a column that does not exist is an error', () => {
    const r = importCandlesCsv('time,open,high,low,close\n', { mapping: { close: 'Last' } });
    expect(r.candles).toHaveLength(0);
    expect(r.errors[0]!.message).toContain('close');
  });

  it('handles BOM, quoted fields and blank lines', () => {
    const csv = '\uFEFF"time","open","high","low","close"\n\n"2026-10-20 10:00","1","2","1","2"\n';
    const r = importCandlesCsv(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.candles).toHaveLength(1);
  });

  it('empty file is an error, not a crash', () => {
    expect(importCandlesCsv('').errors).toHaveLength(1);
  });

  it('does not judge OHLC logic: that is the audit job', () => {
    const r = importCandlesCsv('time,open,high,low,close\n2026-10-20 10:00,1,0.5,2,1\n');
    expect(r.candles).toHaveLength(1);
  });
});
