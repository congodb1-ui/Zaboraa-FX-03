import { describe, it, expect, vi } from 'vitest';
import { BotScheduler, toClosedCandles } from '../botScheduler';
import { HeartbeatWatchdog } from '../watchdog';

const risk: any = {
  maxRiskPerTradePct: 1, maxLotSize: 0.1, maxOpenPositionsTotal: 3, maxOpenPositionsPerSymbol: 1,
  maxDailyLossPct: 2, maxTotalDrawdownPct: 6, maxAllowedSpreadPips: 3,
  enableTradingHoursFilter: false, tradingStartHourUTC: 0, tradingEndHourUTC: 24,
  killSwitchAction: 'CLOSE_ALL_AND_HALT',
};

describe('toClosedCandles', () => {
  it('drops the still-forming bar', () => {
    const raw = [
      { time: 0, open: 1, high: 1, low: 1, close: 1, tick_volume: 1 },
      { time: 3600, open: 1, high: 1, low: 1, close: 1, tick_volume: 1 },
    ];
    // now = 5000s: bar@0 closed at 3600, bar@3600 closes at 7200 -> still forming
    expect(toClosedCandles(raw, 'H1', 5000).map((c) => c.time)).toEqual([0]);
  });
  it('keeps a bar exactly when its period has elapsed', () => {
    const raw = [{ time: 0, open: 1, high: 1, low: 1, close: 1, tick_volume: 1 }];
    expect(toClosedCandles(raw, 'H1', 3600)).toHaveLength(1);
  });
});

describe('BotScheduler', () => {
  it('feeds the watchdog only when the bridge health call succeeds', async () => {
    const wd = new HeartbeatWatchdog({ timeoutMs: 60000 });
    const spy = vi.spyOn(wd, 'recordHeartbeat');
    const bridge: any = { getHealth: vi.fn().mockResolvedValue({ account_type: 'DEMO' }) };
    const sched = new BotScheduler({
      bridge, watchdog: wd, riskSettings: risk,
      listRunningBots: () => [], runReconciliation: async () => false,
    });
    await sched.tick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(sched.getStatus().lastHealthOk).toBe(true);
  });

  it('does NOT feed the watchdog and does not reconcile when the bridge is down', async () => {
    const wd = new HeartbeatWatchdog({ timeoutMs: 60000 });
    const spy = vi.spyOn(wd, 'recordHeartbeat');
    const recon = vi.fn().mockResolvedValue(true);
    const bridge: any = { getHealth: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const sched = new BotScheduler({
      bridge, watchdog: wd, riskSettings: risk,
      listRunningBots: () => [], runReconciliation: recon,
    });
    await sched.tick();
    expect(spy).not.toHaveBeenCalled();
    expect(recon).not.toHaveBeenCalled();
    expect(sched.getStatus().lastHealthOk).toBe(false);
  });

  it('runs no bots until reconciliation has succeeded', async () => {
    const wd = new HeartbeatWatchdog({ timeoutMs: 60000 });
    const bridge: any = {
      getHealth: vi.fn().mockResolvedValue({ account_type: 'DEMO' }),
      getAccount: vi.fn(), getCandles: vi.fn(),
    };
    const sched = new BotScheduler({
      bridge, watchdog: wd, riskSettings: risk,
      listRunningBots: () => [{ id: 'b', symbol: 'EURUSD', timeframe: 'H1', status: 'RUNNING' } as any],
      runReconciliation: async () => false,
    });
    await sched.tick();
    expect(bridge.getAccount).not.toHaveBeenCalled();
    expect(bridge.getCandles).not.toHaveBeenCalled();
    expect(sched.getStatus().reconciled).toBe(false);
  });
});
