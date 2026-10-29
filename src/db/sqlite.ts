import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (fs.existsSync(DB_PATH)) {
  try {
    const backupFile = path.join(BACKUP_DIR, `zaboraa_pre_firewall_${Date.now()}.sqlite`);
    fs.copyFileSync(DB_PATH, backupFile);
  } catch (err) {
    console.warn('Pre-migration backup warning:', err);
  }
}

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

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS broker_accounts (
    id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    broker TEXT NOT NULL,
    server TEXT NOT NULL,
    login TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    last_connection TEXT NOT NULL,
    max_lots REAL NOT NULL,
    risk_pct REAL NOT NULL,
    is_live_approved INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_account_assignments (
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    PRIMARY KEY (user_id, account_id)
  );

  CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS risk_firewall_settings (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );

  CREATE TABLE IF NOT EXISTS risk_firewall_state (
    scope TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    disabled_at TEXT,
    disabled_until TEXT,
    disabled_by TEXT,
    reason TEXT
  );

  CREATE TABLE IF NOT EXISTS risk_firewall_audit (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    role TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    reason TEXT NOT NULL,
    prev_hash TEXT,
    hash TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS prevent_firewall_audit_update BEFORE UPDATE ON risk_firewall_audit
  BEGIN
    SELECT RAISE(ABORT, 'risk_firewall_audit is append-only: UPDATE forbidden');
  END;

  CREATE TRIGGER IF NOT EXISTS prevent_firewall_audit_delete BEFORE DELETE ON risk_firewall_audit
  BEGIN
    SELECT RAISE(ABORT, 'risk_firewall_audit is append-only: DELETE forbidden');
  END;

  CREATE TABLE IF NOT EXISTS blocked_orders_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    attempted_lots REAL NOT NULL,
    attempted_risk_usd REAL NOT NULL,
    rule_violated TEXT NOT NULL,
    suggested_lots REAL,
    error_message TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS prevent_blocked_orders_update BEFORE UPDATE ON blocked_orders_log
  BEGIN
    SELECT RAISE(ABORT, 'blocked_orders_log is append-only: UPDATE forbidden');
  END;

  CREATE TRIGGER IF NOT EXISTS prevent_blocked_orders_delete BEFORE DELETE ON blocked_orders_log
  BEGIN
    SELECT RAISE(ABORT, 'blocked_orders_log is append-only: DELETE forbidden');
  END;

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chart_layouts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    chart_type TEXT NOT NULL,
    indicators TEXT NOT NULL,
    moving_averages TEXT NOT NULL,
    created_at TEXT NOT NULL,
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
        c.spread ?? (symbol === 'XAUUSD' ? 25.0 : 1.2)
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

/**
 * Returns comprehensive statistics of all historical candle data stored in SQLite.
 * Confirms that all data is permanently persisted and never automatically purged.
 */
export function getHistoricalStorageSummary(): {
  totalCandles: number;
  datasets: Array<{
    symbol: string;
    timeframe: string;
    candleCount: number;
    minTime: number;
    maxTime: number;
    minDateIso: string;
    maxDateIso: string;
  }>;
  persisted: boolean;
  message: string;
} {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM candles').get() as { count: number };
  const totalCandles = countRow?.count || 0;

  const datasetRows = db.prepare(`
    SELECT 
      symbol, 
      timeframe, 
      COUNT(*) as candleCount, 
      MIN(time) as minTime, 
      MAX(time) as maxTime 
    FROM candles 
    GROUP BY symbol, timeframe 
    ORDER BY symbol ASC, timeframe ASC
  `).all() as any[];

  const datasets = datasetRows.map((r) => ({
    symbol: r.symbol,
    timeframe: r.timeframe,
    candleCount: r.candleCount,
    minTime: r.minTime,
    maxTime: r.maxTime,
    minDateIso: r.minTime ? new Date(r.minTime * 1000).toISOString() : '',
    maxDateIso: r.maxTime ? new Date(r.maxTime * 1000).toISOString() : '',
  }));

  return {
    totalCandles,
    datasets,
    persisted: true,
    message: 'All historical market data is permanently stored in SQLite (data/zaboraa.sqlite) and never purged.',
  };
}

/**
 * Loads paginated historical candles across any symbol and timeframe so that
 * the user can inspect every single candle stored in SQLite.
 */
export function getStoredCandlesPaginated(
  symbol?: string,
  timeframe?: string,
  page: number = 1,
  pageSize: number = 50
): {
  candles: Candle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(500, pageSize));
  const offset = (safePage - 1) * safePageSize;

  let countQuery = 'SELECT COUNT(*) as count FROM candles WHERE 1=1';
  let dataQuery = 'SELECT time, open, high, low, close, tick_volume as tickVolume, spread FROM candles WHERE 1=1';
  const params: any[] = [];

  if (symbol && symbol !== 'ALL') {
    countQuery += ' AND symbol = ?';
    dataQuery += ' AND symbol = ?';
    params.push(symbol);
  }

  if (timeframe && timeframe !== 'ALL') {
    countQuery += ' AND timeframe = ?';
    dataQuery += ' AND timeframe = ?';
    params.push(timeframe);
  }

  dataQuery += ' ORDER BY time DESC LIMIT ? OFFSET ?';
  const dataParams = [...params, safePageSize, offset];

  const totalRow = db.prepare(countQuery).get(...params) as { count: number };
  const total = totalRow?.count || 0;
  const rows = db.prepare(dataQuery).all(...dataParams) as any[];

  const candles: Candle[] = rows.map((r) => ({
    time: r.time,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    tickVolume: r.tickVolume,
    spread: r.spread,
  }));

  return {
    candles,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

/**
 * Record an action to the administrative audit log
 */
export function recordAuditLog(username: string, role: string, action: string, details?: string): void {
  const stmt = db.prepare(`
    INSERT INTO admin_audit_logs (id, timestamp, username, role, action, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    'audit-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    new Date().toISOString(),
    username,
    role,
    action,
    details || ''
  );
}

/**
 * Retrieve recent administrative audit logs
 */
export function getAuditLogs(limit: number = 50): any[] {
  const stmt = db.prepare('SELECT * FROM admin_audit_logs ORDER BY timestamp DESC LIMIT ?');
  return stmt.all(limit);
}

/**
 * Retrieve registered broker accounts
 */
export function getBrokerAccounts(): any[] {
  const stmt = db.prepare('SELECT * FROM broker_accounts ORDER BY created_at DESC');
  let accounts = stmt.all();

  // Pre-seed default demo account if empty
  if (accounts.length === 0) {
    const seedAccount = {
      id: 'acc-exness-demo-main',
      account_name: 'Exness Standard Trial 9 (Primary)',
      broker: 'Exness',
      server: 'Exness-MT5Trial9',
      login: '50192834',
      type: 'DEMO',
      status: 'CONNECTED',
      last_connection: new Date().toISOString(),
      max_lots: 2.0,
      risk_pct: 1.0,
      is_live_approved: 0,
      created_at: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO broker_accounts (
        id, account_name, broker, server, login, type, status, last_connection, max_lots, risk_pct, is_live_approved, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      seedAccount.id,
      seedAccount.account_name,
      seedAccount.broker,
      seedAccount.server,
      seedAccount.login,
      seedAccount.type,
      seedAccount.status,
      seedAccount.last_connection,
      seedAccount.max_lots,
      seedAccount.risk_pct,
      seedAccount.is_live_approved,
      seedAccount.created_at
    );
    recordAuditLog('System', 'Master Admin', 'INITIALIZE_DEFAULT_ACCOUNT', 'Provisioned Exness Demo Account');
    accounts = [seedAccount];
  }

  return accounts;
}

/**
 * Create or update broker account
 */
export function upsertBrokerAccount(account: {
  id?: string;
  account_name: string;
  broker: string;
  server: string;
  login: string;
  type: string;
  status: string;
  max_lots: number;
  risk_pct: number;
  is_live_approved: boolean;
}): void {
  const id = account.id || 'acc-' + Date.now();
  const stmt = db.prepare(`
    INSERT INTO broker_accounts (
      id, account_name, broker, server, login, type, status, last_connection, max_lots, risk_pct, is_live_approved, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_name = excluded.account_name,
      broker = excluded.broker,
      server = excluded.server,
      login = excluded.login,
      type = excluded.type,
      status = excluded.status,
      max_lots = excluded.max_lots,
      risk_pct = excluded.risk_pct,
      is_live_approved = excluded.is_live_approved
  `);

  stmt.run(
    id,
    account.account_name,
    account.broker,
    account.server,
    account.login,
    account.type,
    account.status,
    new Date().toISOString(),
    account.max_lots,
    account.risk_pct,
    account.is_live_approved ? 1 : 0,
    new Date().toISOString()
  );
}

// ==========================================
// RISK FIREWALL & RBAC REPOSITORY
// ==========================================

export interface RiskFirewallSettingsMap {
  maxRiskPerTradePct: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  maxLots: number;
  maxOpenPositions: number;
  mandatoryStopLoss: boolean;
  maxSpreadPipsEURUSD: number;
  maxSpreadPipsGBPUSD: number;
  maxSpreadPipsUSDJPY: number;
  maxSpreadPointsXAUUSD: number;
  tradingHoursStartUtc: number;
  tradingHoursEndUtc: number;
  newsBlackoutMinutes: number;
}

export const DEFAULT_FIREWALL_SETTINGS: Record<'global:demo' | 'global:live', RiskFirewallSettingsMap> = {
  'global:demo': {
    maxRiskPerTradePct: 2.0,
    dailyLossLimitPct: 3.0,
    maxDrawdownPct: 10.0,
    maxLots: 1.0,
    maxOpenPositions: 5,
    mandatoryStopLoss: true,
    maxSpreadPipsEURUSD: 2.0,
    maxSpreadPipsGBPUSD: 2.5,
    maxSpreadPipsUSDJPY: 2.0,
    maxSpreadPointsXAUUSD: 40,
    tradingHoursStartUtc: 0,
    tradingHoursEndUtc: 24,
    newsBlackoutMinutes: 30,
  },
  'global:live': {
    maxRiskPerTradePct: 2.0,
    dailyLossLimitPct: 3.0,
    maxDrawdownPct: 10.0,
    maxLots: 0.5,
    maxOpenPositions: 5,
    mandatoryStopLoss: true,
    maxSpreadPipsEURUSD: 2.0,
    maxSpreadPipsGBPUSD: 2.5,
    maxSpreadPipsUSDJPY: 2.0,
    maxSpreadPointsXAUUSD: 40,
    tradingHoursStartUtc: 0,
    tradingHoursEndUtc: 24,
    newsBlackoutMinutes: 30,
  },
};

export const HARD_CEILINGS = {
  maxRiskPerTradePct: 5.0,
  dailyLossLimitPct: 10.0,
  maxLots: 10.0,
  maxOpenPositions: 20,
  maxDrawdownPct: 30.0,
};

// Seed default firewall settings and state on startup
export function seedFirewallDefaults(): void {
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO risk_firewall_settings (scope, key, value, updated_by, updated_at)
    VALUES (?, ?, ?, 'system:bootstrap', ?)
  `);
  const insertState = db.prepare(`
    INSERT OR IGNORE INTO risk_firewall_state (scope, enabled, disabled_at, disabled_until, disabled_by, reason)
    VALUES (?, 1, NULL, NULL, NULL, NULL)
  `);

  const now = new Date().toISOString();
  for (const [scope, settings] of Object.entries(DEFAULT_FIREWALL_SETTINGS)) {
    insertState.run(scope);
    for (const [k, v] of Object.entries(settings)) {
      insertSetting.run(scope, k, String(v), now);
    }
  }
}

seedFirewallDefaults();

export interface FirewallState {
  scope: string;
  enabled: boolean;
  disabledAt: string | null;
  disabledUntil: string | null;
  disabledBy: string | null;
  reason: string | null;
}

/**
 * Get firewall state for a scope with automatic 24h expiration check
 */
export function getFirewallState(scope: string): FirewallState {
  const row = db.prepare('SELECT * FROM risk_firewall_state WHERE scope = ?').get(scope) as any;
  if (!row) {
    db.prepare('INSERT INTO risk_firewall_state (scope, enabled) VALUES (?, 1)').run(scope);
    return {
      scope,
      enabled: true,
      disabledAt: null,
      disabledUntil: null,
      disabledBy: null,
      reason: null,
    };
  }

  // Auto-expiry check
  if (row.enabled === 0 && row.disabled_until) {
    const untilMs = new Date(row.disabled_until).getTime();
    if (Date.now() >= untilMs) {
      db.prepare(`
        UPDATE risk_firewall_state
        SET enabled = 1, disabled_at = NULL, disabled_until = NULL, disabled_by = NULL, reason = 'auto-expired'
        WHERE scope = ?
      `).run(scope);

      recordFirewallAudit({
        actor: 'system:auto-expiry',
        role: 'system',
        scope,
        key: 'firewall_enabled',
        old_value: '0',
        new_value: '1',
        reason: '24-hour auto-expiry expired; automatically restored firewall to ON',
      });

      return {
        scope,
        enabled: true,
        disabledAt: null,
        disabledUntil: null,
        disabledBy: null,
        reason: 'auto-expired',
      };
    }
  }

  return {
    scope: row.scope,
    enabled: Boolean(row.enabled),
    disabledAt: row.disabled_at || null,
    disabledUntil: row.disabled_until || null,
    disabledBy: row.disabled_by || null,
    reason: row.reason || null,
  };
}

/**
 * Update firewall state
 */
export function setFirewallState(
  scope: string,
  enabled: boolean,
  disabledBy?: string,
  reason?: string
): void {
  const now = new Date();
  const disabledAt = enabled ? null : now.toISOString();
  // 24 hours expiry
  const disabledUntil = enabled ? null : new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO risk_firewall_state (scope, enabled, disabled_at, disabled_until, disabled_by, reason)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope) DO UPDATE SET
      enabled = excluded.enabled,
      disabled_at = excluded.disabled_at,
      disabled_until = excluded.disabled_until,
      disabled_by = excluded.disabled_by,
      reason = excluded.reason
  `).run(scope, enabled ? 1 : 0, disabledAt, disabledUntil, disabledBy || null, reason || null);
}

/**
 * Get merged firewall settings for a scope, falling back to global:live or global:demo
 */
export function getFirewallSettings(
  scope: string,
  accountType: 'demo' | 'live' = 'demo'
): RiskFirewallSettingsMap {
  const globalScope = `global:${accountType}`;
  const baseDefaults = { ...DEFAULT_FIREWALL_SETTINGS[globalScope as 'global:demo' | 'global:live'] };

  // 1. Fetch global overrides from DB
  const globalRows = db
    .prepare('SELECT key, value FROM risk_firewall_settings WHERE scope = ?')
    .all(globalScope) as { key: string; value: string }[];
  for (const row of globalRows) {
    if (row.key in baseDefaults) {
      if (typeof (baseDefaults as any)[row.key] === 'boolean') {
        (baseDefaults as any)[row.key] = row.value === 'true' || row.value === '1';
      } else {
        (baseDefaults as any)[row.key] = Number(row.value);
      }
    }
  }

  // 2. Fetch account-specific overrides if scope is not global
  if (scope !== globalScope) {
    const acctRows = db
      .prepare('SELECT key, value FROM risk_firewall_settings WHERE scope = ?')
      .all(scope) as { key: string; value: string }[];
    for (const row of acctRows) {
      if (row.key in baseDefaults) {
        if (typeof (baseDefaults as any)[row.key] === 'boolean') {
          (baseDefaults as any)[row.key] = row.value === 'true' || row.value === '1';
        } else {
          (baseDefaults as any)[row.key] = Number(row.value);
        }
      }
    }
  }

  return baseDefaults;
}

/**
 * Save single firewall setting
 */
export function saveFirewallSetting(
  scope: string,
  key: string,
  value: string,
  updatedBy: string
): void {
  db.prepare(`
    INSERT INTO risk_firewall_settings (scope, key, value, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, key) DO UPDATE SET
      value = excluded.value,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(scope, key, value, updatedBy, new Date().toISOString());
}

export interface FirewallAuditEntry {
  actor: string;
  role: string;
  scope: string;
  key: string;
  old_value: string;
  new_value: string;
  reason: string;
}

/**
 * Record firewall audit entry with SHA-256 hash chaining
 */
export function recordFirewallAudit(entry: FirewallAuditEntry): string {
  const id = 'fwa-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
  const timestamp = new Date().toISOString();

  // Get previous hash
  const lastRow = db
    .prepare('SELECT hash FROM risk_firewall_audit ORDER BY rowid DESC LIMIT 1')
    .get() as { hash?: string } | undefined;
  const prevHash = lastRow?.hash || '0000000000000000000000000000000000000000000000000000000000000000';

  const hashContent = `${prevHash}|${id}|${timestamp}|${entry.actor}|${entry.role}|${entry.scope}|${entry.key}|${entry.old_value}|${entry.new_value}|${entry.reason}`;
  const hash = crypto.createHash('sha256').update(hashContent).digest('hex');

  db.prepare(`
    INSERT INTO risk_firewall_audit (id, timestamp, actor, role, scope, key, old_value, new_value, reason, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    entry.actor,
    entry.role,
    entry.scope,
    entry.key,
    entry.old_value,
    entry.new_value,
    entry.reason,
    prevHash,
    hash
  );

  return id;
}

/**
 * Retrieve firewall audit logs
 */
export function getFirewallAuditLogs(limit: number = 100): any[] {
  return db
    .prepare('SELECT * FROM risk_firewall_audit ORDER BY timestamp DESC LIMIT ?')
    .all(limit);
}

/**
 * Record blocked order event in append-only log
 */
export function recordBlockedOrder(entry: {
  userId: string;
  accountId: string;
  symbol: string;
  attemptedLots: number;
  attemptedRiskUsd: number;
  ruleViolated: string;
  suggestedLots: number | null;
  errorMessage: string;
}): string {
  const id = 'blk-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const timestamp = new Date().toISOString();
  db.prepare(`
    INSERT INTO blocked_orders_log (
      id, timestamp, user_id, account_id, symbol, attempted_lots, attempted_risk_usd, rule_violated, suggested_lots, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp,
    entry.userId,
    entry.accountId,
    entry.symbol,
    entry.attemptedLots,
    entry.attemptedRiskUsd,
    entry.ruleViolated,
    entry.suggestedLots,
    entry.errorMessage
  );
  return id;
}

/**
 * Retrieve blocked orders log
 */
export function getBlockedOrderLogs(limit: number = 100): any[] {
  return db
    .prepare('SELECT * FROM blocked_orders_log ORDER BY timestamp DESC LIMIT ?')
    .all(limit);
}

// ==========================================
// OBJECT-LEVEL USER ACCOUNT ASSIGNMENTS
// ==========================================

export function assignUserAccount(
  userId: string,
  accountId: string,
  assignedBy: string
): void {
  db.prepare(`
    INSERT OR REPLACE INTO user_account_assignments (user_id, account_id, assigned_at, assigned_by)
    VALUES (?, ?, ?, ?)
  `).run(userId, accountId, new Date().toISOString(), assignedBy);
}

export function removeUserAccount(userId: string, accountId: string): void {
  db.prepare('DELETE FROM user_account_assignments WHERE user_id = ? AND account_id = ?').run(
    userId,
    accountId
  );
}

export function getUserAssignedAccounts(userId: string): string[] {
  const rows = db
    .prepare('SELECT account_id FROM user_account_assignments WHERE user_id = ?')
    .all(userId) as { account_id: string }[];
  return rows.map((r) => r.account_id);
}

export function isUserAssignedToAccount(
  userId: string,
  accountId: string,
  userRole?: string
): boolean {
  // Master Admin has universal access
  if (userRole === 'master_admin') return true;
  const row = db
    .prepare('SELECT 1 FROM user_account_assignments WHERE user_id = ? AND account_id = ?')
    .get(userId, accountId);
  return Boolean(row);
}

// ==========================================
// MFA RECOVERY CODES
// ==========================================

export function saveMfaRecoveryCodes(userId: string, codeHashes: string[]): void {
  db.prepare('DELETE FROM user_mfa_recovery_codes WHERE user_id = ?').run(userId);
  const insert = db.prepare(`
    INSERT INTO user_mfa_recovery_codes (id, user_id, code_hash, used, created_at)
    VALUES (?, ?, ?, 0, ?)
  `);
  const now = new Date().toISOString();
  for (const h of codeHashes) {
    const id = 'rc-' + crypto.randomUUID();
    insert.run(id, userId, h, now);
  }
}

export function verifyAndConsumeMfaRecoveryCode(userId: string, rawCode: string): boolean {
  const targetHash = crypto.createHash('sha256').update(rawCode.trim().toUpperCase()).digest('hex');
  const row = db
    .prepare('SELECT id FROM user_mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used = 0')
    .get(userId, targetHash) as { id: string } | undefined;

  if (!row) return false;

  db.prepare('UPDATE user_mfa_recovery_codes SET used = 1, used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id
  );
  return true;
}

// ==========================================
// ATOMIC IDEMPOTENCY KEYS
// ==========================================

export function tryAcquireIdempotencyKey(
  key: string,
  userId: string,
  requestHash: string,
  ttlMs: number = 86400000
): {
  status: 'new' | 'in_progress' | 'completed' | 'conflict';
  cachedStatus?: number;
  cachedBody?: any;
} {
  const now = Date.now();
  const existing = db
    .prepare('SELECT * FROM idempotency_keys WHERE key = ?')
    .get(key) as any;

  if (existing) {
    const expiresMs = new Date(existing.expires_at).getTime();
    if (now > expiresMs) {
      db.prepare('DELETE FROM idempotency_keys WHERE key = ?').run(key);
    } else {
      if (existing.request_hash !== requestHash) {
        return { status: 'conflict' };
      }
      if (existing.status === 'in_progress') {
        return { status: 'in_progress' };
      }
      if (existing.status === 'completed') {
        try {
          return {
            status: 'completed',
            cachedStatus: existing.response_status,
            cachedBody: JSON.parse(existing.response_body),
          };
        } catch {
          return { status: 'completed', cachedStatus: existing.response_status, cachedBody: {} };
        }
      }
    }
  }

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  try {
    db.prepare(`
      INSERT INTO idempotency_keys (key, user_id, request_hash, status, created_at, expires_at)
      VALUES (?, ?, ?, 'in_progress', ?, ?)
    `).run(key, userId, requestHash, createdAt, expiresAt);
    return { status: 'new' };
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE')) {
      return { status: 'in_progress' };
    }
    throw err;
  }
}

export function completeIdempotencyKey(
  key: string,
  responseStatus: number,
  responseBody: any
): void {
  db.prepare(`
    UPDATE idempotency_keys
    SET status = 'completed', response_status = ?, response_body = ?
    WHERE key = ?
  `).run(responseStatus, JSON.stringify(responseBody), key);
}

// ==========================================
// CHART LAYOUTS PERSISTENCE
// ==========================================

export function saveChartLayout(layout: {
  id?: string;
  name: string;
  scope: string; // 'global' or symbol e.g. 'EURUSD'
  owner_id: string;
  chart_type: string;
  indicators: any[];
  moving_averages: any[];
}): string {
  const id = layout.id || 'layout-' + crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO chart_layouts (id, name, scope, owner_id, chart_type, indicators, moving_averages, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      chart_type = excluded.chart_type,
      indicators = excluded.indicators,
      moving_averages = excluded.moving_averages,
      updated_at = excluded.updated_at
  `).run(
    id,
    layout.name,
    layout.scope,
    layout.owner_id,
    layout.chart_type,
    JSON.stringify(layout.indicators),
    JSON.stringify(layout.moving_averages),
    now,
    now
  );
  return id;
}

export function getChartLayouts(scope: string, ownerId: string): any[] {
  const rows = db
    .prepare(`
      SELECT * FROM chart_layouts
      WHERE (scope = 'global' OR scope = ?) AND (owner_id = 'global' OR owner_id = ?)
      ORDER BY updated_at DESC
    `)
    .all(scope, ownerId) as any[];

  return rows.map((r) => ({
    ...r,
    indicators: JSON.parse(r.indicators || '[]'),
    moving_averages: JSON.parse(r.moving_averages || '[]'),
  }));
}

export function deleteChartLayout(id: string, ownerId: string): boolean {
  const res = db
    .prepare('DELETE FROM chart_layouts WHERE id = ? AND (owner_id = ? OR owner_id = "global")')
    .run(id, ownerId);
  return res.changes > 0;
}

export function getSystemBranding(): { companyName: string; logoUrl: string } {
  const rowName = db.prepare('SELECT value FROM system_state WHERE key = ?').get('company_name') as { value: string } | undefined;
  const rowLogo = db.prepare('SELECT value FROM system_state WHERE key = ?').get('company_logo') as { value: string } | undefined;
  return {
    companyName: rowName?.value || 'Zaboraa FX',
    logoUrl: rowLogo?.value || '',
  };
}

export function setSystemBranding(companyName: string, logoUrl: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run('company_name', companyName.trim() || 'Zaboraa FX', now);

  db.prepare(`
    INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run('company_logo', logoUrl.trim(), now);
}




