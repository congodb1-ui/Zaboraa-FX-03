/** D34 (dot symbols) and D32 (broker time to UTC on bulk download). */
import { describe, it, expect } from 'vitest';
import { parseSymbol, runBulkSave, type DataDeps } from '../dataApi';
import type { Candle } from '../candleQuality';

describe('parseSymbol (D34)', () => {
  it.each(['.', '..', '...', '.hidden', '..x', 'a..b', '../etc', 'EUR/USD', '', 'x'.repeat(25)])('rejects %j', (v) => {
    expect(parseSymbol(v)).toBeNull();
  });
  it.each(['EURUSD', 'EURUSDm', 'XAUUSD', 'BRK.B', 'EUR_USD', 'US-30'])('accepts %j', (v) => {
    expect(parseSymbol(v)).toBe(v);
  });
  it('rejects non-strings', () => {
    expect(parseSymbol(undefined)).toBeNull();
    expect(parseSymbol(5)).toBeNull();
  });
});

function memDeps() {
  const saved: Candle[][] = [];
  const audits: string[] = [];
  const deps: DataDeps = {
    loadCandles: async () => [],
    saveCandles: async (_s, _t, c) => { saved.push(c); },
    getCatalog: () => [],
    audit: (e) => { audits.push(e.details); },
  };
  return { deps, saved, audits };
}
const raw = (times: number[]) =>
  times.map((t, i) => ({ time: t, open: 1 + i / 100, high: 2 + i / 100, low: 0.5, close: 1.5, tick_volume: 10, spread: 2 }));

describe('runBulkSave broker time (D32)', () => {
  const t0 = 1_700_000_000;
  it('shifts broker-basis candles to UTC', async () => {
    const { deps, saved, audits } = memDeps();
    await runBulkSave('EURUSD', 'H1', raw([t0 + 3 * 3600, t0 + 4 * 3600]), deps, { timeBasis: 'broker', utcOffsetHours: 3 });
    expect(saved[0]!.map((c) => c.time)).toEqual([t0, t0 + 3600]);
    expect(audits[0]).toContain('utcOffsetHours=3');
  });
  it('refuses to store when the bridge could not measure the offset', async () => {
    const { deps, saved } = memDeps();
    await expect(runBulkSave('EURUSD', 'H1', raw([t0]), deps, { timeBasis: 'broker', utcOffsetHours: null })).rejects.toThrow('BRIDGE_UTC_OFFSET_UNKNOWN');
    expect(saved).toHaveLength(0);
  });
  it('leaves times alone when no time basis is given (legacy callers)', async () => {
    const { deps, saved } = memDeps();
    await runBulkSave('EURUSD', 'H1', raw([t0, t0 + 3600]), deps);
    expect(saved[0]!.map((c) => c.time)).toEqual([t0, t0 + 3600]);
  });
  it('a zero offset is a valid measured offset', async () => {
    const { deps, saved } = memDeps();
    await runBulkSave('EURUSD', 'H1', raw([t0]), deps, { timeBasis: 'broker', utcOffsetHours: 0 });
    expect(saved[0]![0]!.time).toBe(t0);
  });
});
