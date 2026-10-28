import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  Candle,
  DatasetRecord,
  ForexSymbol,
  Timeframe,
  PositionRecord,
  OrderRecord,
  RiskEvent,
} from '../types/forex';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'zaboraa.sqlite');

export const db = new Database(DB_PATH);

// Configure WAL mode and full synchronous for durability
db.pragma('journal_mode = WAL');
db.pragma('synchronous = FULL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    time INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    tick_volume REAL NOT NULL,
    spread REAL NOT NULL,
    PRIMARY KEY (symbol, timeframe, time)
  );
  CREATE INDEX IF NOT EXISTS idx_candles_range ON candles (symbol, timeframe, time);

  CREATE TABLE IF NOT EXISTS data_catalog (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    provenance TEXT NOT NULL,
    candle_count INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_research_eligible INTEGER NOT NULL,
    quality_score REAL NOT NULL,
    gap_count INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    utc_offset_hours INTEGER NOT NULL,
    broker_server TEXT,
    file_name TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    version TEXT NOT NULL,
    params_json TEXT NOT NULL,
    code TEXT NOT NULL,
    pine_source TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE NOT NULL,
    bot_id TEXT,
    magic_number INTEGER,
    ticket INTEGER,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    volume REAL NOT NULL,
    intent_price REAL NOT NULL,
    fill_price REAL,
    sl REAL NOT NULL,
    tp REAL,
    status TEXT NOT NULL,
    comment TEXT,
    created_at INTEGER NOT NULL,
    filled_at INTEGER,
    reject_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS positions (
    ticket INTEGER PRIMARY KEY,
    bot_id TEXT,
    magic_number INTEGER,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    volume REAL NOT NULL,
    open_price REAL NOT NULL,
    current_price REAL NOT NULL,
    sl REAL NOT NULL,
    tp REAL,
    pnl REAL NOT NULL,
    swap REAL NOT NULL,
    commission REAL NOT NULL,
    open_time INTEGER NOT NULL,
    comment TEXT,
    mode TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS risk_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    severity TEXT NOT NULL,
    rule TEXT NOT NULL,
    message TEXT NOT NULL,
    details_json TEXT
  );

  CREATE TABLE IF NOT EXISTS backtest_results (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    bar_count INTEGER NOT NULL,
    provenance TEXT NOT NULL,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cot_reports (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    report_date TEXT NOT NULL,
    non_commercial_long INTEGER NOT NULL,
    non_commercial_short INTEGER NOT NULL,
    commercial_long INTEGER NOT NULL,
    commercial_short INTEGER NOT NULL,
    non_reportable_long INTEGER NOT NULL,
    non_reportable_short INTEGER NOT NULL,
    net_speculator_position INTEGER NOT NULL,
    net_commercial_position INTEGER NOT NULL,
    cot_index REAL NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS macro_indicators (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    indicator_name TEXT NOT NULL,
    region TEXT NOT NULL,
    current_value REAL NOT NULL,
    previous_value REAL NOT NULL,
    forecast_value REAL,
    unit TEXT NOT NULL,
    release_date TEXT NOT NULL,
    impact TEXT NOT NULL,
    bias TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

/**
 * Save candles into SQLite in a single transaction (append-only / replace on conflict)
 */
export function saveCandlesToDb(
  symbol: ForexSymbol,
  timeframe: Timeframe,
  candles: Candle[]
): number {
  if (candles.length === 0) return 0;

  const insert = db.prepare(`
    INSERT INTO candles (symbol, timeframe, time, open, high, low, close, tick_volume, spread)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, timeframe, time) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      tick_volume = excluded.tick_volume,
      spread = excluded.spread
  `);

  const tx = db.transaction((rows: Candle[]) => {
    let count = 0;
    for (const c of rows) {
      insert.run(
        symbol,
        timeframe,
        c.time,
        c.open,
        c.high,
        c.low,
        c.close,
        c.tickVolume,
        c.spread
      );
      count++;
    }
    return count;
  });

  return tx(candles);
}

/**
 * Load candles from SQLite by symbol, timeframe, and optional timestamp bounds
 */
export function loadCandlesFromDb(
  symbol: ForexSymbol,
  timeframe: Timeframe,
  fromTime?: number,
  toTime?: number,
  limit?: number
): Candle[] {
  let query = 'SELECT time, open, high, low, close, tick_volume as tickVolume, spread FROM candles WHERE symbol = ? AND timeframe = ?';
  const params: any[] = [symbol, timeframe];

  if (fromTime !== undefined) {
    query += ' AND time >= ?';
    params.push(fromTime);
  }
  if (toTime !== undefined) {
    query += ' AND time <= ?';
    params.push(toTime);
  }

  query += ' ORDER BY time ASC';

  if (limit) {
    query += ' LIMIT ?';
    params.push(limit);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as any[];

  return rows.map((r) => ({
    time: r.time,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    tickVolume: r.tickVolume,
    spread: r.spread,
  }));
}

/**
 * Update Data Catalog record in SQLite
 */
export function upsertCatalogRecord(record: DatasetRecord): void {
  const stmt = db.prepare(`
    INSERT INTO data_catalog (
      id, symbol, timeframe, provenance, candle_count, start_date, end_date,
      is_research_eligible, quality_score, gap_count, sha256, utc_offset_hours,
      broker_server, file_name, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      candle_count = excluded.candle_count,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_research_eligible = excluded.is_research_eligible,
      quality_score = excluded.quality_score,
      gap_count = excluded.gap_count,
      sha256 = excluded.sha256,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    record.id,
    record.symbol,
    record.timeframe,
    record.provenance,
    record.candleCount,
    record.startDate,
    record.endDate,
    record.isResearchEligible ? 1 : 0,
    record.qualityScore,
    record.gapCount,
    record.sha256,
    record.utcOffsetHours,
    record.brokerServer || null,
    record.fileName || null,
    new Date().toISOString()
  );
}

/**
 * Get all Data Catalog entries from SQLite
 */
export function getCatalogRecords(): Omit<DatasetRecord, 'candles'>[] {
  const stmt = db.prepare('SELECT * FROM data_catalog ORDER BY symbol ASC, timeframe ASC');
  const rows = stmt.all() as any[];

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    timeframe: r.timeframe,
    provenance: r.provenance,
    candleCount: r.candle_count,
    startDate: r.start_date,
    endDate: r.end_date,
    isResearchEligible: r.is_research_eligible === 1,
    qualityScore: r.quality_score,
    gapCount: r.gap_count,
    sha256: r.sha256,
    utcOffsetHours: r.utc_offset_hours,
    brokerServer: r.broker_server || undefined,
    fileName: r.file_name || undefined,
  }));
}

export function saveStrategyToDb(strategy: {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  params: Record<string, any>;
  code: string;
  pineSource?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO strategies (id, name, description, author, version, params_json, code, pine_source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      author = excluded.author,
      version = excluded.version,
      params_json = excluded.params_json,
      code = excluded.code,
      pine_source = excluded.pine_source,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    strategy.id,
    strategy.name,
    strategy.description,
    strategy.author,
    strategy.version,
    JSON.stringify(strategy.params || {}),
    strategy.code,
    strategy.pineSource || null,
    new Date().toISOString()
  );
}

export function getStrategiesFromDb(): Array<{
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  params: Record<string, any>;
  code: string;
  pineSource?: string;
}> {
  const stmt = db.prepare('SELECT * FROM strategies ORDER BY name ASC');
  const rows = stmt.all() as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    author: r.author,
    version: r.version,
    params: JSON.parse(r.params_json || '{}'),
    code: r.code,
    pineSource: r.pine_source || undefined,
  }));
}

export function deleteStrategyFromDb(id: string): void {
  const stmt = db.prepare('DELETE FROM strategies WHERE id = ?');
  stmt.run(id);
}
