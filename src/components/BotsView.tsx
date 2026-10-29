import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  LineChart,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Square,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  BotMode,
  BotRecord,
  BotStatus,
  BrokerState,
  Candle,
  DatasetRecord,
  ForexSymbol,
  OrderRecord,
  PositionRecord,
  RiskEvent,
  TradeRecord,
} from '../types/forex';
import { BUILT_IN_STRATEGIES, StrategyDefinition } from '../engine/workerSandbox';
import { PriceChart } from './PriceChart';

export interface BotsViewProps {
  bots: BotRecord[];
  brokerState: BrokerState;
  riskEvents: RiskEvent[];
  positions?: PositionRecord[];
  orders?: OrderRecord[];
  strategies?: StrategyDefinition[];
  datasets?: DatasetRecord[];
  onClosePosition?: (ticket: number) => void | Promise<void>;
  onToggleBotStatus: (botId: string, newStatus: BotStatus) => void;
  onChangeBotMode: (botId: string, newMode: BotMode) => void;
  onAddBot: (bot: BotRecord) => void;
}

export const BotsView: React.FC<BotsViewProps> = ({
  bots,
  brokerState,
  riskEvents,
  positions = [],
  orders = [],
  strategies = [],
  datasets = [],
  onClosePosition,
  onToggleBotStatus,
  onChangeBotMode,
  onAddBot,
}) => {
  // Selected bot for deep inspection (defaults to first bot so inspector is immediately ready)
  const [selectedBotId, setSelectedBotId] = useState<string | null>(bots[0]?.id || null);
  const [inspectorTab, setInspectorTab] = useState<'chart' | 'orders' | 'strategy' | 'logs'>('chart');

  // Live Promotion safety modal state
  const [selectedBotForLive, setSelectedBotForLive] = useState<BotRecord | null>(null);
  const [typedConfirmationLogin, setTypedConfirmationLogin] = useState<string>('');
  const [liveGateError, setLiveGateError] = useState<string | null>(null);

  // Candles cache loaded for the bot's symbol and timeframe
  const [candlesCache, setCandlesCache] = useState<Record<string, Candle[]>>({});
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [closingTicket, setClosingTicket] = useState<number | null>(null);

  const selectedBot = useMemo(() => {
    return bots.find((b) => b.id === selectedBotId) || null;
  }, [bots, selectedBotId]);

  // Load candles for the inspected bot
  useEffect(() => {
    if (!selectedBot) return;
    const cacheKey = `${selectedBot.symbol}_${selectedBot.timeframe}`;

    // 1. Check local state cache
    if (candlesCache[cacheKey] && candlesCache[cacheKey].length > 0) return;

    // 2. Check datasets from props
    const match = datasets.find(
      (d) => d.symbol === selectedBot.symbol && d.timeframe === selectedBot.timeframe
    );
    if (match && match.candles && match.candles.length > 0) {
      setCandlesCache((prev) => ({ ...prev, [cacheKey]: match.candles }));
      return;
    }

    // 3. Fetch from SQLite endpoint
    setIsLoadingCandles(true);
    fetch(`/api/data/load?symbol=${selectedBot.symbol}&timeframe=${selectedBot.timeframe}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.candles && data.candles.length > 0) {
          setCandlesCache((prev) => ({ ...prev, [cacheKey]: data.candles }));
        }
      })
      .catch((err) => {
        console.warn('Could not load candle data for bot inspector:', err);
      })
      .finally(() => {
        setIsLoadingCandles(false);
      });
  }, [selectedBot, datasets]);

  const currentCandles = useMemo(() => {
    if (!selectedBot) return [];
    const cacheKey = `${selectedBot.symbol}_${selectedBot.timeframe}`;
    return candlesCache[cacheKey] || [];
  }, [selectedBot, candlesCache]);

  // Filter positions and orders specific to this bot
  const botPositions = useMemo(() => {
    if (!selectedBot) return [];
    return positions.filter(
      (p) => p.botId === selectedBot.id || p.magicNumber === selectedBot.magicNumber
    );
  }, [selectedBot, positions]);

  const botOrders = useMemo(() => {
    if (!selectedBot) return [];
    return orders.filter(
      (o) => o.botId === selectedBot.id || o.magicNumber === selectedBot.magicNumber
    );
  }, [selectedBot, orders]);

  const botRiskEvents = useMemo(() => {
    if (!selectedBot) return [];
    return riskEvents.filter(
      (e) =>
        !e.details?.symbol ||
        e.details?.symbol === selectedBot.symbol ||
        e.message?.includes(selectedBot.symbol)
    );
  }, [selectedBot, riskEvents]);

  // Map open positions and historical orders to TradeRecord for PriceChart
  const botTrades: TradeRecord[] = useMemo(() => {
    if (!selectedBot) return [];
    const list: TradeRecord[] = [];

    // Map open positions
    botPositions.forEach((pos) => {
      list.push({
        id: `pos-${pos.ticket}`,
        ticket: pos.ticket,
        botId: pos.botId || selectedBot.id,
        strategyName: selectedBot.strategyName,
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

    // Map historical closed orders
    botOrders.forEach((ord) => {
      if (ord.ticket && ord.fillPrice) {
        list.push({
          id: `ord-${ord.id}`,
          ticket: ord.ticket,
          botId: ord.botId || selectedBot.id,
          strategyName: selectedBot.strategyName,
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
  }, [selectedBot, botPositions, botOrders]);

  // Strategy definition metadata
  const botStrategy = useMemo(() => {
    if (!selectedBot) return null;
    return (
      strategies.find((s) => s.id === selectedBot.strategyId) ||
      BUILT_IN_STRATEGIES.find((s) => s.id === selectedBot.strategyId) ||
      null
    );
  }, [selectedBot, strategies]);

  // Strategy specific indicator preset
  const initialIndicators = useMemo(() => {
    if (!selectedBot) return { showSMA20: true, showEMA50: false };
    const sId = selectedBot.strategyId?.toLowerCase() || '';
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
  }, [selectedBot?.strategyId]);

  const handleOpenLiveModal = (bot: BotRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedBotForLive(bot);
    setTypedConfirmationLogin('');
    setLiveGateError(null);
  };

  const handleConfirmLivePromotion = () => {
    if (!selectedBotForLive) return;

    if (typedConfirmationLogin !== brokerState.accountLogin) {
      setLiveGateError(
        `Account confirmation mismatch! You typed "${typedConfirmationLogin}", but active account is "${brokerState.accountLogin}".`
      );
      return;
    }

    if (!brokerState.allowTrading) {
      setLiveGateError(
        'Broker configuration has ALLOW_TRADING=false. Live execution is blocked by system policy.'
      );
      return;
    }

    onChangeBotMode(selectedBotForLive.id, 'LIVE');
    setSelectedBotForLive(null);
  };

  const handleClosePositionClick = async (ticket: number) => {
    if (!onClosePosition) return;
    setClosingTicket(ticket);
    try {
      await onClosePosition(ticket);
    } catch (e) {
      console.error('Failed to close position:', e);
    } finally {
      setClosingTicket(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-text flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Automated Bot Fleet & Execution State Machine
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Click any automated bot below to inspect live strategy signals, interactive chart execution, open positions, and audit telemetry.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-1 rounded bg-bg border border-border text-text-muted">
              Active Bots: <strong>{bots.filter((b) => b.status === 'RUNNING').length}</strong> / {bots.length}
            </span>
          </div>
        </div>
      </div>

      {/* Bot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((b) => {
          const isRunning = b.status === 'RUNNING';
          const isPaused = b.status === 'PAUSED';
          const isSelected = selectedBotId === b.id;

          return (
            <div
              key={b.id}
              onClick={() => setSelectedBotId(isSelected ? null : b.id)}
              className={`rounded-lg border p-4 shadow-lg transition-all cursor-pointer relative ${
                isSelected
                  ? 'border-primary bg-surface ring-2 ring-primary/40 shadow-primary/10'
                  : isRunning
                  ? 'border-success/40 bg-bg hover:border-primary/50'
                  : isPaused
                  ? 'border-warning/40 bg-bg hover:border-primary/50'
                  : 'border-border bg-bg hover:border-primary/50'
              }`}
            >
              {/* Selected indicator badge */}
              {isSelected && (
                <div className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold tracking-wider uppercase shadow-md flex items-center gap-1 font-mono">
                  <span>Inspecting</span>
                </div>
              )}

              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-text flex items-center gap-1.5">
                    {b.name}
                  </h3>
                  <div className="text-xs text-text-muted font-mono mt-0.5">
                    Magic #{b.magicNumber} · {b.symbol} {b.timeframe}
                  </div>
                </div>

                {/* Mode Pill */}
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider uppercase font-mono ${
                      b.mode === 'LIVE'
                        ? 'bg-danger/20 text-danger border border-danger/30'
                        : b.mode === 'DEMO'
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-primary/20 text-primary border border-primary/30'
                    }`}
                  >
                    {b.mode}
                  </span>
                  <span
                    className={`text-xs font-mono font-semibold ${
                      isRunning
                        ? 'text-success'
                        : isPaused
                        ? 'text-warning'
                        : 'text-text-muted'
                    }`}
                  >
                    ● {b.status}
                  </span>
                </div>
              </div>

              {/* Bot Strategy Details */}
              <div className="mt-3 p-2.5 rounded bg-surface border border-border text-xs font-mono space-y-1.5">
                <div className="flex justify-between text-text-muted">
                  <span>Strategy:</span>
                  <strong className="text-text">{b.strategyName}</strong>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Max Lots / Spread:</span>
                  <strong className="text-text">
                    {b.riskLimits.maxLots} lots · {b.riskLimits.maxSpreadPips} pt
                  </strong>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Today P&L:</span>
                  <strong
                    className={`tabular-nums font-bold ${
                      b.todayPnl >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {b.todayPnl >= 0 ? '+' : ''}${b.todayPnl.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Controls */}
              <div
                className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1">
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={() => onToggleBotStatus(b.id, 'PAUSED')}
                      className="p-1.5 rounded bg-warning/20 hover:bg-warning/30 text-warning transition-colors cursor-pointer"
                      title="Pause Bot"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleBotStatus(b.id, 'RUNNING')}
                      className="p-1.5 rounded bg-success/20 hover:bg-success/30 text-success transition-colors cursor-pointer"
                      title="Start Bot"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleBotStatus(b.id, 'STOPPED')}
                    className="p-1.5 rounded bg-surface hover:bg-bg text-text-muted hover:text-text transition-colors cursor-pointer"
                    title="Stop Bot"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center gap-1 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => onChangeBotMode(b.id, 'PAPER')}
                    className={`px-2 py-1 rounded font-bold transition-colors cursor-pointer ${
                      b.mode === 'PAPER'
                        ? 'bg-primary text-white'
                        : 'bg-surface text-text-muted hover:text-text'
                    }`}
                  >
                    PAPER
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBotMode(b.id, 'DEMO')}
                    className={`px-2 py-1 rounded font-bold transition-colors cursor-pointer ${
                      b.mode === 'DEMO'
                        ? 'bg-success text-white'
                        : 'bg-surface text-text-muted hover:text-text'
                    }`}
                  >
                    DEMO
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleOpenLiveModal(b, e)}
                    className={`px-2 py-1 rounded font-bold transition-colors cursor-pointer ${
                      b.mode === 'LIVE'
                        ? 'bg-danger text-white'
                        : 'bg-surface text-danger hover:bg-danger/20'
                    }`}
                  >
                    LIVE
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dedicated Bot Inspection Panel (when a bot is clicked) */}
      {selectedBot && (
        <div className="rounded-xl border border-border bg-surface shadow-2xl p-6 space-y-5 animate-in fade-in duration-200">
          {/* Inspector Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-text">{selectedBot.name}</h3>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                    {selectedBot.symbol} · {selectedBot.timeframe}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                      selectedBot.mode === 'LIVE'
                        ? 'bg-danger/20 text-danger'
                        : selectedBot.mode === 'DEMO'
                        ? 'bg-success/20 text-success'
                        : 'bg-primary/20 text-primary'
                    }`}
                  >
                    {selectedBot.mode}
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5 font-mono">
                  Strategy: <strong>{selectedBot.strategyName}</strong> · Magic Number #{selectedBot.magicNumber}
                </p>
              </div>
            </div>

            {/* Quick Metrics & Close */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs font-mono bg-bg px-3.5 py-1.5 rounded-lg border border-border">
                <div className="text-right">
                  <div className="text-text-muted text-[11px]">Today P&L</div>
                  <div
                    className={`font-bold tabular-nums ${
                      selectedBot.todayPnl >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {selectedBot.todayPnl >= 0 ? '+' : ''}${selectedBot.todayPnl.toFixed(2)}
                  </div>
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="text-right">
                  <div className="text-text-muted text-[11px]">Open Positions</div>
                  <div className="font-bold text-text tabular-nums">{botPositions.length}</div>
                </div>
                <div className="w-px h-6 bg-border" />
                <div className="text-right">
                  <div className="text-text-muted text-[11px]">Orders History</div>
                  <div className="font-bold text-text tabular-nums">{botOrders.length}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBotId(null)}
                className="p-2 rounded-lg bg-bg hover:bg-surface border border-border text-text-muted hover:text-text transition-colors cursor-pointer"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Segmented Inspector Tab Bar */}
          <div className="flex items-center gap-1.5 border-b border-border pb-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setInspectorTab('chart')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                inspectorTab === 'chart'
                  ? 'bg-primary text-white shadow-sm font-semibold'
                  : 'bg-bg text-text-muted hover:text-text'
              }`}
            >
              <LineChart className="w-4 h-4" />
              <span>Live Strategy Chart</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('orders')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                inspectorTab === 'orders'
                  ? 'bg-primary text-white shadow-sm font-semibold'
                  : 'bg-bg text-text-muted hover:text-text'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Positions & Orders ({botPositions.length + botOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('strategy')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                inspectorTab === 'strategy'
                  ? 'bg-primary text-white shadow-sm font-semibold'
                  : 'bg-bg text-text-muted hover:text-text'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Strategy Rules & Logic</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('logs')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors cursor-pointer ${
                inspectorTab === 'logs'
                  ? 'bg-primary text-white shadow-sm font-semibold'
                  : 'bg-bg text-text-muted hover:text-text'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Execution Logs ({botRiskEvents.length})</span>
            </button>
          </div>

          {/* Tab 1: Live Strategy Chart */}
          {inspectorTab === 'chart' && (
            <div className="space-y-3">
              {/* Chart Information Kicker */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono px-3 py-2 rounded bg-bg border border-border">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-text">
                    <Activity className="w-3.5 h-3.5 text-primary" />
                    Feed: <strong>{selectedBot.symbol} · {selectedBot.timeframe}</strong>
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-muted">
                    Candles Loaded: <strong>{currentCandles.length}</strong>
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-text-muted">
                    Trade Markers: <strong>{botTrades.length}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {botPositions.length > 0 ? (
                    <span className="px-2 py-0.5 rounded bg-success/20 text-success font-bold flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Live Position Active (#{botPositions[0].ticket})
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      No active position · Monitoring closed-bar signals
                    </span>
                  )}
                </div>
              </div>

              {/* PriceChart Canvas */}
              {isLoadingCandles && currentCandles.length === 0 ? (
                <div className="h-[480px] rounded-xl border border-border bg-bg flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                  <span>Loading {selectedBot.symbol} {selectedBot.timeframe} price history...</span>
                </div>
              ) : currentCandles.length === 0 ? (
                <div className="h-[480px] rounded-xl border border-border bg-bg flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <AlertTriangle className="w-8 h-8 text-warning" />
                  <div className="max-w-md">
                    <h4 className="text-sm font-bold text-text">No Historical Candle Data Loaded</h4>
                    <p className="text-xs text-text-muted mt-1">
                      No bars currently in memory for {selectedBot.symbol} on {selectedBot.timeframe}. Load or import candles in the Data Manager to view chart history.
                    </p>
                  </div>
                </div>
              ) : (
                <PriceChart
                  candles={currentCandles}
                  symbol={selectedBot.symbol}
                  timeframe={selectedBot.timeframe}
                  trades={botTrades}
                  initialIndicators={initialIndicators}
                  height={480}
                />
              )}
            </div>
          )}

          {/* Tab 2: Positions & Orders */}
          {inspectorTab === 'orders' && (
            <div className="space-y-5">
              {/* Open Positions Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 font-mono">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    Active Open Positions ({botPositions.length})
                  </h4>
                  <span className="text-xs text-text-muted font-mono">
                    Reconciled with MT5 Terminal
                  </span>
                </div>

                {botPositions.length === 0 ? (
                  <div className="p-6 rounded-lg border border-border bg-bg text-center text-xs text-text-muted">
                    No open positions currently held by {selectedBot.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-bg border-b border-border text-text-muted">
                        <tr>
                          <th className="p-3">Ticket</th>
                          <th className="p-3">Side</th>
                          <th className="p-3">Lots</th>
                          <th className="p-3">Open Price</th>
                          <th className="p-3">Current</th>
                          <th className="p-3">Stop Loss</th>
                          <th className="p-3">Take Profit</th>
                          <th className="p-3">P&L</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {botPositions.map((p) => {
                          const isBuy = p.side === 'BUY';
                          const isProfit = p.pnl >= 0;
                          return (
                            <tr key={p.ticket} className="hover:bg-bg/50 transition-colors">
                              <td className="p-3 font-bold text-text">#{p.ticket}</td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    isBuy
                                      ? 'bg-success/20 text-success'
                                      : 'bg-danger/20 text-danger'
                                  }`}
                                >
                                  {p.side}
                                </span>
                              </td>
                              <td className="p-3 tabular-nums font-bold">{p.volume}</td>
                              <td className="p-3 tabular-nums text-text-muted">{p.openPrice}</td>
                              <td className="p-3 tabular-nums text-text">{p.currentPrice}</td>
                              <td className="p-3 tabular-nums text-danger">{p.sl}</td>
                              <td className="p-3 tabular-nums text-success">{p.tp || '—'}</td>
                              <td className="p-3 tabular-nums font-bold">
                                <span className={isProfit ? 'text-success' : 'text-danger'}>
                                  {isProfit ? '+' : ''}${p.pnl.toFixed(2)}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {onClosePosition && (
                                  <button
                                    type="button"
                                    onClick={() => handleClosePositionClick(p.ticket)}
                                    disabled={closingTicket === p.ticket}
                                    className="px-2.5 py-1 rounded text-[11px] font-bold bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30 transition-colors disabled:opacity-50 cursor-pointer"
                                  >
                                    {closingTicket === p.ticket ? 'Closing...' : 'Close'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Historical Orders Section */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 font-mono">
                  <Clock className="w-4 h-4 text-primary" />
                  Historical Orders Log ({botOrders.length})
                </h4>

                {botOrders.length === 0 ? (
                  <div className="p-6 rounded-lg border border-border bg-bg text-center text-xs text-text-muted">
                    No historical orders logged for {selectedBot.name}.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-bg border-b border-border text-text-muted sticky top-0">
                        <tr>
                          <th className="p-3">Order Ticket</th>
                          <th className="p-3">Side</th>
                          <th className="p-3">Volume</th>
                          <th className="p-3">Intent Price</th>
                          <th className="p-3">Fill Price</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-surface">
                        {botOrders.map((o) => (
                          <tr key={o.id} className="hover:bg-bg/50 transition-colors">
                            <td className="p-3 font-bold text-text">#{o.ticket || o.id}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                  o.side === 'BUY'
                                    ? 'bg-success/20 text-success'
                                    : 'bg-danger/20 text-danger'
                                }`}
                              >
                                {o.side}
                              </span>
                            </td>
                            <td className="p-3 tabular-nums">{o.volume}</td>
                            <td className="p-3 tabular-nums text-text-muted">{o.intentPrice}</td>
                            <td className="p-3 tabular-nums text-text">{o.fillPrice || '—'}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-bg border border-border text-text-muted font-bold">
                                {o.status}
                              </span>
                            </td>
                            <td className="p-3 text-text-muted">
                              {new Date(o.createdAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Strategy Rules & Logic */}
          {inspectorTab === 'strategy' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Algorithmic Specification */}
                <div className="p-4 rounded-lg border border-border bg-bg space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 font-mono">
                    <Sliders className="w-4 h-4 text-primary" />
                    Strategy Specification
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {botStrategy?.description ||
                      'Automated rule-based algorithmic trading strategy executing closed-bar signals in QuickJS isolated WASM sandbox.'}
                  </p>

                  <div className="p-3 rounded bg-surface border border-border text-xs font-mono space-y-1.5">
                    <div className="flex justify-between text-text-muted">
                      <span>Strategy ID:</span>
                      <strong className="text-text">{selectedBot.strategyId}</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Execution Mode:</span>
                      <strong className="text-text">Closed-Bar Evaluation (t-1)</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Sandbox Engine:</span>
                      <strong className="text-success">QuickJS WebAssembly</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Canary Lookahead Trap:</span>
                      <strong className="text-success">Enforced</strong>
                    </div>
                  </div>
                </div>

                {/* Risk Ceilings & Parameters */}
                <div className="p-4 rounded-lg border border-border bg-bg space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 font-mono">
                    <Shield className="w-4 h-4 text-warning" />
                    Risk Ceilings & Limits
                  </h4>

                  <div className="p-3 rounded bg-surface border border-border text-xs font-mono space-y-1.5">
                    <div className="flex justify-between text-text-muted">
                      <span>Max Lot Size:</span>
                      <strong className="text-text">{selectedBot.riskLimits.maxLots} lots</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Max Spread Ceiling:</span>
                      <strong className="text-text">{selectedBot.riskLimits.maxSpreadPips} pips</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Max Daily Loss:</span>
                      <strong className="text-text">{selectedBot.riskLimits.dailyLossLimitPct}%</strong>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Mandatory Stop Loss:</span>
                      <strong className="text-success">Broker Required</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy Parameters if present */}
              {botStrategy?.params && Object.keys(botStrategy.params).length > 0 && (
                <div className="p-4 rounded-lg border border-border bg-bg space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text font-mono">
                    Configured Input Parameters
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(botStrategy.params).map(([key, val]) => (
                      <div key={key} className="p-2 rounded bg-surface border border-border text-xs font-mono">
                        <div className="text-text-muted text-[11px]">{key}</div>
                        <div className="font-bold text-text">{String(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Execution & Risk Events Log */}
          {inspectorTab === 'logs' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 font-mono">
                <ShieldAlert className="w-4 h-4 text-warning" />
                Execution Diagnostics & Risk Audit Trail ({botRiskEvents.length})
              </h4>

              {botRiskEvents.length === 0 ? (
                <div className="p-6 rounded-lg border border-border bg-bg text-center text-xs text-text-muted">
                  No risk events or firewall blocks recorded for {selectedBot.name}.
                </div>
              ) : (
                <div className="space-y-1.5 font-mono text-xs max-h-64 overflow-y-auto">
                  {botRiskEvents.map((e) => (
                    <div
                      key={e.id}
                      className={`p-2.5 rounded border flex items-start justify-between gap-3 ${
                        e.severity === 'CRITICAL' || e.severity === 'BLOCKED'
                          ? 'bg-danger/10 border-danger/30 text-danger'
                          : e.severity === 'WARNING'
                          ? 'bg-warning/10 border-warning/30 text-warning'
                          : 'bg-bg border-border text-text-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-surface">
                          {e.severity}
                        </span>
                        <strong className="text-text">[{e.rule}]</strong>
                        <span>{e.message}</span>
                      </div>
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {new Date(e.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Risk Events & Firewall Audit Trail (Fleet-wide) */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning" />
          Authoritative Risk Firewall Audit Events ({riskEvents.length})
        </h3>
        <div className="overflow-x-auto max-h-56 overflow-y-auto">
          {riskEvents.length === 0 ? (
            <div className="py-6 text-center text-text-muted text-xs">
              No risk events recorded. Firewall operating normally.
            </div>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              {riskEvents.map((e) => (
                <div
                  key={e.id}
                  className={`p-2 rounded border flex items-start justify-between gap-3 ${
                    e.severity === 'CRITICAL' || e.severity === 'BLOCKED'
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : e.severity === 'WARNING'
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-bg">
                      {e.severity}
                    </span>
                    <strong className="text-text">[{e.rule}]</strong>
                    <span>{e.message}</span>
                  </div>
                  <span className="text-xs text-text-muted whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Safety Gate Modal */}
      {selectedBotForLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-danger/50 bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-danger border-b border-danger/30 pb-3">
              <AlertOctagon className="w-6 h-6 text-danger animate-pulse" />
              <div>
                <h3 className="font-bold text-sm text-text">Live Trading Safety Gate</h3>
                <span className="text-xs text-danger">Cryptographic Single-Use Confirmation</span>
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Promoting bot <strong>"{selectedBotForLive.name}"</strong> to <strong>LIVE</strong> mode enables automated order execution with real financial exposure on broker server <strong>{brokerState.server}</strong>.
            </p>

            <div className="p-3 rounded bg-bg border border-border text-xs font-mono space-y-1.5">
              <div className="flex justify-between text-text-muted">
                <span>Account Number:</span>
                <strong className="text-text">{brokerState.accountLogin}</strong>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Mandatory Stop-Loss:</span>
                <strong className="text-success">HARD BROKER ENFORCED</strong>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Max Lot Ceiling:</span>
                <strong className="text-text">{selectedBotForLive.riskLimits.maxLots} lots</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-danger mb-1">
                Type active account login <strong>{brokerState.accountLogin}</strong> to confirm:
              </label>
              <input
                type="text"
                value={typedConfirmationLogin}
                onChange={(e) => setTypedConfirmationLogin(e.target.value)}
                placeholder={brokerState.accountLogin}
                className="w-full px-3 py-2 rounded bg-bg border border-danger/40 font-mono text-xs text-text focus:outline-none focus:border-danger"
              />
            </div>

            {liveGateError && (
              <div className="p-2.5 rounded bg-danger/10 border border-danger/30 text-danger text-xs">
                {liveGateError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedBotForLive(null)}
                className="px-4 py-2 rounded text-xs font-semibold bg-surface hover:bg-bg text-text-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLivePromotion}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-danger hover:bg-danger text-white shadow-lg shadow-danger/30 transition-all cursor-pointer"
              >
                Promote Bot to LIVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
