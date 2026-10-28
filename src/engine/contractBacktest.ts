import { BacktestConfig, BacktestResult, Candle, Strategy } from '../types/forex';
import { createQuickJSStrategyExecutor, getQuickJS } from './quickjsSandbox';
import { transpileStrategyCode } from './transpiler';
import { runBacktest } from './backtester';

/** Execute the exact saved StrategyContract source in the same sandbox used by Strategy Studio. */
export async function runContractStrategyBacktest(
  strategy: Strategy,
  candles: Candle[],
  config: BacktestConfig,
): Promise<BacktestResult> {
  if (!strategy || typeof strategy.code !== 'string' || strategy.code.trim().length === 0) {
    throw new Error(`BACKTEST_STRATEGY_UNAVAILABLE: strategy '${strategy?.id || 'unknown'}' has no saved executable source`);
  }

  const transpiled = transpileStrategyCode(strategy.code);
  if (!transpiled.success || !transpiled.jsCode) {
    throw new Error(`BACKTEST_STRATEGY_COMPILE_FAILED: ${transpiled.errors.join(' ') || 'transpiler returned empty code'}`);
  }

  const QuickJS = await getQuickJS();
  const executor = createQuickJSStrategyExecutor(QuickJS, transpiled.jsCode, config.params || strategy.params || {});
  try {
    return runBacktest(candles, config, executor.strategyLogic);
  } finally {
    executor.dispose();
  }
}
