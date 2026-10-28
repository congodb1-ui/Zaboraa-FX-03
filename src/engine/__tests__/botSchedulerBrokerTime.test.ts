/** Bridge candle times are broker server time. The scheduler must convert them before judging "closed". */
import { describe, it, expect, vi } from 'vitest';

const captured = vi.hoisted(() => ({ map: null as Map<string, any[]> | null }));
vi.mock('../botRunner', () => ({
  BotRunner: class {
    updateConfig() {}
    resumeBotsAfterReconciliation() {}
    async runCycle(m: Map<string, any[]>) {
      captured.map = m;
      return [];
    }
  },
}));

import { BotScheduler, toClosedCandles } from '../botScheduler';

const H = 3600;
const h0 = 1_699_999_200; // a whole UTC hour
const NOW = h0 + 800; // 13 minutes into the h0 bar
const bar = (utcOpen: number, offsetH: number) => ({ time: utcOpen + offsetH * H, open: 1, high: 1, low: 1, close: 1, tick_volume: 1 });

describe('toClosedCandles with a broker offset', () => {
  it('shifts broker time to UTC before the closed-bar test', () => {
    const raw = [bar(h0 - 2 * H, 3), bar(h0 - H, 3), bar(h0, 3)]; // last one is still forming
    const out = toClosedCandles(raw, 'H1', NOW, 3);
    expect(out.map((c) => c.time)).toEqual([h0 - 2 * H, h0 - H]);
  });
  it('fails closed when the offset is unknown (null)', () => {
    expect(toClosedCandles([bar(h0 - H, 3)], 'H1', NOW, null)).toEqual([]);
  });
  it('keeps legacy behaviour when no offset is passed', () => {
    const out = toClosedCandles([bar(h0 - H, 0), bar(h0, 0)], 'H1', NOW);
    expect(out.map((c) => c.time)).toEqual([h0 - H]);
  });
});

function makeScheduler(health: any, candlesResp: any) {
  const watchdog: any = { recordHeartbeat: vi.fn(), checkHeartbeat: vi.fn(), getStatus: () => ({ isTripped: false }) };
  const onHealth = vi.fn();
  const runReconciliation = vi.fn(async () => true);
  const bridge: any = {
    getHealth: vi.fn(async () => health),
    getAccount: vi.fn(async () => ({ balance: 1, equity: 1, login: 1, account_type: 'DEMO' })),
    getCandles: vi.fn(async () => candlesResp),
  };
  const s = new BotScheduler({
    bridge, watchdog, riskSettings: {} as any, onHealth, runReconciliation,
    listRunningBots: () => [{ symbol: 'EURUSD', timeframe: 'H1' } as any],
  });
  return { s, watchdog, onHealth, runReconciliation, bridge };
}

describe('BotScheduler', () => {
  it('does not count a bridge with a disconnected MT5 as a healthy heartbeat', async () => {
    const { s, watchdog, onHealth, runReconciliation } = makeScheduler({ broker_connected: false, account_type: 'UNKNOWN' }, null);
    await s.tick(NOW);
    expect(watchdog.recordHeartbeat).not.toHaveBeenCalled();
    expect(onHealth).toHaveBeenCalledWith(null);
    expect(runReconciliation).not.toHaveBeenCalled();
    expect(s.getStatus().lastHealthOk).toBe(false);
  });

  it('hands the runner UTC-correct closed bars', async () => {
    const raw = [bar(h0 - 2 * H, 3), bar(h0 - H, 3), bar(h0, 3)];
    const { s } = makeScheduler({ broker_connected: true, account_type: 'DEMO' }, { candles: raw, utc_offset_hours: 3, time_basis: 'broker' });
    await s.tick(NOW);
    const bars = captured.map!.get('EURUSD:H1')!;
    expect(bars[bars.length - 1].time).toBe(h0 - H);
    expect(s.getStatus().marketClosedSymbols).toEqual([]);
  });

  it('gives the runner no bars when the offset is unknown, and reports the symbol as not tradable', async () => {
    const raw = [bar(h0 - H, 3)];
    const { s } = makeScheduler({ broker_connected: true, account_type: 'DEMO' }, { candles: raw, utc_offset_hours: null, time_basis: 'broker' });
    await s.tick(NOW);
    expect(captured.map!.get('EURUSD:H1')).toEqual([]);
    expect(s.getStatus().marketClosedSymbols).toContain('EURUSD');
    expect(s.getStatus().lastError).toContain('offset');
  });
});
