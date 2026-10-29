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
  HelpCircle,
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
import { CandlestickChart } from './CandlestickChart';

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
      console.warn('Failed to load Smart Money status:', e);
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
      } else {
        setLatestReading(null);
      }
    } catch (e) {
      setLatestReading(null);
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
      console.warn('Failed to load signals:', e);
    }
  };

  // Load H1 Candles for Charting
  const loadCandles = async (sym: SmartMoneySymbol) => {
    try {
      const res = await fetch(`/api/data/load?symbol=${sym}&timeframe=H1`);
      if (res.ok) {
        const data = await res.json();
        setCandles(data.candles || []);
      }
    } catch (e) {
      console.warn('Failed to load candles:', e);
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
        setFeedbackMessage(`CFTC COT positioning refreshed: ${data.rowsIngested} weekly reports indexed.`);
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
        setFeedbackMessage(`Updated ${data.outcomesUpdated} multi-horizon trade outcomes (+4h, +24h, +72h).`);
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
    const target = signalRecord || latestReading?.signal;
    if (!target) return;

    setIsExplainingAi(true);
    setExplanationText(null);
    setExplainError(null);

    try {
      const res = await fetch('/api/smartmoney/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: target }),
      });
      const data = await res.json();
      if (res.ok && data.explanation) {
        setExplanationText(data.explanation);
      } else {
        setExplainError(data.message || 'AI advisor service not available.');
      }
    } catch (e: any) {
      setExplainError(e.message || 'Failed to communicate with AI explanation proxy.');
    } finally {
      setIsExplainingAi(false);
    }
  };

  const currentSignal = latestReading?.signal;
  const totalCotWeeks =
    selectedSymbol === 'XAUUSD'
      ? statusData?.cotFreshness?.totalWeeksXau ?? 0
      : statusData?.cotFreshness?.totalWeeksEur ?? 0;
  const totalH1Bars =
    selectedSymbol === 'XAUUSD'
      ? statusData?.candleFreshness?.xauH1Bars ?? candles.length
      : statusData?.candleFreshness?.eurH1Bars ?? candles.length;

  // Has initial data loaded?
  const hasCotData = totalCotWeeks > 0;
  const hasH1Bars = totalH1Bars >= 30;
  const hasSignals = signalsList.length > 0;

  // Diverging scale position for -100 to +100 score
  const scoreVal = currentSignal?.score ?? 0;
  // Map -100..+100 to 0%..100% (center = 50%)
  const scorePositionPct = Math.max(0, Math.min(100, (scoreVal + 100) / 2));

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & INSTRUMENT TOGGLE */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Footprints className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">
              Smart Money Footprint & Institutional COT
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Multi-evidence quantitative synthesis: Weekly CFTC COT Futures, H1 Volume Displacement, and H4 Trend Context.
            </p>
          </div>
        </div>

        {/* Universal Indigo Instrument Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-bg border border-border">
          {SUPPORTED_SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => setSelectedSymbol(sym)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedSymbol === sym
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {sym === 'XAUUSD' ? 'Gold (XAUUSD)' : 'Euro (EURUSD)'}
            </button>
          ))}
        </div>
      </div>

      {/* Global Feedback notification */}
      {feedbackMessage && (
        <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-primary" />
            <span>{feedbackMessage}</span>
          </div>
          <button type="button" onClick={() => setFeedbackMessage(null)} className="text-text-muted hover:text-text cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. THREE-STEP GUIDED SETUP PIPELINE (When data needs ingest or signals) */}
      {(!hasCotData || !hasH1Bars || !hasSignals) && (
        <div className="p-5 rounded-2xl bg-warning/10 border border-warning/30 text-text space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <h2 className="text-sm font-bold text-warning">
              Institutional Signal Setup Checklist
            </h2>
          </div>
          <p className="text-xs text-text-muted">
            Smart Money Footprint requires 3 authoritative data layers to synthesize hedge fund positioning with price action:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Step 1 */}
            <div className={`p-3.5 rounded-xl border ${hasCotData ? 'bg-success/10 border-success/30' : 'bg-surface border-border'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-text">1. Weekly CFTC COT</span>
                {hasCotData ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-warning font-bold">Pending</span>}
              </div>
              <p className="text-text-muted text-[11px] mb-3">
                {hasCotData ? `${totalCotWeeks} weekly reports indexed` : '0 weeks indexed. Fetch official CFTC commitment records.'}
              </p>
              {!hasCotData && (
                <button
                  type="button"
                  onClick={handleRefreshCot}
                  disabled={isRefreshingCot}
                  className="w-full py-1.5 rounded-lg bg-primary text-white font-semibold text-xs cursor-pointer"
                >
                  {isRefreshingCot ? 'Fetching...' : 'Ingest CFTC reports'}
                </button>
              )}
            </div>

            {/* Step 2 */}
            <div className={`p-3.5 rounded-xl border ${hasH1Bars ? 'bg-success/10 border-success/30' : 'bg-surface border-border'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-text">2. Closed H1 Bars</span>
                {hasH1Bars ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-warning font-bold">Pending</span>}
              </div>
              <p className="text-text-muted text-[11px] mb-3">
                {hasH1Bars ? `${totalH1Bars} closed H1 candles available` : '0 bars found. Minimum 30 closed H1 bars required.'}
              </p>
              {!hasH1Bars && (
                <span className="text-text-muted text-[11px]">Seeded automatically on startup</span>
              )}
            </div>

            {/* Step 3 */}
            <div className={`p-3.5 rounded-xl border ${hasSignals ? 'bg-success/10 border-success/30' : 'bg-surface border-border'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-text">3. Synthesize Signals</span>
                {hasSignals ? <CheckCircle2 className="w-4 h-4 text-success" /> : <span className="text-warning font-bold">Pending</span>}
              </div>
              <p className="text-text-muted text-[11px] mb-3">
                {hasSignals ? `${signalsList.length} candidate signals evaluated` : 'Compute multi-layer confidence score across all closed bars.'}
              </p>
              <button
                type="button"
                onClick={handleComputeSignals}
                disabled={isComputingSignals || !hasCotData || !hasH1Bars}
                className="w-full py-1.5 rounded-lg bg-primary text-white font-semibold text-xs disabled:opacity-50 cursor-pointer"
              >
                {isComputingSignals ? 'Computing...' : 'Compute signals'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DIVERGING -100 TO +100 SCORE CARD */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm transition-colors space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-text">
              Active Institutional Signal ({selectedSymbol})
            </h2>
            <span className="text-xs text-text-muted">
              Composite footprint score combining CFTC positioning, volume displacement, and trend direction.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleComputeSignals}
              disabled={isComputingSignals}
              className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary text-white font-semibold text-xs shadow-sm shadow-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {isComputingSignals ? 'Computing...' : 'Compute signals'}
            </button>
            <button
              type="button"
              onClick={handleRefreshCot}
              disabled={isRefreshingCot}
              className="px-3 py-1.5 rounded-xl border border-border text-text-muted hover:bg-bg text-xs font-semibold cursor-pointer"
            >
              {isRefreshingCot ? 'Fetching...' : 'Refresh COT'}
            </button>
            <button
              type="button"
              onClick={() => handleExplainSignal()}
              disabled={isExplainingAi || !currentSignal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg text-text border border-border hover:bg-surface text-xs font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{isExplainingAi ? 'Analyzing...' : 'Explain signal'}</span>
            </button>
          </div>
        </div>

        {currentSignal ? (
          <div className="space-y-6">
            {/* Score Number & Signal Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs text-text-muted">Synthesis Score:</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-4xl font-extrabold font-mono text-text tabular-nums tracking-tight">
                    {scoreVal > 0 ? `+${scoreVal}` : scoreVal}
                  </span>
                  <span className="text-text-muted font-mono text-xs">/ ±100</span>
                </div>
              </div>

              {/* Direction Badge */}
              <div
                className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
                  currentSignal.direction === 'BUY'
                    ? 'bg-success/15 text-success border border-success/30'
                    : currentSignal.direction === 'SELL'
                    ? 'bg-danger/15 text-danger border border-danger/30'
                    : 'bg-bg text-text-muted border border-border'
                }`}
              >
                {currentSignal.direction === 'BUY' ? (
                  <ArrowUpRight className="w-4 h-4 text-success" />
                ) : currentSignal.direction === 'SELL' ? (
                  <ArrowDownRight className="w-4 h-4 text-danger" />
                ) : (
                  <Minus className="w-4 h-4 text-text-muted" />
                )}
                <span>{currentSignal.direction} CONFIRMED</span>
              </div>
            </div>

            {/* DIVERGING HORIZONTAL GAUGE: -100 to +100 with ±50 thresholds */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-text-muted font-mono">
                <span className="text-danger font-bold">-100 (Strong Short)</span>
                <span className="text-danger font-medium">-50 (Short Gate)</span>
                <span className="text-text-muted font-medium">0 (Neutral)</span>
                <span className="text-success font-medium">+50 (Long Gate)</span>
                <span className="text-success font-bold">+100 (Strong Long)</span>
              </div>

              {/* Gauge Track */}
              <div className="h-4 rounded-full bg-bg overflow-hidden relative border border-border">
                {/* Visual Segments */}
                <div className="absolute inset-0 bg-gradient-to-r from-danger via-border to-success opacity-80" />
                {/* 50 Threshold Markers */}
                <div className="absolute top-0 bottom-0 left-[25%] w-0.5 bg-white/70" title="-50 Threshold" />
                <div className="absolute top-0 bottom-0 left-[50%] w-0.5 bg-white/90" title="Neutral 0" />
                <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-white/70" title="+50 Threshold" />
                {/* Active Needle Pin */}
                <div
                  className="absolute top-0 bottom-0 w-2.5 bg-text rounded-full shadow-lg ring-2 ring-primary transition-all duration-300 -tranborder/2"
                  style={{ left: `${scorePositionPct}%` }}
                />
              </div>
            </div>

            {/* Sub-Components Breakdown with Plain-English Tooltips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-bg border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium" title="CFTC Commercial Hedger Net Flow">
                    COT Hedger Flow (cCot)
                  </span>
                  <HelpCircle className="w-3.5 h-3.5 text-text-muted" />
                </div>
                <div className="text-lg font-bold font-mono text-text tabular-nums">
                  {currentSignal.c_cot > 0 ? `+${currentSignal.c_cot}` : currentSignal.c_cot} / ±40
                </div>
                <div className="text-[11px] text-text-muted">
                  Weekly institutional shift
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-bg border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium" title="H1 Tick Volume Expansion Event">
                    Volume Spike (cAct)
                  </span>
                  <HelpCircle className="w-3.5 h-3.5 text-text-muted" />
                </div>
                <div className="text-lg font-bold font-mono text-text tabular-nums">
                  {currentSignal.c_act > 0 ? `+${currentSignal.c_act}` : currentSignal.c_act} / ±35
                </div>
                <div className="text-[11px] text-text-muted">
                  H1 institutional displacement
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-bg border border-border space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted font-medium" title="H4 Multi-Timeframe Trend Alignment">
                    Trend Context (cTrend)
                  </span>
                  <HelpCircle className="w-3.5 h-3.5 text-text-muted" />
                </div>
                <div className="text-lg font-bold font-mono text-text tabular-nums">
                  {currentSignal.c_trend > 0 ? `+${currentSignal.c_trend}` : currentSignal.c_trend} / ±25
                </div>
                <div className="text-[11px] text-text-muted">
                  H4 swing & EMA structure
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center space-y-3">
            <Footprints className="w-8 h-8 text-text-muted mx-auto" />
            <div className="text-sm font-semibold text-text">No signal calculated yet</div>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              Click "Compute signals" above to scan the latest closed H1 bars and synthesize the institutional footprint score.
            </p>
          </div>
        )}
      </div>

      {/* 4. SIGNAL HISTORY TABLE WITH OUTCOMES */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm transition-colors space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-text">
              Historical Signal Log ({signalsList.length})
            </h2>
            <span className="text-xs text-text-muted">
              Point-in-time signals generated from closed H1 bars with multi-horizon outcomes
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUpdateOutcomes}
              disabled={isUpdatingOutcomes || signalsList.length === 0}
              className="px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-text-muted hover:bg-bg disabled:opacity-50 cursor-pointer"
            >
              {isUpdatingOutcomes ? 'Updating...' : 'Update outcomes'}
            </button>
            <button
              type="button"
              onClick={handleRunEventStudy}
              disabled={isRunningEval || signalsList.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isRunningEval ? 'Evaluating...' : 'Run event study'}
            </button>
          </div>
        </div>

        {signalsList.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-xs">
            No historical signals computed for {selectedSymbol}. Click "Compute signals" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 font-medium">Bar Time</th>
                  <th className="text-center py-2 font-medium">Direction</th>
                  <th className="text-right py-2 font-medium">Score</th>
                  <th className="text-right py-2 font-medium">Confidence</th>
                  <th className="text-left py-2 font-medium">Trigger</th>
                  <th className="text-right py-2 font-medium">Outcomes (+24h)</th>
                  <th className="text-right py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {signalsList.slice(0, 10).map((s) => {
                  const out24 = (s.outcomes || []).find((o: any) => o.horizon_hours === 24);
                  return (
                    <tr key={s.id} className="hover:bg-bg/50 transition-colors">
                      <td className="py-2.5 text-text-muted tabular-nums">
                        {new Date(s.bar_time * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.direction === 'BUY'
                              ? 'bg-success/15 text-success'
                              : 'bg-danger/15 text-danger'
                          }`}
                        >
                          {s.direction}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold tabular-nums text-text">
                        {s.score > 0 ? `+${s.score}` : s.score}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-primary font-semibold">
                        {s.confidence}%
                      </td>
                      <td className="py-2.5 text-text-muted font-sans">
                        {s.event_type}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {out24 ? (
                          <span className={out24.return_pips_or_points >= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                            {out24.return_pips_or_points >= 0 ? '+' : ''}{out24.return_pips_or_points.toFixed(1)} pips
                          </span>
                        ) : (
                          <span className="text-text-muted">Pending</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => handleExplainSignal(s)}
                          className="px-2 py-1 rounded text-xs text-primary hover:bg-primary/10 cursor-pointer"
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

      {/* AI Explanation Dialog */}
      {(explanationText || explainError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-lg w-full p-6 rounded-2xl bg-surface border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-text">
                  AI Quant Advisor: Signal Breakdown
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExplanationText(null);
                  setExplainError(null);
                }}
                className="text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {explanationText ? (
              <div className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                {explanationText}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-danger/10 text-danger text-xs">
                {explainError}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setExplanationText(null);
                  setExplainError(null);
                }}
                className="px-4 py-2 rounded-xl bg-primary text-white font-semibold text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
