import React, { useState, useEffect } from 'react';
import {
  BrokerAccount,
  Position,
  PendingOrder,
  Bot,
  Strategy,
  SymbolName,
  Timeframe,
  Candle,
  JournalEntry,
  RiskSettings,
  AuditLogEntry,
  DatasetRecord,
} from './types/forex';
import { SYMBOL_SPECS } from './services/marketData';
import { BUILT_IN_STRATEGIES } from './services/builtInStrategies';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { MarketsView } from './components/MarketsView';
import { DataManagerView } from './components/DataManagerView';
import { StrategyStudioView } from './components/StrategyStudioView';
import { PineConverterView } from './components/PineConverterView';
import { BacktestView } from './components/BacktestView';
import { BotsView } from './components/BotsView';
import { PositionsView } from './components/PositionsView';
import { JournalView } from './components/JournalView';
import { SettingsView } from './components/SettingsView';
import { OptimizationView } from './components/OptimizationView';
import { KillSwitchModal } from './components/KillSwitchModal';
import { RiskDisclaimerModal } from './components/RiskDisclaimerModal';

const TAB_STORAGE_KEY = 'zfx_active_tab';
const VALID_TABS: ActiveTab[] = [
  'dashboard', 'markets', 'data', 'strategies', 'pine', 'backtest',
  'optimizations', 'bots', 'positions', 'journal', 'settings',
];

// Keeps the open tab across an accidental page reload (form submit, Vite reload, F5).
function loadSavedTab(): ActiveTab {
  try {
    const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (saved && (VALID_TABS as string[]).includes(saved)) return saved as ActiveTab;
  } catch {
    /* storage unavailable: fall back to the dashboard */
  }
  return 'dashboard';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(loadSavedTab);
  const [currentSymbol, setCurrentSymbol] = useState<SymbolName>('EURUSD');
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>('H1');
  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState(false);
  const [activeDownloadJobId, setActiveDownloadJobId] = useState<string | null>(null);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  useEffect(() => {
    const accepted = localStorage.getItem('zfx_disclaimer_accepted');
    if (!accepted) {
      setIsDisclaimerOpen(true);
    }
  }, []);

  // Active datasets are a runtime view of persistent SQLite candles. Restore them on startup.
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);

  const loadStoredDataset = async (symbol: string, timeframe: Timeframe, verifiedMt5 = false): Promise<boolean> => {
    const canonicalSymbol = symbol.toUpperCase().endsWith('M') ? symbol.slice(0, -1) : symbol;
    try {
      const q = new URLSearchParams({ symbol, timeframe, limit: '200000' });
      const response = await fetch(`/api/data/load?${q.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.candles) || payload.candles.length === 0) return false;
      const candles: Candle[] = payload.candles.map((c: any) => ({
        ...c, time: Number(c.time), open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        tickVolume: Number(c.tickVolume ?? c.tick_volume ?? 0), spread: Number(c.spread ?? 0),
      }));
      const auditResponse = await fetch(`/api/data/audit?${new URLSearchParams({ symbol, timeframe }).toString()}`);
      const audit = auditResponse.ok ? await auditResponse.json().catch(() => null) : null;
      const firstDate = new Date(candles[0].time * 1000).toISOString().slice(0, 10);
      const lastDate = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
      const provenance: DatasetRecord['provenance'] = verifiedMt5
        ? { source: 'MT5_BRIDGE', label: 'MT5 BRIDGE', details: 'Downloaded from the configured MT5 bridge in this session.', isResearchEligible: true, utcOffsetHours: 0 }
        : { source: 'STORED_UNVERIFIED', label: 'STORED DATA (SOURCE UNVERIFIED)', details: 'Loaded from persistent SQLite storage. Original source/provenance was not persisted, so research eligibility is not assumed.', isResearchEligible: false, utcOffsetHours: 0 };
      const record: DatasetRecord = {
        id: `ds_stored_${canonicalSymbol.toLowerCase()}_${timeframe.toLowerCase()}`, symbol: canonicalSymbol as SymbolName, timeframe,
        rowCount: candles.length, fileSizeKB: Math.round(candles.length * 0.045), firstDate, lastDate, provenance, candles,
        qualityScore: typeof audit?.qualityScore === 'number' ? audit.qualityScore : 0, lastUpdated: new Date().toISOString(),
      };
      setDatasets(prev => [record, ...prev.filter(d => !(d.symbol.toUpperCase() === canonicalSymbol.toUpperCase() && d.timeframe === timeframe))]);
      return true;
    } catch (error) {
      console.error('[Research dataset activation] Failed to load stored candles', { symbol, timeframe, error });
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/data/catalog');
        if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
        const catalog = await response.json();
        const entries: Array<{ symbol: string; timeframe: Timeframe; count?: number }> = Array.isArray(catalog.datasets) ? catalog.datasets : [];
        for (const entry of entries) {
          if (cancelled) return;
          if (entry.symbol && entry.timeframe && (entry.count ?? 0) > 0) await loadStoredDataset(entry.symbol, entry.timeframe, false);
        }
      } catch (error) {
        console.error('[Research dataset activation] Startup catalog restore failed', error);
      }
    })();
    return () => { cancelled = true; };
    // Restore once at mount; setDatasets is stable and the API routes are fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MT5 Bridge live status
  const [bridgeStatus, setBridgeStatus] = useState<{
    isOnline: boolean;
    serverName?: string;
    accountType?: string;
    error?: string;
  }>({
    isOnline: false,
    serverName: 'Exness-MT5Trial9',
    accountType: 'DEMO',
  });

  // Broker Account State
  const [account, setAccount] = useState<BrokerAccount>({
    id: 'acc_exness',
    label: 'Exness MetaTrader 5',
    broker: 'Exness',
    server: 'Not connected (Offline)',
    login: 'Not connected',
    mode: 'DEMO',
    symbolSuffix: 'm',
    balance: 10000.0,
    equity: 10000.0,
    margin: 0.0,
    freeMargin: 10000.0,
    leverage: 200,
    currency: 'USD',
    isConnected: false,
    isSimulated: true,
    lastHeartbeat: new Date().toISOString(),
    utcOffsetHours: 2,
  });

  // Open Positions (Empty by default: no fake records)
  const [positions, setPositions] = useState<Position[]>([]);

  // Pending Orders (Empty by default: no fake records)
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);

  // Strategies
  const [strategies, setStrategies] = useState<Strategy[]>(BUILT_IN_STRATEGIES);

  // Automated Bots (loaded from SQLite database, zero hardcoded records)
  const [bots, setBots] = useState<Bot[]>([]);

  // Risk Firewall Settings
  const [riskSettings, setRiskSettings] = useState<RiskSettings>({
    maxRiskPerTradePct: 1.5,
    maxLotSize: 1.0,
    maxOpenPositionsTotal: 5,
    maxOpenPositionsPerSymbol: 2,
    maxDailyLossPct: 4.0,
    maxTotalDrawdownPct: 10.0,
    maxAllowedSpreadPips: 2.5,
    enableTradingHoursFilter: true,
    tradingStartHourUTC: 1,
    tradingEndHourUTC: 22,
    killSwitchAction: 'CLOSE_ALL_AND_HALT',
  });

  // Security Audit Log (loaded from SQLite database, zero hardcoded records)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Journal Entries (stored in user records, zero hardcoded records)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  // Probe Bridge function
  const handleTestBridge = async (_url: string, _token: string): Promise<boolean> => {
    // D6: the browser never sees or sends the bridge token; the server calls the bridge.
    try {
      const res = await fetch('/api/bridge/status');
      const data = await res.json();
      if (data.online) {
        setBridgeStatus({
          isOnline: true,
          serverName: data.serverName,
          accountType: data.accountType,
        });
        setAccount((prev) => ({
          ...prev,
          isConnected: true,
          isSimulated: false,
          server: data.serverName || prev.server,
          mode: data.accountType || prev.mode,
          balance: data.account?.balance ?? prev.balance,
          equity: data.account?.equity ?? prev.equity,
          margin: data.account?.margin ?? prev.margin,
          freeMargin: data.account?.freeMargin ?? prev.freeMargin,
          leverage: data.account?.leverage ?? prev.leverage,
          utcOffsetHours: data.utcOffsetHours ?? prev.utcOffsetHours,
        }));
        return true;
      }
      setBridgeStatus({ isOnline: false, error: data.reason || 'Bridge offline' });
    } catch {
      setBridgeStatus({ isOnline: false, error: 'Portal server unreachable.' });
    }
    setAccount((prev) => ({ ...prev, isConnected: false, isSimulated: true }));
    return false;
  };

  // Fetch dataset from MT5 Bridge
  const handleFetchFromBridge = async (symbol: string, tf: Timeframe): Promise<boolean> => {
    try {
      const start = await fetch('/api/data/bulk-download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe: tf, allTimeframes: true }),
      });
      const started = await start.json();
      if (!start.ok || !started.jobId) {
        setBridgeStatus((prev) => ({ ...prev, isOnline: false, error: started.error || 'Historical download could not start' }));
        return false;
      }
      setActiveDownloadJobId(started.jobId);
      // Poll the persistent download job; the bridge response is stored in SQLite, not only in React memory.
      for (let i = 0; i < 1800; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const response = await fetch(`/api/jobs/${encodeURIComponent(started.jobId)}`);
        const job = await response.json();
        if (job.status === 'COMPLETED') {
          setActiveDownloadJobId(null);
          // Hydrate the downloaded SQLite candles into React state so Backtesting Lab
          // can immediately select the persisted dataset without a page reload.
          const canonicalSymbol = symbol.toUpperCase().endsWith('M') ? symbol.slice(0, -1) : symbol;
          const q = `symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(tf)}`;
          const loadedResponse = await fetch(`/api/data/load?${q}&limit=200000`);
          const loaded = await loadedResponse.json().catch(() => null);
          if (!loadedResponse.ok || !Array.isArray(loaded?.candles) || loaded.candles.length === 0) {
            setBridgeStatus((prev) => ({ ...prev, error: `Download completed, but stored candles could not be loaded for ${symbol} ${tf}. Check Data Manager.` }));
            return false;
          }
          const candles: Candle[] = loaded.candles.map((c: any) => ({
            ...c,
            time: Number(c.time),
            open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
            tickVolume: Number(c.tickVolume ?? c.tick_volume ?? 0), spread: Number(c.spread ?? 0),
          }));
          const first = candles[0];
          const last = candles[candles.length - 1];
          const dataset: DatasetRecord = {
            id: `ds_mt5_${canonicalSymbol.toLowerCase()}_${tf.toLowerCase()}_${Date.now()}`,
            symbol: canonicalSymbol as SymbolName,
            timeframe: tf,
            rowCount: candles.length,
            fileSizeKB: Math.round(candles.length * 0.06),
            firstDate: first ? new Date(first.time * 1000).toISOString().slice(0, 10) : '',
            lastDate: last ? new Date(last.time * 1000).toISOString().slice(0, 10) : '',
            provenance: {
              source: 'MT5_BRIDGE', label: 'MT5 BRIDGE',
              details: `Persisted historical candles fetched from the configured MT5 bridge; ${loaded.totalStored ?? candles.length} bars in storage.`,
              brokerServer: account.server, accountType: account.mode === 'LIVE' ? 'REAL' : 'DEMO',
              utcOffsetHours: account.utcOffsetHours ?? 0, isResearchEligible: true,
            },
            candles, qualityScore: 0, lastUpdated: new Date().toISOString(),
          };
          setDatasets((prev) => [dataset, ...prev.filter((d) => !(d.symbol.toUpperCase() === canonicalSymbol.toUpperCase() && d.timeframe === tf))]);
          return true;
        }
        if (job.status === 'FAILED' || job.status === 'CANCELLED') {
          setActiveDownloadJobId(null);
          setBridgeStatus((prev) => ({ ...prev, isOnline: false, error: job.error || job.error_message || `Download ${job.status.toLowerCase()}` }));
          return false;
        }
      }
      setBridgeStatus((prev) => ({ ...prev, error: 'Historical download is still running; check the job status shortly.' }));
      return false;
    } catch (error: any) {
      setActiveDownloadJobId(null);
      setBridgeStatus((prev) => ({ ...prev, isOnline: false, error: error?.message || 'Portal server unreachable' }));
      return false;
    }
  };

  const handleCancelDownload = async () => {
    const jobId = activeDownloadJobId;
    if (!jobId) return;
    try {
      await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    } finally {
      setActiveDownloadJobId(null);
    }
  };

  // Initial system health and bots fetch
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.brokerStatus === 'ONLINE') {
          setBridgeStatus({
            isOnline: true,
            serverName: data.server,
            accountType: data.accountType,
          });
          setAccount((prev) => ({
            ...prev,
            isConnected: true,
            isSimulated: false,
            server: data.server || prev.server,
            mode: data.accountType || prev.mode,
          }));
        }
      })
      .catch(() => {});

    fetch('/api/bots')
      .then((res) => res.json())
      .then((savedBots) => {
        if (Array.isArray(savedBots)) {
          setBots(savedBots);
        }
      })
      .catch(() => {});

    fetch('/api/positions')
      .then((res) => res.json())
      .then((savedPositions) => {
        if (Array.isArray(savedPositions)) {
          setPositions(savedPositions.map(mapServerPosition));
        }
      })
      .catch(() => {});

    fetch('/api/audit-log')
      .then((res) => res.json())
      .then((savedLogs) => {
        if (Array.isArray(savedLogs)) {
          setAuditLogs(savedLogs);
        }
      })
      .catch(() => {});
  }, []);

  // Sync equity with floating P&L
  useEffect(() => {
    const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
    setAccount((prev) => ({
      ...prev,
      equity: Number((prev.balance + totalPnl).toFixed(2)),
      freeMargin: Number((prev.balance + totalPnl - prev.margin).toFixed(2)),
    }));
  }, [positions]);

  // Handlers
  const handleToggleAccountMode = (newMode: 'DEMO' | 'LIVE') => {
    setAccount((prev) => ({ ...prev, mode: newMode }));
    setAuditLogs((prev) => [
      {
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: 'Trader',
        action: 'MODE_CHANGE',
        entity: `Account ${account.login}`,
        details: `Switched trading mode to ${newMode}.`,
        status: newMode === 'LIVE' ? 'WARNING' : 'SUCCESS',
      },
      ...prev,
    ]);
  };

  const refreshPositions = async () => {
    try {
      const r = await fetch('/api/positions');
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setPositions(data.map(mapServerPosition));
      }
    } catch {
      /* keep last known state; never invent positions */
    }
  };

  // Server positions may come from the bridge (snake_case) or SQLite (camelCase).
  const mapServerPosition = (p: any): Position => ({
    id: p.id ?? `pos_${p.ticket}`,
    ticket: p.ticket,
    symbol: p.symbol,
    side: p.side ?? (p.type === 1 ? 'SELL' : 'BUY'),
    volume: p.volume,
    openPrice: p.openPrice ?? p.price_open ?? 0,
    currentPrice: p.currentPrice ?? p.price_current ?? 0,
    sl: p.sl || undefined,
    tp: p.tp || undefined,
    pnl: p.pnl ?? p.profit ?? 0,
    pips: p.pips ?? 0,
    openTime: p.openTime ?? p.time ?? 0,
    swap: p.swap ?? 0,
    commission: p.commission ?? 0,
    comment: p.comment ?? '',
  });

  const handleClosePosition = async (ticket: number) => {
    try {
      const r = await fetch(`/api/positions/${ticket}/close`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok || !data.success) {
        window.alert(`Close failed: ${data.error || 'unknown error'}`);
        return;
      }
      await refreshPositions(); // state comes from the server, not from local guesses
    } catch {
      window.alert('Close failed: portal server unreachable. Nothing was closed.');
    }
  };

  // The bridge has no modify endpoint yet. Changing SL/TP only on screen would show protection that does not exist.
  const handleModifyPosition = (_ticket: number, _sl?: number, _tp?: number) => {
    window.alert('Modifying SL/TP is not supported by the bridge yet. Nothing was changed at the broker.');
  };

  const handlePlaceOrder = async (order: {
    symbol: SymbolName;
    side: 'BUY' | 'SELL';
    volume: number;
    sl?: number;
    tp?: number;
  }): Promise<{ ok: boolean; message: string; simulated?: boolean }> => {
    try {
      const r = await fetch('/api/broker/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, mode: 'DEMO', botId: 'manual' }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.status === 'UNKNOWN') {
        // The bridge did not confirm the outcome. Never present this as a plain failure.
        return { ok: false, message: 'Outcome UNKNOWN: the bridge did not confirm this order. Check Positions before sending it again.' };
      }
      if (!r.ok || !data.success) {
        return { ok: false, message: `Order rejected: ${data.error || data.status || 'unknown error'}` };
      }
      if (data.simulation) {
        return { ok: false, simulated: true, message: 'SIMULATION: no bridge connected. No real order was placed.' };
      }
      await refreshPositions();
      return { ok: true, message: `Order filled: ticket #${data.ticket ?? '?'} at ${data.fillPrice ?? '?'}` };
    } catch {
      return { ok: false, message: 'Order failed: portal server unreachable. Nothing was placed.' };
    }
  };

  // Called by KillSwitchModal ONLY after the server confirmed all positions are flat.
  const handleExecuteKillSwitch = async () => {
    await refreshPositions();
    setPendingOrders([]);
    try {
      const r = await fetch('/api/bots');
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setBots(data);
      }
    } catch {
      /* ignore */
    }
  };

  // Load strategies & bots from SQLite on startup
  useEffect(() => {
    fetch('/api/strategies')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setStrategies(data);
        }
      })
      .catch(() => {});

    fetch('/api/bots')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setBots(data);
        }
      })
      .catch(() => {});
  }, []);

  // Saves to the database FIRST. The screen and the tab only change after the server confirms,
  // so a failed save is never shown as a success. `goTo` is applied in the same update as the
  // strategy list, so the target view mounts with the new strategy already present.
  const handleSaveStrategy = async (strat: Strategy, goTo?: ActiveTab): Promise<boolean> => {
    try {
      const r = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: strat }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        window.alert(`Strategy was NOT saved to the database: ${d.error || `HTTP ${r.status}`}`);
        return false;
      }
    } catch {
      window.alert('Strategy was NOT saved: portal server unreachable.');
      return false;
    }

    setStrategies((prev) => {
      const idx = prev.findIndex((s) => s.id === strat.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = strat;
        return copy;
      }
      return [strat, ...prev];
    });
    if (goTo) setActiveTab(goTo);
    return true;
  };

  const [botErrorBanner, setBotErrorBanner] = useState<string | null>(null);

  const handleUpdateBotStatus = async (id: string, status: Bot['status']) => {
    try {
      const res = await fetch(`/api/bots/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBotErrorBanner(data.error || 'Failed to update bot status. Verify broker permissions.');
        return;
      }
      setBotErrorBanner(null);
      setBots((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    } catch (err: any) {
      setBotErrorBanner(`Network error updating bot status: ${err.message}`);
    }
  };

  const handleCreateBot = (newBot: Bot) => {
    setBots((prev) => [newBot, ...prev]);
    fetch('/api/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot: newBot }),
    }).catch(() => {});
  };

  // Stored candles (UTC) from the server catalog. Tried with the broker suffix first, then without.
  const [stored, setStored] = useState<{ candles: Candle[]; info: string } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const names = Array.from(new Set([`${currentSymbol}${account.symbolSuffix || ''}`, currentSymbol]));
      for (const name of names) {
        try {
          const q = `symbol=${encodeURIComponent(name)}&timeframe=${encodeURIComponent(currentTimeframe)}`;
          const r = await fetch(`/api/data/load?${q}&limit=2000`);
          if (!r.ok) continue;
          const d = await r.json();
          if (!Array.isArray(d.candles) || d.candles.length === 0) continue;
          let info = `${name} ${currentTimeframe} · ${d.totalStored} stored bars`;
          try {
            const ar = await fetch(`/api/data/audit?${q}`);
            if (ar.ok) {
              const a = await ar.json();
              info += ` · quality ${a.qualityScore} · ${a.gapCount} gaps · ${a.duplicateCount} duplicates`;
            }
          } catch {
            /* audit is extra detail only */
          }
          if (alive) {
            setStored({
              candles: d.candles.map((c: any) => ({ ...c, tickVolume: c.tickVolume ?? 0, spread: c.spread ?? 0 })),
              info,
            });
          }
          return;
        } catch {
          /* try the next name */
        }
      }
      if (alive) setStored(null);
    })();
    return () => {
      alive = false;
    };
  }, [currentSymbol, currentTimeframe, account.symbolSuffix]);

  // Never invent candles: stored data first, then an in-memory dataset (labelled), otherwise nothing.
  const activeDataset = datasets.find((d) => d.symbol === currentSymbol && d.timeframe === currentTimeframe);
  const chartCandles: Candle[] = stored?.candles ?? activeDataset?.candles ?? [];
  const chartLabel: string = stored
    ? `STORED DATA (UTC) · ${stored.info}`
    : activeDataset
      ? `${activeDataset.provenance.label}: ${activeDataset.provenance.details}`
      : '';

  return (
    <div className="min-h-screen bg-[#090D16] flex flex-col font-sans">
      <Navbar
        account={account}
        bridgeAccountType={bridgeStatus.isOnline ? (bridgeStatus.accountType || 'UNKNOWN') : 'UNKNOWN'}
        onToggleAccountMode={handleToggleAccountMode}
        activeBotsCount={bots.filter((b) => b.status === 'RUNNING').length}
        onOpenKillSwitch={() => setIsKillSwitchOpen(true)}
      />

      {/* Persistent Simulation Warning Banner */}
      {!bridgeStatus.isOnline && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2.5 font-mono">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
              SIMULATION
            </span>
            <span className="font-semibold text-slate-200">
              Not connected: simulation only.
            </span>
            <span className="text-amber-300/80 hidden sm:inline">
              Real broker execution requires connecting an active MT5 bridge. Orders & data are strictly paper simulation.
            </span>
          </div>
          <span className="text-[11px] font-mono text-amber-400/80">Bridge: Offline</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          openPositionsCount={positions.length}
        />

        <main className="flex-1 overflow-y-auto p-5 pb-16 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <DashboardView
              account={account}
              positions={positions}
              bots={bots}
              onNavigate={setActiveTab}
              onClosePosition={handleClosePosition}
              onSelectSymbol={setCurrentSymbol}
            />
          )}

          {activeTab === 'markets' && (
            <MarketsView
              account={account}
              currentSymbol={currentSymbol}
              currentTimeframe={currentTimeframe}
              candles={chartCandles}
              dataLabel={chartLabel}
              onSelectSymbol={setCurrentSymbol}
              onSelectTimeframe={setCurrentTimeframe}
              onPlaceOrder={handlePlaceOrder}
            />
          )}

          {activeTab === 'data' && (
            <DataManagerView
              datasets={datasets}
              onAddDataset={(ds) => setDatasets((prev) => [ds, ...prev])}
              onAutoFixAnomalies={async (id) => {
                const ds = datasets.find((d) => d.id === id);
                if (!ds) return;
                const q = `symbol=${encodeURIComponent(ds.symbol)}&timeframe=${encodeURIComponent(ds.timeframe)}`;
                try {
                  const fixRes = await fetch('/api/data/autofix', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbol: ds.symbol, timeframe: ds.timeframe }),
                  });
                  const fix = await fixRes.json().catch(() => ({}));
                  const auditRes = await fetch(`/api/data/audit?${q}`);
                  const audit = await auditRes.json().catch(() => ({}));
                  if (!auditRes.ok || !audit.totalBars) {
                    window.alert(`No stored data for ${ds.symbol} ${ds.timeframe}: nothing was fixed. Download it first.`);
                    return;
                  }
                  setDatasets((prev) => prev.map((d) => (d.id === id ? { ...d, qualityScore: audit.qualityScore } : d)));
                  window.alert(fix.changed ? `Fixed ordering/duplicates (${fix.before} to ${fix.after} bars). Quality now ${audit.qualityScore}.` : `Nothing to fix. Quality ${audit.qualityScore}. Prices are never altered.`);
                } catch {
                  window.alert('Auto-fix failed: portal server unreachable. Nothing was changed.');
                }
              }}
              onLoadStoredData={(symbol, tf) => loadStoredDataset(symbol, tf, false)}
              onFetchFromBridge={handleFetchFromBridge}
              onCancelDownload={handleCancelDownload}
              bridgeStatus={bridgeStatus}
            />
          )}

          {activeTab === 'strategies' && (
            <StrategyStudioView
              strategies={strategies}
              onSelectStrategy={() => {}}
              onSaveStrategy={handleSaveStrategy}
              onLaunchBacktest={() => setActiveTab('backtest')}
            />
          )}

          {activeTab === 'pine' && (
            <PineConverterView
              onSaveConvertedStrategy={(strat) => handleSaveStrategy(strat, 'strategies')}
              onLaunchBacktest={(strat) => {
                void handleSaveStrategy(strat, 'backtest');
              }}
            />
          )}

          {activeTab === 'backtest' && (
            <BacktestView
              strategies={strategies}
              datasets={datasets}
              currentSymbol={currentSymbol}
              currentTimeframe={currentTimeframe}
              onNavigateToData={() => setActiveTab('data')}
            />
          )}

          {activeTab === 'optimizations' && (
            <OptimizationView
              strategies={strategies}
              currentSymbol={currentSymbol}
              currentTimeframe={currentTimeframe}
              historicalCandles={datasets
                .filter((d) => d.symbol === currentSymbol && d.timeframe === currentTimeframe && d.provenance?.isResearchEligible === true && d.provenance.source !== 'SIMULATED')
                .flatMap((d) => d.candles)
                .sort((a, b) => a.time - b.time)
                .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time)}
              researchProvenance={datasets.find((d) => d.symbol === currentSymbol && d.timeframe === currentTimeframe && d.provenance?.isResearchEligible === true && d.provenance.source !== 'SIMULATED')?.provenance}
            />
          )}

          {activeTab === 'bots' && (
            <BotsView
              bots={bots}
              strategies={strategies}
              account={account}
              errorMessage={botErrorBanner}
              onDismissError={() => setBotErrorBanner(null)}
              onUpdateBotStatus={handleUpdateBotStatus}
              onCreateBot={handleCreateBot}
            />
          )}

          {activeTab === 'positions' && (
            <PositionsView
              positions={positions}
              pendingOrders={pendingOrders}
              isBrokerConnected={bridgeStatus.isOnline}
              onClosePosition={handleClosePosition}
              onModifyPosition={handleModifyPosition}
              onCancelPendingOrder={(ticket) => {
                setPendingOrders((prev) => prev.filter((o) => o.ticket !== ticket));
              }}
            />
          )}

          {activeTab === 'journal' && (
            <JournalView
              entries={journalEntries}
              onAddEntry={(entry) => setJournalEntries((prev) => [entry, ...prev])}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              account={account}
              riskSettings={riskSettings}
              auditLogs={auditLogs}
              onUpdateBroker={(updated) => setAccount((prev) => ({ ...prev, ...updated }))}
              onUpdateRiskSettings={setRiskSettings}
              bridgeStatus={bridgeStatus}
              onTestBridge={handleTestBridge}
            />
          )}
        </main>
      </div>

      {/* Persistent Regulatory & Risk Disclaimer Footer */}
      <footer className="px-6 py-2 bg-[#080C16] border-t border-slate-900 text-center text-[10px] text-slate-500 select-none">
        <span>
          Risk Disclosure: Trading Forex and leveraged financial instruments involves substantial risk of loss and is not suitable for every investor. Past backtest results, parameter optimization heatmaps, and simulated performance metrics do not predict future live trading execution.
        </span>
      </footer>

      <KillSwitchModal
        isOpen={isKillSwitchOpen}
        onClose={() => setIsKillSwitchOpen(false)}
        positions={positions}
        bots={bots}
        onExecuteKillSwitch={handleExecuteKillSwitch}
      />

      <RiskDisclaimerModal
        isOpen={isDisclaimerOpen}
        onAccept={() => {
          localStorage.setItem('zfx_disclaimer_accepted', 'true');
          setIsDisclaimerOpen(false);
        }}
      />
    </div>
  );
}
