# Round 3 fix: how to use these files

New files (copy into your project, same paths):

- `src/engine/data/candleQuality.ts`   audit, weekend-aware gaps, autofix with log
- `src/engine/data/candleCsv.ts`       CSV export (FR-H7) and import with mapping + timezone (FR-H6)
- `src/engine/data/__tests__/candleQuality.test.ts`  20 tests
- `src/engine/data/__tests__/candleCsv.test.ts`      17 tests

Expected after copying: `npm test` goes from 119 to 156. Run `npm run lint` and `npm run build` too.
I ran the 37 tests here with a small stand-in for vitest (not the real one), so your real run is the proof.

## Assumptions to check against your code

1. Candle `time` is UTC epoch SECONDS. If `/api/data/load` returns milliseconds, divide by 1000 before `auditCandles`.
2. Field names are `tickVolume` and `spread` (same as your export columns).
3. Weekly close/open is 22:00 UTC Friday to 22:00 UTC Sunday. Exness shifts by one hour with daylight saving.
   If the audit reports a missing bar at Fri 21:00 or Sun 21:00, pass `{ fridayCloseUtcHour: 21, sundayOpenUtcHour: 21 }`.
4. Holidays are not built in. Pass `closedRanges` for Christmas and New Year.

## Replace the audit logic in /api/data/audit

```ts
import { auditCandles, fixCandles, isTimeframe } from './src/engine/data/candleQuality';

// inside the handler, after you load the candles into `candles`
if (!isTimeframe(String(req.query.timeframe))) {
  return res.status(400).json({ error: 'INVALID_TIMEFRAME' });
}
const result = auditCandles(candles, req.query.timeframe as Timeframe);
return res.json(result);
```

## Autofix (only when the user clicks it; never silent)

```ts
const { candles: fixed, log } = fixCandles(candles);
// save `fixed`, then write each entry of `log` to audit_log
```

## Replace the CSV writer in /api/data/export

```ts
import { candleCsvLines } from './src/engine/data/candleCsv';

res.setHeader('Content-Type', 'text/csv; charset=utf-8');
res.setHeader('Content-Disposition', `attachment; filename="${symbol}_${timeframe}.csv"`);
for (const line of candleCsvLines(candles)) res.write(line);
res.end();
```
Validate `symbol` with the same regex as the bridge before building the filename.

## New route: /api/data/import (FR-H6)

```ts
import { importCandlesCsv } from './src/engine/data/candleCsv';

app.post('/api/data/import', express.text({ type: '*/*', limit: '50mb' }), (req, res) => {
  const { symbol, timeframe, utcOffsetHours, mapping } = JSON.parse(String(req.headers['x-import-options'] ?? '{}'));
  // validate symbol + timeframe first (400 JSON errors)
  const r = importCandlesCsv(String(req.body), { utcOffsetHours, mapping });
  if (r.candles.length === 0) return res.status(422).json({ error: 'NOTHING_IMPORTED', errors: r.errors.slice(0, 50) });
  // run auditCandles(r.candles, timeframe) and show the result BEFORE saving
  // save with savePartitionedCandles(...), mark provenance 'csv-import' in data_catalog
  res.json({ imported: r.candles.length, rejected: r.errors.length, errors: r.errors.slice(0, 50) });
});
```
Imported data should be stored with provenance `csv-import`, and the user should see the audit result before it is saved.

## Route tests still needed (need your server.ts to write)

Supertest-style tests for the three routes with a mocked database: invalid timeframe returns 400 JSON,
unknown symbol returns 400 JSON, empty data returns a clean JSON result, export sends the header plus rows.
