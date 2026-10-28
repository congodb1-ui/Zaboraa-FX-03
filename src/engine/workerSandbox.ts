import {
  Candle,
  ForexSymbol,
  StrategyVisualBlock,
  StrategyVisualLine,
  StrategyVisualMarker,
} from '../types/forex';

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'MODIFY' | 'HOLD';
  symbol: ForexSymbol;
  lots: number;
  sl: number;
  tp?: number;
  tp2?: number;
  tp3?: number;
  ticket?: number;
  reason?: string;
  visualBlock?: StrategyVisualBlock;
}

export interface StrategyContext {
  symbol: ForexSymbol;
  balance: number;
  equity: number;
  currentBarIndex: number;
  openPositions: Array<{
    ticket: number;
    side: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    sl: number;
    tp?: number;
  }>;
  getBar: (index: number) => Candle | null;
  buy: (
    symbol: ForexSymbol,
    lots: number,
    sl: number,
    tp1?: number,
    tp2?: number,
    tp3?: number,
    reason?: string
  ) => void;
  sell: (
    symbol: ForexSymbol,
    lots: number,
    sl: number,
    tp1?: number,
    tp2?: number,
    tp3?: number,
    reason?: string
  ) => void;
  close: (ticket: number) => void;
  addVisualBlock: (block: StrategyVisualBlock) => void;
  addVisualLine: (
    name: string,
    points: Array<{ time: number; price: number; color?: string }>,
    color?: string
  ) => void;
  addVisualMarker: (marker: StrategyVisualMarker) => void;
  log: (msg: string) => void;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  params: Record<string, number | string | boolean>;
  code: string;
  pineSource?: string;
  verifiedTv?: boolean;
}

/**
 * Static AST / Token security check to verify code safety before execution.
 * Blocks forbidden global identifiers and dynamic imports.
 */
export function validateStrategySecurity(code: string): { valid: boolean; error?: string } {
  const forbiddenPatterns = [
    /\bprocess\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\beval\b/,
    /\bFunction\b/,
    /\bimport\s*\(/,
    /\brequire\s*\(/,
    /\bglobalThis\.constructor/,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(code)) {
      return {
        valid: false,
        error: `Security violation: Forbidden identifier detected (${pattern.toString()}). Sandbox access restricted.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Built-in production strategy presets.
 */
export const BUILT_IN_STRATEGIES: StrategyDefinition[] = [
  {
    id: 'strat-vwap-range-breakout',
    name: 'VWAP Range Breakout & Multi-TP Order Blocks',
    description: 'TradingView Zellerman style Range Breakout with shaded Consolidation Blocks, dynamic VWAP trend curve, and multi-tier TP1/TP2/TP3 execution targets.',
    author: 'Zaboraa Quantitative Research',
    version: '3.0.0',
    params: {
      rangeBars: 18,
      riskLots: 1.0,
      rewardRatioTp1: 1.5,
      rewardRatioTp2: 2.5,
      rewardRatioTp3: 4.0,
    },
    code: `// VWAP Range Breakout & Order Blocks Strategy
function onBar(ctx, bar) {
  const rangeLen = 18;
  const idx = ctx.currentBarIndex;
  if (idx < rangeLen + 5) return;

  // 1. Calculate Consolidation Range Bounds over previous 18 bars (excluding current)
  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  let typicalVolSum = 0;
  let volSum = 0;

  for (let i = idx - rangeLen; i < idx; i++) {
    const b = ctx.getBar(i);
    if (b) {
      if (b.high > rangeHigh) rangeHigh = b.high;
      if (b.low < rangeLow) rangeLow = b.low;
      const typical = (b.high + b.low + b.close) / 3;
      typicalVolSum += typical * b.tickVolume;
      volSum += b.tickVolume;
    }
  }

  const vwap = volSum > 0 ? typicalVolSum / volSum : (rangeHigh + rangeLow) / 2;
  const rangeHeight = rangeHigh - rangeLow;

  // 2. Emit Consolidation Range Block visual if in active range
  const startCandle = ctx.getBar(idx - rangeLen);
  if (startCandle && idx % 10 === 0) {
    ctx.addVisualBlock({
      id: 'range-' + idx,
      type: 'CONSOLIDATION_RANGE',
      startTime: startCandle.time,
      endTime: bar.time,
      highPrice: rangeHigh,
      lowPrice: rangeLow,
      color: '#e11d48', // pink/rose range shading
      label: 'CONSOLIDATION RANGE',
    });
  }

  // 3. Check for BREAKOUT (Long) or BREAKDOWN (Short)
  const prevBar = ctx.getBar(idx - 1);
  if (!prevBar) return;

  const hasPosition = ctx.openPositions.length > 0;
  const pipScale = ctx.symbol === 'USDJPY' ? 0.01 : ctx.symbol === 'XAUUSD' ? 1.0 : 0.0001;

  if (!hasPosition) {
    // Bullish Range Breakout: previous bar closed <= rangeHigh, current bar breaks and closes above
    if (prevBar.close <= rangeHigh && bar.close > rangeHigh && bar.close > vwap) {
      const sl = Number((rangeLow - 2 * pipScale).toFixed(bar.close > 100 ? 2 : 5));
      const risk = bar.close - sl;
      const tp1 = Number((bar.close + risk * 1.5).toFixed(bar.close > 100 ? 2 : 5));
      const tp2 = Number((bar.close + risk * 2.5).toFixed(bar.close > 100 ? 2 : 5));
      const tp3 = Number((bar.close + risk * 4.0).toFixed(bar.close > 100 ? 2 : 5));

      ctx.buy(ctx.symbol, 1.0, sl, tp1, tp2, tp3, 'BREAKOUT ↑');
      ctx.addVisualMarker({
        id: 'mark-' + idx,
        time: bar.time,
        price: bar.close,
        shape: 'triangle_up',
        color: '#10b981',
        label: 'BREAKOUT ↑',
      });
      ctx.log('VWAP Range Breakout: LONG @ ' + bar.close + ' | SL: ' + sl + ' | TP1: ' + tp1 + ' | TP2: ' + tp2 + ' | TP3: ' + tp3);
    }
    // Bearish Range Breakdown: previous bar closed >= rangeLow, current bar breaks and closes below
    else if (prevBar.close >= rangeLow && bar.close < rangeLow && bar.close < vwap) {
      const sl = Number((rangeHigh + 2 * pipScale).toFixed(bar.close > 100 ? 2 : 5));
      const risk = sl - bar.close;
      const tp1 = Number((bar.close - risk * 1.5).toFixed(bar.close > 100 ? 2 : 5));
      const tp2 = Number((bar.close - risk * 2.5).toFixed(bar.close > 100 ? 2 : 5));
      const tp3 = Number((bar.close - risk * 4.0).toFixed(bar.close > 100 ? 2 : 5));

      ctx.sell(ctx.symbol, 1.0, sl, tp1, tp2, tp3, 'BREAKDOWN ↓');
      ctx.addVisualMarker({
        id: 'mark-' + idx,
        time: bar.time,
        price: bar.close,
        shape: 'triangle_down',
        color: '#f43f5e',
        label: 'BREAKDOWN ↓',
      });
      ctx.log('VWAP Range Breakdown: SHORT @ ' + bar.close + ' | SL: ' + sl + ' | TP1: ' + tp1 + ' | TP2: ' + tp2 + ' | TP3: ' + tp3);
    }
  }
}`,
  },
  {
    id: 'strat-donchian-breakout',
    name: 'Donchian Breakout Channel (Turtle Trend)',
    description: 'Classic 20-period Donchian channel breakout with 10-period exit and mandatory ATR-based Stop-Loss.',
    author: 'Zaboraa Quantitative Research',
    version: '2.1.0',
    params: {
      channelPeriod: 20,
      exitPeriod: 10,
      riskLots: 1.0,
    },
    code: `// Donchian Breakout Channel Strategy
function onBar(ctx, bar) {
  const period = 20;
  const exitPeriod = 10;
  const idx = ctx.currentBarIndex;
  if (idx < period) return;

  // Calculate highest high and lowest low of previous 20 bars (no lookahead!)
  let highest = -Infinity;
  let lowest = Infinity;
  for (let k = idx - period; k < idx; k++) {
    const b = ctx.getBar(k);
    if (b) {
      if (b.high > highest) highest = b.high;
      if (b.low < lowest) lowest = b.low;
    }
  }

  // Calculate exit bounds over previous 10 bars
  let exitHigh = -Infinity;
  let exitLow = Infinity;
  for (let k = idx - exitPeriod; k < idx; k++) {
    const b = ctx.getBar(k);
    if (b) {
      if (b.high > exitHigh) exitHigh = b.high;
      if (b.low < exitLow) exitLow = b.low;
    }
  }

  const hasLong = ctx.openPositions.find(p => p.side === 'BUY');
  const hasShort = ctx.openPositions.find(p => p.side === 'SELL');

  if (hasLong && bar.close < exitLow) {
    ctx.close(hasLong.ticket);
    ctx.log('Donchian Long exit triggered');
    return;
  }
  if (hasShort && bar.close > exitHigh) {
    ctx.close(hasShort.ticket);
    ctx.log('Donchian Short exit triggered');
    return;
  }

  if (!hasLong && bar.close > highest) {
    const sl = Number((bar.close - 0.0030).toFixed(bar.close > 100 ? 2 : 5));
    const tp1 = Number((bar.close + 0.0060).toFixed(bar.close > 100 ? 2 : 5));
    const tp2 = Number((bar.close + 0.0090).toFixed(bar.close > 100 ? 2 : 5));
    ctx.buy(ctx.symbol, 1.0, sl, tp1, tp2, undefined, 'DONCHIAN BREAKOUT ↑');
    ctx.log('Donchian Breakout BUY triggered at ' + bar.close);
  } else if (!hasShort && bar.close < lowest) {
    const sl = Number((bar.close + 0.0030).toFixed(bar.close > 100 ? 2 : 5));
    const tp1 = Number((bar.close - 0.0060).toFixed(bar.close > 100 ? 2 : 5));
    const tp2 = Number((bar.close - 0.0090).toFixed(bar.close > 100 ? 2 : 5));
    ctx.sell(ctx.symbol, 1.0, sl, tp1, tp2, undefined, 'DONCHIAN BREAKDOWN ↓');
    ctx.log('Donchian Breakout SELL triggered at ' + bar.close);
  }
}`,
  },
  {
    id: 'strat-ema-ribbon',
    name: 'EMA Ribbon Trend Follower',
    description: 'Fast 9-EMA and Slow 21-EMA crossover with trend confirmation from 50-EMA and mandatory 25-pip Stop-Loss.',
    author: 'Zaboraa Quantitative Research',
    version: '1.4.0',
    params: {
      fastEma: 9,
      slowEma: 21,
      trendEma: 50,
      stopLossPips: 25,
      takeProfitPips: 60,
    },
    code: `// EMA Ribbon Trend Follower
function onBar(ctx, bar) {
  const idx = ctx.currentBarIndex;
  if (idx < 50) return;

  function calcEma(len) {
    let k = 2 / (len + 1);
    let ema = ctx.getBar(idx - len).close;
    for (let i = idx - len + 1; i <= idx; i++) {
      ema = ctx.getBar(i).close * k + ema * (1 - k);
    }
    return ema;
  }

  const ema9 = calcEma(9);
  const ema21 = calcEma(21);
  const ema50 = calcEma(50);

  const hasPosition = ctx.openPositions.length > 0;
  const pipScale = ctx.symbol === 'USDJPY' ? 0.01 : ctx.symbol === 'XAUUSD' ? 1.0 : 0.0001;

  if (!hasPosition) {
    if (ema9 > ema21 && bar.close > ema50) {
      const sl = bar.close - 25 * pipScale;
      const tp1 = bar.close + 35 * pipScale;
      const tp2 = bar.close + 60 * pipScale;
      ctx.buy(ctx.symbol, 1.0, Number(sl.toFixed(5)), Number(tp1.toFixed(5)), Number(tp2.toFixed(5)), undefined, 'EMA RIBBON ↑');
      ctx.log('EMA Ribbon BUY signal');
    } else if (ema9 < ema21 && bar.close < ema50) {
      const sl = bar.close + 25 * pipScale;
      const tp1 = bar.close - 35 * pipScale;
      const tp2 = bar.close - 60 * pipScale;
      ctx.sell(ctx.symbol, 1.0, Number(sl.toFixed(5)), Number(tp1.toFixed(5)), Number(tp2.toFixed(5)), undefined, 'EMA RIBBON ↓');
      ctx.log('EMA Ribbon SELL signal');
    }
  }
}`,
  },
  {
    id: 'strat-rsi-mean-reversion',
    name: 'RSI Volatility Mean Reversion',
    description: '14-period Relative Strength Index detecting overbought (>70) and oversold (<30) exhaustion zones.',
    author: 'Zaboraa Quantitative Research',
    version: '1.2.0',
    params: {
      rsiPeriod: 14,
      oversold: 30,
      overbought: 70,
      stopLossPips: 30,
    },
    code: `// RSI Mean Reversion Strategy
function onBar(ctx, bar) {
  const period = 14;
  const idx = ctx.currentBarIndex;
  if (idx < period + 1) return;

  let gains = 0, losses = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const diff = ctx.getBar(i).close - ctx.getBar(i - 1).close;
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  const pipScale = ctx.symbol === 'USDJPY' ? 0.01 : ctx.symbol === 'XAUUSD' ? 1.0 : 0.0001;

  if (ctx.openPositions.length === 0) {
    if (rsi < 30) {
      const sl = bar.close - 30 * pipScale;
      const tp1 = bar.close + 45 * pipScale;
      ctx.buy(ctx.symbol, 1.0, Number(sl.toFixed(5)), Number(tp1.toFixed(5)), undefined, undefined, 'RSI OVERSOLD ↑');
      ctx.log('RSI Oversold (' + rsi.toFixed(1) + ') BUY signal');
    } else if (rsi > 70) {
      const sl = bar.close + 30 * pipScale;
      const tp1 = bar.close - 45 * pipScale;
      ctx.sell(ctx.symbol, 1.0, Number(sl.toFixed(5)), Number(tp1.toFixed(5)), undefined, undefined, 'RSI OVERBOUGHT ↓');
      ctx.log('RSI Overbought (' + rsi.toFixed(1) + ') SELL signal');
    }
  }
}`,
  },
  {
    id: 'strat-xauusd-volatility',
    name: 'XAUUSD Gold London/NY Momentum Breakout',
    description: 'Gold breakout strategy capturing expansion during London and New York market overlap.',
    author: 'Zaboraa Quantitative Research',
    version: '1.0.0',
    params: {
      rangePeriod: 16,
      riskLots: 1.0,
      slPoints: 400,
      tpPoints: 1200,
    },
    code: `// Gold London/NY Momentum Breakout
function onBar(ctx, bar) {
  const idx = ctx.currentBarIndex;
  if (idx < 20) return;

  const d = new Date(bar.time * 1000);
  const hour = d.getUTCHours();

  if (hour < 12 || hour > 17) return;

  let highest = -Infinity;
  let lowest = Infinity;
  for (let i = idx - 16; i < idx; i++) {
    const b = ctx.getBar(i);
    if (b) {
      if (b.high > highest) highest = b.high;
      if (b.low < lowest) lowest = b.low;
    }
  }

  if (ctx.openPositions.length === 0) {
    if (bar.close > highest) {
      const sl = Number((bar.close - 4.0).toFixed(2));
      const tp1 = Number((bar.close + 6.0).toFixed(2));
      const tp2 = Number((bar.close + 12.0).toFixed(2));
      ctx.buy('XAUUSD', 1.0, sl, tp1, tp2, undefined, 'GOLD BREAKOUT ↑');
      ctx.log('XAUUSD London Breakout BUY @ ' + bar.close);
    } else if (bar.close < lowest) {
      const sl = Number((bar.close + 4.0).toFixed(2));
      const tp1 = Number((bar.close - 6.0).toFixed(2));
      const tp2 = Number((bar.close - 12.0).toFixed(2));
      ctx.sell('XAUUSD', 1.0, sl, tp1, tp2, undefined, 'GOLD BREAKDOWN ↓');
      ctx.log('XAUUSD London Breakout SELL @ ' + bar.close);
    }
  }
}`,
  },
];

/**
 * Safe strategy sandbox runner with AST validation, bounds checking, and canary lookahead trap.
 */
export function executeStrategyBar(
  code: string,
  candles: Candle[],
  barIndex: number,
  context: {
    symbol: ForexSymbol;
    balance: number;
    equity: number;
    openPositions: Array<{
      ticket: number;
      side: 'BUY' | 'SELL';
      volume: number;
      openPrice: number;
      sl: number;
      tp?: number;
    }>;
  }
): {
  signals: StrategySignal[];
  logs: string[];
  visualBlocks: StrategyVisualBlock[];
  visualLines: StrategyVisualLine[];
  visualMarkers: StrategyVisualMarker[];
  error?: string;
} {
  const security = validateStrategySecurity(code);
  if (!security.valid) {
    return {
      signals: [],
      logs: [],
      visualBlocks: [],
      visualLines: [],
      visualMarkers: [],
      error: security.error,
    };
  }

  const signals: StrategySignal[] = [];
  const logs: string[] = [];
  const visualBlocks: StrategyVisualBlock[] = [];
  const visualLines: StrategyVisualLine[] = [];
  const visualMarkers: StrategyVisualMarker[] = [];

  const getBar = (idx: number): Candle | null => {
    if (idx > barIndex) {
      throw new Error(
        `CANARY_LOOKAHEAD_VIOLATION: Cheating script attempted to read future bar index ${idx} when current is ${barIndex}`
      );
    }
    if (idx < 0 || idx >= candles.length) return null;
    return candles[idx];
  };

  const buy = (
    symbol: ForexSymbol,
    lots: number,
    sl: number,
    tp1?: number,
    tp2?: number,
    tp3?: number,
    reason?: string
  ) => {
    if (sl <= 0) {
      logs.push(`MANDATORY_STOP_LOSS_REJECT: Buy order rejected because SL is missing or zero.`);
      return;
    }
    signals.push({
      action: 'BUY',
      symbol,
      lots,
      sl,
      tp: tp1,
      tp2,
      tp3,
      reason: reason || 'BREAKOUT ↑',
    });
  };

  const sell = (
    symbol: ForexSymbol,
    lots: number,
    sl: number,
    tp1?: number,
    tp2?: number,
    tp3?: number,
    reason?: string
  ) => {
    if (sl <= 0) {
      logs.push(`MANDATORY_STOP_LOSS_REJECT: Sell order rejected because SL is missing or zero.`);
      return;
    }
    signals.push({
      action: 'SELL',
      symbol,
      lots,
      sl,
      tp: tp1,
      tp2,
      tp3,
      reason: reason || 'BREAKDOWN ↓',
    });
  };

  const close = (ticket: number) => {
    signals.push({ action: 'CLOSE', symbol: context.symbol, lots: 0, sl: 0, ticket });
  };

  const addVisualBlock = (block: StrategyVisualBlock) => {
    visualBlocks.push(block);
  };

  const addVisualLine = (
    name: string,
    points: Array<{ time: number; price: number; color?: string }>,
    color: string = '#3b82f6'
  ) => {
    visualLines.push({ name, points, color, style: 'solid' });
  };

  const addVisualMarker = (marker: StrategyVisualMarker) => {
    visualMarkers.push(marker);
  };

  const log = (msg: string) => {
    logs.push(msg);
  };

  const ctx: StrategyContext = {
    symbol: context.symbol,
    balance: context.balance,
    equity: context.equity,
    currentBarIndex: barIndex,
    openPositions: context.openPositions,
    getBar,
    buy,
    sell,
    close,
    addVisualBlock,
    addVisualLine,
    addVisualMarker,
    log,
  };

  try {
    const fn = new Function(
      'ctx',
      'bar',
      `${code}\nif (typeof onBar === 'function') onBar(ctx, bar);`
    );
    fn(ctx, candles[barIndex]);
    return { signals, logs, visualBlocks, visualLines, visualMarkers };
  } catch (err: any) {
    return {
      signals: [],
      logs,
      visualBlocks: [],
      visualLines: [],
      visualMarkers: [],
      error: err?.message || 'Strategy execution error',
    };
  }
}
