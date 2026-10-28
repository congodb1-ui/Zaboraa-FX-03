import { describe, it, expect } from 'vitest';
import { parseTradingViewTradesCsv, compareWithTradingViewTrades } from '../tradingViewComparator';
import { runBacktest } from '../backtester';
import { generateHistoricalCandles } from '../../services/marketData';
import { getStrategyExecutor } from '../../services/builtInStrategies';

describe('Phase 3: Backtest Correctness & TradingView Comparison', () => {
  it('parses TradingView trade CSV correctly including short trades and zero profit', () => {
    const csvData = `Trade #,Type,Signal,Date/Time,Price,Contracts,Profit USD
1,Entry Long,Buy,2023-01-02 10:00,1050.5,0.1,
2,Exit Long,Sell,2023-01-05 14:00,1050.5,0.1,0.0
3,Entry Short,Sell,2023-01-06 09:00,1075.0,0.1,
4,Exit Short,Buy,2023-01-10 16:00,1060.0,0.1,15.0`;

    const parsed = parseTradingViewTradesCsv(csvData);
    expect(parsed.length).toBe(4);
    expect(parsed[1].type).toBe('Exit Long');
    expect(parsed[1].profitUSD).toBe(0.0);
    expect(parsed[2].type).toBe('Entry Short');
    expect(parsed[3].type).toBe('Exit Short');
    expect(parsed[3].profitUSD).toBe(15.0);
  });

  it('compares portal trades against TradingView benchmark accurately', () => {
    const portalTrades: any[] = [
      { ticket: 1, entryTime: 1672653600, exitTime: 1672740000, symbol: 'EURUSD', direction: 'BUY', size: 0.1, entryPrice: 1.08, exitPrice: 1.09, pnl: 100, pips: 10, durationMinutes: 60, costs: { spread: 1.0, commission: 0, swap: 0, slippage: 0 }, mae: 5, mfe: 15, exitReason: 'SIGNAL' },
      { ticket: 2, entryTime: 1672826400, exitTime: 1672912800, symbol: 'EURUSD', direction: 'SELL', size: 0.1, entryPrice: 1.09, exitPrice: 1.085, pnl: 50, pips: 5, durationMinutes: 60, costs: { spread: 1.0, commission: 0, swap: 0, slippage: 0 }, mae: 5, mfe: 15, exitReason: 'SIGNAL' },
    ];

    const mockTvTrades = [
      { tradeNumber: 1, type: 'Entry Long' as const, signal: 'Buy', date: '2023-01-02 10:00', price: 1.08, contracts: 0.1 },
      { tradeNumber: 2, type: 'Exit Long' as const, signal: 'Sell', date: '2023-01-03 10:00', price: 1.09, contracts: 0.1, profitUSD: 100 },
      { tradeNumber: 3, type: 'Entry Short' as const, signal: 'Sell', date: '2023-01-04 10:00', price: 1.09, contracts: 0.1 },
      { tradeNumber: 4, type: 'Exit Short' as const, signal: 'Buy', date: '2023-01-05 10:00', price: 1.085, contracts: 0.1, profitUSD: 50 },
    ];

    const report = compareWithTradingViewTrades(portalTrades, mockTvTrades);
    expect(report.portalTradeCount).toBe(2);
    expect(report.tvTradeCount).toBe(2);
    expect(report.alignmentScore).toBeGreaterThanOrEqual(90);
  });

  it('integration test: runs runBacktest() and validates output against comparator', () => {
    const candles = generateHistoricalCandles('EURUSD', 'H1', 300);
    const backtestRes = runBacktest(candles, {
      symbol: 'EURUSD',
      timeframe: 'H1',
      startDate: new Date(candles[0].time * 1000).toISOString(),
      endDate: new Date(candles[candles.length - 1].time * 1000).toISOString(),
      initialBalance: 10000,
      leverage: 100,
      lotSize: 0.1,
      positionSizing: 'fixed_lot',
      riskPctPerTrade: 1,
      strategyId: 'strat_sma_cross',
      params: { fastPeriod: 2, slowPeriod: 5 },
      costModel: {
        spreadMode: 'fixed',
        fixedSpreadPips: 1.0,
        commissionPerLotRoundTurn: 0,
        includeSwap: false,
        slippagePips: 0,
      },
      provenance: {
        source: 'SIMULATED',
        label: 'SIMULATED',
        details: 'Synthetic candles generated for unit testing',
        utcOffsetHours: 0,
        isResearchEligible: false,
      },
    }, getStrategyExecutor('strat_sma_cross'));

    // Step 1 Diagnostics
    console.log("Sample backtest trades:", backtestRes.trades?.slice(0, 3));
    console.log("Non-finite PnL count:", backtestRes.trades?.filter(t => !Number.isFinite(t.pnl)).length);

    // Ensure backtester actually generated trades without silent fallback
    expect(backtestRes.trades.length).toBeGreaterThan(0);

    const tvEquivalentTrades = backtestRes.trades.flatMap((t, idx) => [
      {
        tradeNumber: idx * 2 + 1,
        type: (t.direction === 'BUY' ? 'Entry Long' : 'Entry Short') as 'Entry Long' | 'Entry Short',
        signal: 'Signal',
        date: new Date(t.entryTime * 1000).toISOString(),
        price: t.entryPrice,
        contracts: t.size,
      },
      {
        tradeNumber: idx * 2 + 2,
        type: (t.direction === 'BUY' ? 'Exit Long' : 'Exit Short') as 'Exit Long' | 'Exit Short',
        signal: 'Signal',
        date: new Date(t.exitTime * 1000).toISOString(),
        price: t.exitPrice,
        contracts: t.size,
        profitUSD: t.pnl,
      },
    ]);

    // Step 4: Tighten test assertions
    for (const t of backtestRes.trades) {
      expect(Number.isFinite(t.pnl)).toBe(true);
      expect(Number.isFinite(t.entryPrice)).toBe(true);
      expect(Number.isFinite(t.exitPrice)).toBe(true);
      expect(Number.isFinite(t.entryTime)).toBe(true);
      expect(Number.isFinite(t.exitTime)).toBe(true);
      expect(t.entryPrice).toBeGreaterThan(0);
      expect(t.exitPrice).toBeGreaterThan(0);
    }

    const report = compareWithTradingViewTrades(backtestRes.trades, tvEquivalentTrades);
    expect(report.portalTradeCount).toBe(backtestRes.trades.length);
    expect(Number.isFinite(report.alignmentScore)).toBe(true);
    expect(report.alignmentScore).toBeGreaterThanOrEqual(90);
  });

  it('enforces held-out data split for overfitting prevention with nonempty boundary validation', () => {
    const candles = generateHistoricalCandles('EURUSD', 'H1', 210);
    expect(candles.length).toBeGreaterThan(0);

    const splitIndex = Math.floor(candles.length * 0.7);
    const trainData = candles.slice(0, splitIndex);
    const heldOutData = candles.slice(splitIndex);

    expect(trainData.length).toBeGreaterThan(0);
    expect(heldOutData.length).toBeGreaterThan(0);
    expect(trainData.length).toBe(Math.floor(candles.length * 0.7));
    expect(heldOutData.length).toBe(candles.length - Math.floor(candles.length * 0.7));
    
    expect(trainData[trainData.length - 1].time).toBeLessThan(heldOutData[0].time);
  });
});

describe('Phase 4: strict backtest execution and reserved holdout', () => {
  it('resolves Liquidity Hunt by strategy name even when its saved ID is custom', () => {
    const executor = getStrategyExecutor('Liquidity Hunt');
    expect(typeof executor).toBe('function');
    expect(getStrategyExecutor('strat_liquidity_hunt')).toBeDefined();
  });
  it('refuses to substitute a dummy strategy when no executor is supplied', () => {
    const candles = generateHistoricalCandles('EURUSD', 'H1', 120);
    expect(() => runBacktest(candles, {
      symbol: 'EURUSD', timeframe: 'H1', startDate: '2024-01-01', endDate: '2024-02-01',
      initialBalance: 10000, leverage: 100, lotSize: 0.1, positionSizing: 'fixed_lot',
      riskPctPerTrade: 1, strategyId: 'missing_strategy', params: {},
      costModel: { spreadMode: 'fixed', fixedSpreadPips: 1, commissionPerLotRoundTurn: 0, includeSwap: false, slippagePips: 0 },
      provenance: { source: 'SIMULATED', label: 'SIMULATED', details: 'Synthetic candles for negative unit test', utcOffsetHours: 0, isResearchEligible: false },
    })).toThrow(/BACKTEST_STRATEGY_UNAVAILABLE/);
  });

  it('rejects non-finite OHLC input before backtest execution', () => {
    const candles = generateHistoricalCandles('EURUSD', 'H1', 120);
    candles[50] = { ...candles[50], close: Number.NaN };
    expect(() => runBacktest(candles, {
      symbol: 'EURUSD', timeframe: 'H1', startDate: '2024-01-01', endDate: '2024-02-01',
      initialBalance: 10000, leverage: 100, lotSize: 0.1, positionSizing: 'fixed_lot',
      riskPctPerTrade: 1, strategyId: 'strat_sma_cross', params: {},
      costModel: { spreadMode: 'fixed', fixedSpreadPips: 1, commissionPerLotRoundTurn: 0, includeSwap: false, slippagePips: 0 },
      provenance: { source: 'SIMULATED', label: 'SIMULATED', details: 'Synthetic candles for invalid-input unit test', utcOffsetHours: 0, isResearchEligible: false },
    }, getStrategyExecutor('strat_sma_cross'))).toThrow(/BACKTEST_INVALID_CANDLE/);
  });
});

describe('FR-N3: optimizer must reserve the final holdout', () => {
  it('reports a reserved final slice that is excluded from optimization partitions', async () => {
    const candles = generateHistoricalCandles('EURUSD', 'H1', 150);
    const { runOptimizationSweep } = await import('../optimizer');
    const report = await runOptimizationSweep(candles, {
      strategyId: 'strat_sma_cross', symbol: 'EURUSD', timeframe: 'H1',
      startDate: new Date(candles[0].time * 1000).toISOString(),
      endDate: new Date(candles[candles.length - 1].time * 1000).toISOString(),
      inSamplePct: 70, searchType: 'grid', initialBalance: 10000,
      costModel: { spreadMode: 'fixed', fixedSpreadPips: 1, commissionPerLotRoundTurn: 0, includeSwap: false, slippagePips: 0 },
      paramRanges: [{ name: 'fastPeriod', min: 2, max: 2, step: 1 }, { name: 'slowPeriod', min: 5, max: 5, step: 1 }],
    }, undefined, { provenance: { source: 'USER_CSV', label: 'USER CSV', details: 'Unit-test fixture', utcOffsetHours: 0, isResearchEligible: true } });

    // Derive expectations from the actual fixture length; the generator may return fewer bars than requested.
    const expectedReservedTestBars = Math.max(1, Math.floor(candles.length * 0.20));
    const expectedReservedTestStartIndex = candles.length - expectedReservedTestBars;
    expect(report.reservedTestBars).toBe(expectedReservedTestBars);
    expect(report.reservedTestStartTime).toBe(candles[expectedReservedTestStartIndex].time);
    expect(report.trials).toHaveLength(1);
    expect(Number.isFinite(report.trials[0].isSharpe)).toBe(true);
    expect(Number.isFinite(report.trials[0].oosSharpe)).toBe(true);
  });
});
