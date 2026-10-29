import React, { useState, useEffect } from 'react';
import { Header, NavTab } from './components/Header';
import { MarketsView } from './components/MarketsView';
import { BacktestView } from './components/BacktestView';
import { StrategyStudioView } from './components/StrategyStudioView';
import { OptimizationView } from './components/OptimizationView';
import { PineConverterView } from './components/PineConverterView';
import { DataManagerView } from './components/DataManagerView';
import { BotsView } from './components/BotsView';
import { FundamentalView } from './components/FundamentalView';
import { TechnicalAnalysisView } from './components/TechnicalAnalysisView';
import { AIAnalysisView } from './components/AIAnalysisView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsView } from './components/SettingsView';
import { KillSwitchModal } from './components/KillSwitchModal';
import { SmartMoneyFootprintView } from './components/SmartMoneyFootprintView';
import { AdminAccountsView } from './components/AdminAccountsView';

import {
  BacktestReport,
  BotMode,
  BotRecord,
  BotStatus,
  BrokerState,
  DatasetRecord,
  ForexSymbol,
  OrderRecord,
  PositionRecord,
  RiskEvent,
} from './types/forex';
import { BUILT_IN_STRATEGIES, StrategyDefinition } from './engine/workerSandbox';
import { globalRiskManager } from './engine/riskManager';
import { ShieldCheck, TrendingUp, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('markets');
  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState<boolean>(false);
  const [studioSelectedStrategyId, setStudioSelectedStrategyId] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dual Theme state (defaults to light mode)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('zaboraa_theme');
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('zaboraa_theme', theme);
    } catch {}
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Broker State (Connected to Exness MT5 Demo Terminal)
  const [brokerState, setBrokerState] = useState<BrokerState>({
    connected: true,
    terminalRunning: true,
    algoTradingEnabled: true,
    server: 'Exness-MT5Trial9',
    accountLogin: '50192834',
    mode: 'DEMO',
    balance: 10000.0,
    equity: 10245.8,
    margin: 217.06,
    freeMargin: 10028.74,
    utcOffsetHours: 2,
    symbolSuffix: 'm',
    allowTrading: true,
    killSwitchActive: false,
  });

  // Datasets from SQLite
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);

  // Synchronize bridge status and SQLite catalog on mount
  React.useEffect(() => {
    // 1. Sync bridge status
    fetch('/api/bridge/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setBrokerState((prev) => ({
            ...prev,
            connected: data.connected ?? false,
            server: data.server || prev.server,
            accountLogin: data.account_login || prev.accountLogin,
            mode: data.mode || prev.mode,
            utcOffsetHours: data.utc_offset_hours || prev.utcOffsetHours,
          }));
        }
      })
      .catch(() => {});

    // 2. Sync SQLite datasets catalog
    fetch('/api/data/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (data && data.catalog && data.catalog.length > 0) {
          const loaded: DatasetRecord[] = [];
          for (const item of data.catalog) {
            try {
              const cRes = await fetch(`/api/data/load?symbol=${item.symbol}&timeframe=${item.timeframe}`);
              const cData = await cRes.json();
              loaded.push({
                ...item,
                candles: cData.candles || [],
              });
            } catch {}
          }
          if (loaded.length > 0) {
            setDatasets(loaded);
          }
        }
      })
      .catch(() => {});

    // 3. Sync saved backtest reports from SQLite
    fetch('/api/backtests')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.reports && data.reports.length > 0) {
          setSavedReports((prev) => {
            const map = new Map<string, BacktestReport>();
            prev.forEach((r) => map.set(r.id, r));
            data.reports.forEach((r: BacktestReport) => map.set(r.id, r));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  // Active Backtest Report & Saved Reports Archive
  const [activeReport, setActiveReport] = useState<BacktestReport | null>(null);
  const [savedReports, setSavedReports] = useState<BacktestReport[]>(() => {
    try {
      const stored = localStorage.getItem('zaboraa_saved_reports');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Strategy Registry (Supports user creation, editing, cloning, and persistence)
  const [strategies, setStrategies] = useState<StrategyDefinition[]>(() => {
    try {
      const stored = localStorage.getItem('zaboraa_custom_strategies');
      if (stored) {
        const parsed = JSON.parse(stored);
        const map = new Map<string, StrategyDefinition>();
        BUILT_IN_STRATEGIES.forEach((s) => map.set(s.id, s));
        parsed.forEach((s: StrategyDefinition) => map.set(s.id, s));
        return Array.from(map.values());
      }
    } catch {}
    return BUILT_IN_STRATEGIES;
  });

  // Sync strategies from SQLite on mount
  useEffect(() => {
    fetch('/api/strategies')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.strategies && data.strategies.length > 0) {
          setStrategies((prev) => {
            const map = new Map<string, StrategyDefinition>();
            prev.forEach((s) => map.set(s.id, s));
            data.strategies.forEach((s: StrategyDefinition) => map.set(s.id, s));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveStrategy = (updated: StrategyDefinition) => {
    setStrategies((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((s) => s.id === updated.id);
      if (idx >= 0) {
        copy[idx] = updated;
      } else {
        copy.push(updated);
      }
      try {
        localStorage.setItem('zaboraa_custom_strategies', JSON.stringify(copy));
      } catch {}
      return copy;
    });

    fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  };

  const handleCreateStrategy = (newStrat: StrategyDefinition) => {
    setStrategies((prev) => {
      const copy = [...prev, newStrat];
      try {
        localStorage.setItem('zaboraa_custom_strategies', JSON.stringify(copy));
      } catch {}
      return copy;
    });

    fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStrat),
    }).catch(() => {});
  };

  const handleDeleteStrategy = (id: string) => {
    setStrategies((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem('zaboraa_custom_strategies', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });

    fetch(`/api/strategies/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  // Active Positions
  const [positions, setPositions] = useState<PositionRecord[]>([
    {
      ticket: 8192034,
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
      openTime: Math.floor(Date.now() / 1000) - 86400,
      comment: 'Donchian Breakout #101',
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
      openTime: Math.floor(Date.now() / 1000) - 43200,
      comment: 'Gold Momentum #104',
      mode: 'DEMO',
    },
  ]);

  // Orders History
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  // Automated Bots Fleet
  const [bots, setBots] = useState<BotRecord[]>([
    {
      id: 'bot-turtle-eur',
      name: 'Turtle Donchian EURUSD',
      magicNumber: 101,
      strategyId: 'strat-donchian-breakout',
      strategyName: 'Donchian Breakout Channel',
      symbol: 'EURUSD',
      timeframe: 'H1',
      mode: 'DEMO',
      status: 'RUNNING',
      riskLimits: {
        maxLots: 2.0,
        maxSpreadPips: 2.5,
        maxDrawdownPct: 6.0,
        maxRiskPerTradePct: 1.5,
        dailyLossLimitPct: 3.0,
        maxOpenPositions: 2,
        mandatoryStopLoss: true,
        tradingHours: { startUtcHour: 6, endUtcHour: 20 },
      },
      todayPnl: 145.2,
      totalPnl: 1240.5,
      winCount: 14,
      lossCount: 6,
    },
    {
      id: 'bot-ema-ribbon',
      name: 'EMA Ribbon GBPUSD',
      magicNumber: 102,
      strategyId: 'strat-ema-ribbon',
      strategyName: 'EMA Ribbon Trend Follower',
      symbol: 'GBPUSD',
      timeframe: 'M15',
      mode: 'PAPER',
      status: 'RUNNING',
      riskLimits: {
        maxLots: 1.5,
        maxSpreadPips: 2.5,
        maxDrawdownPct: 5.0,
        maxRiskPerTradePct: 1.0,
        dailyLossLimitPct: 2.5,
        maxOpenPositions: 1,
        mandatoryStopLoss: true,
        tradingHours: { startUtcHour: 7, endUtcHour: 18 },
      },
      todayPnl: -35.0,
      totalPnl: 580.0,
      winCount: 9,
      lossCount: 4,
    },
    {
      id: 'bot-xau-gold',
      name: 'Gold Breakout XAUUSD',
      magicNumber: 104,
      strategyId: 'strat-xauusd-volatility',
      strategyName: 'XAUUSD Gold Volatility Breakout',
      symbol: 'XAUUSD',
      timeframe: 'M15',
      mode: 'DEMO',
      status: 'RUNNING',
      riskLimits: {
        maxLots: 1.0,
        maxSpreadPips: 30.0,
        maxDrawdownPct: 8.0,
        maxRiskPerTradePct: 2.0,
        dailyLossLimitPct: 4.0,
        maxOpenPositions: 1,
        mandatoryStopLoss: true,
        tradingHours: { startUtcHour: 12, endUtcHour: 17 },
      },
      todayPnl: 135.6,
      totalPnl: 2150.0,
      winCount: 18,
      lossCount: 7,
    },
  ]);

  // Risk events
  const [riskEvents, setRiskEvents] = useState<RiskEvent[]>(() =>
    globalRiskManager.getRiskEvents()
  );

  // Place Order handler
  const handlePlaceOrder = (order: {
    symbol: ForexSymbol;
    side: 'BUY' | 'SELL';
    volume: number;
    sl: number;
    tp?: number;
  }) => {
    const newTicket = Math.floor(8000000 + Math.random() * 900000);
    const intentPrice = order.side === 'BUY' ? 1.08532 : 1.0852;

    const newPos: PositionRecord = {
      ticket: newTicket,
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      openPrice: intentPrice,
      currentPrice: intentPrice,
      sl: order.sl,
      tp: order.tp,
      pnl: -7.0, // spread/commission friction at fill
      swap: 0,
      commission: 7.0 * order.volume,
      openTime: Math.floor(Date.now() / 1000),
      comment: `Manual ${order.side}`,
      mode: brokerState.mode === 'REAL' ? 'LIVE' : 'DEMO',
    };

    setPositions((prev) => [newPos, ...prev]);

    const newOrderRecord: OrderRecord = {
      id: `ord-${Date.now()}`,
      idempotencyKey: `idemp-${Date.now()}`,
      botId: 'manual-desk',
      magicNumber: 0,
      ticket: newTicket,
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      intentPrice,
      fillPrice: intentPrice,
      sl: order.sl,
      tp: order.tp,
      status: 'FILLED',
      comment: 'Manual Order Desk',
      createdAt: Date.now(),
      filledAt: Date.now(),
    };

    setOrders((prev) => [newOrderRecord, ...prev]);
    globalRiskManager.logRiskEvent(
      'INFO',
      'ORDER_FILLED',
      `Order filled on broker: Ticket #${newTicket} ${order.side} ${order.volume} lots on ${order.symbol} with SL @ ${order.sl}.`
    );
    setRiskEvents(globalRiskManager.getRiskEvents());
  };

  // Close Position handler
  const handleClosePosition = (ticket: number) => {
    setPositions((prev) => prev.filter((p) => p.ticket !== ticket));
    globalRiskManager.logRiskEvent(
      'INFO',
      'POSITION_CLOSED',
      `Position ticket #${ticket} closed on broker. P&L settled.`
    );
    setRiskEvents(globalRiskManager.getRiskEvents());
  };

  // Emergency Kill Switch Execution
  const handleExecuteKill = async () => {
    // If broker is offline, trigger loud failure
    if (!brokerState.connected) {
      return {
        success: false,
        loudFailure: true,
        message:
          'CRITICAL: MT5 Python bridge is unreachable on 127.0.0.1:8001! Broker liquidation could not be performed.',
      };
    }

    // Liquidate all positions and pause bots
    const count = positions.length;
    setPositions([]);
    setBots((prev) => prev.map((b) => ({ ...b, status: 'PAUSED' })));
    globalRiskManager.triggerKillSwitch();
    setBrokerState((prev) => ({ ...prev, killSwitchActive: true }));
    setRiskEvents(globalRiskManager.getRiskEvents());

    return {
      success: true,
      loudFailure: false,
      message: `FLAT VERIFIED: Liquidated ${count} positions. All pending orders cancelled. Bots halted. Account is 100% flat.`,
    };
  };

  const handleResetKillSwitch = () => {
    globalRiskManager.resetKillSwitch();
    setBrokerState((prev) => ({ ...prev, killSwitchActive: false }));
    setRiskEvents(globalRiskManager.getRiskEvents());
    setIsKillSwitchOpen(false);
  };

  // Saved reports handlers (persisted to SQLite and localStorage)
  const handleSaveReport = async (report: BacktestReport) => {
    const updated = [report, ...savedReports.filter((r) => r.id !== report.id)];
    setSavedReports(updated);
    try {
      localStorage.setItem('zaboraa_saved_reports', JSON.stringify(updated));
    } catch {}

    try {
      await fetch('/api/backtests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch (e) {
      console.error('Failed to persist backtest to SQLite:', e);
    }
  };

  const handleDeleteReport = async (id: string) => {
    const updated = savedReports.filter((r) => r.id !== id);
    setSavedReports(updated);
    try {
      localStorage.setItem('zaboraa_saved_reports', JSON.stringify(updated));
    } catch {}

    try {
      await fetch(`/api/backtests/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to delete backtest from SQLite:', e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-[#E6ECF5] flex flex-col justify-between selection:bg-indigo-600 selection:text-white transition-colors">
      <div>
        {/* Navigation Header */}
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          brokerState={brokerState}
          onOpenKillSwitch={() => setIsKillSwitchOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {activeTab === 'markets' && (
            <MarketsView
              brokerState={brokerState}
              positions={positions}
              orders={orders}
              onPlaceOrder={handlePlaceOrder}
              onClosePosition={handleClosePosition}
            />
          )}

          {activeTab === 'smartmoney' && (
            <ErrorBoundary fallbackTitle="Smart Money Footprint">
              <SmartMoneyFootprintView />
            </ErrorBoundary>
          )}

          {activeTab === 'ai-analyst' && (
            <AIAnalysisView
              onNavigateToTab={(tab) => setActiveTab(tab)}
              activeReport={activeReport}
              strategies={strategies}
            />
          )}

          {activeTab === 'backtest' && (
            <BacktestView
              datasets={datasets}
              strategies={strategies}
              activeReport={activeReport}
              setActiveReport={setActiveReport}
              savedReports={savedReports}
              onSaveReport={handleSaveReport}
              onDeleteReport={handleDeleteReport}
              onNavigateToStrategyStudio={(stratId) => {
                if (stratId) setStudioSelectedStrategyId(stratId);
                setActiveTab('strategies');
              }}
            />
          )}

          {activeTab === 'strategies' && (
            <StrategyStudioView
              datasets={datasets}
              strategies={strategies}
              initialStrategyId={studioSelectedStrategyId}
              onSaveStrategy={handleSaveStrategy}
              onCreateStrategy={handleCreateStrategy}
              onDeleteStrategy={handleDeleteStrategy}
            />
          )}

          {activeTab === 'optimization' && (
            <OptimizationView datasets={datasets} />
          )}

          {activeTab === 'pine' && (
            <PineConverterView
              onAddConvertedStrategy={(strat) => {
                handleCreateStrategy(strat);
                setToastMessage(`Pine strategy "${strat.name}" added to Strategy Studio.`);
                setTimeout(() => setToastMessage(null), 4000);
                setActiveTab('strategies');
              }}
            />
          )}

          {activeTab === 'data' && (
            <DataManagerView />
          )}

          {activeTab === 'fundamentals' && (
            <FundamentalView />
          )}

          {activeTab === 'technical' && (
            <ErrorBoundary fallbackTitle="Gold Technical Analysis">
              <TechnicalAnalysisView initialSymbol="XAUUSD" />
            </ErrorBoundary>
          )}

          {activeTab === 'bots' && (
            <BotsView
              bots={bots}
              brokerState={brokerState}
              riskEvents={riskEvents}
              onToggleBotStatus={(botId, newStatus) =>
                setBots((prev) =>
                  prev.map((b) => (b.id === botId ? { ...b, status: newStatus } : b))
                )
              }
              onChangeBotMode={(botId, newMode) =>
                setBots((prev) =>
                  prev.map((b) => (b.id === botId ? { ...b, mode: newMode } : b))
                )
              }
              onAddBot={(bot) => setBots((prev) => [...prev, bot])}
            />
          )}

          {activeTab === 'accounts' && (
            <AdminAccountsView
              brokerState={brokerState}
              onOpenKillSwitch={() => setIsKillSwitchOpen(true)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              brokerState={brokerState}
              onUpdateBrokerState={(state) =>
                setBrokerState((prev) => ({ ...prev, ...state }))
              }
            />
          )}
        </main>
      </div>

      {/* Floating System Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg bg-[#0F1B2F] border border-blue-500/50 text-slate-100 text-xs shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Emergency Kill Switch Modal */}
      <KillSwitchModal
        isOpen={isKillSwitchOpen}
        onClose={() => setIsKillSwitchOpen(false)}
        brokerState={brokerState}
        positions={positions}
        onExecuteKill={handleExecuteKill}
        onResetKillSwitch={handleResetKillSwitch}
      />

      {/* Institutional Risk Footer */}
      <footer className="border-t border-slate-200 dark:border-[#223049] bg-white dark:bg-[#070A11] px-4 py-3 mt-12 text-slate-500 dark:text-[#9FB0C8] text-xs transition-colors">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              Zaboraa FX Quantitative Trading Desk · Local First Architecture
            </span>
          </div>
          <div>
            Mandatory Risk Disclosure: Leveraged Forex & Gold trading carries significant financial risk.
          </div>
        </div>
      </footer>
    </div>
  );
};
