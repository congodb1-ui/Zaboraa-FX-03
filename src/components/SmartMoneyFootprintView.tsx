import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Compass,
  Database,
  ExternalLink,
  Flame,
  Footprints,
  Info,
  Layers,
  LineChart,
  Minus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  COT_LABEL,
  DISCLAIMER_TEXT,
  SMART_MONEY_NAME,
  SmartMoneySymbol,
  SUPPORTED_SYMBOLS,
  TICK_VOLUME_LABEL,
} from '../engine/smartMoney/cotConfig';
import { Candle } from '../types/forex';

interface SmartMoneyFootprintViewProps {
  onSelectSymbol?: (symbol: SmartMoneySymbol) => void;
}

export const SmartMoneyFootprintView: React.FC<SmartMoneyFootprintViewProps> = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<SmartMoneySymbol>('XAUUSD');
  const [statusData, setStatusData] = useState<any | null>(null);
  const [latestReading, setLatestReading] = useState<any | null>(null);
  const [signalsList, setSignalsList] = useState<any[]>([]);
  const [evalReport, setEvalReport] = useState<any | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Loading states
  const [isLoadingLatest, setIsLoadingLatest] = useState<boolean>(false);
  const [isRefreshingCot, setIsRefreshingCot] = useState<boolean>(false);
  const [isComputingSignals, setIsComputingSignals] = useState<boolean>(false);
  const [isRunningEval, setIsRunningEval] = useState<boolean>(false);
  const [isUpdatingOutcomes, setIsUpdatingOutcomes] = useState<boolean>(false);
  const [isExplainingAi, setIsExplainingAi] = useState<boolean>(false);

  // AI Explanation Modal
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Held-out test confirmation state
  const [confirmHeldOut, setConfirmHeldOut] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Load Status and Freshness
  const loadStatus = async () => {
    try {
      const res = await fetch('/api/smartmoney/status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (e) {
      console.error('Failed to load Smart Money status:', e);
    }
  };

  // Load Latest Reading for selected symbol
  const loadLatest = async (sym: SmartMoneySymbol) => {
    setIsLoadingLatest(true);
    try {
      const res = await fetch(`/api/smartmoney/latest?symbol=${sym}`);
      if (res.ok) {
        const data = await res.json();
        setLatestReading(data);
      }
    } catch (e) {
      console.error('Failed to load latest reading:', e);
    } finally {
      setIsLoadingLatest(false);
    }
  };

  // Load Signals History
  const loadSignals = async (sym: SmartMoneySymbol) => {
    try {
      const res = await fetch(`/api/smartmoney/signals?symbol=${sym}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setSignalsList(data.signals || []);
      }
    } catch (e) {
      console.error('Failed to load signals:', e);
    }
  };

  // Load Candles for chart
  const loadCandles = async (sym: SmartMoneySymbol) => {
    try {
      const res = await fetch(`/api/data/load?symbol=${sym}&timeframe=H1`);
      if (res.ok) {
        const data = await res.json();
        setCandles((data.candles || []).slice(-80)); // Last 80 H1 bars
      }
    } catch (e) {
      console.error('Failed to load H1 candles:', e);
    }
  };

  useEffect(() => {
    loadStatus();
    loadLatest(selectedSymbol);
    loadSignals(selectedSymbol);
    loadCandles(selectedSymbol);
  }, [selectedSymbol]);

  // Handle Refresh COT
  const handleRefreshCot = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsRefreshingCot(true);
    setFeedbackMessage(null);
    try {
      const res = await fetch('/api/smartmoney/cot/refresh', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage(`CFTC COT positioning refreshed: ${data.rowsIngested} weekly rows indexed.`);
        await loadStatus();
        await loadLatest(selectedSymbol);
      } else {
        setFeedbackMessage(`COT refresh notice: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setFeedbackMessage(`COT refresh error: ${err.message}`);
    } finally {
      setIsRefreshingCot(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Handle Compute Signals
  const handleComputeSignals = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsComputingSignals(true);
    try {
      const res = await fetch('/api/smartmoney/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage(`Computed ${data.barsEvaluated} closed H1 bars; ${data.signalsLogged} candidate signals logged.`);
        await loadSignals(selectedSymbol);
        await loadLatest(selectedSymbol);
      }
    } catch (err: any) {
      setFeedbackMessage(`Compute error: ${err.message}`);
    } finally {
      setIsComputingSignals(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Handle Update Outcomes
  const handleUpdateOutcomes = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsUpdatingOutcomes(true);
    try {
      const res = await fetch('/api/smartmoney/outcomes/update', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMessage(`Updated ${data.outcomesUpdated} multi-horizon outcomes (+4h, +24h, +72h).`);
        await loadSignals(selectedSymbol);
      }
    } catch (err: any) {
      setFeedbackMessage(`Outcome update error: ${err.message}`);
    } finally {
      setIsUpdatingOutcomes(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Handle Run Event Study
  const handleRunEventStudy = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsRunningEval(true);
    try {
      const res = await fetch('/api/smartmoney/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          confirmHeldOut,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEvalReport(data);
      } else {
        setFeedbackMessage(`Event study notice: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setFeedbackMessage(`Event study error: ${err.message}`);
    } finally {
      setIsRunningEval(false);
    }
  };

  // Handle AI Explanation
  const handleExplainSignal = async (signalRecord?: any) => {
    const targetSignal = signalRecord || latestReading?.signal;
    if (!targetSignal) return;

    setIsExplainingAi(true);
    setExplanationText(null);
    setExplainError(null);

    try {
      const res = await fetch('/api/smartmoney/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: targetSignal }),
      });
      const data = await res.json();
      if (res.ok && data.explanation) {
        setExplanationText(data.explanation);
      } else {
        setExplainError(data.message || data.error || 'AI explanation service currently unavailable.');
      }
    } catch (err: any) {
      setExplainError(`Failed to contact AI advisor service: ${err.message}`);
    } finally {
      setIsExplainingAi(false);
    }
  };

  const currentSignal = latestReading?.signal;
  const cot = latestReading?.cotFeatures;
  const act = latestReading?.activityEvent;
  const trend = latestReading?.trendContext;

  return (
    <div className="space-y-6">
      {/* 1. Header & Symbol Switcher Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0E1524] p-5 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Footprints className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  {SMART_MONEY_NAME}
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    H1 Closed Bars · Point-in-Time
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Multi-evidence quantitative synthesis: Weekly CFTC COT Futures, H1 Tick Volume Displacement, and UTC H4 Trend Context.
                </p>
              </div>
            </div>
          </div>

          {/* Symbol Selector Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Instrument:</span>
            {SUPPORTED_SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSelectedSymbol(sym)}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedSymbol === sym
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-400'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                {sym}
                <span className="text-[10px] opacity-70 ml-1.5 font-normal">
                  {sym === 'XAUUSD' ? 'Gold Spot' : 'Euro FX'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Global Feedback notification */}
        {feedbackMessage && (
          <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span>{feedbackMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Current Signal Reading Card */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">
                  Active Synthesis State
                </span>
                {currentSignal && (
                  <span
                    className={`px-3 py-1 rounded-md text-xs font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 ${
                      currentSignal.direction === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : currentSignal.direction === 'SELL'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {currentSignal.direction === 'BUY' ? (
                      <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                    ) : currentSignal.direction === 'SELL' ? (
                      <ArrowDownRight className="w-4 h-4 text-rose-400" />
                    ) : (
                      <Minus className="w-4 h-4 text-slate-400" />
                    )}
                    {currentSignal.direction} SIGNAL
                  </span>
                )}
              </div>

              {/* Explain Button */}
              <button
                type="button"
                onClick={() => handleExplainSignal()}
                disabled={isExplainingAi || !currentSignal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isExplainingAi ? 'animate-spin' : ''}`} />
                {isExplainingAi ? 'Consulting Advisor...' : 'Explain This Signal'}
              </button>
            </div>

            {/* Score & Confidence Gauges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-3 rounded-lg bg-[#0E1524] border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Synthesized Score</span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-mono font-bold tabular-nums ${
                      (currentSignal?.score || 0) > 0
                        ? 'text-emerald-400'
                        : (currentSignal?.score || 0) < 0
                        ? 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {currentSignal?.score > 0 ? `+${currentSignal.score}` : currentSignal?.score ?? 0}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">/ ±100</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (currentSignal?.score || 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.abs(currentSignal?.score || 0))}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0E1524] border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Empirical Confidence</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-mono font-bold text-white tabular-nums">
                    {currentSignal?.confidence ?? 0}%
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">P-score</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${currentSignal?.confidence || 0}%` }}
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#0E1524] border border-slate-800">
                <span className="text-[11px] text-slate-400 block mb-1">Invalidation Reference</span>
                <div className="text-lg font-mono font-bold text-amber-400 tabular-nums">
                  {currentSignal?.invalidation_price ? currentSignal.invalidation_price.toFixed(selectedSymbol === 'XAUUSD' ? 2 : 4) : '—'}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block mt-1">
                  Exit rule: ±1.5 × ATR(14)
                </span>
              </div>
            </div>

            {/* Crowded Warning Banner */}
            {currentSignal?.is_crowded && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Crowded Positioning Alert:</strong> Weekly institutional COT positioning z-score is extreme (|z| ≥ 2.0). Historical crowd saturation increases squeeze risk; confidence reduced by 15 points.
                </span>
              </div>
            )}

            {/* Stale Warning Banner */}
            {currentSignal?.is_stale && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>Stale Data Gate Active:</strong> Latest COT report exceeds 12 days old. Per Hard Rule 6, layer fails closed to 0 (NEUTRAL).
                </span>
              </div>
            )}
          </div>

          {/* Quick Context & Time Metadata */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-3 font-mono text-xs">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">
              Bar Timing & Expiry Guard
            </h3>
            <div className="space-y-2 text-slate-300 pt-1">
              <div className="flex justify-between pb-1.5 border-b border-slate-800">
                <span className="text-slate-500">Closed Bar Time:</span>
                <strong className="text-white">
                  {currentSignal?.bar_time ? new Date(currentSignal.bar_time * 1000).toUTCString() : '—'}
                </strong>
              </div>
              <div className="flex justify-between pb-1.5 border-b border-slate-800">
                <span className="text-slate-500">Signal Expiry (+24h):</span>
                <strong className="text-slate-300">
                  {currentSignal?.expires_at ? new Date(currentSignal.expires_at * 1000).toUTCString() : '—'}
                </strong>
              </div>
              <div className="flex justify-between pb-1.5 border-b border-slate-800">
                <span className="text-slate-500">Minimum Agreement:</span>
                <span className="text-emerald-400 font-bold">2 of 3 Non-Zero</span>
              </div>
              <div className="flex justify-between pb-1.5 border-b border-slate-800">
                <span className="text-slate-500">Config Hash:</span>
                <span className="text-slate-400 text-[10px]">{currentSignal?.config_hash || 'cfg-default'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Execution Status:</span>
                <span className="text-amber-400 font-bold">ADVISORY ONLY</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Component Breakdown (3 Pillars) */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Pillar 1: COT Weekly Positioning */}
          <div className="rounded-xl border border-slate-800 bg-[#0A0F1D] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  1. CFTC COT Positioning
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-blue-400">
                cCot: {cot?.cCot ?? 0}
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Net % Open Interest:</span>
                <span className="text-white font-bold">{cot?.netPctOi ? `${cot.netPctOi}%` : 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">3-Year Z-Score (z156):</span>
                <span className="text-slate-300">{cot?.z156 ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">4-Week Change Z-Score:</span>
                <span className="text-slate-300">{cot?.chg4z ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Effective Since:</span>
                <span className="text-slate-400 text-[10px]">
                  {cot?.effectiveAt ? new Date(cot.effectiveAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Mandatory Exact String from Hard Rule 5 */}
            <div className="pt-2 border-t border-slate-800 text-[10px] text-blue-300/80 font-mono italic">
              {COT_LABEL}
            </div>
          </div>

          {/* Pillar 2: Activity Events (H1 Volume Anomalies) */}
          <div className="rounded-xl border border-slate-800 bg-[#0A0F1D] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  2. Activity Events
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400">
                cAct: {act?.cAct ?? 0}
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Detected Event:</span>
                <strong className="text-white font-bold">{act?.eventType ?? 'NONE'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Volume Z-Score:</span>
                <span className="text-slate-300">{act?.volZ ?? '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Bar Range (in ATR):</span>
                <span className="text-slate-300">{act?.rangeInAtr ?? '0.00'}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Close Location:</span>
                <span className="text-slate-300">{act?.closeLoc ? `${Math.round(act.closeLoc * 100)}%` : '50%'}</span>
              </div>
            </div>

            {/* Mandatory Exact String from Hard Rule 4 */}
            <div className="pt-2 border-t border-slate-800 text-[10px] text-emerald-300/80 font-mono italic">
              {TICK_VOLUME_LABEL}
            </div>
          </div>

          {/* Pillar 3: H4 Multi-Timeframe Trend Context */}
          <div className="rounded-xl border border-slate-800 bg-[#0A0F1D] p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  3. Trend Context (H4)
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-indigo-400">
                cTrend: {trend?.cTrend ?? 0}
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">H4 Trend Direction:</span>
                <strong className="text-white font-bold">{trend?.trendDirection ?? 'FLAT'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fast EMA (50):</span>
                <span className="text-slate-300">{trend?.emaFast ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Slow EMA (200):</span>
                <span className="text-slate-300">{trend?.emaSlow ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">H4 Completed Bars:</span>
                <span className="text-slate-400">{trend?.h4BarCount ?? 0}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[10px] text-indigo-300/80 font-mono italic">
              UTC-aligned 4h buckets (00, 04, 08, 12, 16, 20 UTC)
            </div>
          </div>
        </div>
      </div>

      {/* 4. Data Freshness & Pipeline Management */}
      <div className="rounded-xl border border-slate-800 bg-[#0E1524] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Pipeline Freshness & Sync Operations
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Direct ingestion from free public CFTC feeds and local SQLite H1 candles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshCot}
              disabled={isRefreshingCot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCot ? 'animate-spin' : ''}`} />
              {isRefreshingCot ? 'Refreshing COT...' : 'Refresh CFTC COT'}
            </button>

            <button
              type="button"
              onClick={handleComputeSignals}
              disabled={isComputingSignals}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isComputingSignals ? 'Computing...' : 'Compute H1 Signals'}
            </button>

            <button
              type="button"
              onClick={handleUpdateOutcomes}
              disabled={isUpdatingOutcomes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5" />
              {isUpdatingOutcomes ? 'Updating...' : 'Update Outcomes (+4h/+24h/+72h)'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs font-mono">
          <div className="p-3 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">COT Last Report Date:</span>
            <strong className="text-white">{statusData?.cotFreshness?.lastReportDate || 'N/A'}</strong>
          </div>
          <div className="p-3 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">Point-in-Time Effective:</span>
            <strong className="text-emerald-400">
              {statusData?.cotFreshness?.effectiveAt ? new Date(statusData.cotFreshness.effectiveAt).toLocaleDateString() : 'N/A'}
            </strong>
          </div>
          <div className="p-3 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">COT History Indexed:</span>
            <strong className="text-blue-400">
              {selectedSymbol === 'XAUUSD' ? statusData?.cotFreshness?.totalWeeksXau : statusData?.cotFreshness?.totalWeeksEur} weeks
            </strong>
          </div>
          <div className="p-3 rounded bg-slate-950 border border-slate-800">
            <span className="text-slate-500 block text-[10px]">H1 Closed Bars Available:</span>
            <strong className="text-white">
              {selectedSymbol === 'XAUUSD' ? statusData?.candleFreshness?.xauH1Bars : statusData?.candleFreshness?.eurH1Bars} bars
            </strong>
          </div>
        </div>
      </div>

      {/* 5. Signal History Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <LineChart className="w-4 h-4 text-emerald-400" />
              Generated Signals Ledger ({signalsList.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Append-only immutable record stamped on closed bar times with multi-horizon evaluation.
            </p>
          </div>
        </div>

        {signalsList.length === 0 ? (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            No candidate signals logged yet for {selectedSymbol}. Click <strong>"Compute H1 Signals"</strong> above to evaluate closed bars.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Bar Time (UTC)</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Conf</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Invalidation</th>
                  <th className="py-2.5 px-3">+4h Outcome</th>
                  <th className="py-2.5 px-3">+24h Outcome</th>
                  <th className="py-2.5 px-3">+72h Outcome</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {signalsList.map((sig) => {
                  const out4 = sig.outcomes?.find((o: any) => o.horizon_hours === 4);
                  const out24 = sig.outcomes?.find((o: any) => o.horizon_hours === 24);
                  const out72 = sig.outcomes?.find((o: any) => o.horizon_hours === 72);

                  return (
                    <tr key={sig.id} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 font-bold text-white">{sig.symbol}</td>
                      <td className="py-2 px-3 text-slate-400">
                        {new Date(sig.bar_time * 1000).toISOString().replace('T', ' ').slice(0, 16)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sig.direction === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-white tabular-nums">
                        {sig.score > 0 ? `+${sig.score}` : sig.score}
                      </td>
                      <td className="py-2 px-3 tabular-nums">{sig.confidence}%</td>
                      <td className="py-2 px-3 text-[11px] text-slate-400">{sig.event_type}</td>
                      <td className="py-2 px-3 text-amber-400 tabular-nums">
                        {sig.invalidation_price.toFixed(sig.symbol === 'XAUUSD' ? 2 : 4)}
                      </td>
                      <td className="py-2 px-3">
                        {out4 ? (
                          <span
                            className={`font-bold tabular-nums ${
                              out4.return_pips_or_points >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {out4.return_pips_or_points > 0 ? `+${out4.return_pips_or_points}` : out4.return_pips_or_points}p
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {out24 ? (
                          <span
                            className={`font-bold tabular-nums ${
                              out24.return_pips_or_points >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {out24.return_pips_or_points > 0 ? `+${out24.return_pips_or_points}` : out24.return_pips_or_points}p
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {out72 ? (
                          <span
                            className={`font-bold tabular-nums ${
                              out72.return_pips_or_points >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {out72.return_pips_or_points > 0 ? `+${out72.return_pips_or_points}` : out72.return_pips_or_points}p
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleExplainSignal(sig)}
                          className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] transition-all cursor-pointer"
                        >
                          Explain
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Event Study & Empirical Evidence Panel */}
      <div className="rounded-xl border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-400" />
              Event Study & Empirical Baseline (Multi-Horizon Evaluation)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              1,000 matched random draws with Mulberry32 fixed seed (<code className="text-emerald-400">20261028</code>) after realistic transaction costs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmHeldOut}
                onChange={(e) => setConfirmHeldOut(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span className={confirmHeldOut ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                Evaluate Held-Out 20%
              </span>
            </label>

            <button
              type="button"
              onClick={handleRunEventStudy}
              disabled={isRunningEval}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {isRunningEval ? 'Computing Event Study...' : 'Run Event Study'}
            </button>
          </div>
        </div>

        {/* Mandatory Research Result Banner */}
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong>Research result, not a trading recommendation.</strong> A null or negative baseline differential is a valid empirical result. Sample counts below 30 are explicitly flagged as Insufficient Sample.
          </span>
        </div>

        {evalReport ? (
          <div className="space-y-4 pt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Horizon</th>
                    <th className="py-2.5 px-3">Sample (n)</th>
                    <th className="py-2.5 px-3">Mean Return (Pips)</th>
                    <th className="py-2.5 px-3">Median</th>
                    <th className="py-2.5 px-3">Hit Rate (%)</th>
                    <th className="py-2.5 px-3">95% Bootstrap CI</th>
                    <th className="py-2.5 px-3">Baseline Mean</th>
                    <th className="py-2.5 px-3">Excess over Baseline</th>
                    <th className="py-2.5 px-3">Sample Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {evalReport.horizons?.map((h: any) => (
                    <tr key={h.horizonHours} className="hover:bg-slate-900/40">
                      <td className="py-2 px-3 font-bold text-white">+{h.horizonHours} Hours</td>
                      <td className="py-2 px-3 tabular-nums">{h.n}</td>
                      <td className={`py-2 px-3 font-bold tabular-nums ${h.meanReturnPips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {h.meanReturnPips > 0 ? `+${h.meanReturnPips}` : h.meanReturnPips} pips
                      </td>
                      <td className="py-2 px-3 tabular-nums">{h.medianReturnPips} pips</td>
                      <td className="py-2 px-3 tabular-nums">{h.hitRatePct}%</td>
                      <td className="py-2 px-3 text-[11px] text-slate-400">
                        [{h.bootstrapCi95?.[0]}, {h.bootstrapCi95?.[1]}]
                      </td>
                      <td className="py-2 px-3 text-slate-400 tabular-nums">{h.baselineMeanPips} pips</td>
                      <td className={`py-2 px-3 font-bold tabular-nums ${h.excessOverBaselinePips >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {h.excessOverBaselinePips > 0 ? `+${h.excessOverBaselinePips}` : h.excessOverBaselinePips} pips
                      </td>
                      <td className="py-2 px-3">
                        {h.label === 'INSUFFICIENT SAMPLE' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            INSUFFICIENT SAMPLE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                            VALID SAMPLE
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Component-Only Ablation Breakdown */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Component-Only Attribution (Ablation Analysis)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {evalReport.componentBreakdown?.map((c: any) => (
                  <div key={c.componentName} className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs">
                    <span className="text-slate-400 block text-[11px] font-bold line-clamp-1">{c.componentName}</span>
                    <div className="mt-1 flex justify-between">
                      <span className="text-slate-500">Events (n):</span>
                      <strong className="text-white">{c.n}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">+24h Mean:</span>
                      <span className={c.meanReturn24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {c.meanReturn24h > 0 ? `+${c.meanReturn24h}` : c.meanReturn24h}p
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">+24h Hit Rate:</span>
                      <span className="text-slate-300">{c.hitRate24h}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            Click <strong>"Run Event Study"</strong> to compute multi-horizon outcomes and compare against 1,000 matched random baseline draws.
          </div>
        )}
      </div>

      {/* 7. AI Explanation Modal */}
      {(explanationText || explainError || isExplainingAi) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0E1524] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">
                  Smart Money Signal Advisory Breakdown
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExplanationText(null);
                  setExplainError(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isExplainingAi ? (
              <div className="py-12 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-300 font-mono">
                  Synthesizing quantitative layers with Vertex AI...
                </p>
              </div>
            ) : explainError ? (
              <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <strong>Explanation Service Notice:</strong> {explainError}
              </div>
            ) : (
              <div className="text-xs text-slate-300 space-y-3 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
                {explanationText?.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>{DISCLAIMER_TEXT}</span>
              <button
                type="button"
                onClick={() => {
                  setExplanationText(null);
                  setExplainError(null);
                }}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Permanent Disclaimer Footer (Hard Rule 11) */}
      <footer className="text-center py-4 border-t border-slate-800/80 text-[11px] text-slate-500 font-mono">
        {DISCLAIMER_TEXT}
      </footer>
    </div>
  );
};
