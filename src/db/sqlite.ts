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
  BacktestReport,
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

  CREATE TABLE IF NOT EXISTS smartmoney_cot (
    market TEXT NOT NULL,
    report_date TEXT NOT NULL,
    open_interest REAL NOT NULL,
    long REAL NOT NULL,
    short REAL NOT NULL,
    net REAL NOT NULL,
    net_pct_oi REAL NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    effective_at TEXT NOT NULL,
    PRIMARY KEY (market, report_date)
  );

  CREATE TABLE IF NOT EXISTS smartmoney_signals (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    bar_time INTEGER NOT NULL,
    direction TEXT NOT NULL,
    score REAL NOT NULL,
    confidence REAL NOT NULL,
    c_cot REAL NOT NULL,
    c_act REAL NOT NULL,
    c_trend REAL NOT NULL,
    event_type TEXT NOT NULL,
    vol_z REAL NOT NULL,
    range_atr REAL NOT NULL,
    close_loc REAL NOT NULL,
    is_crowded INTEGER NOT NULL,
    is_stale INTEGER NOT NULL,
    is_baseline_fallback INTEGER NOT NULL,
    invalidation_price REAL NOT NULL,
    expires_at INTEGER NOT NULL,
    config_hash TEXT NOT NULL,
    strategy_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    disclaimer TEXT NOT NULL,
    UNIQUE(symbol, bar_time, strategy_version)
  );

  CREATE TABLE IF NOT EXISTS smartmoney_outcomes (
    id TEXT PRIMARY KEY,
    signal_id TEXT NOT NULL,
    horizon_hours INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL NOT NULL,
    return_pips_or_points REAL NOT NULL,
    return_atr REAL NOT NULL,
    cost_applied REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(signal_id, horizon_hours)
  );

  CREATE TABLE IF NOT EXISTS smartmoney_bars (
    symbol TEXT NOT NULL,
    bar_time INTEGER NOT NULL,
    c_cot REAL NOT NULL,
    c_act REAL NOT NULL,
    c_trend REAL NOT NULL,
    score REAL NOT NULL,
    direction TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (symbol, bar_time)
  );

  CREATE TABLE IF NOT EXISTS external_fetch_log (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    ok INTEGER NOT NULL,
    rows_ingested INTEGER NOT NULL,
    error TEXT
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

// ==========================================
// BACKTEST RESULTS PERSISTENCE
// ==========================================

export function saveBacktestResultToDb(report: BacktestReport): void {
  const stmt = db.prepare(`
    INSERT INTO backtest_results (
      id, strategy_id, strategy_name, symbol, timeframe, period_start, period_end,
      bar_count, provenance, report_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      report_json = excluded.report_json,
      created_at = excluded.created_at
  `);

  stmt.run(
    report.id,
    report.strategyId,
    report.strategyName,
    report.symbol,
    report.timeframe,
    report.periodStart,
    report.periodEnd,
    report.barCount,
    report.provenance,
    JSON.stringify(report),
    new Date().toISOString()
  );
}

export function getBacktestResultsFromDb(): BacktestReport[] {
  const stmt = db.prepare('SELECT report_json FROM backtest_results ORDER BY created_at DESC');
  const rows = stmt.all() as Array<{ report_json: string }>;
  const reports: BacktestReport[] = [];
  for (const r of rows) {
    try {
      reports.push(JSON.parse(r.report_json));
    } catch {}
  }
  return reports;
}

export function deleteBacktestResultFromDb(id: string): void {
  const stmt = db.prepare('DELETE FROM backtest_results WHERE id = ?');
  stmt.run(id);
}

// ==========================================
// SMART MONEY FOOTPRINT PERSISTENCE
// ==========================================

export interface SmartMoneyCotRow {
  market: string;
  report_date: string;
  open_interest: number;
  long: number;
  short: number;
  net: number;
  net_pct_oi: number;
  source: string;
  fetched_at: string;
  effective_at: string;
}

export function upsertSmartMoneyCot(rows: SmartMoneyCotRow[]): number {
  if (rows.length === 0) return 0;
  const insert = db.prepare(`
    INSERT INTO smartmoney_cot (
      market, report_date, open_interest, long, short, net, net_pct_oi, source, fetched_at, effective_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(market, report_date) DO UPDATE SET
      open_interest = excluded.open_interest,
      long = excluded.long,
      short = excluded.short,
      net = excluded.net,
      net_pct_oi = excluded.net_pct_oi,
      source = excluded.source,
      fetched_at = excluded.fetched_at,
      effective_at = excluded.effective_at
  `);

  const tx = db.transaction((items: SmartMoneyCotRow[]) => {
    let count = 0;
    for (const r of items) {
      insert.run(
        r.market,
        r.report_date,
        r.open_interest,
        r.long,
        r.short,
        r.net,
        r.net_pct_oi,
        r.source,
        r.fetched_at,
        r.effective_at
      );
      count++;
    }
    return count;
  });

  return tx(rows);
}

export function getSmartMoneyCotRows(market: string, asOfTimeUtc?: string): SmartMoneyCotRow[] {
  let query = 'SELECT * FROM smartmoney_cot WHERE market = ?';
  const params: any[] = [market];
  if (asOfTimeUtc) {
    query += ' AND effective_at <= ?';
    params.push(asOfTimeUtc);
  }
  query += ' ORDER BY report_date ASC';
  const stmt = db.prepare(query);
  return stmt.all(...params) as SmartMoneyCotRow[];
}

export function saveSmartMoneySignal(signal: {
  id: string;
  symbol: string;
  bar_time: number;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  score: number;
  confidence: number;
  c_cot: number;
  c_act: number;
  c_trend: number;
  event_type: string;
  vol_z: number;
  range_atr: number;
  close_loc: number;
  is_crowded: boolean | number;
  is_stale: boolean | number;
  is_baseline_fallback: boolean | number;
  invalidation_price: number;
  expires_at: number;
  config_hash: string;
  strategy_version: string;
  created_at: string;
  disclaimer: string;
}): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO smartmoney_signals (
      id, symbol, bar_time, direction, score, confidence, c_cot, c_act, c_trend,
      event_type, vol_z, range_atr, close_loc, is_crowded, is_stale, is_baseline_fallback,
      invalidation_price, expires_at, config_hash, strategy_version, created_at, disclaimer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    signal.id,
    signal.symbol,
    signal.bar_time,
    signal.direction,
    signal.score,
    signal.confidence,
    signal.c_cot,
    signal.c_act,
    signal.c_trend,
    signal.event_type,
    signal.vol_z,
    signal.range_atr,
    signal.close_loc,
    signal.is_crowded ? 1 : 0,
    signal.is_stale ? 1 : 0,
    signal.is_baseline_fallback ? 1 : 0,
    signal.invalidation_price,
    signal.expires_at,
    signal.config_hash,
    signal.strategy_version,
    signal.created_at,
    signal.disclaimer
  );
}

export function getSmartMoneySignals(options: {
  symbol?: string;
  limit?: number;
  from?: number;
  to?: number;
}): any[] {
  let query = 'SELECT * FROM smartmoney_signals WHERE 1=1';
  const params: any[] = [];
  if (options.symbol) {
    query += ' AND symbol = ?';
    params.push(options.symbol);
  }
  if (options.from !== undefined) {
    query += ' AND bar_time >= ?';
    params.push(options.from);
  }
  if (options.to !== undefined) {
    query += ' AND bar_time <= ?';
    params.push(options.to);
  }
  query += ' ORDER BY bar_time DESC';
  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

export function getSmartMoneySignalById(id: string): any {
  const stmt = db.prepare('SELECT * FROM smartmoney_signals WHERE id = ?');
  return stmt.get(id);
}

export function saveSmartMoneyOutcome(outcome: {
  id: string;
  signal_id: string;
  horizon_hours: number;
  entry_price: number;
  exit_price: number;
  return_pips_or_points: number;
  return_atr: number;
  cost_applied: number;
  computed_at: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO smartmoney_outcomes (
      id, signal_id, horizon_hours, entry_price, exit_price, return_pips_or_points,
      return_atr, cost_applied, computed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(signal_id, horizon_hours) DO UPDATE SET
      entry_price = excluded.entry_price,
      exit_price = excluded.exit_price,
      return_pips_or_points = excluded.return_pips_or_points,
      return_atr = excluded.return_atr,
      cost_applied = excluded.cost_applied,
      computed_at = excluded.computed_at
  `);

  stmt.run(
    outcome.id,
    outcome.signal_id,
    outcome.horizon_hours,
    outcome.entry_price,
    outcome.exit_price,
    outcome.return_pips_or_points,
    outcome.return_atr,
    outcome.cost_applied,
    outcome.computed_at
  );
}

export function getSmartMoneyOutcomes(signalIds?: string[]): any[] {
  if (!signalIds || signalIds.length === 0) {
    const stmt = db.prepare('SELECT * FROM smartmoney_outcomes');
    return stmt.all();
  }
  const placeholders = signalIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM smartmoney_outcomes WHERE signal_id IN (${placeholders})`);
  return stmt.all(...signalIds);
}

export function saveSmartMoneyBar(bar: {
  symbol: string;
  bar_time: number;
  c_cot: number;
  c_act: number;
  c_trend: number;
  score: number;
  direction: string;
  created_at: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO smartmoney_bars (symbol, bar_time, c_cot, c_act, c_trend, score, direction, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol, bar_time) DO UPDATE SET
      c_cot = excluded.c_cot,
      c_act = excluded.c_act,
      c_trend = excluded.c_trend,
      score = excluded.score,
      direction = excluded.direction
  `);

  stmt.run(
    bar.symbol,
    bar.bar_time,
    bar.c_cot,
    bar.c_act,
    bar.c_trend,
    bar.score,
    bar.direction,
    bar.created_at
  );
}

export function getSmartMoneyBars(symbol: string, limit = 500): any[] {
  const stmt = db.prepare('SELECT * FROM smartmoney_bars WHERE symbol = ? ORDER BY bar_time DESC LIMIT ?');
  return stmt.all(symbol, limit);
}

export function logExternalFetch(entry: {
  id: string;
  source: string;
  started_at: string;
  completed_at?: string;
  ok: boolean;
  rows_ingested: number;
  error?: string;
}): void {
  const stmt = db.prepare(`
    INSERT INTO external_fetch_log (id, source, started_at, completed_at, ok, rows_ingested, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    entry.id,
    entry.source,
    entry.started_at,
    entry.completed_at || new Date().toISOString(),
    entry.ok ? 1 : 0,
    entry.rows_ingested,
    entry.error || null
  );
}

export function getExternalFetchStatus(source = 'CFTC_COT'): any {
  const stmt = db.prepare('SELECT * FROM external_fetch_log WHERE source = ? ORDER BY started_at DESC LIMIT 1');
  return stmt.get(source);
}

