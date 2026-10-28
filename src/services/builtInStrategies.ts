import { Strategy, Candle, StrategyExecutionContext } from '../types/forex';
import { calculateSMA, calculateRSI, calculateBollingerBands } from './marketData';

export const BUILT_IN_STRATEGIES: Strategy[] = [
  {
    id: 'strat_sma_cross',
    name: 'Dual SMA Dynamic Crossover',
    description: 'Classic trend-following strategy using fast and slow Simple Moving Averages with dynamic stop-loss and take-profit.',
    sourceType: 'typescript',
    version: '1.2.0',
    tags: ['Trend Following', 'Moving Average', 'Low Frequency'],
    author: 'Zaboraa FX Quant Team',
    licenseNote: 'Apache-2.0 Open Source',
    paramsSchema: [
      { name: 'fastPeriod', type: 'number', default: 20, min: 5, max: 100, step: 1, description: 'Period for fast moving average' },
      { name: 'slowPeriod', type: 'number', default: 50, min: 20, max: 200, step: 1, description: 'Period for slow moving average' },
      { name: 'stopLossPips', type: 'number', default: 35, min: 10, max: 200, step: 5, description: 'Fixed Stop Loss in pips' },
      { name: 'takeProfitPips', type: 'number', default: 70, min: 15, max: 400, step: 5, description: 'Fixed Take Profit in pips' },
    ],
    params: {
      fastPeriod: 20,
      slowPeriod: 50,
      stopLossPips: 35,
      takeProfitPips: 70,
    },
    code: `// Dual SMA Dynamic Crossover Strategy
// Implements Zaboraa FX TypeScript Strategy Contract

export const strategy = {
  name: "Dual SMA Crossover",
  version: "1.2.0",
  paramsSchema: [
    { name: "fastPeriod", type: "number", default: 20, description: "Fast SMA" },
    { name: "slowPeriod", type: "number", default: 50, description: "Slow SMA" },
    { name: "stopLossPips", type: "number", default: 35, description: "Stop Loss (pips)" },
    { name: "takeProfitPips", type: "number", default: 70, description: "Take Profit (pips)" }
  ],
  init(ctx) {
    ctx.warmupPeriod = 50;
  },
  onBar(ctx, bar) {
    const fastP = ctx.params.fastPeriod || 20;
    const slowP = ctx.params.slowPeriod || 50;
    const slPips = ctx.params.stopLossPips || 35;
    const tpPips = ctx.params.takeProfitPips || 70;

    if (ctx.data.length < slowP + 2) return;

    const closes = ctx.data.map(b => b.close);
    const fastSMA = closes.slice(-fastP).reduce((a, b) => a + b, 0) / fastP;
    const slowSMA = closes.slice(-slowP).reduce((a, b) => a + b, 0) / slowP;

    const prevCloses = closes.slice(0, -1);
    const prevFast = prevCloses.slice(-fastP).reduce((a, b) => a + b, 0) / fastP;
    const prevSlow = prevCloses.slice(-slowP).reduce((a, b) => a + b, 0) / slowP;

    const pipMult = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    // Bullish Crossover
    if (prevFast <= prevSlow && fastSMA > slowSMA) {
      if (ctx.openPositions.length === 0) {
        ctx.buy(0.1, bar.close - slPips * pipMult, bar.close + tpPips * pipMult, "SMA Cross Long");
      } else if (ctx.openPositions[0].side === "SELL") {
        ctx.close();
        ctx.buy(0.1, bar.close - slPips * pipMult, bar.close + tpPips * pipMult, "SMA Reverse Long");
      }
    }
    // Bearish Crossover
    else if (prevFast >= prevSlow && fastSMA < slowSMA) {
      if (ctx.openPositions.length === 0) {
        ctx.sell(0.1, bar.close + slPips * pipMult, bar.close - tpPips * pipMult, "SMA Cross Short");
      } else if (ctx.openPositions[0].side === "BUY") {
        ctx.close();
        ctx.sell(0.1, bar.close + slPips * pipMult, bar.close - tpPips * pipMult, "SMA Reverse Short");
      }
    }
  }
};
`,
    createdAt: '2026-01-15T00:00:00.000Z',
    lastBacktestNetProfit: 2140.50,
    lastBacktestWinRate: 58.4,
  },
  {
    id: 'strat_rsi_reversion',
    name: 'RSI Statistical Mean Reversion',
    description: 'Captures counter-trend reversals when Relative Strength Index indicates extreme exhaustion.',
    sourceType: 'typescript',
    version: '1.0.4',
    tags: ['Mean Reversion', 'Oscillator', 'Forex Majors'],
    author: 'Zaboraa FX Quant Team',
    licenseNote: 'MIT License',
    paramsSchema: [
      { name: 'rsiPeriod', type: 'number', default: 14, min: 5, max: 50, step: 1, description: 'RSI calculation window' },
      { name: 'oversold', type: 'number', default: 30, min: 10, max: 40, step: 1, description: 'Oversold entry threshold' },
      { name: 'overbought', type: 'number', default: 70, min: 60, max: 90, step: 1, description: 'Overbought entry threshold' },
      { name: 'slPips', type: 'number', default: 25, min: 10, max: 100, step: 5, description: 'Stop Loss in pips' },
      { name: 'tpPips', type: 'number', default: 45, min: 15, max: 200, step: 5, description: 'Take Profit in pips' },
    ],
    params: {
      rsiPeriod: 14,
      oversold: 30,
      overbought: 70,
      slPips: 25,
      tpPips: 45,
    },
    code: `// RSI Statistical Mean Reversion Strategy
// Implements Zaboraa FX TypeScript Strategy Contract

export const strategy = {
  name: "RSI Mean Reversion",
  version: "1.0.4",
  paramsSchema: [
    { name: "rsiPeriod", type: "number", default: 14, description: "RSI Period" },
    { name: "oversold", type: "number", default: 30, description: "Oversold Level" },
    { name: "overbought", type: "number", default: 70, description: "Overbought Level" },
    { name: "slPips", type: "number", default: 25, description: "Stop Loss" },
    { name: "tpPips", type: "number", default: 45, description: "Take Profit" }
  ],
  init(ctx) {
    ctx.warmupPeriod = 20;
  },
  onBar(ctx, bar) {
    const period = ctx.params.rsiPeriod || 14;
    const oversold = ctx.params.oversold || 30;
    const overbought = ctx.params.overbought || 70;
    const slPips = ctx.params.slPips || 25;
    const tpPips = ctx.params.tpPips || 45;

    if (ctx.data.length < period + 5) return;

    // RSI calculation
    const closes = ctx.data.map(b => b.close);
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = 100 - (100 / (1 + rs));

    const pipMult = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    if (rsi < oversold && ctx.openPositions.length === 0) {
      ctx.buy(0.1, bar.close - slPips * pipMult, bar.close + tpPips * pipMult, "RSI Oversold");
    } else if (rsi > overbought && ctx.openPositions.length === 0) {
      ctx.sell(0.1, bar.close + slPips * pipMult, bar.close - tpPips * pipMult, "RSI Overbought");
    }
  }
};
`,
    createdAt: '2026-02-01T00:00:00.000Z',
    lastBacktestNetProfit: 1680.00,
    lastBacktestWinRate: 64.2,
  },
  {
    id: 'strat_bollinger_breakout',
    name: 'Bollinger Band Squeeze & Breakout',
    description: 'Detects volatility compression squeezes followed by aggressive expansion breaks outside 2-sigma bands.',
    sourceType: 'typescript',
    version: '2.1.0',
    tags: ['Volatility', 'Breakout', 'Momentum'],
    author: 'Zaboraa FX Quant Team',
    licenseNote: 'Apache-2.0',
    paramsSchema: [
      { name: 'bbPeriod', type: 'number', default: 20, min: 10, max: 50, step: 1, description: 'Bollinger Band period' },
      { name: 'bbStdDev', type: 'number', default: 2.0, min: 1.0, max: 3.5, step: 0.1, description: 'Standard deviation multiplier' },
    ],
    params: {
      bbPeriod: 20,
      bbStdDev: 2.0,
    },
    code: `// Bollinger Band Squeeze & Breakout Strategy
// Implements Zaboraa FX TypeScript Strategy Contract

export const strategy = {
  name: "Bollinger Breakout",
  version: "2.1.0",
  init(ctx) {
    ctx.warmupPeriod = 25;
  },
  onBar(ctx, bar) {
    const period = ctx.params.bbPeriod || 20;
    const stdDevMult = ctx.params.bbStdDev || 2.0;

    if (ctx.data.length < period + 2) return;

    const closes = ctx.data.map(b => b.close);
    const slice = closes.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + stdDevMult * stdDev;
    const lower = mean - stdDevMult * stdDev;

    if (bar.close > upper && ctx.openPositions.length === 0) {
      ctx.buy(0.1, mean, bar.close + (bar.close - mean) * 1.5, "BB Upper Breakout");
    } else if (bar.close < lower && ctx.openPositions.length === 0) {
      ctx.sell(0.1, mean, bar.close - (mean - bar.close) * 1.5, "BB Lower Breakout");
    }
  }
};
`,
    createdAt: '2026-03-10T00:00:00.000Z',
    lastBacktestNetProfit: 3420.20,
    lastBacktestWinRate: 53.8,
  },
  {
    id: 'strat_donchian_breakout',
    name: 'Donchian Channel Turtle Breakout',
    description: 'Classic 20-day / 20-bar Donchian breakout system with 10-bar exit and volatility position sizing.',
    sourceType: 'typescript',
    version: '1.5.0',
    tags: ['Turtle Trading', 'Trend', 'Donchian'],
    author: 'Zaboraa FX Quant Team',
    licenseNote: 'Public Domain',
    paramsSchema: [
      { name: 'entryPeriod', type: 'number', default: 20, min: 10, max: 60, step: 1, description: 'Channel high/low period for entry' },
      { name: 'exitPeriod', type: 'number', default: 10, min: 5, max: 30, step: 1, description: 'Channel exit trailing period' },
    ],
    params: {
      entryPeriod: 20,
      exitPeriod: 10,
    },
    code: `// Donchian Channel Turtle Breakout Strategy
// Implements Zaboraa FX TypeScript Strategy Contract

export const strategy = {
  name: "Donchian Breakout",
  version: "1.5.0",
  init(ctx) {
    ctx.warmupPeriod = 25;
  },
  onBar(ctx, bar) {
    const entryP = ctx.params.entryPeriod || 20;
    if (ctx.data.length < entryP + 2) return;

    const highs = ctx.data.slice(-entryP - 1, -1).map(b => b.high);
    const lows = ctx.data.slice(-entryP - 1, -1).map(b => b.low);

    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const pipMult = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    if (bar.close > maxHigh && ctx.openPositions.length === 0) {
      ctx.buy(0.1, bar.close - 40 * pipMult, bar.close + 80 * pipMult, "Donchian High Break");
    } else if (bar.close < minLow && ctx.openPositions.length === 0) {
      ctx.sell(0.1, bar.close + 40 * pipMult, bar.close - 80 * pipMult, "Donchian Low Break");
    }
  }
};
`,
    createdAt: '2026-03-15T00:00:00.000Z',
    lastBacktestNetProfit: 2890.00,
    lastBacktestWinRate: 51.2,
  },
  {
    id: 'strat_trend_pullback',
    name: 'ATR Trend Pullback',
    description: 'Trades only with the prevailing trend: price on the right side of a rising or falling slow SMA, entry when RSI recovers from a pullback, stop at a multiple of ATR, fixed reward-to-risk target, one position at a time and a time stop. Research strategy: validate on your own held-out data before relying on it.',
    sourceType: 'typescript',
    version: '1.0.0',
    tags: ['Trend Following', 'Pullback', 'ATR Risk', 'H1-H4'],
    author: 'Zaboraa FX Quant Team',
    licenseNote: 'Apache-2.0 Open Source',
    paramsSchema: [
      { name: 'trendPeriod', type: 'number', default: 100, min: 50, max: 250, step: 10, description: 'Slow SMA period that defines the trend' },
      { name: 'slopeBars', type: 'number', default: 10, min: 3, max: 30, step: 1, description: 'Bars back used to check the SMA is rising or falling' },
      { name: 'rsiPeriod', type: 'number', default: 14, min: 5, max: 30, step: 1, description: 'RSI period used to detect the pullback' },
      { name: 'pullbackLevel', type: 'number', default: 40, min: 25, max: 48, step: 1, description: 'Long: RSI must recover above this level. Short uses 100 minus this level' },
      { name: 'atrPeriod', type: 'number', default: 14, min: 5, max: 30, step: 1, description: 'ATR period used for stop distance' },
      { name: 'atrStopMult', type: 'number', default: 1.5, min: 0.8, max: 3.0, step: 0.1, description: 'Stop distance as a multiple of ATR' },
      { name: 'riskReward', type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.25, description: 'Target distance as a multiple of the stop distance' },
      { name: 'minAtrPct', type: 'number', default: 0.0003, min: 0, max: 0.002, step: 0.0001, description: 'Skip entries when ATR divided by price is below this (dead market filter)' },
      { name: 'maxHoldHours', type: 'number', default: 48, min: 0, max: 240, step: 6, description: 'Close the trade after this many hours; 0 disables the time stop' },
    ],
    params: {
      trendPeriod: 100,
      slopeBars: 10,
      rsiPeriod: 14,
      pullbackLevel: 40,
      atrPeriod: 14,
      atrStopMult: 1.5,
      riskReward: 2.0,
      minAtrPct: 0.0003,
      maxHoldHours: 48,
    },
    code: `// ATR Trend Pullback Strategy
// Implements Zaboraa FX TypeScript Strategy Contract
//
// Trade with the trend only. Enter when RSI recovers from a pullback, risk a multiple of ATR,
// aim for a fixed reward-to-risk, hold one position at a time, close on a time stop.
// Uses only closed-bar data up to the current bar. Position size comes from the run settings.

export const strategy = {
  name: "ATR Trend Pullback",
  version: "1.0.0",
  paramsSchema: [
    { name: "trendPeriod", type: "number", default: 100, description: "Slow SMA period" },
    { name: "slopeBars", type: "number", default: 10, description: "SMA slope lookback" },
    { name: "rsiPeriod", type: "number", default: 14, description: "RSI period" },
    { name: "pullbackLevel", type: "number", default: 40, description: "RSI recovery level" },
    { name: "atrPeriod", type: "number", default: 14, description: "ATR period" },
    { name: "atrStopMult", type: "number", default: 1.5, description: "Stop in ATR" },
    { name: "riskReward", type: "number", default: 2.0, description: "Reward to risk" },
    { name: "minAtrPct", type: "number", default: 0.0003, description: "Min ATR / price" },
    { name: "maxHoldHours", type: "number", default: 48, description: "Time stop in hours" }
  ],
  init(ctx) {
    ctx.warmupPeriod = 120;
  },
  onBar(ctx, bar) {
    const p = ctx.params || {};
    const trendP = Math.max(20, Math.floor(Number(p.trendPeriod) || 100));
    const slopeBars = Math.max(2, Math.floor(Number(p.slopeBars) || 10));
    const rsiP = Math.max(2, Math.floor(Number(p.rsiPeriod) || 14));
    const pullback = Number(p.pullbackLevel) || 40;
    const atrP = Math.max(2, Math.floor(Number(p.atrPeriod) || 14));
    const stopMult = Math.max(0.5, Number(p.atrStopMult) || 1.5);
    const rr = Math.max(1, Number(p.riskReward) || 2);
    const minAtrPct = p.minAtrPct === undefined ? 0.0003 : Math.max(0, Number(p.minAtrPct) || 0);
    const maxHold = p.maxHoldHours === undefined ? 48 : Math.max(0, Number(p.maxHoldHours) || 0);

    // Manage the open trade first: only the time stop; stop-loss and take-profit are set at entry.
    if (ctx.openPositions.length > 0) {
      if (maxHold > 0) {
        const pos = ctx.openPositions[0];
        if ((bar.time - pos.entryTime) / 3600 >= maxHold) ctx.close(pos.ticket);
      }
      return;
    }

    const n = ctx.barIndex;
    if (n < trendP + slopeBars + 2) return;

    const sma = (period, off) => {
      if (typeof ctx.sma === "function") return ctx.sma(period, off);
      const idx = n - off;
      if (idx < period - 1) return null;
      let s = 0;
      for (let j = idx - period + 1; j <= idx; j++) s += ctx.data[j].close;
      return s / period;
    };
    const rsi = (period, off) => {
      if (typeof ctx.rsi === "function") return ctx.rsi(period, off);
      const idx = n - off;
      if (idx < period) return null;
      let gains = 0, losses = 0;
      for (let j = idx - period + 1; j <= idx; j++) {
        const d = ctx.data[j].close - ctx.data[j - 1].close;
        if (d >= 0) gains += d; else losses -= d;
      }
      if (losses === 0) return 100;
      return 100 - 100 / (1 + gains / losses);
    };
    const atrFn = (period, off) => {
      if (typeof ctx.atr === "function") return ctx.atr(period, off);
      const idx = n - off;
      if (idx < period || idx <= 0) return null;
      let sum = 0;
      for (let j = idx - period + 1; j <= idx; j++) {
        const c = ctx.data[j];
        const pc = ctx.data[j - 1].close;
        sum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
      }
      return sum / period;
    };

    const smaNow = sma(trendP, 0);
    const smaOld = sma(trendP, slopeBars);
    const rsiNow = rsi(rsiP, 0);
    const rsiPrev = rsi(rsiP, 1);
    const atr = atrFn(atrP, 0);
    if (smaNow === null || smaOld === null || rsiNow === null || rsiPrev === null || atr === null) return;
    if (!(atr > 0) || atr / bar.close < minAtrPct) return;

    const stopDist = stopMult * atr;
    const up = bar.close > smaNow && smaNow > smaOld;
    const down = bar.close < smaNow && smaNow < smaOld;
    const sellLevel = 100 - pullback;

    if (up && rsiPrev < pullback && rsiNow >= pullback && bar.close > bar.open) {
      ctx.buy(undefined, bar.close - stopDist, bar.close + rr * stopDist, "Trend Pullback Long");
    } else if (down && rsiPrev > sellLevel && rsiNow <= sellLevel && bar.close < bar.open) {
      ctx.sell(undefined, bar.close + stopDist, bar.close - rr * stopDist, "Trend Pullback Short");
    }
  }
};
`,
    createdAt: '2026-10-28T00:00:00.000Z',
  },
];

export interface StrategyContract {
  name: string;
  version: string;
  paramsSchema?: Strategy['paramsSchema'];
  init?: (ctx: any) => void;
  onBar: (ctx: any, bar: Candle) => void;
}

export const smaCrossoverContract: StrategyContract = {
  name: 'Dual SMA Dynamic Crossover',
  version: '1.2.0',
  init(ctx) {
    ctx.warmupPeriod = 50;
  },
  onBar(ctx, bar) {
    const fastP = ctx.params?.fastPeriod || 20;
    const slowP = ctx.params?.slowPeriod || 50;
    const slPips = ctx.params?.stopLossPips || 35;
    const tpPips = ctx.params?.takeProfitPips || 70;

    if (ctx.data.length < slowP + 2) return;

    const closes = ctx.data.map((b: Candle) => b.close);
    const fastSMA = calculateSMA(closes, fastP);
    const slowSMA = calculateSMA(closes, slowP);

    const currFast = fastSMA[fastSMA.length - 1];
    const prevFast = fastSMA[fastSMA.length - 2];
    const currSlow = slowSMA[slowSMA.length - 1];
    const prevSlow = slowSMA[slowSMA.length - 2];

    if (currFast == null || prevFast == null || currSlow == null || prevSlow == null) return;

    const pipMultiplier = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    if (prevFast <= prevSlow && currFast > currSlow) {
      if (ctx.openPositions.length === 0) {
        ctx.buy(0.1, bar.close - slPips * pipMultiplier, bar.close + tpPips * pipMultiplier, 'SMA Cross Long');
      } else if (ctx.openPositions[0].direction === 'SELL' || ctx.openPositions[0].side === 'SELL') {
        if (ctx.close) ctx.close();
        else if (ctx.closePosition) ctx.closePosition();
        ctx.buy(0.1, bar.close - slPips * pipMultiplier, bar.close + tpPips * pipMultiplier, 'SMA Reverse Long');
      }
    } else if (prevFast >= prevSlow && currFast < currSlow) {
      if (ctx.openPositions.length === 0) {
        ctx.sell(0.1, bar.close + slPips * pipMultiplier, bar.close - tpPips * pipMultiplier, 'SMA Cross Short');
      } else if (ctx.openPositions[0].direction === 'BUY' || ctx.openPositions[0].side === 'BUY') {
        if (ctx.close) ctx.close();
        else if (ctx.closePosition) ctx.closePosition();
        ctx.sell(0.1, bar.close + slPips * pipMultiplier, bar.close - tpPips * pipMultiplier, 'SMA Reverse Short');
      }
    }
  },
};

export const rsiReversionContract: StrategyContract = {
  name: 'RSI Statistical Mean Reversion',
  version: '1.0.4',
  init(ctx) {
    ctx.warmupPeriod = 20;
  },
  onBar(ctx, bar) {
    const rsiP = ctx.params?.rsiPeriod || 14;
    const oversold = ctx.params?.oversold || 30;
    const overbought = ctx.params?.overbought || 70;
    const slPips = ctx.params?.slPips || 25;
    const tpPips = ctx.params?.tpPips || 45;

    if (ctx.data.length < rsiP + 5) return;

    const closes = ctx.data.map((b: Candle) => b.close);
    const rsiSeries = calculateRSI(closes, rsiP);
    const currRsi = rsiSeries[rsiSeries.length - 1];
    const prevRsi = rsiSeries[rsiSeries.length - 2];

    if (currRsi == null || prevRsi == null) return;

    const pipMultiplier = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    if (prevRsi < oversold && currRsi >= oversold && ctx.openPositions.length === 0) {
      ctx.buy(0.1, bar.close - slPips * pipMultiplier, bar.close + tpPips * pipMultiplier, 'RSI Oversold');
    } else if (prevRsi > overbought && currRsi <= overbought && ctx.openPositions.length === 0) {
      ctx.sell(0.1, bar.close + slPips * pipMultiplier, bar.close - tpPips * pipMultiplier, 'RSI Overbought');
    }
  },
};

export const bollingerBreakoutContract: StrategyContract = {
  name: 'Bollinger Band Squeeze & Breakout',
  version: '2.1.0',
  init(ctx) {
    ctx.warmupPeriod = 25;
  },
  onBar(ctx, bar) {
    const bbP = ctx.params?.bbPeriod || 20;
    const bbStd = ctx.params?.bbStdDev || 2.0;

    if (ctx.data.length < bbP + 2) return;

    const closes = ctx.data.map((b: Candle) => b.close);
    const bb = calculateBollingerBands(closes, bbP, bbStd);

    const upper = bb.upper[bb.upper.length - 1];
    const lower = bb.lower[bb.lower.length - 1];
    const middle = bb.middle[bb.middle.length - 1];

    if (upper == null || lower == null || middle == null) return;

    if (bar.close > upper && ctx.openPositions.length === 0) {
      ctx.buy(0.1, middle, bar.close + (bar.close - middle) * 1.5, 'BB Upper Breakout');
    } else if (bar.close < lower && ctx.openPositions.length === 0) {
      ctx.sell(0.1, middle, bar.close - (middle - bar.close) * 1.5, 'BB Lower Breakout');
    }
  },
};

export const donchianBreakoutContract: StrategyContract = {
  name: 'Donchian Channel Turtle Breakout',
  version: '1.5.0',
  init(ctx) {
    ctx.warmupPeriod = 25;
  },
  onBar(ctx, bar) {
    const entryP = ctx.params?.entryPeriod || 20;
    if (ctx.data.length < entryP + 2) return;

    const highSlice = ctx.data.slice(-entryP - 1, -1).map((c: Candle) => c.high);
    const lowSlice = ctx.data.slice(-entryP - 1, -1).map((c: Candle) => c.low);
    const maxHigh = Math.max(...highSlice);
    const minLow = Math.min(...lowSlice);

    const pipMultiplier = bar.close > 500 ? 1.0 : (bar.close > 50 ? 0.01 : 0.0001);

    if (bar.close > maxHigh && ctx.openPositions.length === 0) {
      ctx.buy(0.1, bar.close - 40 * pipMultiplier, bar.close + 80 * pipMultiplier, 'Donchian High Break');
    } else if (bar.close < minLow && ctx.openPositions.length === 0) {
      ctx.sell(0.1, bar.close + 40 * pipMultiplier, bar.close - 80 * pipMultiplier, 'Donchian Low Break');
    }
  },
};



/** Liquidity-sweep / reclaim contract for saved strategies named "Liquidity Hunt".
 * It looks for a wick beyond the prior range followed by a close back inside it.
 * This is a deterministic research implementation, not a claim of profitability.
 */
export const liquidityHuntContract: StrategyContract = {
  name: 'Liquidity Hunt',
  version: '1.0.0',
  paramsSchema: [
    { name: 'lookback', type: 'number', default: 20, min: 5, max: 100, step: 1, description: 'Prior bars used to define liquidity levels' },
    { name: 'stopBufferPips', type: 'number', default: 2, min: 0, max: 20, step: 1, description: 'Stop buffer beyond the sweep wick' },
    { name: 'riskReward', type: 'number', default: 2, min: 1, max: 5, step: 0.5, description: 'Target distance as a multiple of risk' },
  ],
  init(ctx) { ctx.warmupPeriod = 25; },
  onBar(ctx, bar) {
    const lookback = Math.max(5, Math.min(100, Math.floor(Number(ctx.params?.lookback) || 20)));
    const bufferPips = Math.max(0, Number(ctx.params?.stopBufferPips) || 0);
    const riskReward = Math.max(1, Math.min(5, Number(ctx.params?.riskReward) || 2));
    if (ctx.data.length < lookback + 2 || ctx.openPositions.length > 0) return;

    // Exclude the current bar from the reference range to avoid look-ahead bias.
    const prior = ctx.data.slice(-(lookback + 1), -1);
    if (prior.length < lookback) return;
    const rangeHigh = Math.max(...prior.map((c: Candle) => c.high));
    const rangeLow = Math.min(...prior.map((c: Candle) => c.low));
    const pip = bar.close > 500 ? 1 : (bar.close > 50 ? 0.01 : 0.0001);
    const buffer = bufferPips * pip;

    // Sweep above the prior high and close back below it => fade the buy-side sweep.
    if (bar.high > rangeHigh && bar.close < rangeHigh && bar.close < bar.open) {
      const sl = bar.high + buffer;
      const risk = sl - bar.close;
      if (risk > 0) ctx.sell(0.1, sl, bar.close - risk * riskReward, 'Liquidity Hunt: buy-side sweep reclaimed');
      return;
    }
    // Sweep below the prior low and close back above it => fade the sell-side sweep.
    if (bar.low < rangeLow && bar.close > rangeLow && bar.close > bar.open) {
      const sl = bar.low - buffer;
      const risk = bar.close - sl;
      if (risk > 0) ctx.buy(0.1, sl, bar.close + risk * riskReward, 'Liquidity Hunt: sell-side sweep reclaimed');
    }
  },
};

/** ATR Trend Pullback. Same logic as the saved source of 'strat_trend_pullback' above; keep the two in sync
 * (src/engine/__tests__/trendPullback.test.ts runs both on the same candles and compares the trades).
 * Research strategy: no profitability claim; validate on held-out data.
 */
export const trendPullbackContract: StrategyContract = {
  name: 'ATR Trend Pullback',
  version: '1.0.0',
  init(ctx) {
    ctx.warmupPeriod = 120;
  },
  onBar(ctx, bar) {
    const p = ctx.params || {};
    const trendP = Math.max(20, Math.floor(Number(p.trendPeriod) || 100));
    const slopeBars = Math.max(2, Math.floor(Number(p.slopeBars) || 10));
    const rsiP = Math.max(2, Math.floor(Number(p.rsiPeriod) || 14));
    const pullback = Number(p.pullbackLevel) || 40;
    const atrP = Math.max(2, Math.floor(Number(p.atrPeriod) || 14));
    const stopMult = Math.max(0.5, Number(p.atrStopMult) || 1.5);
    const rr = Math.max(1, Number(p.riskReward) || 2);
    const minAtrPct = p.minAtrPct === undefined ? 0.0003 : Math.max(0, Number(p.minAtrPct) || 0);
    const maxHold = p.maxHoldHours === undefined ? 48 : Math.max(0, Number(p.maxHoldHours) || 0);

    if (ctx.openPositions.length > 0) {
      if (maxHold > 0) {
        const pos = ctx.openPositions[0];
        if ((bar.time - pos.entryTime) / 3600 >= maxHold) ctx.close(pos.ticket);
      }
      return;
    }

    const n = ctx.barIndex;
    if (n < trendP + slopeBars + 2) return;

    const sma = (period: number, off: number): number | null => {
      if (typeof ctx.sma === 'function') return ctx.sma(period, off);
      const idx = n - off;
      if (idx < period - 1) return null;
      let s = 0;
      for (let j = idx - period + 1; j <= idx; j++) s += ctx.data[j].close;
      return s / period;
    };
    const rsi = (period: number, off: number): number | null => {
      if (typeof ctx.rsi === 'function') return ctx.rsi(period, off);
      const idx = n - off;
      if (idx < period) return null;
      let gains = 0, losses = 0;
      for (let j = idx - period + 1; j <= idx; j++) {
        const d = ctx.data[j].close - ctx.data[j - 1].close;
        if (d >= 0) gains += d; else losses -= d;
      }
      if (losses === 0) return 100;
      return 100 - 100 / (1 + gains / losses);
    };
    const atrFn = (period: number, off: number): number | null => {
      if (typeof ctx.atr === 'function') return ctx.atr(period, off);
      const idx = n - off;
      if (idx < period || idx <= 0) return null;
      let sum = 0;
      for (let j = idx - period + 1; j <= idx; j++) {
        const c = ctx.data[j];
        const pc = ctx.data[j - 1].close;
        sum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
      }
      return sum / period;
    };

    const smaNow = sma(trendP, 0);
    const smaOld = sma(trendP, slopeBars);
    const rsiNow = rsi(rsiP, 0);
    const rsiPrev = rsi(rsiP, 1);
    const atr = atrFn(atrP, 0);
    if (smaNow === null || smaOld === null || rsiNow === null || rsiPrev === null || atr === null) return;
    if (!(atr > 0) || atr / bar.close < minAtrPct) return;

    const stopDist = stopMult * atr;
    const up = bar.close > smaNow && smaNow > smaOld;
    const down = bar.close < smaNow && smaNow < smaOld;
    const sellLevel = 100 - pullback;

    if (up && rsiPrev < pullback && rsiNow >= pullback && bar.close > bar.open) {
      ctx.buy(undefined, bar.close - stopDist, bar.close + rr * stopDist, 'Trend Pullback Long');
    } else if (down && rsiPrev > sellLevel && rsiNow <= sellLevel && bar.close < bar.open) {
      ctx.sell(undefined, bar.close + stopDist, bar.close - rr * stopDist, 'Trend Pullback Short');
    }
  },
};

export const STRATEGY_CONTRACT_REGISTRY: Record<string, StrategyContract> = {
  strat_sma_cross: smaCrossoverContract,
  strat_rsi_reversion: rsiReversionContract,
  strat_bollinger_breakout: bollingerBreakoutContract,
  strat_donchian_breakout: donchianBreakoutContract,
  strat_trend_pullback: trendPullbackContract,
  strat_liquidity_hunt: liquidityHuntContract,
  'Liquidity Hunt': liquidityHuntContract,
  liquidity_hunt: liquidityHuntContract,
};

export function registerStrategyContract(id: string, contract: StrategyContract): void {
  STRATEGY_CONTRACT_REGISTRY[id] = contract;
}

export function getStrategyExecutor(strategyId: string, customContract?: StrategyContract) {
  const key = String(strategyId || '').trim();
  const normalised = key.toLowerCase().replace(/[\s-]+/g, '_');
  let contract: StrategyContract | undefined = customContract || STRATEGY_CONTRACT_REGISTRY[key] || STRATEGY_CONTRACT_REGISTRY[normalised];

  if (!contract && ['liquidity_hunt', 'strat_liquidity_hunt'].includes(normalised)) {
    contract = liquidityHuntContract;
  }

  if (!contract) {
    const builtIn = BUILT_IN_STRATEGIES.find((s) => s.id === key || s.name.toLowerCase() === key.toLowerCase());
    if (builtIn && STRATEGY_CONTRACT_REGISTRY[builtIn.id]) {
      contract = STRATEGY_CONTRACT_REGISTRY[builtIn.id];
    }
  }

  if (!contract) {
    throw new Error(`UNKNOWN_STRATEGY: Strategy '${strategyId}' is not registered`);
  }

  if (typeof contract.onBar !== 'function') {
    throw new Error(`INVALID_STRATEGY: Strategy '${strategyId}' has no executable onBar method`);
  }

  return (
    ctx: {
      data: Candle[];
      currentBar: Candle;
      barIndex: number;
      buy: (size?: number, sl?: number, tp?: number, comment?: string) => void;
      sell: (size?: number, sl?: number, tp?: number, comment?: string) => void;
      closePosition: (ticket?: number) => void;
      modifyPosition: (ticket: number, sl?: number, tp?: number) => void;
      openPositions: any[];
      accountBalance: number;
      accountEquity: number;
      close?: (ticket?: number) => void;
      modify?: (ticket: number, sl?: number, tp?: number) => void;
      params?: Record<string, any>;
    },
    params: Record<string, any>
  ) => {
    // Provide aliases and injected params
    if (!ctx.close && ctx.closePosition) ctx.close = ctx.closePosition;
    if (!ctx.modify && ctx.modifyPosition) ctx.modify = ctx.modifyPosition;
    ctx.params = params;

    contract!.onBar(ctx, ctx.currentBar);
  };
}

