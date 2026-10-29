import { describe, it, expect } from 'vitest';
import { BotRecord, PositionRecord, OrderRecord, TradeRecord } from '../../types/forex';

/**
 * Stage 3 Feature: Automated Bot Inspection & Trade Mapping Unit Tests
 * Companion test suite with explicit failing-case counterparts.
 */

// Pure helper function simulating the trade mapper from BotsView
export function mapBotTrades(
  bot: BotRecord,
  positions: PositionRecord[],
  orders: OrderRecord[]
): TradeRecord[] {
  const list: TradeRecord[] = [];

  const matchedPositions = positions.filter(
    (p) => p.botId === bot.id || p.magicNumber === bot.magicNumber
  );

  matchedPositions.forEach((pos) => {
    if (!Number.isFinite(pos.openPrice) || !Number.isFinite(pos.volume)) {
      throw new Error('INVALID_POSITION_GEOMETRY');
    }

    list.push({
      id: `pos-${pos.ticket}`,
      ticket: pos.ticket,
      botId: pos.botId || bot.id,
      strategyName: bot.strategyName,
      symbol: pos.symbol,
      side: pos.side,
      volume: pos.volume,
      openPrice: pos.openPrice,
      closePrice: pos.currentPrice,
      sl: pos.sl,
      tp: pos.tp,
      pnl: pos.pnl,
      swap: pos.swap,
      commission: pos.commission,
      openTime: pos.openTime,
      closeTime: 0,
      exitReason: 'SIGNAL',
      slippagePips: 0,
      maePips: 0,
      mfePips: 0,
    });
  });

  const matchedOrders = orders.filter(
    (o) => o.botId === bot.id || o.magicNumber === bot.magicNumber
  );

  matchedOrders.forEach((ord) => {
    if (ord.ticket && ord.fillPrice && Number.isFinite(ord.fillPrice)) {
      list.push({
        id: `ord-${ord.id}`,
        ticket: ord.ticket,
        botId: ord.botId || bot.id,
        strategyName: bot.strategyName,
        symbol: ord.symbol,
        side: ord.side,
        volume: ord.volume,
        openPrice: ord.intentPrice,
        closePrice: ord.fillPrice,
        sl: ord.sl,
        tp: ord.tp,
        pnl: 0,
        swap: 0,
        commission: 0,
        openTime: ord.createdAt,
        closeTime: ord.filledAt || ord.createdAt,
        exitReason: 'SIGNAL',
        slippagePips: 0,
        maePips: 0,
        mfePips: 0,
      });
    }
  });

  return list;
}

export function resolveBotInitialIndicators(strategyId: string) {
  const sId = (strategyId || '').toLowerCase();
  if (sId.includes('turtle') || sId.includes('donchian')) {
    return {
      showDonchian: true,
      showSMA20: true,
      showEMA50: false,
      showSupertrend: false,
      showVWAP: false,
    };
  }
  if (sId.includes('gold') || sId.includes('momentum') || sId.includes('pullback')) {
    return {
      showDonchian: false,
      showSMA20: true,
      showEMA50: true,
      showSupertrend: true,
      showVWAP: true,
    };
  }
  return {
    showDonchian: false,
    showSMA20: true,
    showEMA50: true,
    showSupertrend: false,
    showVWAP: true,
  };
}

describe('Automated Bot Inspection & Trade Mapping Suite', () => {
  const sampleBot: BotRecord = {
    id: 'bot-turtle-eur',
    name: 'Turtle Donchian EURUSD',
    magicNumber: 101,
    symbol: 'EURUSD',
    timeframe: 'H1',
    strategyId: 'strat-turtle',
    strategyName: 'Turtle Donchian Breakout',
    mode: 'DEMO',
    status: 'RUNNING',
    todayPnl: 280.0,
    totalPnl: 1420.0,
    winCount: 14,
    lossCount: 6,
    riskLimits: {
      maxLots: 1.0,
      maxSpreadPips: 2.5,
      maxDrawdownPct: 15.0,
      maxRiskPerTradePct: 2.0,
      dailyLossLimitPct: 5.0,
      maxOpenPositions: 3,
      mandatoryStopLoss: true,
      tradingHours: { startUtcHour: 0, endUtcHour: 24 },
    },
  };

  const samplePositions: PositionRecord[] = [
    {
      ticket: 5019281,
      botId: 'bot-turtle-eur',
      magicNumber: 101,
      symbol: 'EURUSD',
      side: 'BUY',
      volume: 1.0,
      openPrice: 1.0825,
      currentPrice: 1.0853,
      sl: 1.0795,
      tp: 1.0915,
      pnl: 280.0,
      swap: -3.2,
      commission: 7.0,
      openTime: 1729000000,
      comment: 'Donchian Breakout',
      mode: 'DEMO',
    },
    {
      ticket: 8192088,
      botId: 'bot-xau-gold',
      magicNumber: 104,
      symbol: 'XAUUSD',
      side: 'BUY',
      volume: 0.5,
      openPrice: 2642.0,
      currentPrice: 2648.5,
      sl: 2638.0,
      tp: 2660.0,
      pnl: 325.0,
      swap: -4.25,
      commission: 3.5,
      openTime: 1729050000,
      comment: 'Gold Momentum',
      mode: 'DEMO',
    },
  ];

  it('filters and accurately maps active positions for the inspected bot', () => {
    const trades = mapBotTrades(sampleBot, samplePositions, []);

    expect(trades).toHaveLength(1);
    expect(trades[0].ticket).toBe(5019281);
    expect(trades[0].symbol).toBe('EURUSD');
    expect(trades[0].side).toBe('BUY');
    expect(trades[0].volume).toBe(1.0);
    expect(trades[0].openPrice).toBe(1.0825);
    expect(trades[0].sl).toBe(1.0795);
    expect(trades[0].tp).toBe(1.0915);
    expect(trades[0].pnl).toBe(280.0);
    expect(Number.isFinite(trades[0].openPrice)).toBe(true);
  });

  it('failing-case counterpart: strictly rejects position matching other bots and prevents cross-contamination', () => {
    const trades = mapBotTrades(sampleBot, samplePositions, []);
    const goldTrade = trades.find((t) => t.ticket === 8192088);
    expect(goldTrade).toBeUndefined();
  });

  it('failing-case counterpart: throws and prevents NaN pollution when openPrice is NaN or infinite', () => {
    const corruptedPosition: PositionRecord = {
      ...samplePositions[0],
      openPrice: NaN,
    };

    expect(() => {
      mapBotTrades(sampleBot, [corruptedPosition], []);
    }).toThrow('INVALID_POSITION_GEOMETRY');
  });

  it('maps historical filled orders into chart trade records', () => {
    const sampleOrders: OrderRecord[] = [
      {
        id: 'ord-101-1',
        idempotencyKey: 'key-101-1',
        botId: 'bot-turtle-eur',
        magicNumber: 101,
        ticket: 5019200,
        symbol: 'EURUSD',
        side: 'BUY',
        volume: 0.8,
        intentPrice: 1.081,
        fillPrice: 1.0812,
        sl: 1.078,
        tp: 1.088,
        status: 'FILLED',
        comment: 'Historical order',
        createdAt: 1728900000,
        filledAt: 1728900002,
      },
      {
        id: 'ord-other-bot',
        idempotencyKey: 'key-other',
        botId: 'bot-other',
        magicNumber: 999,
        ticket: 999001,
        symbol: 'EURUSD',
        side: 'SELL',
        volume: 1.0,
        intentPrice: 1.085,
        fillPrice: 1.085,
        sl: 1.088,
        status: 'FILLED',
        comment: 'Other bot order',
        createdAt: 1728900000,
      },
    ];

    const trades = mapBotTrades(sampleBot, [], sampleOrders);
    expect(trades).toHaveLength(1);
    expect(trades[0].ticket).toBe(5019200);
    expect(trades[0].volume).toBe(0.8);
    expect(trades[0].openPrice).toBe(1.081);
    expect(trades[0].closePrice).toBe(1.0812);
  });

  it('resolves correct indicator presets for Turtle Donchian vs Trend Pullback / Gold Momentum strategies', () => {
    const turtlePreset = resolveBotInitialIndicators('strat-turtle');
    expect(turtlePreset.showDonchian).toBe(true);
    expect(turtlePreset.showSMA20).toBe(true);
    expect(turtlePreset.showSupertrend).toBe(false);

    const goldPreset = resolveBotInitialIndicators('strat-gold-momentum');
    expect(goldPreset.showDonchian).toBe(false);
    expect(goldPreset.showSupertrend).toBe(true);
    expect(goldPreset.showEMA50).toBe(true);
  });
});
