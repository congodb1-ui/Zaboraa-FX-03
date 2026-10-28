import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Candle, DataIntegrityReport, SymbolName, Timeframe } from '../types/forex';
import { getDb } from './db';

const CANDLE_DIR = path.resolve(process.cwd(), 'data', 'candles');

/**
 * Ensures directory hierarchy exists
 */
function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Computes SHA-256 hash of a candle array
 */
export function computeCandlesHash(candles: Candle[]): string {
  const hash = crypto.createHash('sha256');
  for (const c of candles) {
    hash.update(`${c.time}:${c.open}:${c.high}:${c.low}:${c.close}:${c.tickVolume || 0},`);
  }
  return hash.digest('hex');
}

/**
 * Runs thorough integrity analysis on a candle dataset
 */
export function auditCandleIntegrity(candles: Candle[], timeframe: Timeframe): DataIntegrityReport {
  if (candles.length === 0) {
    return {
      totalBars: 0,
      validBars: 0,
      gapCount: 0,
      duplicateCount: 0,
      invalidOhlcCount: 0,
      gaps: [],
      invalidBars: [],
      sha256Hash: '',
      qualityScore: 100,
    };
  }

  // Sort ascending by timestamp
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const gaps: { startTime: number; endTime: number; missingBarsEstimated: number }[] = [];
  const invalidBars: { time: number; reason: string }[] = [];

  let duplicateCount = 0;
  let invalidOhlcCount = 0;

  // Expected bar step in seconds
  const stepMap: Record<Timeframe, number> = {
    M1: 60,
    M5: 300, M10: 600,
    M15: 900, M30: 1800,
    H1: 3600, H3: 10800, H4: 14400,
    D1: 86400,
  };
  const expectedStep = stepMap[timeframe] || 3600;

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];

    // OHLC validation: H must be >= L, O, C; L must be <= H, O, C
    if (c.high < c.low || c.open > c.high || c.close > c.high || c.open < c.low || c.close < c.low) {
      invalidOhlcCount++;
      if (invalidBars.length < 20) {
        invalidBars.push({
          time: c.time,
          reason: `Invalid OHLC bounds: O=${c.open}, H=${c.high}, L=${c.low}, C=${c.close}`,
        });
      }
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const diff = c.time - prev.time;

      if (diff === 0) {
        duplicateCount++;
      } else if (diff > expectedStep * 1.5) {
        // Exclude normal weekend gap for forex (Friday 22:00 UTC to Sunday 22:00 UTC ~ 48h)
        const isWeekend = diff >= 86400 * 1.8 && diff <= 86400 * 2.5;
        if (!isWeekend) {
          const missingBars = Math.floor(diff / expectedStep) - 1;
          if (missingBars > 0 && gaps.length < 30) {
            gaps.push({
              startTime: prev.time,
              endTime: c.time,
              missingBarsEstimated: missingBars,
            });
          }
        }
      }
    }
  }

  const sha256Hash = computeCandlesHash(sorted);
  const totalGaps = gaps.length;
  const invalidTotal = invalidOhlcCount + duplicateCount;
  const errorRate = (invalidTotal + totalGaps * 2) / Math.max(1, sorted.length);
  const qualityScore = Math.max(0, Math.min(100, Math.round((1 - errorRate) * 100)));

  return {
    totalBars: sorted.length,
    validBars: sorted.length - invalidOhlcCount,
    gapCount: totalGaps,
    duplicateCount,
    invalidOhlcCount,
    gaps,
    invalidBars,
    sha256Hash,
    qualityScore,
  };
}

/**
 * Saves candles atomically to disk partitioned by symbol/timeframe/year,
 * writes to .tmp first, and updates SQLite catalog metadata.
 */
export async function savePartitionedCandles(
  symbol: SymbolName, timeframe: Timeframe, candles: Candle[]
): Promise<DataIntegrityReport> {
  const audit = auditCandleIntegrity(candles, timeframe);
  const db = getDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(`INSERT INTO candles
    (symbol,timeframe,time,open,high,low,close,tick_volume,spread,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(symbol,timeframe,time) DO UPDATE SET
    open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,
    tick_volume=excluded.tick_volume,spread=excluded.spread,updated_at=excluded.updated_at`);
  db.exec('BEGIN IMMEDIATE');
  try { for (const c of candles) upsert.run(symbol,timeframe,Math.floor(c.time),c.open,c.high,c.low,c.close,c.tickVolume||0,c.spread||0,now); db.exec('COMMIT'); }
  catch (err) { db.exec('ROLLBACK'); throw err; }
  // Maintain the legacy year catalog shape for compatibility with existing UI.
  const byYear = new Map<number, Candle[]>();
  for (const c of candles) { const y = new Date(c.time * 1000).getUTCFullYear(); byYear.set(y, [...(byYear.get(y) || []), c]); }
  for (const [year, rows] of byYear) {
    const all = loadSqliteCandles(symbol, timeframe, yearStart(year), yearEnd(year));
    const id = `${symbol}_${timeframe}_${year}`;
    db.prepare(`INSERT INTO data_catalog(id,symbol,timeframe,year,file_path,sha256_hash,first_candle_time,last_candle_time,candle_count,gap_count,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET file_path=excluded.file_path,sha256_hash=excluded.sha256_hash,
      first_candle_time=excluded.first_candle_time,last_candle_time=excluded.last_candle_time,candle_count=excluded.candle_count,
      gap_count=excluded.gap_count,updated_at=excluded.updated_at`).run(id,symbol,timeframe,year,'sqlite:candles',computeCandlesHash(all),all[0]?.time??null,all.at(-1)?.time??null,all.length,audit.gapCount,now);
  }
  return audit;
}
function yearStart(y:number){return Math.floor(Date.UTC(y,0,1)/1000)}
function yearEnd(y:number){return Math.floor(Date.UTC(y+1,0,1)/1000)-1}
function loadSqliteCandles(symbol: SymbolName, timeframe: Timeframe, start?: number, end?: number): Candle[] {
  const db=getDb(); let sql='SELECT time,open,high,low,close,tick_volume AS tickVolume,spread FROM candles WHERE symbol=? AND timeframe=?';
  const args:any[]=[symbol,timeframe]; if(start!==undefined){sql+=' AND time>=?';args.push(start)} if(end!==undefined){sql+=' AND time<=?';args.push(end)}
  sql+=' ORDER BY time ASC'; return db.prepare(sql).all(...args) as unknown as Candle[];
}

/** Loads canonical SQLite candles; migrates old year JSON partitions on first access. */
export async function loadPartitionedCandles(symbol: SymbolName, timeframe: Timeframe, startTimeSec?: number, endTimeSec?: number): Promise<Candle[]> {
  const db=getDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM candles WHERE symbol=? AND timeframe=?').get(symbol,timeframe) as any).n as number;
  if (count === 0) {
    const partitionDir=path.join(CANDLE_DIR,symbol,timeframe);
    if(fs.existsSync(partitionDir)) {
      const files=(await fs.promises.readdir(partitionDir)).filter(f=>/^\d{4}\.json$/.test(f));
      for(const file of files) { try { const rows=JSON.parse(await fs.promises.readFile(path.join(partitionDir,file),'utf8')) as Candle[]; const stmt=db.prepare('INSERT OR IGNORE INTO candles(symbol,timeframe,time,open,high,low,close,tick_volume,spread,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)'); db.exec('BEGIN IMMEDIATE'); try { for(const c of rows) stmt.run(symbol,timeframe,c.time,c.open,c.high,c.low,c.close,c.tickVolume||0,c.spread||0,new Date().toISOString()); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; } } catch(e){ console.error('Legacy candle migration failed',file,e); } }
    }
  }
  const exact = loadSqliteCandles(symbol,timeframe,startTimeSec,endTimeSec);
  if (exact.length > 0) return exact;

  // Compatibility lookup for historical data saved before symbol canonicalization.
  // Prefer an exact match; only query a suffix alias when the exact symbol has no bars.
  const upper = String(symbol).toUpperCase();
  const base = upper.endsWith('M') ? upper.slice(0, -1) : upper;
  if (!/^[A-Z]{6}$/.test(base) && base !== 'XAUUSD' && base !== 'XAGUSD') return [];
  const candidates = upper.endsWith('M') ? [base] : [`${base}m`, `${base}M`];
  for (const candidate of candidates) {
    const aliasCount = (db.prepare('SELECT COUNT(*) AS n FROM candles WHERE symbol=? AND timeframe=?').get(candidate,timeframe) as any).n as number;
    if (aliasCount > 0) return loadSqliteCandles(candidate as SymbolName,timeframe,startTimeSec,endTimeSec);
  }
  return [];
}

/**
 * Retrieves the Data Catalog entries from SQLite
 */
export function getDataCatalog() {
  const db = getDb();
  return db.prepare('SELECT * FROM data_catalog ORDER BY symbol, timeframe, year ASC').all();
}
