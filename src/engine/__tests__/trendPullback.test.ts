import { describe, it, expect } from 'vitest';
import { BacktestConfig, Candle } from '../../types/forex';
import { runBacktest } from '../backtester';
import { BUILT_IN_STRATEGIES, getStrategyExecutor } from '../../services/builtInStrategies';
import { createMulberry32 } from '../monteCarlo';
import { getQuickJS, createQuickJSStrategyExecutor } from '../quickjsSandbox';
import { transpileStrategyCode } from '../transpiler';

const strategy = BUILT_IN_STRATEGIES.find((s) => s.id === 'strat_trend_pullback')!;

/** Seeded driftless random walk. It has no edge by construction, so it is used for mechanics and bias checks only. */
function randomWalk(seed: number, bars: number): Candle[] {
  const rng = createMulberry32(seed);
  const gauss = () => {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  const out: Candle[] = [];
  let px = 1.1;
  for (let i = 0; i < bars; i++) {
    const open = px;
    let hi = open, lo = open, c = open;
    for (let k = 0; k < 4; k++) {
      c += (gauss() * 6 / 2) * 0.0001;
      hi = Math.max(hi, c);
      lo = Math.min(lo, c);
    }
    out.push({ time: 1700000000 + i * 3600, open: +open.toFixed(5), high: +hi.toFixed(5), low: +lo.toFixed(5), close: +c.toFixed(5), tickVolume: 100, spread: 1 });
    px = c;
  }
  return out;
}

const config: BacktestConfig = {
  strategyId: 'strat_trend_pullback',
  symbol: 'EURUSD',
  timeframe: 'H1',
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  initialBalance: 10000,
  leverage: 100,
  lotSize: 0.1,
  positionSizing: 'fixed_lot',
  riskPctPerTrade: 1,
  costModel: { spreadMode: 'fixed', fixedSpreadPips: 1.0, commissionPerLotRoundTurn: 7, slippagePips: 0.3, includeSwap: false },
  provenance: { source: 'SIMULATED', label: 'SIMULATED', details: 'Synthetic mechanics test', utcOffsetHours: 0, isResearchEligible: false },
  params: { ...strategy.params },
};

const key = (t: { entryTime: number; exitTime: number; direction: string; pnl: number }) => [t.entryTime, t.exitTime, t.direction, t.pnl];

describe('ATR Trend Pullback built-in strategy', () => {
  it('is in the built-in list, compiles, and passes the sandbox token check', () => {
    expect(strategy).toBeDefined();
    const transpiled = transpileStrategyCode(strategy.code);
    expect(transpiled.success).toBe(true);
    expect(transpiled.errors).toEqual([]);
  });

  it('saved source (QuickJS) and the registry contract produce identical trades', async () => {
    const QuickJS = await getQuickJS();
    const js = transpileStrategyCode(strategy.code).jsCode;
    for (const seed of [1, 2, 3]) {
      const candles = randomWalk(seed, 3000);
      const viaContract = runBacktest(candles, config, getStrategyExecutor('strat_trend_pullback'));
      const sandbox = createQuickJSStrategyExecutor(QuickJS, js, config.params);
      try {
        const viaSource = runBacktest(candles, config, sandbox.strategyLogic);
        expect(viaSource.trades.map(key)).toEqual(viaContract.trades.map(key));
      } finally {
        sandbox.dispose();
      }
    }
  });

  it('does not use future bars: trades closed before a cut are unchanged when later bars are added', () => {
    const full = randomWalk(11, 2500);
    const cut = 1800;
    const short = runBacktest(full.slice(0, cut), config, getStrategyExecutor('strat_trend_pullback'));
    const long = runBacktest(full, config, getStrategyExecutor('strat_trend_pullback'));
    const cutTime = full[cut - 1].time;
    expect(short.totalTrades).toBeGreaterThan(0);
    expect(long.trades.filter((t) => t.exitTime <= cutTime).map(key)).toEqual(short.trades.map(key));
  });

  it('trades both directions with finite prices and always sets a stop-loss and take-profit', () => {
    const result = runBacktest(randomWalk(1, 3000), config, getStrategyExecutor('strat_trend_pullback'));
    expect(result.totalTrades).toBeGreaterThan(10);
    expect(result.trades.some((t) => t.direction === 'BUY')).toBe(true);
    expect(result.trades.some((t) => t.direction === 'SELL')).toBe(true);
    for (const t of result.trades) {
      expect(Number.isFinite(t.pnl)).toBe(true);
      expect(Number.isFinite(t.entryPrice)).toBe(true);
      expect(Number.isFinite(t.exitPrice)).toBe(true);
      expect(typeof t.sl).toBe('number');
      expect(typeof t.tp).toBe('number');
    }
  });

  it('finds no edge on a driftless random walk (a large positive average would signal a bias or look-ahead bug)', () => {
    let trades = 0;
    let pnl = 0;
    for (let seed = 100; seed < 110; seed++) {
      const r = runBacktest(randomWalk(seed, 4000), config, getStrategyExecutor('strat_trend_pullback'));
      trades += r.totalTrades;
      pnl += r.trades.reduce((s, t) => s + t.pnl, 0);
    }
    expect(trades).toBeGreaterThan(300);
    expect(pnl / trades).toBeLessThan(3);
  });
});
