/**
 * CSV export (FR-H7) and import with column mapping and timezone (FR-H6).
 * Pure functions. Times are UTC epoch seconds in memory.
 */
import type { Candle } from './candleQuality';

export const CSV_COLUMNS = ['time', 'open', 'high', 'low', 'close', 'tickVolume', 'spread'] as const;

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function formatUtc(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}

export function csvEscape(v: string): string {
  return /[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Line generator so the Express route can stream without building one big string. */
export function* candleCsvLines(candles: Iterable<Candle>): Generator<string> {
  yield CSV_COLUMNS.join(',') + '\n';
  for (const c of candles) {
    const cells = [
      formatUtc(c.time),
      String(c.open),
      String(c.high),
      String(c.low),
      String(c.close),
      c.tickVolume === undefined ? '' : String(c.tickVolume),
      c.spread === undefined ? '' : String(c.spread),
    ];
    yield cells.map(csvEscape).join(',') + '\n';
  }
}

export function exportCandlesCsv(candles: Iterable<Candle>): string {
  let out = '';
  for (const line of candleCsvLines(candles)) out += line;
  return out;
}

// ---------------------------------------------------------------- import

export type CandleField = 'time' | 'open' | 'high' | 'low' | 'close' | 'tickVolume' | 'spread';

export interface CsvImportOptions {
  /** Column per field: header name (case-insensitive) or zero-based index. */
  mapping?: Partial<Record<CandleField, string | number>>;
  /**
   * Hours the file's clock is ahead of UTC (broker offset, e.g. 3 for UTC+3).
   * Ignored for epoch values and for text times that carry their own Z or +hh:mm.
   */
  utcOffsetHours?: number;
  /** Force a delimiter; otherwise detected from the first line. */
  delimiter?: string;
}

export interface CsvRowError {
  line: number;
  message: string;
}

export interface CsvImportResult {
  candles: Candle[];
  errors: CsvRowError[];
  delimiter: string;
}

const ALIASES: Record<Exclude<CandleField, 'time'>, string[]> = {
  open: ['open', 'o'],
  high: ['high', 'h'],
  low: ['low', 'l'],
  close: ['close', 'c'],
  tickVolume: ['tickvolume', 'tick_volume', 'tickvol', 'volume', 'vol'],
  spread: ['spread'],
};
const TIME_ALIASES = ['datetime', 'timestamp', 'date/time', 'time', 'date'];

function norm(h: string): string {
  return h.replace(/[<>"]/g, '').trim().toLowerCase();
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

function parseRecords(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const TIME_RE =
  /^(\d{4})[-./](\d{2})[-./](\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/** Returns UTC epoch seconds, or null if the text is not a recognised time. */
export function parseTime(raw: string, utcOffsetHours: number): number | null {
  const s = raw.trim();
  if (/^\d{9,10}$/.test(s)) return Number(s);
  if (/^\d{12,13}$/.test(s)) return Math.floor(Number(s) / 1000);
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, zone] = m;
  const month = Number(mo);
  const day = Number(d);
  const hour = h === undefined ? 0 : Number(h);
  const min = mi === undefined ? 0 : Number(mi);
  const sec = se === undefined ? 0 : Number(se);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || min > 59 || sec > 59) return null;
  const asUtc = Date.UTC(Number(y), month - 1, day, hour, min, sec) / 1000;
  if (zone === undefined) return asUtc - utcOffsetHours * 3600;
  if (zone === 'Z') return asUtc;
  const sign = zone.startsWith('-') ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const off = sign * (Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4)) * 60);
  return asUtc - off;
}

function parseNumber(raw: string | undefined, delim: string): number {
  if (raw === undefined) return NaN;
  let s = raw.trim();
  if (s === '') return NaN;
  if (delim !== ',' && s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  return Number(s);
}

export function importCandlesCsv(input: string, options: CsvImportOptions = {}): CsvImportResult {
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const offset = options.utcOffsetHours ?? 0;
  const errors: CsvRowError[] = [];
  const records = parseRecords(text, delimiter);
  if (records.length === 0) {
    return { candles: [], errors: [{ line: 1, message: 'file is empty' }], delimiter };
  }
  const headers = records[0]!.map(norm);

  const findCol = (spec: string | number | undefined, aliases: string[]): number | undefined | 'bad' => {
    if (spec !== undefined) {
      if (typeof spec === 'number') return spec >= 0 && spec < headers.length ? spec : 'bad';
      const i = headers.indexOf(norm(spec));
      return i >= 0 ? i : 'bad';
    }
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    return undefined;
  };

  const cols: Partial<Record<CandleField, number>> = {};
  let dateCol: number | undefined;
  let clockCol: number | undefined;
  let fatal = false;

  // time: MT5 exports use separate date and time columns
  const mapTime = options.mapping?.time;
  if (mapTime === undefined && headers.includes('date') && headers.includes('time')) {
    dateCol = headers.indexOf('date');
    clockCol = headers.indexOf('time');
  } else {
    const t = findCol(mapTime, TIME_ALIASES);
    if (t === undefined || t === 'bad') {
      errors.push({ line: 1, message: t === 'bad' ? 'mapped time column not found' : 'no time column found' });
      fatal = true;
    } else cols.time = t;
  }

  (Object.keys(ALIASES) as Array<Exclude<CandleField, 'time'>>).forEach((f) => {
    const c = findCol(options.mapping?.[f], ALIASES[f]);
    if (c === 'bad') {
      errors.push({ line: 1, message: `mapped column for ${f} not found` });
      fatal = true;
    } else if (c === undefined) {
      if (f !== 'tickVolume' && f !== 'spread') {
        errors.push({ line: 1, message: `no ${f} column found` });
        fatal = true;
      }
    } else cols[f] = c;
  });

  if (fatal) return { candles: [], errors, delimiter };

  const candles: Candle[] = [];
  for (let r = 1; r < records.length; r++) {
    const row = records[r]!;
    const line = r + 1;
    if (row.length === 1 && row[0]!.trim() === '') continue;

    const rawTime =
      dateCol !== undefined && clockCol !== undefined
        ? `${(row[dateCol] ?? '').trim()} ${(row[clockCol] ?? '').trim()}`
        : (row[cols.time!] ?? '');
    const time = parseTime(rawTime, offset);
    if (time === null) {
      errors.push({ line, message: `unrecognised time "${rawTime.trim()}"` });
      continue;
    }
    const open = parseNumber(row[cols.open!], delimiter);
    const high = parseNumber(row[cols.high!], delimiter);
    const low = parseNumber(row[cols.low!], delimiter);
    const close = parseNumber(row[cols.close!], delimiter);
    if (![open, high, low, close].every(Number.isFinite)) {
      errors.push({ line, message: 'open, high, low or close is not a number' });
      continue;
    }
    const candle: Candle = { time, open, high, low, close };
    if (cols.tickVolume !== undefined) {
      const v = parseNumber(row[cols.tickVolume], delimiter);
      if (Number.isFinite(v)) candle.tickVolume = v;
    }
    if (cols.spread !== undefined) {
      const v = parseNumber(row[cols.spread], delimiter);
      if (Number.isFinite(v)) candle.spread = v;
    }
    candles.push(candle);
  }
  // OHLC logic, duplicates and gaps are NOT judged here: run auditCandles on the result.
  return { candles, errors, delimiter };
}
