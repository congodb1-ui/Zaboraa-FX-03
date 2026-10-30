import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Database,
  Sliders,
  Play,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Copy,
  Trash2,
  Lock,
  ArrowRight,
  TrendingUp,
  Clock,
  Layers,
  Calendar,
  DollarSign,
  Activity,
  Calculator,
  Compass,
} from 'lucide-react';

interface XauDataStats {
  m1: { count: number; earliest: string | null; latest: string | null };
  m5: { count: number; earliest: string | null; latest: string | null };
  m15: { count: number; earliest: string | null; latest: string | null };
  cot: {
    count: number;
    source: string;
    earliest: string | null;
    latest: string | null;
    latestEffectiveAt: string | null;
  };
  dfii10: {
    count: number;
    latestObsDate: string | null;
    latestValue: number | null;
    latestEffectiveAt: string | null;
  };
  dgs10: {
    count: number;
    latestObsDate: string | null;
    latestValue: number | null;
    latestEffectiveAt: string | null;
  };
  fakeCheck: {
    seededH1BaselineCount: number;
    sha256SeedCount: number;
    syntheticCotCount: number;
    isClean: boolean;
  };
}

interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  command: string;
  output: string;
}

export const XauStrategyGuideView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'data' | 'logic' | 'execution' | 'runbook'>('data');
  const [stats, setStats] = useState<XauDataStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      command: 'system:init',
      output: 'Zaboraa FX XAU Strategy Engine initialized in DEMO mode. ALLOW_TRADING=false enforced.',
    },
  ]);
  const [dryRunDone, setDryRunDone] = useState<boolean>(false);
  const [isRunningCommand, setIsRunningCommand] = useState<boolean>(false);

  // Strategy Weights (Bias Layer - 15m previous CLOSED bar only)
  // Requirement 2: DXY set to 0 (no clean source in v1); other 4 layers 25% placeholders (not tuned yet)
  const [weightCot, setWeightCot] = useState<number>(25);
  const [weightActivity, setWeightActivity] = useState<number>(25);
  const [weightTrend, setWeightTrend] = useState<number>(25);
  const [weightRealYield, setWeightRealYield] = useState<number>(25);
  const [weightDxy, setWeightDxy] = useState<number>(0);

  // Normalization preview sliders (-100 to +100)
  const [cCot, setCCot] = useState<number>(45);
  const [cAct, setCAct] = useState<number>(60);
  const [cTrend, setCTrend] = useState<number>(50);
  const [cRealYield, setCRealYield] = useState<number>(-30);
  const [cDxy, setCDxy] = useState<number>(0);
  const [trainThreshold, setTrainThreshold] = useState<number>(35);

  // MT5 Symbol Info state (Requirement 3: if not fetched, show "not fetched")
  const [symbolInfo, setSymbolInfo] = useState<{
    symbol: string;
    broker_symbol: string;
    trade_contract_size: number;
    volume_min: number;
    volume_step: number;
    volume_max: number;
    spread_points_typical: number;
  } | null>(null);

  // Interactive Timing & Sizing state
  const [m5Atr, setM5Atr] = useState<number>(2.4);
  const [calcEquity, setCalcEquity] = useState<number>(10000);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.0);
  const [calcEntry, setCalcEntry] = useState<number>(2650.0);
  const [calcStopPrice, setCalcStopPrice] = useState<number>(2646.5);

  // Backtest state - computed strictly from real database (Requirement 1)
  const [backtestResult, setBacktestResult] = useState<{
    trades: Array<{
      date: string;
      side: string;
      entry: string;
      sl: string;
      tp: string;
      exit: string;
      spread: string;
      outcome: string;
      won: boolean;
      rReturn: number;
    }>;
    totalSetups: number;
    winRate: string;
    profitFactor: number;
    netReturnR: string;
    maxDrawdownR: string;
    expectancyR: string;
  } | null>(null);
  const [isRunningBacktest, setIsRunningBacktest] = useState<boolean>(false);

  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem('token') ||
      localStorage.getItem('zaboraa_token') ||
      ((import.meta as any).env?.VITE_API_TOKEN as string) ||
      'zaboraa-demo-token';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  };

  // Fetch SQLite Stats & MT5 Symbol Info
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/runbook/stats', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }

      // Also query symbol info from backend
      const symRes = await fetch('/api/runbook/symbol-info', {
        headers: getAuthHeaders(),
      });
      if (symRes.ok) {
        const symData = await symRes.json();
        setSymbolInfo(symData);
      }
    } catch (err: any) {
      appendConsoleLog('stats:fetch', `Failed to load stats: ${err.message}`, 'error');
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const appendConsoleLog = (command: string, output: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const entry: ConsoleLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      command,
      output,
    };
    setConsoleLogs((prev) => [entry, ...prev].slice(0, 50));
  };

  // Runbook Command Handlers
  const handleDryRunCleanup = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:dry-run-cleanup', 'Executing dry-run inspection across SQLite data catalog and COT storage...', 'info');
      const res = await fetch('/api/runbook/dry-run-cleanup', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setDryRunDone(true);
        appendConsoleLog(
          'runbook:dry-run-cleanup',
          `DRY RUN RESULT:\n- Fake Catalog Datasets: ${data.baselineCatalogCount}\n- Fake Seed Hashes: ${data.seedHashCatalogCount}\n- Synthetic COT Rows: ${data.syntheticCotCount}\n${data.message}`,
          'success'
        );
      } else {
        appendConsoleLog('runbook:dry-run-cleanup', `Dry-run failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:dry-run-cleanup', `Dry-run error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleApplyCleanup = async () => {
    if (!dryRunDone) {
      appendConsoleLog('runbook:apply-cleanup', 'Refused: Dry Run must be performed prior to applying database modifications.', 'warn');
      return;
    }
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:apply-cleanup', 'Creating atomic SQLite backup before pruning synthetic data...', 'info');
      const res = await fetch('/api/runbook/apply-cleanup', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:apply-cleanup',
          `CLEANUP APPLIED SUCCESSFULLY:\n- Backup Created: data/backups/${data.backupFile}\n- Deleted Catalog Rows: ${data.deletedCatalogRows}\n- Deleted Synthetic COT Rows: ${data.deletedCotRows}\n- Database is now verified clean.`,
          'success'
        );
        fetchStats();
      } else {
        appendConsoleLog('runbook:apply-cleanup', `Apply cleanup error: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:apply-cleanup', `Apply cleanup error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handlePatchCot = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:patch-cot', 'Applying lock patch to enforce limit=110 and CFTC Public Reporting API...', 'info');
      const res = await fetch('/api/runbook/patch-cot', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog('runbook:patch-cot', `PATCH SUCCESS: Limit locked to ${data.limit}. Source: ${data.source}. ${data.status}`, 'success');
      } else {
        appendConsoleLog('runbook:patch-cot', `Patch failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:patch-cot', `Patch error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleBackfillCot = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:backfill-cot', 'Backfilling COMEX Gold COT from CFTC Public Reporting API (Report Tuesday + 6 days = Monday 00:00 UTC)...', 'info');
      const res = await fetch('/api/runbook/backfill-cot', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:backfill-cot',
          `COT BACKFILL SUCCESS: Ingested ${data.ingested} reports (${data.earliestReportDate} to ${data.latestReportDate}). Source: ${data.source}.`,
          'success'
        );
        fetchStats();
      } else {
        appendConsoleLog('runbook:backfill-cot', `Backfill failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:backfill-cot', `Backfill error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleFredDryRun = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:fred-dry-run', 'Testing FRED macro connection for DFII10 (10Y Real Yield) and DGS10 (10Y Nominal)...', 'info');
      const res = await fetch('/api/runbook/fred-dry-run', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:fred-dry-run',
          `FRED DRY-RUN SUCCESS:\n- Series: ${data.series.join(', ')}\n- Lag Rule: ${data.lagRule}\n- Sample Observations: ${JSON.stringify(data.sample, null, 2)}`,
          'success'
        );
      } else {
        appendConsoleLog('runbook:fred-dry-run', `FRED Dry-Run failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:fred-dry-run', `FRED Dry-Run error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleFredBackfill = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:fred-backfill', 'Backfilling macro_series (DFII10 & DGS10) with next UTC day 00:00 effective_at...', 'info');
      const res = await fetch('/api/runbook/fred-backfill', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:fred-backfill',
          `FRED BACKFILL SUCCESS:\n- Ingested ${data.inserted} macro observations.\n- Effective Rule: ${data.effectiveRule}\n- Series: ${data.series.join(', ')}`,
          'success'
        );
        fetchStats();
      } else {
        appendConsoleLog('runbook:fred-backfill', `FRED Backfill failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:fred-backfill', `FRED Backfill error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleDownloadRealCandles = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:download-real-candles', 'Requesting XAUUSD M1, M5, M15 candles via broker bridge (suffix resolved: XAUUSDm -> XAUUSD)...', 'info');
      const res = await fetch('/api/runbook/download-real-candles', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:download-real-candles',
          `CANDLE SYNC: ${data.status}\n- Target: ${data.broker_symbol} (Mapped to Canonical: ${data.canonical_symbol})\n- ${data.message}`,
          'success'
        );
        fetchStats();
      } else {
        appendConsoleLog('runbook:download-real-candles', `Candle sync error: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:download-real-candles', `Candle sync error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleSessionWindowsSelfTest = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:session-windows', 'Testing London (08:00-12:00) & NY (08:00-10:00) zoneinfo UTC conversions across seasons...', 'info');
      const res = await fetch('/api/runbook/session-windows', {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        appendConsoleLog(
          'runbook:session-windows',
          `SESSION WINDOWS UTC MATRIX:\n- London Rule: ${data.rules.london}\n- NY Rule: ${data.rules.ny}\n\nSeason Details:\n` +
            data.matrix
              .map(
                (m: any) =>
                  `* ${m.season} (${m.sampleDate}):\n  - London: ${m.londonLocal} -> ${m.londonUtc}\n  - New York: ${m.nyLocal} -> ${m.nyUtc}`
              )
              .join('\n\n'),
          'success'
        );
      } else {
        appendConsoleLog('runbook:session-windows', `Session window test failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:session-windows', `Session window test error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleMt5SymbolInfo = async () => {
    setIsRunningCommand(true);
    try {
      appendConsoleLog('runbook:symbol-info', 'Querying MetaTrader 5 Symbol Specification for XAUUSD / XAUUSDm...', 'info');
      const res = await fetch('/api/runbook/symbol-info', {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setSymbolInfo(data);
        appendConsoleLog(
          'runbook:symbol-info',
          `MT5 SYMBOL SPECIFICATION (XAUUSD):\n` +
            `- Canonical Symbol: ${data.symbol}\n` +
            `- Broker Target: ${data.broker_symbol}\n` +
            `- Trade Contract Size: ${data.trade_contract_size} oz\n` +
            `- Volume Min: ${data.volume_min} lot\n` +
            `- Volume Step: ${data.volume_step} lot\n` +
            `- Volume Max: ${data.volume_max} lots\n` +
            `- Point: ${data.point} (Digits: ${data.digits})\n` +
            `- Tick Value: $${data.trade_tick_value.toFixed(2)} | Tick Size: ${data.trade_tick_size}\n` +
            `- Typical Spread: ${data.spread_points_typical} pts ($${data.spread_usd_typical.toFixed(2)})\n` +
            `- Broker Server: ${data.broker_server}`,
          'success'
        );
      } else {
        appendConsoleLog('runbook:symbol-info', `Symbol info error: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('runbook:symbol-info', `Symbol info error: ${err.message}`, 'error');
    } finally {
      setIsRunningCommand(false);
    }
  };

  // Calculations for Strategy Logic & Execution
  const weightSum = weightCot + weightActivity + weightTrend + weightRealYield + weightDxy;
  const isWeightsValid = weightSum === 100;

  // Composite Score = sum(indicator * weight) / 100
  const compositeScore = Math.round(
    (cCot * weightCot +
      cAct * weightActivity +
      cTrend * weightTrend +
      cRealYield * weightRealYield +
      cDxy * weightDxy) /
      100
  );

  const directionBias =
    compositeScore >= trainThreshold
      ? 'BULLISH'
      : compositeScore <= -trainThreshold
      ? 'BEARISH'
      : 'NEUTRAL';

  // Timing layer: 0.6x M5 ATR14
  const sweepDistance = Number((0.6 * m5Atr).toFixed(2));

  // Risk Sizing (Requirement 3):
  // Take contract size, volume_min, and volume_step from bridge symbol info; if not fetched, show "not fetched"
  // Always round lots DOWN to volume_step (e.g. risk $100, stop $3.50, contract size 100 gives 0.2857 -> 0.28 lots, not 0.29)
  const stopDistance = Math.abs(calcEntry - calcStopPrice);
  const riskAmountUsd = (calcEquity * calcRiskPct) / 100;
  const contractSize = symbolInfo ? symbolInfo.trade_contract_size : null;
  const volumeStep = symbolInfo ? symbolInfo.volume_step : null;
  const volumeMin = symbolInfo ? symbolInfo.volume_min : null;

  const rawLots =
    contractSize !== null && stopDistance > 0 && Number.isFinite(stopDistance)
      ? riskAmountUsd / (stopDistance * contractSize)
      : null;

  // Always round lots DOWN to volume_step
  const computedLots =
    rawLots !== null && volumeStep !== null && volumeMin !== null && Number.isFinite(rawLots)
      ? Number((Math.max(volumeMin, Math.floor((rawLots + 1e-9) / volumeStep) * volumeStep)).toFixed(2))
      : null;

  const targetProfitUsd = Number((riskAmountUsd * 1.8).toFixed(2));
  const targetPrice =
    directionBias === 'BULLISH'
      ? Number((calcEntry + stopDistance * 1.8).toFixed(2))
      : Number((calcEntry - stopDistance * 1.8).toFixed(2));

  // Real Database Backtest Handler (Requirement 1: Computed from real SQLite candles)
  const handleRunRealBacktest = async () => {
    setIsRunningBacktest(true);
    try {
      appendConsoleLog('backtest:xau', 'Evaluating real historical XAUUSD candles from SQLite database...', 'info');
      const res = await fetch('/api/runbook/backtest-xau', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setBacktestResult(data);
        appendConsoleLog(
          'backtest:xau',
          `REAL BACKTEST RUN COMPLETED:\n- Total Setups: ${data.totalSetups}\n- Win Rate: ${data.winRate}\n- Profit Factor: ${data.profitFactor}\n- Net Return: ${data.netReturnR}\n- Max Drawdown: ${data.maxDrawdownR}\n- Expectancy: ${data.expectancyR}`,
          'success'
        );
      } else {
        appendConsoleLog('backtest:xau', `Backtest failed: ${data.message || data.error}`, 'error');
      }
    } catch (err: any) {
      appendConsoleLog('backtest:xau', `Backtest error: ${err.message}`, 'error');
    } finally {
      setIsRunningBacktest(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 text-xs font-semibold rounded bg-primary/10 text-primary border border-primary/20">
                XAU SPECIALIZED GUIDE
              </span>
              <span className="px-2.5 py-1 text-xs font-semibold rounded bg-warning/10 text-warning border border-warning/20">
                DEMO ONLY
              </span>
              <span className="px-2.5 py-1 text-xs font-semibold rounded bg-danger/10 text-danger border border-danger/20 flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                ALLOW_TRADING=false
              </span>
            </div>
            <h1 className="text-2xl font-bold text-text mt-2">
              Zaboraa FX - XAU Strategy (Single Easy Guide)
            </h1>
            <p className="text-sm text-text-muted mt-1">
              One Market (XAUUSD) | One Score (Composite Point-in-Time) | One Setup (0.6x M5 ATR14 Sweep + 2x M1 Confirmation)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-surface hover:bg-surface-hover border border-border text-text flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
              Refresh Data Stats
            </button>
            <div className="text-right pl-3 border-l border-border hidden sm:block">
              <div className="text-xs text-text-muted">Target Symbol</div>
              <div className="text-sm font-semibold text-text">XAUUSD <span className="text-xs font-normal text-text-muted">(Bridge: XAUUSDm)</span></div>
            </div>
          </div>
        </div>

        {/* Safety Protection Notice */}
        <div className="mt-4 p-3.5 rounded-lg bg-bg border border-border flex items-start gap-3 text-xs text-text-muted">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-text">Safety Architecture:</span> Simulation and Paper trading are permanently enforced with <code className="text-text font-mono bg-surface px-1.5 py-0.5 rounded border border-border">ALLOW_TRADING=false</code>. Live MT5 order routing gates remain locked. Bulk history downloads resolve parameters dynamically via broker symbol suffix while archiving under canonical <code className="text-text font-mono bg-surface px-1.5 py-0.5 rounded border border-border">XAUUSD</code>.
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-border space-x-2">
        <button
          onClick={() => setActiveTab('data')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'data'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Database className="w-4 h-4" />
          1. DATA (Real Sources)
        </button>
        <button
          onClick={() => setActiveTab('logic')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'logic'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Sliders className="w-4 h-4" />
          2. STRATEGY LOGIC
        </button>
        <button
          onClick={() => setActiveTab('execution')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'execution'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Play className="w-4 h-4" />
          3. EXECUTION
        </button>
        <button
          onClick={() => setActiveTab('runbook')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'runbook'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <Terminal className="w-4 h-4" />
          4. RUNBOOK & CONSOLE
        </button>
      </div>

      {/* TAB 1: DATA (Real Sources) */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          {/* Real Candles Summary */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Real XAUUSD Candle Archives (SQLite: candles)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* M1 Card */}
              <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">Timeframe M1</span>
                  <span className="text-xs text-text-muted">High Precision</span>
                </div>
                <div className="text-2xl font-bold text-text mt-1">
                  {stats ? stats.m1.count.toLocaleString() : '---'}
                  <span className="text-xs font-normal text-text-muted ml-1.5">bars</span>
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-text-muted">
                  <div className="flex justify-between">
                    <span>Earliest:</span>
                    <span className="font-mono text-text">{stats?.m1.earliest ? stats.m1.earliest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latest:</span>
                    <span className="font-mono text-text">{stats?.m1.latest ? stats.m1.latest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                </div>
              </div>

              {/* M5 Card */}
              <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-info/10 text-info">Timeframe M5</span>
                  <span className="text-xs text-text-muted">ATR Reference</span>
                </div>
                <div className="text-2xl font-bold text-text mt-1">
                  {stats ? stats.m5.count.toLocaleString() : '---'}
                  <span className="text-xs font-normal text-text-muted ml-1.5">bars</span>
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-text-muted">
                  <div className="flex justify-between">
                    <span>Earliest:</span>
                    <span className="font-mono text-text">{stats?.m5.earliest ? stats.m5.earliest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latest:</span>
                    <span className="font-mono text-text">{stats?.m5.latest ? stats.m5.latest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                </div>
              </div>

              {/* M15 Card */}
              <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-warning/10 text-warning">Timeframe M15</span>
                  <span className="text-xs text-text-muted">Bias Closed Bar</span>
                </div>
                <div className="text-2xl font-bold text-text mt-1">
                  {stats ? stats.m15.count.toLocaleString() : '---'}
                  <span className="text-xs font-normal text-text-muted ml-1.5">bars</span>
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-xs text-text-muted">
                  <div className="flex justify-between">
                    <span>Earliest:</span>
                    <span className="font-mono text-text">{stats?.m15.earliest ? stats.m15.earliest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latest:</span>
                    <span className="font-mono text-text">{stats?.m15.latest ? stats.m15.latest.replace('T', ' ').substring(0, 16) : 'Empty'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Institutional Macro & COT Real Sources */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* COT Card */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-success/10 text-success">COT Gold</span>
                <span className="text-xs font-mono text-text-muted">CFTC Public API</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {stats ? stats.cot.count : '---'}
                <span className="text-xs font-normal text-text-muted ml-1.5">weekly reports</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-text-muted">
                <div className="flex justify-between">
                  <span>Mandated Source:</span>
                  <span className="font-medium text-text">CFTC Public Reporting API</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Lag:</span>
                  <span className="text-text">Tue + 6 days = Mon 00:00 UTC</span>
                </div>
                <div className="flex justify-between">
                  <span>Latest Report:</span>
                  <span className="font-mono text-text">{stats?.cot.latest || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Latest Effective:</span>
                  <span className="font-mono text-text">{stats?.cot.latestEffectiveAt ? stats.cot.latestEffectiveAt.substring(0, 10) : 'None'}</span>
                </div>
              </div>
            </div>

            {/* DFII10 Card */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-info/10 text-info">DFII10 (TIPS Real Yield)</span>
                <span className="text-xs font-mono text-text-muted">FRED 10Y Real</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {stats?.dfii10.latestValue !== null ? `${stats?.dfii10.latestValue}%` : '---'}
                <span className="text-xs font-normal text-text-muted ml-1.5">({stats ? stats.dfii10.count : 0} obs)</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-text-muted">
                <div className="flex justify-between">
                  <span>Series ID:</span>
                  <span className="font-mono text-text">DFII10 (FRED)</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Rule:</span>
                  <span className="text-text">Next UTC day 00:00</span>
                </div>
                <div className="flex justify-between">
                  <span>Latest Observation:</span>
                  <span className="font-mono text-text">{stats?.dfii10.latestObsDate || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective At:</span>
                  <span className="font-mono text-text">{stats?.dfii10.latestEffectiveAt ? stats.dfii10.latestEffectiveAt.substring(0, 10) : 'None'}</span>
                </div>
              </div>
            </div>

            {/* DGS10 Card */}
            <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-warning/10 text-warning">DGS10 (Nominal Treasury)</span>
                <span className="text-xs font-mono text-text-muted">FRED 10Y Nominal</span>
              </div>
              <div className="text-2xl font-bold text-text mt-1">
                {stats?.dgs10.latestValue !== null ? `${stats?.dgs10.latestValue}%` : '---'}
                <span className="text-xs font-normal text-text-muted ml-1.5">({stats ? stats.dgs10.count : 0} obs)</span>
              </div>
              <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs text-text-muted">
                <div className="flex justify-between">
                  <span>Series ID:</span>
                  <span className="font-mono text-text">DGS10 (FRED)</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective Rule:</span>
                  <span className="text-text">Next UTC day 00:00</span>
                </div>
                <div className="flex justify-between">
                  <span>Latest Observation:</span>
                  <span className="font-mono text-text">{stats?.dgs10.latestObsDate || 'None'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Effective At:</span>
                  <span className="font-mono text-text">{stats?.dgs10.latestEffectiveAt ? stats.dgs10.latestEffectiveAt.substring(0, 10) : 'None'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Fake-Data Check Badges */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-semibold text-text flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  Fake-Data Integrity Audit Badges
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Detects and confirms zero synthetic baseline records, seeded hashes, and disaggregated mock COT. All 3 must be strictly 0.
                </p>
              </div>

              {stats?.fakeCheck.isClean ? (
                <div className="px-3 py-1 rounded-full text-xs font-semibold bg-success/10 text-success border border-success/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  CLEAN: 0 Fake Datasets Detected
                </div>
              ) : (
                <div className="px-3 py-1 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  UNCLEAN: Pruning Required via Runbook
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
              <div className="p-4 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">Check 1: Seeded -h1-baseline</div>
                <div className="text-lg font-bold text-text mt-1 flex items-center justify-between">
                  <span>{stats?.fakeCheck.seededH1BaselineCount ?? 0}</span>
                  {stats?.fakeCheck.seededH1BaselineCount === 0 ? (
                    <span className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> PASS (0)</span>
                  ) : (
                    <span className="text-xs font-medium text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FAIL</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">Must be 0. Scans data_catalog table for synthetic baseline ids.</p>
              </div>

              <div className="p-4 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">Check 2: sha256-seed-</div>
                <div className="text-lg font-bold text-text mt-1 flex items-center justify-between">
                  <span>{stats?.fakeCheck.sha256SeedCount ?? 0}</span>
                  {stats?.fakeCheck.sha256SeedCount === 0 ? (
                    <span className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> PASS (0)</span>
                  ) : (
                    <span className="text-xs font-medium text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FAIL</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">Must be 0. Scans data_catalog for synthetic sha256 checksum seeds.</p>
              </div>

              <div className="p-4 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">Check 3: CFTC Disaggregated / TFF</div>
                <div className="text-lg font-bold text-text mt-1 flex items-center justify-between">
                  <span>{stats?.fakeCheck.syntheticCotCount ?? 0}</span>
                  {stats?.fakeCheck.syntheticCotCount === 0 ? (
                    <span className="text-xs font-medium text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> PASS (0)</span>
                  ) : (
                    <span className="text-xs font-medium text-danger flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> FAIL</span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1">Must be 0. Confirms only authentic CFTC Public Reporting API is stored.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STRATEGY LOGIC */}
      {activeTab === 'logic' && (
        <div className="space-y-6">
          {/* Bias Layer Box */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary">LAYER 1</span>
                <h3 className="text-lg font-bold text-text mt-1">Bias Layer (Previous 15m CLOSED Bar Only)</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Point-in-time evaluation. Zero lookahead: uses strictly completed 15m bar data to form directional filter.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded border ${
                    isWeightsValid
                      ? 'bg-success/10 text-success border-success/20'
                      : 'bg-danger/10 text-danger border-danger/20'
                  }`}
                >
                  Sum of Weights: {weightSum}% {isWeightsValid ? '(Valid)' : '(Must = 100%)'}
                </span>
                <button
                  onClick={() => {
                    setWeightCot(25);
                    setWeightActivity(25);
                    setWeightTrend(25);
                    setWeightRealYield(25);
                    setWeightDxy(0);
                  }}
                  className="px-2.5 py-1 text-xs rounded bg-surface hover:bg-surface-hover border border-border text-text transition-colors"
                >
                  Reset Defaults (25% Placeholders)
                </button>
              </div>
            </div>

            {/* Weights Partition Callout Notice (Requirement 2) */}
            <div className="mb-4 p-3 rounded-lg bg-bg border border-border text-xs text-text-muted flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-text">Weights Partition Rule:</span> Weights are <strong>not final</strong>; they are set on the <strong>TRAIN block partition only</strong> to prevent lookahead and data leakage. The four core layers are currently shown as equal 25% placeholders (&ldquo;not tuned yet&rdquo;). DXY is set to 0% (no clean source in v1).
              </div>
            </div>

            {/* Weights Inputs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 p-4 rounded-lg bg-bg border border-border">
              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">COT Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightCot}
                  onChange={(e) => setWeightCot(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-[11px] text-warning mt-1 block font-medium">not tuned yet (25% placeholder)</span>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Activity Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightActivity}
                  onChange={(e) => setWeightActivity(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-[11px] text-warning mt-1 block font-medium">not tuned yet (25% placeholder)</span>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Trend Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightTrend}
                  onChange={(e) => setWeightTrend(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-[11px] text-warning mt-1 block font-medium">not tuned yet (25% placeholder)</span>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Real Yield (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightRealYield}
                  onChange={(e) => setWeightRealYield(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-[11px] text-warning mt-1 block font-medium">not tuned yet (25% placeholder)</span>
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">DXY Weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={weightDxy}
                  onChange={(e) => setWeightDxy(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-[11px] text-text-muted mt-1 block">0% (no clean source in v1)</span>
              </div>
            </div>

            {/* Normalized Composite Indicator Simulation */}
            <div className="mt-6 p-4 rounded-lg bg-bg border border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Interactive Normalization Gauge (Range -100 to +100)
                </span>
                <span className="text-xs text-text-muted">
                  Formula: Score = sum(Factor x Weight) / 100
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text">c_cot (Institutional COT):</span>
                      <span className="font-mono text-text">{cCot}</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={cCot}
                      onChange={(e) => setCCot(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text">c_act (M15 Activity / Vol Z):</span>
                      <span className="font-mono text-text">{cAct}</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={cAct}
                      onChange={(e) => setCAct(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text">c_trend (M15 Trend Alignment):</span>
                      <span className="font-mono text-text">{cTrend}</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={cTrend}
                      onChange={(e) => setCTrend(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text">c_realyield (DFII10 Rate Shift):</span>
                      <span className="font-mono text-text">{cRealYield}</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={cRealYield}
                      onChange={(e) => setCRealYield(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text">c_dxy (Dollar Index Momentum):</span>
                      <span className="font-mono text-text">{cDxy}</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={cDxy}
                      onChange={(e) => setCDxy(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-center items-center p-6 rounded-lg bg-surface border border-border text-center">
                  <div className="text-xs text-text-muted">Calculated Composite Score</div>
                  <div className={`text-4xl font-extrabold mt-2 ${
                    directionBias === 'BULLISH' ? 'text-success' : directionBias === 'BEARISH' ? 'text-danger' : 'text-text'
                  }`}>
                    {compositeScore > 0 ? `+${compositeScore}` : compositeScore}
                  </div>
                  <div className="mt-2">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                      directionBias === 'BULLISH'
                        ? 'bg-success/10 text-success border border-success/20'
                        : directionBias === 'BEARISH'
                        ? 'bg-danger/10 text-danger border border-danger/20'
                        : 'bg-surface-hover text-text-muted border border-border'
                    }`}>
                      {directionBias === 'BULLISH' ? 'LONG DIRECTION ONLY' : directionBias === 'BEARISH' ? 'SHORT DIRECTION ONLY' : 'NEUTRAL (NO TRADE)'}
                    </span>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border w-full text-xs text-text-muted">
                    <div className="flex justify-between mb-1">
                      <span>TRAIN Calibration Threshold:</span>
                      <span className="font-mono text-text">±{trainThreshold} pts</span>
                    </div>
                    <p className="text-left text-xs text-text-muted mt-2">
                      * Strict Rule: Threshold is picked on <strong>TRAIN partition only</strong> to safeguard against lookahead bias.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timing Layer & Session Windows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Timing Layer */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-info/10 text-info">LAYER 2</span>
              <h3 className="text-lg font-bold text-text mt-1">Timing Layer (1m / 5m Liquidity Sweep)</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Sweep requirement = 0.6x M5 ATR14 beyond the session range extreme.
              </p>

              <div className="mt-4 p-4 rounded-lg bg-bg border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text">M5 ATR(14) Input:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-text-muted">$</span>
                    <input
                      type="number"
                      step="0.1"
                      value={m5Atr}
                      onChange={(e) => setM5Atr(Number(e.target.value))}
                      className="w-20 px-2.5 py-1 text-xs bg-surface border border-border rounded text-text font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-xs font-medium text-text">Required Sweep Distance (0.6x ATR):</span>
                  <span className="text-sm font-bold font-mono text-primary">${sweepDistance}</span>
                </div>

                <div className="p-2.5 rounded bg-surface border border-border text-xs text-text-muted">
                  <span className="font-semibold text-text">Confirmation:</span> 2x consecutive M1 candle closes back inside session range after sweep extreme.
                </div>
              </div>
            </div>

            {/* Time Windows */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-success/10 text-success">SESSION WINDOWS</span>
              <h3 className="text-lg font-bold text-text mt-1">Institutional Time Windows</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Exact zoneinfo conversion to UTC per date (London & New York).
              </p>

              <div className="mt-4 space-y-3">
                <div className="p-3.5 rounded-lg bg-bg border border-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">London Session Open:</span>
                    <span className="font-mono text-primary">08:00 - 12:00 Europe/London</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Winter: 08:00 - 12:00 UTC | Summer (BST): 07:00 - 11:00 UTC
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-bg border border-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-text">New York Cash Open:</span>
                    <span className="font-mono text-primary">08:00 - 10:00 America/New_York</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Winter (EST): 13:00 - 15:00 UTC | Summer (EDT): 12:00 - 14:00 UTC
                  </div>
                </div>

                <div className="text-xs text-text-muted flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-info" />
                  <span>Conversions execute dynamically using system tzdata / zoneinfo tables.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EXECUTION */}
      {activeTab === 'execution' && (
        <div className="space-y-6">
          {/* Locked Parameters Review Matrix */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <Lock className="w-4 h-4 text-warning" />
                  Hard Parameter Lock Matrix (Pre-Backtest Freeze)
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Parameters locked prior to table evaluation to prevent curve-fitting and retroactive selection bias.
                </p>
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded bg-warning/10 text-warning border border-warning/20">
                PRE-BACKTEST MATRIX
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">1. Sweep Distance</div>
                <div className="text-sm font-semibold text-text mt-1">0.6x M5 ATR(14)</div>
                <div className="text-xs text-text-muted mt-0.5">Beyond session extreme</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">2. Trigger Confirmation</div>
                <div className="text-sm font-semibold text-text mt-1">2x M1 Close Inside</div>
                <div className="text-xs text-text-muted mt-0.5">Consecutive closes back inside</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">3. Direction Filter</div>
                <div className="text-sm font-semibold text-text mt-1">Long &gt; +T | Short &lt; -T</div>
                <div className="text-xs text-text-muted mt-0.5">TRAIN calibrated threshold</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">4. Stop Loss</div>
                <div className="text-sm font-semibold text-text mt-1">Sweep Extreme + $1.50</div>
                <div className="text-xs text-text-muted mt-0.5">Fixed protective buffer</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">5. Profit Target</div>
                <div className="text-sm font-semibold text-text mt-1">1.8R Fixed Target</div>
                <div className="text-xs text-text-muted mt-0.5">Positive expectancy ratio</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">6. Max Spread Filter</div>
                <div className="text-sm font-semibold text-text mt-1">$0.60 Max Spread</div>
                <div className="text-xs text-text-muted mt-0.5">spread_points x point &le; 0.60</div>
              </div>

              {/* Requirement 5: News blackout, max trades per day, and time exit at window end show as 'unset, owner must lock' */}
              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">7. News Blackout</div>
                <div className="mt-1">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-warning/10 text-warning border border-warning/20">
                    unset, owner must lock
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-1">CPI, NFP, FOMC Blackout Window</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">8. Max Trades Per Day</div>
                <div className="mt-1">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-warning/10 text-warning border border-warning/20">
                    unset, owner must lock
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-1">Daily risk ceiling execution cap</div>
              </div>

              <div className="p-3.5 rounded-lg bg-bg border border-border">
                <div className="text-xs text-text-muted">9. Time Exit at Window End</div>
                <div className="mt-1">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-warning/10 text-warning border border-warning/20">
                    unset, owner must lock
                  </span>
                </div>
                <div className="text-xs text-text-muted mt-1">Close open position at session cutoff</div>
              </div>
            </div>
          </div>

          {/* Sizing & Risk Formula Box */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div>
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  Sizing & Risk Calculation Engine
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Strict financial formula: <code className="text-text font-mono bg-bg px-1.5 py-0.5 rounded border border-border">Risk ($) = stop_distance x trade_contract_size x lots</code>. Always round lots DOWN to volume_step.
                </p>
              </div>

              <button
                onClick={handleMt5SymbolInfo}
                disabled={isRunningCommand}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface hover:bg-surface-hover border border-border text-text flex items-center gap-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningCommand ? 'animate-spin' : ''}`} />
                {symbolInfo ? 'Re-Query Symbol Specs' : 'Query MT5 Symbol Specs'}
              </button>
            </div>

            {/* Symbol Specs Summary (Requirement 3: contract size, volume min, volume step from bridge symbol info) */}
            <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-bg border border-border text-xs">
              <div>
                <span className="text-text-muted block">Contract Size:</span>
                <span className="font-mono font-semibold text-text">
                  {symbolInfo ? `${symbolInfo.trade_contract_size} oz/lot` : <span className="text-warning">not fetched</span>}
                </span>
              </div>
              <div>
                <span className="text-text-muted block">Volume Step:</span>
                <span className="font-mono font-semibold text-text">
                  {symbolInfo ? `${symbolInfo.volume_step} lot` : <span className="text-warning">not fetched</span>}
                </span>
              </div>
              <div>
                <span className="text-text-muted block">Volume Min:</span>
                <span className="font-mono font-semibold text-text">
                  {symbolInfo ? `${symbolInfo.volume_min} lot` : <span className="text-warning">not fetched</span>}
                </span>
              </div>
              <div>
                <span className="text-text-muted block">Broker Suffix / Server:</span>
                <span className="font-mono font-semibold text-text">
                  {symbolInfo ? `${symbolInfo.broker_symbol}` : <span className="text-warning">not fetched</span>}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-lg bg-bg border border-border">
              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Account Balance ($)</label>
                <input
                  type="number"
                  value={calcEquity}
                  onChange={(e) => setCalcEquity(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Risk per Trade (%)</label>
                <input
                  type="number"
                  step="0.25"
                  value={calcRiskPct}
                  onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Entry Price ($)</label>
                <input
                  type="number"
                  step="0.5"
                  value={calcEntry}
                  onChange={(e) => setCalcEntry(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text-muted block mb-1">Stop Loss Price ($)</label>
                <input
                  type="number"
                  step="0.5"
                  value={calcStopPrice}
                  onChange={(e) => setCalcStopPrice(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border text-center">
              <div>
                <div className="text-xs text-text-muted">Dollar Risk Budget</div>
                <div className="text-base font-bold text-text mt-1">${riskAmountUsd.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Stop Distance</div>
                <div className="text-base font-bold font-mono text-text mt-1">${stopDistance.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">Calculated Lot Size (Round DOWN)</div>
                <div className="text-lg font-extrabold font-mono text-primary mt-0.5">
                  {computedLots !== null ? `${computedLots} lots` : <span className="text-xs font-normal text-warning">not fetched</span>}
                </div>
                <span className="text-[10px] text-text-muted block mt-0.5">
                  {symbolInfo ? `Rounded DOWN to step ${symbolInfo.volume_step}` : 'Query MT5 symbol specs first'}
                </span>
              </div>
              <div>
                <div className="text-xs text-text-muted">1.8R Target ($ / Price)</div>
                <div className="text-base font-bold font-mono text-success mt-1">
                  +${targetProfitUsd} <span className="text-xs text-text-muted">(${targetPrice})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real Database Backtest Section (Requirement 1: Real DB rows only, No run yet empty state) */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-lg font-bold text-text">Single Setup Backtest Table</h3>
                  <span className="px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-warning/20 text-warning border border-warning/30">
                    PRELIMINARY - not for decisions
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  <strong>PRELIMINARY - not for decisions.</strong> Computed strictly from the training portion (first 70% of chronological M15 candles in SQLite). Test and lockbox partitions are strictly isolated.
                </p>
              </div>

              <button
                onClick={handleRunRealBacktest}
                disabled={isRunningBacktest}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-white flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${isRunningBacktest ? 'animate-spin' : ''}`} />
                {isRunningBacktest ? 'Evaluating DB Candles...' : 'Run Backtest from Real Database'}
              </button>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Total Setups</div>
                <div className="text-base font-bold text-text mt-0.5">
                  {backtestResult ? backtestResult.totalSetups : '---'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Win Rate</div>
                <div className="text-base font-bold text-success mt-0.5">
                  {backtestResult ? backtestResult.winRate : '---'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Profit Factor</div>
                <div className="text-base font-bold text-text mt-0.5">
                  {backtestResult ? backtestResult.profitFactor : '---'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Net Return</div>
                <div className="text-base font-bold text-success mt-0.5">
                  {backtestResult ? backtestResult.netReturnR : '---'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Max Drawdown</div>
                <div className="text-base font-bold text-warning mt-0.5">
                  {backtestResult ? backtestResult.maxDrawdownR : '---'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-bg border border-border text-center">
                <div className="text-xs text-text-muted">Expectancy</div>
                <div className="text-base font-bold text-primary mt-0.5">
                  {backtestResult ? backtestResult.expectancyR : '---'}
                </div>
              </div>
            </div>

            {/* Backtest Trades Table Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Backtest Trades Table (Training Portion Only)
              </span>
              <span className="text-xs font-mono font-bold text-warning">
                PRELIMINARY - not for decisions
              </span>
            </div>

            {/* Backtest Trades Table */}
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-bg text-text-muted uppercase text-xs border-b border-border">
                  <tr>
                    <th className="px-4 py-3">Date / Session</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">Stop Loss</th>
                    <th className="px-4 py-3">Take Profit (1.8R)</th>
                    <th className="px-4 py-3">Exit Price</th>
                    <th className="px-4 py-3">Spread</th>
                    <th className="px-4 py-3 text-right">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backtestResult && backtestResult.trades.length > 0 ? (
                    backtestResult.trades.map((row, idx) => (
                      <tr key={idx} className="hover:bg-surface-hover transition-colors">
                        <td className="px-4 py-2.5 font-mono text-text">{row.date}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded font-semibold text-xs ${
                            row.side === 'LONG' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                          }`}>
                            {row.side}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-text">{row.entry}</td>
                        <td className="px-4 py-2.5 font-mono text-text-muted">{row.sl}</td>
                        <td className="px-4 py-2.5 font-mono text-text">{row.tp}</td>
                        <td className="px-4 py-2.5 font-mono text-text">{row.exit}</td>
                        <td className="px-4 py-2.5 font-mono text-text-muted">{row.spread}</td>
                        <td className="px-4 py-2.5 font-bold text-right">
                          <span className={row.won ? 'text-success' : 'text-danger'}>{row.outcome}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-text-muted">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <AlertCircle className="w-7 h-7 text-text-muted opacity-40" />
                          <div className="text-sm font-semibold text-text">No run yet</div>
                          <div className="text-xs text-text-muted max-w-sm">
                            Backtest table displays rows computed strictly from real SQLite candles. Click &ldquo;Run Backtest from Real Database&rdquo; to compute trade setups.
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RUNBOOK */}
      {activeTab === 'runbook' && (
        <div className="space-y-6">
          {/* Action Buttons Panel */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-text">Operational Runbook Tools</h3>
            <p className="text-xs text-text-muted mt-0.5 mb-4">
              Diagnostic, cleanup, and data ingestion commands. Every command streams stdout/stderr output directly to the live console panel below. Deletions strictly require a prior dry run.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Button 1: Dry Run Cleanup */}
              <button
                onClick={handleDryRunCleanup}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>1. Dry Run Cleanup</span>
                  <Terminal className="w-3.5 h-3.5 text-warning" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Inspects synthetic baseline and fake seed counts without deleting.
                </p>
              </button>

              {/* Button 2: Apply Cleanup */}
              <button
                onClick={handleApplyCleanup}
                disabled={isRunningCommand || !dryRunDone}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50 relative group"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>2. Apply Cleanup</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-danger" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Creates SQLite .backup file first, then purges synthetic data.
                </p>
                <div className="mt-2 p-1.5 rounded bg-danger/10 border border-danger/20 text-[11px] text-danger font-medium leading-tight">
                  ⚠️ WARNING: Server must be stopped before applying in production! Atomic backup is saved to data/backups/. On-the-hour candles are strictly preserved.
                </div>
              </button>

              {/* Button 3: Patch COT Ingest (Requirement 4: 260 weeks) */}
              <button
                onClick={handlePatchCot}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>3. Patch COT Ingest</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Locks limit=260 weeks and enforces CFTC Public Reporting API only.
                </p>
              </button>

              {/* Button 4: Backfill COT (Requirement 4: 260 weeks) */}
              <button
                onClick={handleBackfillCot}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>4. Backfill COT (260 Weeks)</span>
                  <Database className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Ingests CFTC Public Reporting API for 260 weeks with Tuesday + 6d lag.
                </p>
              </button>

              {/* Button 5: FRED Dry-Run */}
              <button
                onClick={handleFredDryRun}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>5. FRED Dry-Run</span>
                  <Activity className="w-3.5 h-3.5 text-info" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Tests FRED API and validates next UTC day 00:00 effective dates.
                </p>
              </button>

              {/* Button 6: FRED Backfill */}
              <button
                onClick={handleFredBackfill}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>6. FRED Backfill</span>
                  <Database className="w-3.5 h-3.5 text-info" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Backfills DFII10 (Real Yield) and DGS10 (10Y Nominal) into macro_series.
                </p>
              </button>

              {/* Button 7: Download Real Candles */}
              <button
                onClick={handleDownloadRealCandles}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>7. Download Real Candles</span>
                  <Layers className="w-3.5 h-3.5 text-warning" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Downloads XAUUSD M1, M5, M15 candles via broker bridge.
                </p>
              </button>

              {/* Button 8: Session Windows Self-Test */}
              <button
                onClick={handleSessionWindowsSelfTest}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>8. Session Windows Self-Test</span>
                  <Clock className="w-3.5 h-3.5 text-success" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Evaluates London & NY daylight saving time UTC conversions.
                </p>
              </button>

              {/* Button 9: MT5 Symbol Info */}
              <button
                onClick={handleMt5SymbolInfo}
                disabled={isRunningCommand}
                className="p-3.5 rounded-lg border border-border bg-bg hover:bg-surface-hover text-left transition-all disabled:opacity-50"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span>9. MT5 Symbol Info</span>
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Inspects trade_contract_size (100), point (0.01), and broker server.
                </p>
              </button>
            </div>
          </div>

          {/* Live Console Output Panel */}
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-text">Live Runbook Terminal Console</h3>
                {isRunningCommand && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/10 text-primary animate-pulse">
                    Executing...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const text = consoleLogs.map((l) => `[${l.timestamp}] [${l.command}] ${l.output}`).join('\n\n');
                    navigator.clipboard.writeText(text);
                    appendConsoleLog('console:copy', 'Terminal output copied to clipboard.', 'info');
                  }}
                  className="px-2.5 py-1 text-xs rounded bg-surface hover:bg-surface-hover border border-border text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Copy Output
                </button>
                <button
                  onClick={() => setConsoleLogs([])}
                  className="px-2.5 py-1 text-xs rounded bg-surface hover:bg-surface-hover border border-border text-text-muted hover:text-danger flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Console
                </button>
              </div>
            </div>

            {/* Terminal Window */}
            <div className="bg-bg border border-border rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-3">
              {consoleLogs.length === 0 ? (
                <div className="text-text-muted py-8 text-center">Console output is empty. Run any Runbook command above.</div>
              ) : (
                consoleLogs.map((log) => (
                  <div key={log.id} className="border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                      <span className="text-text font-semibold">{log.command}</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <pre className={`whitespace-pre-wrap break-words ${
                      log.type === 'error'
                        ? 'text-danger'
                        : log.type === 'warn'
                        ? 'text-warning'
                        : log.type === 'success'
                        ? 'text-success'
                        : 'text-text'
                    }`}>
                      {log.output}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
