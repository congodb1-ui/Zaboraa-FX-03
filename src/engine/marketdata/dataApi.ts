/**
 * Logic behind the /api/data/* routes, as pure functions with injected storage.
 * server.ts routes stay thin: parse request, call one of these, send the result.
 * That makes every route rule testable without HTTP or a database.
 */
import {
  auditCandles,
  fixCandles,
  isTimeframe,
  DEFAULT_MARKET_HOURS,
  type AuditResult,
  type Candle,
  type MarketHours,
  type Timeframe,
} from './candleQuality';
import { candleCsvLines, importCandlesCsv, type CandleField } from './candleCsv';

// ------------------------------------------------------------ validation

export const SYMBOL_RE = /^[A-Za-z0-9._-]{1,24}$/;

/** Symbol is used in file paths, so leading dots, '..' and dot-only names are rejected even though the bridge regex allows them. */
export function parseSymbol(v: unknown): string | null {
  if (typeof v !== 'string' || !SYMBOL_RE.test(v)) return null;
  if (v.startsWith('.') || v.includes('..') || /^\.+$/.test(v)) return null;
  return v;
}

export function parseTimeframe(v: unknown): Timeframe | null {
  return typeof v === 'string' && isTimeframe(v) ? v : null;
}

function parseHour(v: unknown, fallback: number): number {
  if (typeof v !== 'string' || !/^\d{1,2}$/.test(v)) return fallback;
  const n = Number(v);
  return n >= 0 && n <= 23 ? n : fallback;
}

/** Optional ?closeHourUtc=21&openHourUtc=21 for brokers whose weekly close shifts with daylight saving. */
export function parseMarketHours(query: Record<string, unknown>): MarketHours {
  return {
    fridayCloseUtcHour: parseHour(query.closeHourUtc, DEFAULT_MARKET_HOURS.fridayCloseUtcHour),
    sundayOpenUtcHour: parseHour(query.openHourUtc, DEFAULT_MARKET_HOURS.sundayOpenUtcHour),
  };
}

// ------------------------------------------------------------ types

export interface CatalogRow {
  symbol: string;
  timeframe: string;
  year: number;
  first_candle_time: number | null;
  last_candle_time: number | null;
  candle_count: number;
  gap_count: number | null;
  updated_at: string;
}

export interface DataDeps {
  loadCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]>;
  saveCandles(symbol: string, timeframe: Timeframe, candles: Candle[]): Promise<void>;
  getCatalog(): CatalogRow[];
  audit(entry: { action: string; entity: string; details: string }): void;
}

export interface JsonResult {
  status: number;
  body: Record<string, unknown>;
}
export interface CsvResult {
  status: 200;
  filename: string;
  lines: Iterable<string>;
}

type Q = Record<string, unknown>;

function badInput(symbol: string | null, timeframe: Timeframe | null): JsonResult | null {
  if (!symbol) return { status: 400, body: { error: 'INVALID_SYMBOL' } };
  if (!timeframe) return { status: 400, body: { error: 'INVALID_TIMEFRAME' } };
  return null;
}

// ------------------------------------------------------------ candle helpers

/** Maps bridge candles (tick_volume) to the stored shape (tickVolume). Drops unusable rows. */
export function normaliseBridgeCandles(raw: unknown): { candles: Candle[]; rejected: number } {
  if (!Array.isArray(raw)) return { candles: [], rejected: 0 };
  const candles: Candle[] = [];
  let rejected = 0;
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const time = Number(o.time);
    const open = Number(o.open);
    const high = Number(o.high);
    const low = Number(o.low);
    const close = Number(o.close);
    if (![time, open, high, low, close].every(Number.isFinite) || time <= 0) {
      rejected++;
      continue;
    }
    const vol = Number(o.tickVolume ?? o.tick_volume ?? 0);
    const spr = Number(o.spread ?? 0);
    candles.push({
      time,
      open,
      high,
      low,
      close,
      tickVolume: Number.isFinite(vol) ? vol : 0,
      spread: Number.isFinite(spr) ? spr : 0,
    });
  }
  return { candles, rejected };
}

/** The bridge's mock mode returns identical bars. Real markets never do. */
export function looksSynthetic(candles: Candle[]): boolean {
  if (candles.length < 10) return false;
  const f = candles[0]!;
  return candles.every((c) => c.open === f.open && c.high === f.high && c.low === f.low && c.close === f.close);
}

export function mergeCandles(existing: Candle[], incoming: Candle[], preferIncoming: boolean) {
  const map = new Map<number, Candle>();
  for (const c of existing) map.set(c.time, c);
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const c of incoming) {
    if (!map.has(c.time)) {
      map.set(c.time, c);
      added++;
    } else if (preferIncoming) {
      map.set(c.time, c);
      replaced++;
    } else skipped++;
  }
  return { candles: [...map.values()].sort((a, b) => a.time - b.time), added, replaced, skipped };
}

function compactAudit(a: AuditResult) {
  return {
    total: a.total,
    counts: a.counts,
    expectedClosedGaps: a.expectedClosedGaps,
    qualityScore: a.qualityScore,
    issues: a.issues.slice(0, 50),
    issuesTruncated: a.issues.length > 50,
  };
}

// ------------------------------------------------------------ /api/data/check

/** Treat a base symbol and its common Exness `m` suffix as aliases for lookup only.
 * The stored/catalog symbol is not rewritten. This is intentionally limited to
 * the app's supported FX/metals-style symbols to avoid stripping arbitrary names.
 */
function symbolAliases(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  const base = upper.endsWith('M') ? upper.slice(0, -1) : upper;
  const isSupportedBase = /^[A-Z]{6}$/.test(base) || base === 'XAUUSD' || base === 'XAGUSD';
  if (!isSupportedBase) return [symbol];
  return [...new Set([symbol, base, `${base}m`, `${base}M`])];
}

export function summariseCatalog(rows: CatalogRow[], symbol: string, timeframe: string) {
  const exact = rows.filter((r) => r.symbol.toUpperCase() === symbol.toUpperCase() && r.timeframe === timeframe);
  const aliases = new Set(symbolAliases(symbol).map((v) => v.toUpperCase()));
  // Exact canonical data wins; use alias rows only when no exact rows exist, to avoid double-counting.
  const mine = exact.length > 0 ? exact : rows.filter((r) => aliases.has(r.symbol.toUpperCase()) && r.timeframe === timeframe);
  if (mine.length === 0) return { exists: false as const };
  const firsts = mine.map((r) => r.first_candle_time).filter((v): v is number => typeof v === 'number');
  const lasts = mine.map((r) => r.last_candle_time).filter((v): v is number => typeof v === 'number');
  return {
    exists: true as const,
    symbol,
    timeframe,
    barCount: mine.reduce((s, r) => s + (r.candle_count || 0), 0),
    minTime: firsts.length ? Math.min(...firsts) : null,
    maxTime: lasts.length ? Math.max(...lasts) : null,
    years: mine.map((r) => r.year).sort((a, b) => a - b),
    gapCount: mine.reduce((s, r) => s + (r.gap_count || 0), 0),
    lastUpdated: (() => { const u = mine.map((r) => r.updated_at).sort(); return u.length ? u[u.length - 1]! : null; })(),
    // Not stored in the catalog. Run /api/data/audit for a real score.
    qualityScore: null,
  };
}

export async function runCheck(q: Q, deps: DataDeps): Promise<JsonResult> {
  const symbol = parseSymbol(q.symbol);
  const timeframe = parseTimeframe(q.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;
  return { status: 200, body: { ...summariseCatalog(deps.getCatalog(), symbol!, timeframe!) } };
}

// ------------------------------------------------------------ /api/data/load

const MAX_LOAD = 200000;

export async function runLoad(q: Q, deps: DataDeps): Promise<JsonResult> {
  const symbol = parseSymbol(q.symbol);
  const timeframe = parseTimeframe(q.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;
  let limit = MAX_LOAD;
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1) return { status: 400, body: { error: 'INVALID_LIMIT' } };
    limit = Math.min(n, MAX_LOAD);
  }
  const all = await deps.loadCandles(symbol!, timeframe!);
  const from = q.from === undefined || q.from === '' ? undefined : Math.floor(Date.parse(String(q.from)) / 1000);
  const toRaw = q.to === undefined || q.to === '' ? undefined : String(q.to);
  const to = toRaw === undefined ? undefined : Math.floor(Date.parse(toRaw) / 1000) + (/^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? 86399 : 0);
  if ((q.from !== undefined && !Number.isFinite(from)) || (q.to !== undefined && !Number.isFinite(to))) return { status: 400, body: { error: 'INVALID_DATE_RANGE' } };
  if (from !== undefined && to !== undefined && from > to) return { status: 400, body: { error: 'INVALID_DATE_RANGE' } };
  const ranged = all.filter(c => (from === undefined || c.time >= from) && (to === undefined || c.time <= to));
  const candles = ranged.length > limit ? ranged.slice(ranged.length - limit) : ranged;
  return {
    status: 200,
    body: { success: true, symbol, timeframe, count: candles.length, totalStored: all.length, rangeCount: ranged.length, truncated: ranged.length > limit, candles },
  };
}

// ------------------------------------------------------------ /api/data/audit

export async function runAudit(q: Q, deps: DataDeps): Promise<JsonResult> {
  const symbol = parseSymbol(q.symbol);
  const timeframe = parseTimeframe(q.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;
  const candles = await deps.loadCandles(symbol!, timeframe!);
  const a = auditCandles(candles, timeframe!, parseMarketHours(q));
  const status =
    a.total === 0 ? 'NO_DATA' : a.qualityScore > 90 ? 'EXCELLENT' : a.qualityScore > 75 ? 'GOOD' : 'NEEDS_REVIEW';
  return {
    status: 200,
    body: {
      success: true,
      symbol,
      timeframe,
      // legacy keys used by the existing UI
      totalBars: a.total,
      duplicateCount: a.counts.duplicates,
      ohlcAnomalyCount: a.counts.ohlcInvalid + a.counts.nonFinite,
      gapCount: a.counts.gaps,
      qualityScore: a.qualityScore,
      status,
      // new detail
      outOfOrderCount: a.counts.outOfOrder,
      missingBars: a.counts.missingBars,
      expectedClosedGaps: a.expectedClosedGaps,
      issues: a.issues.slice(0, 50),
      issuesTruncated: a.issues.length > 50,
    },
  };
}

// ------------------------------------------------------------ /api/data/export

export async function runExport(q: Q, deps: DataDeps): Promise<JsonResult | CsvResult> {
  const symbol = parseSymbol(q.symbol);
  const timeframe = parseTimeframe(q.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;
  let candles = await deps.loadCandles(symbol!, timeframe!);
  const from = q.from === undefined || q.from === '' ? undefined : Math.floor(Date.parse(String(q.from)) / 1000);
  const toRaw = q.to === undefined || q.to === '' ? undefined : String(q.to);
  const to = toRaw === undefined ? undefined : Math.floor(Date.parse(toRaw) / 1000) + (/^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? 86399 : 0);
  if ((q.from !== undefined && !Number.isFinite(from)) || (q.to !== undefined && !Number.isFinite(to)) || (from !== undefined && to !== undefined && from > to)) return { status: 400, body: { error: 'INVALID_DATE_RANGE' } };
  candles = candles.filter(c => (from === undefined || c.time >= from) && (to === undefined || c.time <= to));
  return { status: 200, filename: `${symbol}_${timeframe}_export.csv`, lines: candleCsvLines(candles) };
}

// ------------------------------------------------------------ /api/data/import

const FIELDS: CandleField[] = ['time', 'open', 'high', 'low', 'close', 'tickVolume', 'spread'];

function cleanMapping(m: unknown): Partial<Record<CandleField, string | number>> | null {
  if (m === undefined || m === null) return {};
  if (typeof m !== 'object' || Array.isArray(m)) return null;
  const out: Partial<Record<CandleField, string | number>> = {};
  for (const f of FIELDS) {
    const v = (m as Record<string, unknown>)[f];
    if (v === undefined || v === '') continue;
    if (typeof v === 'string' || (typeof v === 'number' && Number.isInteger(v) && v >= 0)) out[f] = v;
    else return null;
  }
  return out;
}

/**
 * Two steps. commit=false (default) parses and audits only; nothing is saved.
 * commit=true saves, merging with stored bars so other bars of the same year are never wiped.
 */
export async function runImport(body: Q, deps: DataDeps): Promise<JsonResult> {
  const symbol = parseSymbol(body.symbol);
  const timeframe = parseTimeframe(body.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;

  const csv = body.csv;
  if (typeof csv !== 'string' || csv.trim() === '') return { status: 400, body: { error: 'INVALID_IMPORT_OPTIONS', message: 'csv text is required' } };
  const offset = body.utcOffsetHours === undefined ? 0 : Number(body.utcOffsetHours);
  if (!Number.isFinite(offset) || offset < -14 || offset > 14) return { status: 400, body: { error: 'INVALID_IMPORT_OPTIONS', message: 'utcOffsetHours must be between -14 and 14' } };
  const mapping = cleanMapping(body.mapping);
  if (mapping === null) return { status: 400, body: { error: 'INVALID_IMPORT_OPTIONS', message: 'mapping must map field names to a header name or column index' } };

  const parsed = importCandlesCsv(csv, { utcOffsetHours: offset, mapping });
  if (parsed.candles.length === 0) {
    return { status: 422, body: { error: 'NOTHING_IMPORTED', errors: parsed.errors.slice(0, 50) } };
  }

  const fixed = fixCandles(parsed.candles); // sorts and drops duplicate timestamps inside the file
  const audit = auditCandles(fixed.candles, timeframe!, parseMarketHours(body));
  const summary = {
    symbol,
    timeframe,
    parsedRows: parsed.candles.length,
    rejectedRows: parsed.errors.length,
    rowErrors: parsed.errors.slice(0, 50),
    fileFixes: fixed.log.length,
    audit: compactAudit(audit),
  };

  if (body.commit !== true) return { status: 200, body: { committed: false, ...summary } };

  const hardErrors = audit.counts.ohlcInvalid + audit.counts.nonFinite;
  if (hardErrors > 0 && body.allowInvalid !== true) {
    return { status: 409, body: { error: 'AUDIT_ERRORS', message: 'File has invalid OHLC bars. Fix the file, or resend with allowInvalid=true.', committed: false, ...summary } };
  }

  const existing = await deps.loadCandles(symbol!, timeframe!);
  const merged = mergeCandles(existing, fixed.candles, body.overwrite === true);
  await deps.saveCandles(symbol!, timeframe!, merged.candles);
  deps.audit({
    action: 'DATA_IMPORT_CSV',
    entity: `${symbol}_${timeframe}`,
    details: `source=csv-import added=${merged.added} replaced=${merged.replaced} skipped=${merged.skipped} rejectedRows=${parsed.errors.length} fileFixes=${fixed.log.length} utcOffsetHours=${offset} score=${audit.qualityScore}`,
  });
  return {
    status: 200,
    body: { committed: true, added: merged.added, replaced: merged.replaced, skippedExisting: merged.skipped, ...summary },
  };
}

// ------------------------------------------------------------ /api/data/autofix

export async function runAutofix(body: Q, deps: DataDeps): Promise<JsonResult> {
  const symbol = parseSymbol(body.symbol);
  const timeframe = parseTimeframe(body.timeframe);
  const bad = badInput(symbol, timeframe);
  if (bad) return bad;
  const candles = await deps.loadCandles(symbol!, timeframe!);
  const fixed = fixCandles(candles);
  if (fixed.log.length === 0) return { status: 200, body: { changed: false, message: 'Nothing to fix. Prices are never altered by autofix.' } };
  await deps.saveCandles(symbol!, timeframe!, fixed.candles);
  const lines = fixed.log.slice(0, 20).map((l) => `${l.action}${l.time ? '@' + l.time : ''}`).join(',');
  deps.audit({
    action: 'DATA_AUTOFIX',
    entity: `${symbol}_${timeframe}`,
    details: `before=${candles.length} after=${fixed.candles.length} changes=${fixed.log.length} first=[${lines}]`,
  });
  return { status: 200, body: { changed: true, before: candles.length, after: fixed.candles.length, log: fixed.log.slice(0, 100) } };
}

// ------------------------------------------------------------ bulk download save

/** Used by the bulk-download job after the bridge replies. Throws Error with a short code. */
export async function runBulkSave(
  symbol: string,
  timeframe: Timeframe,
  rawCandles: unknown,
  deps: DataDeps,
  meta?: { timeBasis?: string; utcOffsetHours?: number | null },
) {
  // Bridge candle times are broker server time. Stored candles are UTC, so shift by the offset.
  // If the bridge says "broker" but could not measure the offset, refuse rather than store wrong times.
  let shiftSec = 0;
  if (meta?.timeBasis === 'broker') {
    if (typeof meta.utcOffsetHours !== 'number' || !Number.isFinite(meta.utcOffsetHours)) {
      throw new Error('BRIDGE_UTC_OFFSET_UNKNOWN');
    }
    shiftSec = meta.utcOffsetHours * 3600;
  }
  const normalised = normaliseBridgeCandles(rawCandles);
  const rejected = normalised.rejected;
  const candles = shiftSec === 0 ? normalised.candles : normalised.candles.map((c) => ({ ...c, time: c.time - shiftSec }));
  if (candles.length === 0) throw new Error('BRIDGE_RETURNED_NO_VALID_CANDLES');
  if (looksSynthetic(candles)) throw new Error('BRIDGE_RETURNED_SYNTHETIC_DATA');
  const existing = await deps.loadCandles(symbol, timeframe);
  const merged = mergeCandles(existing, candles, false);
  await deps.saveCandles(symbol, timeframe, merged.candles);
  deps.audit({
    action: 'DATA_BULK_DOWNLOAD',
    entity: `${symbol}_${timeframe}`,
    details: `source=bridge accepted=${candles.length} rejected=${rejected} added=${merged.added} replaced=${merged.replaced} utcOffsetHours=${shiftSec / 3600}`,
  });
  return { accepted: candles.length, rejected, added: merged.added, replaced: merged.replaced, total: merged.candles.length };
}
