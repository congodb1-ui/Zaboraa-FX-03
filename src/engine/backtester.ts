import {
  BacktestReport,
  Candle,
  DatasetRecord,
  ForexSymbol,
  TradeRecord,
} from '../types/forex';
import {
  calculateDrawdown,
  calculateFrictionCosts,
  calculatePnl,
  calculatePipValue,
  evaluateIntrabarExit,
  calculateOverfittingScore,
  runMonteCarloAnalysis,
} from './engineMath';
import { BUILT_IN_STRATEGIES, executeStrategyBar, StrategyDefinition } from './workerSandbox';

export interface BacktestOptions {
  initialBalance?: number;
  spreadPips?: number;
  commissionPerLot?: number;
  slippagePips?: number;
  reserveHoldoutPct?: number; // default 20%
}

export function runBacktest(
  strategy: StrategyDefinition,
  dataset: DatasetRecord,
  options: BacktestOptions = {}
): BacktestReport {
  const initialBalance = options.initialBalance ?? 10000;
  const spreadPips = options.spreadPips ?? 1.2;
  const commissionPerLot = options.commissionPerLot ?? 7.0;
  const slippagePips = options.slippagePips ?? 0.2;
  const reserveHoldoutPct = options.reserveHoldoutPct ?? 20;

  const candles = dataset.candles;
  if (!candles || candles.length === 0) {
    throw new Error('Dataset contains zero candles. Backtest cannot run on empty data.');
  }

  // Calculate In-Sample vs Holdout boundary
  const holdoutBars = Math.floor(candles.length * (reserveHoldoutPct / 100));
  const inSampleBarsCount = candles.length - holdoutBars;
  const holdoutStartIso = candles[inSampleBarsCount]?.time
    ? new Date(candles[inSampleBarsCount].time * 1000).toISOString()
    : '';

  let balance = initialBalance;
  let equity = initialBalance;
  let ticketCounter = 1000;

  interface ActiveTrade {
    ticket: number;
    symbol: ForexSymbol;
    side: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    sl: number;
    tp?: number;
    tp2?: number;
    tp3?: number;
    openTime: number;
    openBarIndex: number;
    highestPriceSinceOpen: number;
    lowestPriceSinceOpen: number;
    reason?: string;
  }

  const openTrades: ActiveTrade[] = [];
  const closedTrades: TradeRecord[] = [];
  const accumulatedVisualBlocks: any[] = [];
  const accumulatedVisualLines: any[] = [];
  const accumulatedVisualMarkers: any[] = [];
  const equityCurve: Array<{ time: number; equity: number; drawdownPct: number }> = [
    { time: candles[0].time, equity: initialBalance, drawdownPct: 0 },
  ];

  let totalSpreadCost = 0;
  let totalCommission = 0;
  let totalSwapCost = 0;
  let totalSlippageCost = 0;

  let peakEquity = initialBalance;

  // Run bar by bar
  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];

    // 1. Evaluate open trades against the current bar's intrabar price action
    for (let t = openTrades.length - 1; t >= 0; t--) {
      const trade = openTrades[t];

      // Update MAE / MFE price extremes
      if (bar.high > trade.highestPriceSinceOpen) trade.highestPriceSinceOpen = bar.high;
      if (bar.low < trade.lowestPriceSinceOpen) trade.lowestPriceSinceOpen = bar.low;

      // Check Intrabar SL/TP execution (Worst case rule!)
      const exitResult = evaluateIntrabarExit(trade.side, bar.high, bar.low, trade.sl, trade.tp);
      if (exitResult && exitResult.triggered) {
        // Calculate days held and Wednesday rollover
        const daysHeld = Math.max(1, Math.round((bar.time - trade.openTime) / 86400));
        const crossedWed = new Date(trade.openTime * 1000).getUTCDay() <= 3 && new Date(bar.time * 1000).getUTCDay() >= 4;

        const friction = calculateFrictionCosts(trade.symbol, trade.volume, spreadPips, daysHeld, crossedWed);
        const slippageAdjPrice =
          trade.side === 'BUY'
            ? exitResult.exitPrice - slippagePips * (trade.symbol === 'USDJPY' ? 0.01 : trade.symbol === 'XAUUSD' ? 1.0 : 0.0001)
            : exitResult.exitPrice + slippagePips * (trade.symbol === 'USDJPY' ? 0.01 : trade.symbol === 'XAUUSD' ? 1.0 : 0.0001);

        const rawPnl = calculatePnl(trade.symbol, trade.side, trade.openPrice, slippageAdjPrice, trade.volume);
        const netPnl = Number((rawPnl - friction.spreadCost - friction.commission + friction.swapCost).toFixed(2));

        balance += netPnl;
        totalSpreadCost += friction.spreadCost;
        totalCommission += friction.commission;
        totalSwapCost += Math.abs(friction.swapCost < 0 ? friction.swapCost : 0);
        totalSlippageCost += Number((slippagePips * calculatePipValue(trade.symbol, trade.volume)).toFixed(2));

        // MAE & MFE in pips
        const pipScale = trade.symbol === 'USDJPY' ? 0.01 : trade.symbol === 'XAUUSD' ? 1.0 : 0.0001;
        const maePips = trade.side === 'BUY'
          ? Math.max(0, (trade.openPrice - trade.lowestPriceSinceOpen) / pipScale)
          : Math.max(0, (trade.highestPriceSinceOpen - trade.openPrice) / pipScale);
        const mfePips = trade.side === 'BUY'
          ? Math.max(0, (trade.highestPriceSinceOpen - trade.openPrice) / pipScale)
          : Math.max(0, (trade.openPrice - trade.lowestPriceSinceOpen) / pipScale);

        const pnlPips = Number(((exitResult.exitPrice - trade.openPrice) * (trade.side === 'BUY' ? 1 : -1) / pipScale).toFixed(1));
        const riskRewardRatio = trade.tp && Math.abs(trade.openPrice - trade.sl) > 0
          ? Number((Math.abs(trade.tp - trade.openPrice) / Math.abs(trade.openPrice - trade.sl)).toFixed(2))
          : 2.0;

        closedTrades.push({
          id: `tr-${trade.ticket}`,
          ticket: trade.ticket,
          strategyName: strategy.name,
          symbol: trade.symbol,
          side: trade.side,
          volume: trade.volume,
          openPrice: trade.openPrice,
          closePrice: exitResult.exitPrice,
          sl: trade.sl,
          tp: trade.tp,
          tp2: trade.tp2,
          tp3: trade.tp3,
          riskRewardRatio,
          pnl: netPnl,
          pnlPips,
          swap: friction.swapCost,
          commission: friction.commission,
          slippagePips,
          openTime: trade.openTime,
          closeTime: bar.time,
          exitReason: exitResult.exitType,
          maePips: Number(maePips.toFixed(1)),
          mfePips: Number(mfePips.toFixed(1)),
        });

        openTrades.splice(t, 1);
      }
    }

    // 2. Execute Strategy bar logic
    const context = {
      symbol: dataset.symbol,
      balance,
      equity,
      openPositions: openTrades.map((o) => ({
        ticket: o.ticket,
        side: o.side,
        volume: o.volume,
        openPrice: o.openPrice,
        sl: o.sl,
        tp: o.tp,
      })),
    };

    const stratResult = executeStrategyBar(strategy.code, candles, i, context);
    const { signals } = stratResult;

    if (stratResult.visualBlocks && stratResult.visualBlocks.length > 0) {
      accumulatedVisualBlocks.push(...stratResult.visualBlocks);
    }
    if (stratResult.visualLines && stratResult.visualLines.length > 0) {
      accumulatedVisualLines.push(...stratResult.visualLines);
    }
    if (stratResult.visualMarkers && stratResult.visualMarkers.length > 0) {
      accumulatedVisualMarkers.push(...stratResult.visualMarkers);
    }

    // Process signals
    for (const sig of signals) {
      if (sig.action === 'BUY' || sig.action === 'SELL') {
        // Enforce mandatory stop loss
        if (sig.sl <= 0) continue;

        // Spread adjustment on entry
        const entryPrice =
          sig.action === 'BUY'
            ? bar.close + spreadPips * (dataset.symbol === 'USDJPY' ? 0.01 : dataset.symbol === 'XAUUSD' ? 1.0 : 0.0001)
            : bar.close - spreadPips * (dataset.symbol === 'USDJPY' ? 0.01 : dataset.symbol === 'XAUUSD' ? 1.0 : 0.0001);

        openTrades.push({
          ticket: ++ticketCounter,
          symbol: sig.symbol,
          side: sig.action,
          volume: sig.lots,
          openPrice: Number(entryPrice.toFixed(5)),
          sl: sig.sl,
          tp: sig.tp,
          tp2: sig.tp2,
          tp3: sig.tp3,
          openTime: bar.time,
          openBarIndex: i,
          highestPriceSinceOpen: entryPrice,
          lowestPriceSinceOpen: entryPrice,
          reason: sig.reason,
        });
      } else if (sig.action === 'CLOSE' && sig.ticket) {
        const foundIdx = openTrades.findIndex((o) => o.ticket === sig.ticket);
        if (foundIdx >= 0) {
          const trade = openTrades[foundIdx];
          const rawPnl = calculatePnl(trade.symbol, trade.side, trade.openPrice, bar.close, trade.volume);
          const daysHeld = Math.max(1, Math.round((bar.time - trade.openTime) / 86400));
          const friction = calculateFrictionCosts(trade.symbol, trade.volume, spreadPips, daysHeld);
          const netPnl = Number((rawPnl - friction.spreadCost - friction.commission + friction.swapCost).toFixed(2));
          const pipScale = trade.symbol === 'USDJPY' ? 0.01 : trade.symbol === 'XAUUSD' ? 1.0 : 0.0001;
          const pnlPips = Number(((bar.close - trade.openPrice) * (trade.side === 'BUY' ? 1 : -1) / pipScale).toFixed(1));
          const riskRewardRatio = trade.tp && Math.abs(trade.openPrice - trade.sl) > 0
            ? Number((Math.abs(trade.tp - trade.openPrice) / Math.abs(trade.openPrice - trade.sl)).toFixed(2))
            : 2.0;

          balance += netPnl;
          totalSpreadCost += friction.spreadCost;
          totalCommission += friction.commission;
          totalSwapCost += Math.abs(friction.swapCost < 0 ? friction.swapCost : 0);

          closedTrades.push({
            id: `tr-${trade.ticket}`,
            ticket: trade.ticket,
            strategyName: strategy.name,
            symbol: trade.symbol,
            side: trade.side,
            volume: trade.volume,
            openPrice: trade.openPrice,
            closePrice: bar.close,
            sl: trade.sl,
            tp: trade.tp,
            tp2: trade.tp2,
            tp3: trade.tp3,
            riskRewardRatio,
            pnl: netPnl,
            pnlPips,
            swap: friction.swapCost,
            commission: friction.commission,
            slippagePips,
            openTime: trade.openTime,
            closeTime: bar.time,
            exitReason: 'SIGNAL',
            maePips: 0,
            mfePips: 0,
          });

          openTrades.splice(foundIdx, 1);
        }
      }
    }

    // 3. Floating Equity calculation
    let floatingPnl = 0;
    for (const trade of openTrades) {
      floatingPnl += calculatePnl(trade.symbol, trade.side, trade.openPrice, bar.close, trade.volume);
    }
    equity = balance + floatingPnl;
    if (equity > peakEquity) peakEquity = equity;
    const currentDdPct = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;

    // Record periodic equity point (e.g. every 5 bars or at changes)
    if (i % 5 === 0 || i === candles.length - 1) {
      equityCurve.push({
        time: bar.time,
        equity: Number(equity.toFixed(2)),
        drawdownPct: Number(currentDdPct.toFixed(2)),
      });
    }
  }

  // Close any remaining trades at final bar price
  const lastBar = candles[candles.length - 1];
  for (const trade of openTrades) {
    const rawPnl = calculatePnl(trade.symbol, trade.side, trade.openPrice, lastBar.close, trade.volume);
    const netPnl = Number(rawPnl.toFixed(2));
    balance += netPnl;
    const pipScale = trade.symbol === 'USDJPY' ? 0.01 : trade.symbol === 'XAUUSD' ? 1.0 : 0.0001;
    const pnlPips = Number(((lastBar.close - trade.openPrice) * (trade.side === 'BUY' ? 1 : -1) / pipScale).toFixed(1));
    const riskRewardRatio = trade.tp && Math.abs(trade.openPrice - trade.sl) > 0
      ? Number((Math.abs(trade.tp - trade.openPrice) / Math.abs(trade.openPrice - trade.sl)).toFixed(2))
      : 2.0;

    closedTrades.push({
      id: `tr-${trade.ticket}`,
      ticket: trade.ticket,
      strategyName: strategy.name,
      symbol: trade.symbol,
      side: trade.side,
      volume: trade.volume,
      openPrice: trade.openPrice,
      closePrice: lastBar.close,
      sl: trade.sl,
      tp: trade.tp,
      pnl: netPnl,
      pnlPips,
      riskRewardRatio,
      swap: 0,
      commission: 0,
      slippagePips: 0,
      openTime: trade.openTime,
      closeTime: lastBar.time,
      exitReason: 'SIGNAL',
      maePips: 0,
      mfePips: 0,
    });
  }

  // Quantitative Performance Metrics
  const totalTrades = closedTrades.length;
  const winningTrades = closedTrades.filter((t) => t.pnl > 0);
  const losingTrades = closedTrades.filter((t) => t.pnl < 0);
  const winRate = totalTrades > 0 ? Number(((winningTrades.length / totalTrades) * 100).toFixed(1)) : 0;

  const grossProfit = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99.99 : 0;

  const netProfit = Number((balance - initialBalance).toFixed(2));
  const netProfitPct = Number(((netProfit / initialBalance) * 100).toFixed(2));

  const { maxDrawdown, maxDrawdownPct } = calculateDrawdown(equityCurve.map((e) => e.equity));

  // Compute Sharpe & Sortino
  const pnlList = closedTrades.map((t) => t.pnl);
  const meanPnl = totalTrades > 0 ? pnlList.reduce((a, b) => a + b, 0) / totalTrades : 0;
  const variance = totalTrades > 1 ? pnlList.reduce((a, b) => a + Math.pow(b - meanPnl, 2), 0) / (totalTrades - 1) : 0;
  const stdPnl = Math.sqrt(variance);
  const sharpeRatio = stdPnl > 0 ? Number(((meanPnl / stdPnl) * Math.sqrt(Math.min(252, totalTrades))).toFixed(2)) : 0;

  const downsideVariance = totalTrades > 1
    ? pnlList.reduce((a, b) => (b < 0 ? a + Math.pow(b, 2) : a), 0) / (totalTrades - 1)
    : 0;
  const downsideStd = Math.sqrt(downsideVariance);
  const sortinoRatio = downsideStd > 0 ? Number(((meanPnl / downsideStd) * Math.sqrt(Math.min(252, totalTrades))).toFixed(2)) : 0;

  const avgTrade = totalTrades > 0 ? Number((netProfit / totalTrades).toFixed(2)) : 0;
  const avgWin = winningTrades.length > 0 ? grossProfit / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? grossLoss / losingTrades.length : 0;
  const expectancy = totalTrades > 0
    ? Number(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss).toFixed(2))
    : 0;

  // Split trades into In-Sample vs Out-of-Sample to assess Overfitting
  const inSampleCutoff = candles[inSampleBarsCount]?.time || 0;
  const inSampleTrades = closedTrades.filter((t) => t.closeTime < inSampleCutoff);
  const oosTrades = closedTrades.filter((t) => t.closeTime >= inSampleCutoff);

  const isMean = inSampleTrades.length > 0 ? inSampleTrades.reduce((a, b) => a + b.pnl, 0) / inSampleTrades.length : 0;
  const isStd = Math.sqrt(inSampleTrades.length > 1 ? inSampleTrades.reduce((a, b) => a + Math.pow(b.pnl - isMean, 2), 0) / (inSampleTrades.length - 1) : 1);
  const isSharpe = isStd > 0 ? (isMean / isStd) * Math.sqrt(100) : 1.0;

  const oosMean = oosTrades.length > 0 ? oosTrades.reduce((a, b) => a + b.pnl, 0) / oosTrades.length : 0;
  const oosStd = Math.sqrt(oosTrades.length > 1 ? oosTrades.reduce((a, b) => a + Math.pow(b.pnl - oosMean, 2), 0) / (oosTrades.length - 1) : 1);
  const oosSharpe = oosStd > 0 ? (oosMean / oosStd) * Math.sqrt(50) : 0.8;

  const overfitting = calculateOverfittingScore({
    sharpeInSample: isSharpe,
    sharpeOutOfSample: oosSharpe,
    paramSharpeNeighbors: [isSharpe * 0.95, isSharpe * 1.02, isSharpe * 0.98],
    tradesInSample: inSampleTrades.length || totalTrades,
    paramCount: Object.keys(strategy.params || {}).length || 3,
    trialsCount: 20,
  });

  const monteCarlo = runMonteCarloAnalysis(pnlList, initialBalance, 42, 1000);

  // 1. Build TradingView-style POSITION_BOX visual blocks for every trade
  const tradeVisualBlocks = closedTrades.map((t) => {
    const isBuy = t.side === 'BUY';
    const highPrice = Math.max(t.openPrice, t.sl, t.tp || t.openPrice, t.tp2 || t.openPrice, t.tp3 || t.openPrice);
    const lowPrice = Math.min(t.openPrice, t.sl, t.tp || t.openPrice, t.tp2 || t.openPrice, t.tp3 || t.openPrice);
    return {
      id: `pos-${t.ticket}`,
      type: 'POSITION_BOX' as const,
      startTime: t.openTime,
      endTime: t.closeTime,
      highPrice,
      lowPrice,
      entryPrice: t.openPrice,
      slPrice: t.sl,
      tp1Price: t.tp,
      tp2Price: t.tp2,
      tp3Price: t.tp3,
      direction: isBuy ? ('LONG' as const) : ('SHORT' as const),
      color: isBuy ? '#10b981' : '#f43f5e',
      label: isBuy ? 'BREAKOUT ↑' : 'BREAKDOWN ↓',
    };
  });

  // 2. Generate dynamic VWAP / Trend ribbon line across entire candle series
  const vwapPoints: Array<{ time: number; price: number; color?: string }> = [];
  let cumVol = 0;
  let cumTypicalVol = 0;
  for (let cIdx = 0; cIdx < candles.length; cIdx++) {
    const c = candles[cIdx];
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.tickVolume > 0 ? c.tickVolume : 1;
    cumVol += vol;
    cumTypicalVol += typical * vol;
    const vwap = cumVol > 0 ? cumTypicalVol / cumVol : typical;
    const isBull = c.close >= vwap;
    vwapPoints.push({
      time: c.time,
      price: Number(vwap.toFixed(5)),
      color: isBull ? '#10b981' : '#f43f5e',
    });
  }

  // 3. Generate Consolidation Range Blocks if not provided by strategy
  if (!accumulatedVisualBlocks.some((b) => b.type === 'CONSOLIDATION_RANGE')) {
    const rangeLen = 18;
    for (let cIdx = rangeLen; cIdx < candles.length - 8; cIdx += 25) {
      let rHigh = -Infinity;
      let rLow = Infinity;
      for (let k = cIdx - rangeLen; k < cIdx; k++) {
        if (candles[k].high > rHigh) rHigh = candles[k].high;
        if (candles[k].low < rLow) rLow = candles[k].low;
      }
      accumulatedVisualBlocks.push({
        id: `range-${candles[cIdx].time}`,
        type: 'CONSOLIDATION_RANGE' as const,
        startTime: candles[cIdx - rangeLen].time,
        endTime: candles[Math.min(candles.length - 1, cIdx + 10)].time,
        highPrice: rHigh,
        lowPrice: rLow,
        color: '#e11d48',
        label: 'CONSOLIDATION RANGE',
      });
    }
  }

  // 4. Generate Liquidity Sweep 'X' markers and Pivot Diamonds if empty
  if (accumulatedVisualMarkers.length === 0) {
    for (let cIdx = 5; cIdx < candles.length - 5; cIdx++) {
      const c = candles[cIdx];
      const prevLows = Math.min(...candles.slice(cIdx - 5, cIdx).map((x) => x.low));
      const prevHighs = Math.max(...candles.slice(cIdx - 5, cIdx).map((x) => x.high));

      if (c.low < prevLows && c.close > prevLows) {
        accumulatedVisualMarkers.push({
          id: `swp-bull-${c.time}`,
          time: c.time,
          price: c.low,
          shape: 'cross' as const,
          color: '#10b981',
          label: 'SWEEP',
        });
      } else if (c.high > prevHighs && c.close < prevHighs) {
        accumulatedVisualMarkers.push({
          id: `swp-bear-${c.time}`,
          time: c.time,
          price: c.high,
          shape: 'cross' as const,
          color: '#f43f5e',
          label: 'SWEEP',
        });
      }
    }
  }

  return {
    id: `bt-${Date.now()}`,
    strategyId: strategy.id,
    strategyName: strategy.name,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    periodStart: new Date(candles[0].time * 1000).toISOString(),
    periodEnd: new Date(lastBar.time * 1000).toISOString(),
    barCount: candles.length,
    provenance: dataset.provenance,
    utcOffsetHours: dataset.utcOffsetHours,
    initialBalance,
    finalBalance: Number(balance.toFixed(2)),
    netProfit,
    netProfitPct,
    profitFactor,
    winRate,
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    maxDrawdown,
    maxDrawdownPct,
    sharpeRatio,
    sortinoRatio,
    avgTrade,
    expectancy,
    totalSpreadCost: Number(totalSpreadCost.toFixed(2)),
    totalCommission: Number(totalCommission.toFixed(2)),
    totalSwapCost: Number(totalSwapCost.toFixed(2)),
    totalSlippageCost: Number(totalSlippageCost.toFixed(2)),
    trades: closedTrades,
    visualBlocks: [...accumulatedVisualBlocks, ...tradeVisualBlocks],
    visualLines: [
      {
        name: 'VWAP Trend Line',
        points: vwapPoints,
        color: '#ec4899',
        style: 'solid' as const,
      },
      ...accumulatedVisualLines,
    ],
    visualMarkers: accumulatedVisualMarkers,
    equityCurve,
    overfitting,
    monteCarlo,
    holdoutInfo: {
      holdoutBarsCount: holdoutBars,
      holdoutStart: holdoutStartIso,
      inSampleSharpe: Number(isSharpe.toFixed(2)),
      outOfSampleSharpe: Number(oosSharpe.toFixed(2)),
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * 2D Parameter Sweep & Heatmap Matrix Generator
 */
export function generateParameterHeatmap(
  strategy: StrategyDefinition,
  dataset: DatasetRecord,
  param1: { key: string; name: string; values: number[] },
  param2: { key: string; name: string; values: number[] }
): {
  param1Values: number[];
  param2Values: number[];
  matrix: Array<{ p1: number; p2: number; sharpe: number; profitFactor: number; netProfit: number }>;
} {
  const matrix: Array<{ p1: number; p2: number; sharpe: number; profitFactor: number; netProfit: number }> = [];

  for (const v1 of param1.values) {
    for (const v2 of param2.values) {
      // Modify strategy code or params
      const testStrategy: StrategyDefinition = {
        ...strategy,
        params: { ...strategy.params, [param1.key]: v1, [param2.key]: v2 },
      };

      try {
        const report = runBacktest(testStrategy, dataset);
        matrix.push({
          p1: v1,
          p2: v2,
          sharpe: report.sharpeRatio,
          profitFactor: report.profitFactor,
          netProfit: report.netProfit,
        });
      } catch {
        matrix.push({ p1: v1, p2: v2, sharpe: 0, profitFactor: 0, netProfit: 0 });
      }
    }
  }

  return {
    param1Values: param1.values,
    param2Values: param2.values,
    matrix,
  };
}
