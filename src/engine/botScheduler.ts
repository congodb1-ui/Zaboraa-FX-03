/**
 * Bot scheduler (fix for D1 + D2).
 *
 * Every tick it:
 *  1. polls the bridge /health and feeds the watchdog on success (D2);
 *  2. runs startup reconciliation once before any bot may act (D1);
 *  3. fetches candles for each RUNNING bot, drops the still-forming last bar,
 *     and asks the BotRunner to evaluate the latest CLOSED bar (D1).
 *
 * It never runs if the bridge is unreachable, the watchdog has tripped,
 * reconciliation has not succeeded, or the market looks closed.
 * Everything that talks to the outside world is injected, so it is unit-testable.
 */
import type { Bot, Candle, RiskSettings, SymbolName } from '../types/forex';
import type { BridgeClient } from '../services/bridgeClient';
import { BotRunner, BotCycleResult } from './botRunner';
import { HeartbeatWatchdog } from './watchdog';

const TF_SECONDS: Record<string, number> = {
  M1: 60, M5: 300, M10: 600, M15: 900, M30: 1800, H1: 3600, H3: 10800, D1: 86400,
};

export interface SchedulerDeps {
  bridge: BridgeClient;
  watchdog: HeartbeatWatchdog;
  riskSettings: RiskSettings;
  listRunningBots: () => Bot[];
  runReconciliation: () => Promise<boolean>; // true = success
  onHealth?: (health: any | null) => void;
  log?: (msg: string) => void;
}

export interface SchedulerStatus {
  started: boolean;
  reconciled: boolean;
  lastHealthOk: boolean;
  lastTickAt: string | null;
  lastResults: BotCycleResult[];
  lastError: string | null;
  marketClosedSymbols: string[];
}

/**
 * Bridge candle times are broker server time (UTC + offset). Pass the bridge's utc_offset_hours:
 *  - a number: times are shifted to UTC before the closed-bar test;
 *  - null: the offset is unknown, so no bar can be trusted and nothing is returned (fail closed);
 *  - undefined: legacy callers that already hold UTC times (no shift).
 */
export function toClosedCandles(raw: any[], timeframe: string, nowSec: number, utcOffsetHours?: number | null): Candle[] {
  if (utcOffsetHours === null) return [];
  const shiftSec = (utcOffsetHours ?? 0) * 3600;
  const tf = TF_SECONDS[timeframe] ?? 3600;
  const mapped: Candle[] = (raw || []).map((c: any) => ({
    time: c.time - shiftSec,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    tickVolume: c.tick_volume ?? c.tickVolume ?? 0,
    spread: 0,
  }));
  // A bar is closed only when its period has fully elapsed.
  return mapped.filter((c) => c.time + tf <= nowSec);
}

export class BotScheduler {
  private timer: any = null;
  private busy = false;
  private runner: BotRunner;
  private status: SchedulerStatus = {
    started: false, reconciled: false, lastHealthOk: false,
    lastTickAt: null, lastResults: [], lastError: null, marketClosedSymbols: [],
  };

  constructor(private deps: SchedulerDeps) {
    this.runner = new BotRunner({
      riskSettings: deps.riskSettings,
      bridgeClient: deps.bridge,
      reconciliationExecuted: false,
      getAccountSnapshot: () => this.snapshot,
    });
  }

  private snapshot = { balance: 0, equity: 0, login: '', mode: 'DEMO' as string };

  public getStatus(): SchedulerStatus {
    return { ...this.status };
  }

  public getRunner(): BotRunner {
    return this.runner;
  }

  public start(intervalMs = 10000): void {
    if (this.timer) return;
    this.status.started = true;
    this.timer = setInterval(() => { void this.tick(); }, intervalMs);
    void this.tick();
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status.started = false;
  }

  /** One scheduler cycle. Exposed for tests. */
  public async tick(nowSec: number = Math.floor(Date.now() / 1000)): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.status.lastTickAt = new Date().toISOString();
    try {
      // 1. Health -> watchdog heartbeat (only a REAL bridge response counts)
      let health: any = null;
      try {
        health = await this.deps.bridge.getHealth();
        if (health && health.broker_connected === false) {
          // The bridge answers but MT5 has no broker connection: not a healthy heartbeat.
          this.status.lastHealthOk = false;
          this.status.lastError = 'Bridge is up but MT5 is not connected to the broker.';
          health = null;
        } else {
          this.deps.watchdog.recordHeartbeat();
          this.status.lastHealthOk = true;
        }
      } catch (err: any) {
        this.status.lastHealthOk = false;
        this.status.lastError = `Bridge health failed: ${err?.message || err}`;
      }
      this.deps.onHealth?.(health);
      this.deps.watchdog.checkHeartbeat();

      if (!health) return;

      // 2. Reconcile once before any bot may act
      if (!this.status.reconciled) {
        const ok = await this.deps.runReconciliation();
        this.status.reconciled = ok;
        this.runner.updateConfig({ reconciliationExecuted: ok });
        if (!ok) {
          this.status.lastError = 'Startup reconciliation failed; bots will not run.';
          return;
        }
        this.runner.resumeBotsAfterReconciliation(true);
      }

      // 3. Watchdog tripped => nothing runs (watchdog already paused the bots)
      if (this.deps.watchdog.getStatus().isTripped) return;

      // 4. Account snapshot + authoritative mode
      const acct = await this.deps.bridge.getAccount();
      this.snapshot = {
        balance: acct.balance, equity: acct.equity,
        login: String(acct.login), mode: acct.account_type,
      };
      this.runner.updateConfig({ authoritativeAccountMode: acct.account_type });

      // 5. Candles for each running bot, closed bars only
      const bots = this.deps.listRunningBots();
      if (bots.length === 0) return;

      const candleMap = new Map<string, Candle[]>();
      const closedSymbols: string[] = [];
      for (const bot of bots) {
        const key = `${bot.symbol}:${bot.timeframe}`;
        if (candleMap.has(key)) continue;
        try {
          const resp = await this.deps.bridge.getCandles(bot.symbol, bot.timeframe, 300);
          if (resp.utc_offset_hours === null) {
            this.status.lastError = `Candles ${key}: broker UTC offset unknown; bars not used. Set BROKER_UTC_OFFSET_HOURS on the bridge.`;
          }
          const closed = toClosedCandles(resp.candles, bot.timeframe, nowSec, resp.utc_offset_hours);
          candleMap.set(key, closed);
          const last = closed[closed.length - 1];
          const tf = TF_SECONDS[bot.timeframe] ?? 3600;
          // Stale by more than 3 bars => market closed / feed stalled; do not trade.
          if (!last || nowSec - (last.time + tf) > tf * 3) {
            closedSymbols.push(bot.symbol);
            candleMap.set(key, []);
          }
        } catch (err: any) {
          candleMap.set(key, []);
          this.status.lastError = `Candles ${key}: ${err?.message || err}`;
        }
      }
      this.status.marketClosedSymbols = closedSymbols;

      this.status.lastResults = await this.runner.runCycle(candleMap);
    } catch (err: any) {
      this.status.lastError = err?.message || String(err);
      this.deps.log?.(`[scheduler] ${this.status.lastError}`);
    } finally {
      this.busy = false;
    }
  }
}
