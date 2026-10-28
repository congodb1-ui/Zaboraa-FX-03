import { describe, it, expect } from 'vitest';
import {
  parseSymbol,
  parseTimeframe,
  parseMarketHours,
  normaliseBridgeCandles,
  looksSynthetic,
  mergeCandles,
  summariseCatalog,
  runCheck,
  runLoad,
  runAudit,
  runExport,
  runImport,
  runAutofix,
  runBulkSave,
  type CatalogRow,
  type CsvResult,
  type DataDeps,
} from '../dataApi';
import type { Candle } from '../candleQuality';

const t = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const bar = (time: number, o = 1.1, h = 1.2, l = 1.0, c = 1.15): Candle => ({ time, open: o, high: h, low: l, close: c, tickVolume: 10, spread: 2 });

function makeDeps(initial: Candle[] = [], catalog: CatalogRow[] = []) {
  const state = { candles: [...initial], saves: 0, audits: [] as Array<{ action: string; entity: string; details: string }>, loadArgs: [] as string[] };
  const deps: DataDeps = {
    async loadCandles(s, tf) {
      state.loadArgs.push(`${s}/${tf}`);
      return [...state.candles];
    },
    async saveCandles(_s, _tf, c) {
      state.candles = [...c];
      state.saves++;
    },
    getCatalog: () => catalog,
    audit: (e) => void state.audits.push(e),
  };
  return { deps, state };
}

describe('input validation', () => {
  it('accepts normal symbols', () => {
    expect(parseSymbol('XAUUSDm')).toBe('XAUUSDm');
    expect(parseSymbol('EURUSD.pro')).toBe('EURUSD.pro');
  });
  it('rejects path traversal, separators, empty, long, non-string', () => {
    for (const bad of ['..', '.', '../etc', 'a/b', 'a\\b', 'A..B', '', 'x'.repeat(25), 'EUR USD', 'EUR;DROP']) {
      expect(parseSymbol(bad)).toBeNull();
    }
    expect(parseSymbol(undefined)).toBeNull();
    expect(parseSymbol(['EURUSD'])).toBeNull();
  });
  it('timeframe: all 8 pass, others fail', () => {
    for (const tf of ['M1', 'M5', 'M10', 'M15', 'M30', 'H1', 'H3', 'D1']) expect(parseTimeframe(tf)).toBe(tf);
    for (const bad of ['H4', 'm1', '../x', '', 'constructor']) expect(parseTimeframe(bad)).toBeNull();
    expect(parseTimeframe(5)).toBeNull();
  });
  it('market hours query: valid used, invalid falls back to 22', () => {
    expect(parseMarketHours({ closeHourUtc: '21', openHourUtc: '21' })).toEqual({ fridayCloseUtcHour: 21, sundayOpenUtcHour: 21 });
    expect(parseMarketHours({ closeHourUtc: '99', openHourUtc: 'x' })).toEqual({ fridayCloseUtcHour: 22, sundayOpenUtcHour: 22 });
  });
});

describe('bridge candle normalisation', () => {
  it('maps tick_volume to tickVolume and keeps spread', () => {
    const r = normaliseBridgeCandles([{ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, tick_volume: 77, spread: 3 }]);
    expect(r.candles[0]).toEqual({ time: 100, open: 1, high: 2, low: 0.5, close: 1.5, tickVolume: 77, spread: 3 });
  });
  it('drops rows with missing or non-numeric prices and counts them', () => {
    const r = normaliseBridgeCandles([{ time: 1, open: 1, high: 2, low: 1, close: 'x' }, { time: 0, open: 1, high: 1, low: 1, close: 1 }, null, { time: 5, open: 1, high: 2, low: 1, close: 2 }]);
    expect(r.candles).toHaveLength(1);
    expect(r.rejected).toBe(3);
  });
  it('non-array input gives nothing', () => {
    expect(normaliseBridgeCandles({ a: 1 }).candles).toHaveLength(0);
  });
  it('detects the bridge mock data (identical bars) but not real-looking data', () => {
    const fake = Array.from({ length: 20 }, (_, i) => bar(1000 + i * 60, 1.08, 1.09, 1.07, 1.085));
    expect(looksSynthetic(fake)).toBe(true);
    const real = Array.from({ length: 20 }, (_, i) => bar(1000 + i * 60, 1.08 + i / 1000, 1.09 + i / 1000, 1.07, 1.085));
    expect(looksSynthetic(real)).toBe(false);
    expect(looksSynthetic(fake.slice(0, 3))).toBe(false);
  });
});

describe('mergeCandles', () => {
  it('keeps existing bars of the same year when saving new ones', () => {
    const existing = [bar(100), bar(200)];
    const m = mergeCandles(existing, [bar(300)], true);
    expect(m.candles.map((c) => c.time)).toEqual([100, 200, 300]);
    expect(m.added).toBe(1);
  });
  it('prefer-incoming replaces, keep-existing skips', () => {
    const old = bar(100, 1, 1, 1, 1);
    const neu = bar(100, 2, 2, 2, 2);
    expect(mergeCandles([old], [neu], true).candles[0]!.open).toBe(2);
    const keep = mergeCandles([old], [neu], false);
    expect(keep.candles[0]!.open).toBe(1);
    expect(keep.skipped).toBe(1);
  });
});

describe('/check', () => {
  const rows: CatalogRow[] = [
    { symbol: 'XAUUSDm', timeframe: 'H1', year: 2025, first_candle_time: 100, last_candle_time: 500, candle_count: 400, gap_count: 1, updated_at: '2026-10-24T10:00:00Z' },
    { symbol: 'XAUUSDm', timeframe: 'H1', year: 2026, first_candle_time: 600, last_candle_time: 900, candle_count: 300, gap_count: 2, updated_at: '2026-10-25T10:00:00Z' },
    { symbol: 'XAUUSDm', timeframe: 'D1', year: 2026, first_candle_time: 1, last_candle_time: 2, candle_count: 5, gap_count: 0, updated_at: 'x' },
  ];
  it('sums all years for the pair and reports range and last update', async () => {
    const r = await runCheck({ symbol: 'XAUUSDm', timeframe: 'H1' }, makeDeps([], rows).deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ exists: true, barCount: 700, minTime: 100, maxTime: 900, gapCount: 3, lastUpdated: '2026-10-25T10:00:00Z' });
    expect(r.body.years).toEqual([2025, 2026]);
  });
  it('unknown pair says it does not exist', async () => {
    const r = await runCheck({ symbol: 'EURUSDm', timeframe: 'H1' }, makeDeps([], rows).deps);
    expect(r.body).toEqual({ exists: false });
  });
  it('base symbol resolves to broker-suffixed catalog rows', async () => {
    const r = await runCheck({ symbol: 'XAUUSD', timeframe: 'H1' }, makeDeps([], rows).deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ exists: true, symbol: 'XAUUSD', timeframe: 'H1', barCount: 700 });
  });
  it('invalid input gives 400 JSON', async () => {
    expect((await runCheck({ symbol: '..', timeframe: 'H1' }, makeDeps().deps)).body).toEqual({ error: 'INVALID_SYMBOL' });
    expect((await runCheck({ symbol: 'EURUSD', timeframe: 'H4' }, makeDeps().deps)).body).toEqual({ error: 'INVALID_TIMEFRAME' });
  });
  it('summariseCatalog does not match other timeframes', () => {
    expect(summariseCatalog(rows, 'XAUUSDm', 'M5')).toEqual({ exists: false });
  });
});

describe('/load', () => {
  it('returns bars, and the last N when limited', async () => {
    const { deps } = makeDeps([bar(1), bar(2), bar(3)]);
    const all = await runLoad({ symbol: 'EURUSD', timeframe: 'H1' }, deps);
    expect(all.body).toMatchObject({ count: 3, truncated: false });
    const tail = await runLoad({ symbol: 'EURUSD', timeframe: 'H1', limit: '2' }, deps);
    expect((tail.body.candles as Candle[]).map((c) => c.time)).toEqual([2, 3]);
    expect(tail.body.truncated).toBe(true);
  });
  it('bad limit and bad symbol are 400 and never touch storage', async () => {
    const { deps, state } = makeDeps([bar(1)]);
    expect((await runLoad({ symbol: 'EURUSD', timeframe: 'H1', limit: '-1' }, deps)).status).toBe(400);
    expect((await runLoad({ symbol: '../x', timeframe: 'H1' }, deps)).status).toBe(400);
    expect(state.loadArgs).toHaveLength(0);
  });
});

describe('/audit', () => {
  it('weekend is not a gap, a real gap, bad OHLC and duplicate are all reported', async () => {
    const c = [
      bar(t(2026, 10, 23, 20)),
      bar(t(2026, 10, 23, 21)),
      bar(t(2026, 10, 25, 22)), // after weekend: fine
      bar(t(2026, 10, 25, 23), 1.1, 1.0, 1.2, 1.1), // high below low
      bar(t(2026, 10, 25, 23)), // duplicate
      bar(t(2026, 10, 26, 2)), // 2 missing bars (00:00, 01:00)
    ];
    const r = await runAudit({ symbol: 'XAUUSDm', timeframe: 'H1' }, makeDeps(c).deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ totalBars: 6, duplicateCount: 1, ohlcAnomalyCount: 1, gapCount: 1, missingBars: 2, expectedClosedGaps: 1 });
    expect(r.body.status).toBe('NEEDS_REVIEW');
  });
  it('clean data is EXCELLENT, empty is NO_DATA', async () => {
    const clean = Array.from({ length: 5 }, (_, i) => bar(t(2026, 10, 20, 10 + i)));
    expect((await runAudit({ symbol: 'A', timeframe: 'H1' }, makeDeps(clean).deps)).body).toMatchObject({ qualityScore: 100, status: 'EXCELLENT', gapCount: 0 });
    expect((await runAudit({ symbol: 'A', timeframe: 'H1' }, makeDeps([]).deps)).body.status).toBe('NO_DATA');
  });
  it('uses the broker hours override', async () => {
    const c = [bar(t(2026, 10, 23, 20)), bar(t(2026, 10, 25, 21))];
    const def = await runAudit({ symbol: 'A', timeframe: 'H1' }, makeDeps(c).deps);
    expect(def.body.missingBars).toBe(1); // Fri 21:00 is open under the default hours
    const shifted = await runAudit({ symbol: 'A', timeframe: 'H1', closeHourUtc: '21', openHourUtc: '21' }, makeDeps(c).deps);
    expect(shifted.body.missingBars).toBe(0);
  });
  it('invalid timeframe is 400', async () => {
    expect((await runAudit({ symbol: 'A', timeframe: 'H4' }, makeDeps().deps)).status).toBe(400);
  });
});

describe('/export', () => {
  it('streams header plus UTC rows with a safe filename', async () => {
    const r = (await runExport({ symbol: 'XAUUSDm', timeframe: 'M10' }, makeDeps([bar(t(2026, 10, 20, 10))]).deps)) as CsvResult;
    expect(r.filename).toBe('XAUUSDm_M10_export.csv');
    expect([...r.lines].join('')).toBe('time,open,high,low,close,tickVolume,spread\n2026-10-20T10:00:00Z,1.1,1.2,1,1.15,10,2\n');
  });
  it('invalid symbol returns JSON error, not a file', async () => {
    const r = await runExport({ symbol: 'a/b', timeframe: 'H1' }, makeDeps().deps);
    expect('lines' in r).toBe(false);
    expect(r.status).toBe(400);
  });
});

describe('/import', () => {
  const csv = 'time,open,high,low,close\n2026-10-20 10:00,1,2,1,2\n2026-10-20 11:00,1,2,1,2\n';
  it('preview parses and audits but saves nothing', async () => {
    const { deps, state } = makeDeps();
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv, utcOffsetHours: 3 }, deps);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ committed: false, parsedRows: 2, rejectedRows: 0 });
    expect(state.saves).toBe(0);
  });
  it('commit applies the broker offset, saves, and writes an audit-log line with provenance', async () => {
    const { deps, state } = makeDeps();
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv, utcOffsetHours: 3, commit: true }, deps);
    expect(r.body).toMatchObject({ committed: true, added: 2 });
    expect(state.candles[0]!.time).toBe(t(2026, 10, 20, 7));
    expect(state.audits[0]!.details).toContain('source=csv-import');
  });
  it('commit merges with stored bars instead of wiping them', async () => {
    const { deps, state } = makeDeps([bar(t(2026, 10, 1, 0))]);
    await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv, commit: true }, deps);
    expect(state.candles).toHaveLength(3);
  });
  it('existing bars win unless overwrite=true', async () => {
    const stored = bar(t(2026, 10, 20, 10), 9, 9, 9, 9);
    const a = makeDeps([stored]);
    await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv, commit: true }, a.deps);
    expect(a.state.candles.find((c) => c.time === stored.time)!.open).toBe(9);
    const b = makeDeps([stored]);
    await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv, commit: true, overwrite: true }, b.deps);
    expect(b.state.candles.find((c) => c.time === stored.time)!.open).toBe(1);
  });
  it('invalid OHLC blocks the commit (409) unless allowInvalid', async () => {
    const bad = 'time,open,high,low,close\n2026-10-20 10:00,1,0.5,2,1\n';
    const a = makeDeps();
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv: bad, commit: true }, a.deps);
    expect(r.status).toBe(409);
    expect(a.state.saves).toBe(0);
    const ok = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv: bad, commit: true, allowInvalid: true }, makeDeps().deps);
    expect(ok.status).toBe(200);
  });
  it('duplicate timestamps inside the file are dropped and counted', async () => {
    const dup = 'time,open,high,low,close\n2026-10-20 10:00,1,2,1,2\n2026-10-20 10:00,1,2,1,2\n';
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv: dup }, makeDeps().deps);
    expect(r.body).toMatchObject({ fileFixes: 1 });
  });
  it('bad rows are reported, good rows kept', async () => {
    const mixed = 'time,open,high,low,close\n2026-10-20 10:00,1,2,1,2\nnope,1,2,1,2\n';
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv: mixed }, makeDeps().deps);
    expect(r.body).toMatchObject({ parsedRows: 1, rejectedRows: 1 });
  });
  it('nothing importable is 422', async () => {
    const r = await runImport({ symbol: 'EURUSD', timeframe: 'H1', csv: 'a,b\n1,2\n' }, makeDeps().deps);
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('NOTHING_IMPORTED');
  });
  it('rejects bad options before parsing', async () => {
    const d = makeDeps().deps;
    expect((await runImport({ symbol: '..', timeframe: 'H1', csv }, d)).status).toBe(400);
    expect((await runImport({ symbol: 'A', timeframe: 'H4', csv }, d)).status).toBe(400);
    expect((await runImport({ symbol: 'A', timeframe: 'H1', csv: '' }, d)).status).toBe(400);
    expect((await runImport({ symbol: 'A', timeframe: 'H1', csv, utcOffsetHours: 99 }, d)).status).toBe(400);
    expect((await runImport({ symbol: 'A', timeframe: 'H1', csv, mapping: { time: { x: 1 } } }, d)).status).toBe(400);
  });
  it('explicit mapping works', async () => {
    const r = await runImport({ symbol: 'A', timeframe: 'H1', csv: 'Stamp,O,H,L,C\n2026-10-20 10:00,1,2,1,2\n', mapping: { time: 'Stamp', open: 'O', high: 'H', low: 'L', close: 'C' } }, makeDeps().deps);
    expect(r.body).toMatchObject({ parsedRows: 1 });
  });
});

describe('/autofix', () => {
  it('drops duplicates, logs to audit, never touches prices', async () => {
    const { deps, state } = makeDeps([bar(100), bar(100, 9, 9, 9, 9), bar(200)]);
    const r = await runAutofix({ symbol: 'A', timeframe: 'H1' }, deps);
    expect(r.body).toMatchObject({ changed: true, before: 3, after: 2 });
    expect(state.candles[0]!.open).toBe(1.1);
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]!.action).toBe('DATA_AUTOFIX');
  });
  it('clean data: no save, no audit entry', async () => {
    const { deps, state } = makeDeps([bar(100), bar(200)]);
    const r = await runAutofix({ symbol: 'A', timeframe: 'H1' }, deps);
    expect(r.body.changed).toBe(false);
    expect(state.saves).toBe(0);
  });
  it('invalid input is 400', async () => {
    expect((await runAutofix({ symbol: '..', timeframe: 'H1' }, makeDeps().deps)).status).toBe(400);
  });
});

describe('bulk download save', () => {
  const raw = Array.from({ length: 12 }, (_, i) => ({ time: 1000 + i * 3600, open: 1 + i / 100, high: 2 + i / 100, low: 0.5, close: 1.5, tick_volume: 5, spread: 2 }));
  it('stores tickVolume, merges with existing bars, writes audit line', async () => {
    const { deps, state } = makeDeps([bar(10)]);
    const r = await runBulkSave('XAUUSDm', 'H1', raw, deps);
    expect(r).toMatchObject({ accepted: 12, added: 12, total: 13 });
    expect(state.candles.every((c) => typeof c.tickVolume === 'number')).toBe(true);
    expect(state.candles.find((c) => c.time === 1000)!.tickVolume).toBe(5);
    expect(state.audits[0]!.details).toContain('source=bridge');
  });
  it('refuses the bridge mock data and saves nothing', async () => {
    const fake = Array.from({ length: 20 }, (_, i) => ({ time: 1000 + i * 3600, open: 1.08, high: 1.09, low: 1.07, close: 1.085, tick_volume: 100, spread: 2 }));
    const { deps, state } = makeDeps();
    await expect(runBulkSave('FOO', 'H1', fake, deps)).rejects.toThrow('BRIDGE_RETURNED_SYNTHETIC_DATA');
    expect(state.saves).toBe(0);
  });
  it('refuses an empty or all-invalid reply', async () => {
    await expect(runBulkSave('A', 'H1', [], makeDeps().deps)).rejects.toThrow('BRIDGE_RETURNED_NO_VALID_CANDLES');
    await expect(runBulkSave('A', 'H1', [{ time: 'x' }], makeDeps().deps)).rejects.toThrow('BRIDGE_RETURNED_NO_VALID_CANDLES');
  });
});
