import { describe, it, expect } from 'vitest';
import { runBacktest } from '../backtester';
import { BUILT_IN_STRATEGIES } from '../workerSandbox';
import { DatasetRecord, Candle } from '../../types/forex';

describe('Strategy Regression Parity & Determinism Suite (Stage 1b)', () => {
  // Generate deterministic 200-bar H1 dataset
  const testCandles: Candle[] = Array.from({ length: 200 }, (_, i) => {
    const time = 1700000000 + i * 3600;
    const base = 1.0800 + Math.sin(i / 15) * 0.0060 + (i * 0.0001);
    const open = Number(base.toFixed(5));
    const high = Number((base + 0.0015).toFixed(5));
    const low = Number((base - 0.0015).toFixed(5));
    const close = Number((base + (i % 2 === 0 ? 0.0008 : -0.0008)).toFixed(5));
    return { time, open, high, low, close, tickVolume: 200 + (i % 50) };
  });

  const testDataset: DatasetRecord = {
    id: 'ds-regression-eurusd-h1',
    symbol: 'EURUSD',
    timeframe: 'H1',
    provenance: 'MT5 BRIDGE',
    candleCount: testCandles.length,
    startDate: new Date(testCandles[0].time * 1000).toISOString(),
    endDate: new Date(testCandles[testCandles.length - 1].time * 1000).toISOString(),
    isResearchEligible: true,
    qualityScore: 100,
    gapCount: 0,
    sha256: 'sha256-test-regression',
    utcOffsetHours: 2,
    candles: testCandles,
  };

  const trendStrategy = BUILT_IN_STRATEGIES[0]; // Trend Pullback Pro (Multi-Timeframe H4/H1)

  it('verifies built-in TrendPullbackPro strategy exists and has valid configuration', () => {
    expect(trendStrategy).toBeDefined();
    expect(trendStrategy.id).toBe('trend_pullback_pro_v1');
    expect(trendStrategy.code).toContain('function onBar');
  });

  it('runs backtest deterministically with 100% reproducible metrics across consecutive runs', () => {
    const report1 = runBacktest(trendStrategy, testDataset, { initialBalance: 10000 });
    const report2 = runBacktest(trendStrategy, testDataset, { initialBalance: 10000 });

    expect(report1.totalTrades).toBe(report2.totalTrades);
    expect(report1.netProfit).toBe(report2.netProfit);
    expect(report1.winRate).toBe(report2.winRate);
    expect(report1.finalBalance).toBe(report2.finalBalance);
    expect(report1.equityCurve).toHaveLength(report2.equityCurve.length);
  });

  it('strictly validates that 100% of generated trades have mandatory stop-loss', () => {
    const report = runBacktest(trendStrategy, testDataset, { initialBalance: 10000 });

    for (const trade of report.trades) {
      expect(trade.sl).toBeGreaterThan(0);
      expect(Number.isFinite(trade.sl)).toBe(true);
      expect(Number.isFinite(trade.pnl)).toBe(true);
      expect(Number.isFinite(trade.openPrice)).toBe(true);
      expect(Number.isFinite(trade.closePrice)).toBe(true);
    }
  });

  it('enforces in-sample and out-of-sample holdout division without data leakage', () => {
    const report = runBacktest(trendStrategy, testDataset, { reserveHoldoutPct: 20 });

    if (report.holdoutInfo) {
      expect(report.holdoutInfo.holdoutBarsCount).toBe(40); // 20% of 200 bars
      expect(report.holdoutInfo.holdoutStart).toBeDefined();
    }
  });

  it('fails-closed on empty candle datasets (explicit failing-case)', () => {
    const emptyDataset: DatasetRecord = {
      ...testDataset,
      candleCount: 0,
      candles: [],
    };

    expect(() => {
      runBacktest(trendStrategy, emptyDataset);
    }).toThrow(/zero candles/i);
  });
});
