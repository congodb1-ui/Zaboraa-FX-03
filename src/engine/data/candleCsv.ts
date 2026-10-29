import { Candle } from '../../types/forex';

export interface CsvImportOptions {
  utcOffsetHours?: number;
  mapping?: Record<string, string>;
}

export interface CsvImportResult {
  candles: Candle[];
  errors: string[];
}

/**
 * Generator that streams CSV lines for candles with standard MT5 / Quant export format.
 */
export function* candleCsvLines(candles: Candle[]): Generator<string> {
  yield 'Date,Time,Open,High,Low,Close,TickVolume,Spread\n';

  for (const c of candles) {
    const d = new Date(c.time * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');

    const dateStr = `${yyyy}.${mm}.${dd}`;
    const timeStr = `${hh}:${min}:${ss}`;
    const spread = c.spread !== undefined ? c.spread : 0;

    yield `${dateStr},${timeStr},${c.open},${c.high},${c.low},${c.close},${c.tickVolume},${spread}\n`;
  }
}

/**
 * Parses CSV string (supporting MT5, TradingView, or generic formats) into Candle[].
 */
export function importCandlesCsv(csvText: string, options: CsvImportOptions = {}): CsvImportResult {
  const candles: Candle[] = [];
  const errors: string[] = [];
  const offsetHours = options.utcOffsetHours || 0;

  if (!csvText || typeof csvText !== 'string') {
    return { candles: [], errors: ['Empty CSV body'] };
  }

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { candles: [], errors: ['Empty CSV rows'] };
  }

  // Header detection
  const firstLine = lines[0];
  const headerParts = firstLine.split(/[,;\t]/).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  let dateIdx = -1;
  let timeIdx = -1;
  let timestampIdx = -1;
  let openIdx = -1;
  let highIdx = -1;
  let lowIdx = -1;
  let closeIdx = -1;
  let volIdx = -1;
  let spreadIdx = -1;

  for (let i = 0; i < headerParts.length; i++) {
    const col = headerParts[i];
    if (col === 'date' || col === '<date>') dateIdx = i;
    else if (col === 'time' || col === '<time>') timeIdx = i;
    else if (col === 'timestamp' || col === 'datetime' || col === 'epoch') timestampIdx = i;
    else if (col === 'open' || col === '<open>') openIdx = i;
    else if (col === 'high' || col === '<high>') highIdx = i;
    else if (col === 'low' || col === '<low>') lowIdx = i;
    else if (col === 'close' || col === '<close>') closeIdx = i;
    else if (col.includes('vol') || col === '<vol>' || col === '<tickvol>') volIdx = i;
    else if (col === 'spread' || col === '<spread>') spreadIdx = i;
  }

  // Default MT5 indices if header was standard or not explicitly matched
  if (dateIdx === -1 && openIdx === -1) {
    // Check if row 0 was actually data
    const maybeNum = Number(headerParts[0]);
    if (isNaN(maybeNum)) {
      // It was a header with unrecognized labels
    }
  }

  const startLine = (dateIdx !== -1 || openIdx !== -1 || timestampIdx !== -1) ? 1 : 0;

  // Fallbacks if header didn't specify
  if (dateIdx === -1 && timeIdx === -1 && timestampIdx === -1) {
    dateIdx = 0;
    timeIdx = 1;
    openIdx = 2;
    highIdx = 3;
    lowIdx = 4;
    closeIdx = 5;
    volIdx = 6;
  }

  for (let r = startLine; r < lines.length; r++) {
    const row = lines[r];
    const parts = row.split(/[,;\t]/).map((p) => p.trim().replace(/['"]/g, ''));
    if (parts.length < 4) {
      errors.push(`Row ${r + 1}: Insufficient columns`);
      continue;
    }

    try {
      let epochSec = 0;

      if (timestampIdx !== -1 && parts[timestampIdx]) {
        const raw = parts[timestampIdx];
        const num = Number(raw);
        if (!isNaN(num)) {
          epochSec = num > 1e11 ? Math.floor(num / 1000) : num;
        } else {
          epochSec = Math.floor(new Date(raw).getTime() / 1000);
        }
      } else if (dateIdx !== -1 && timeIdx !== -1 && parts[dateIdx] && parts[timeIdx]) {
        const dStr = parts[dateIdx].replace(/\./g, '-');
        const tStr = parts[timeIdx];
        const combined = `${dStr}T${tStr}Z`;
        const parsedMs = Date.parse(combined);
        if (isNaN(parsedMs)) {
          // Try local fallback
          const dt = new Date(`${dStr} ${tStr}`);
          epochSec = Math.floor(dt.getTime() / 1000);
        } else {
          epochSec = Math.floor(parsedMs / 1000);
        }
      } else if (dateIdx !== -1 && parts[dateIdx]) {
        epochSec = Math.floor(new Date(parts[dateIdx]).getTime() / 1000);
      }

      // Apply broker UTC offset if provided
      if (offsetHours !== 0) {
        epochSec -= offsetHours * 3600;
      }

      const open = parseFloat(parts[openIdx !== -1 ? openIdx : 2]);
      const high = parseFloat(parts[highIdx !== -1 ? highIdx : 3]);
      const low = parseFloat(parts[lowIdx !== -1 ? lowIdx : 4]);
      const close = parseFloat(parts[closeIdx !== -1 ? closeIdx : 5]);
      const tickVolume = volIdx !== -1 && parts[volIdx] ? parseFloat(parts[volIdx]) : 100;
      const spread = spreadIdx !== -1 && parts[spreadIdx] ? parseFloat(parts[spreadIdx]) : 0;

      if (isNaN(epochSec) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        errors.push(`Row ${r + 1}: Invalid numeric conversion`);
        continue;
      }

      candles.push({
        time: epochSec,
        open,
        high,
        low,
        close,
        tickVolume: isNaN(tickVolume) ? 100 : tickVolume,
        spread: isNaN(spread) ? 0 : spread,
      });
    } catch (err: any) {
      errors.push(`Row ${r + 1}: ${err.message}`);
    }
  }

  // Sort ascending by time
  candles.sort((a, b) => a.time - b.time);

  return { candles, errors };
}
