import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart2,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Play,
  Printer,
  Shield,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { BacktestReport, DatasetRecord, TradeRecord } from '../types/forex';
import { BUILT_IN_STRATEGIES, StrategyDefinition } from '../engine/workerSandbox';
import { runBacktest } from '../engine/backtester';
import { CandlestickChart } from './CandlestickChart';
import { D3SimulationTimeline } from './D3SimulationTimeline';
import { Layers, Sparkles } from 'lucide-react';

interface BacktestViewProps {
  datasets: DatasetRecord[];
  strategies?: StrategyDefinition[];
  activeReport: BacktestReport | null;
  setActiveReport: (report: BacktestReport | null) => void;
  savedReports: BacktestReport[];
  onSaveReport: (report: BacktestReport) => void;
  onDeleteReport: (id: string) => void;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  datasets,
  strategies = BUILT_IN_STRATEGIES,
  activeReport,
  setActiveReport,
  savedReports,
  onSaveReport,
  onDeleteReport,
}) => {
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    datasets[0]?.id || ''
  );
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(
    strategies[0]?.id || BUILT_IN_STRATEGIES[0]?.id || ''
  );
  const [spreadPips, setSpreadPips] = useState<number>(1.2);
  const [commission, setCommission] = useState<number>(7.0);
  const [slippagePips, setSlippagePips] = useState<number>(0.2);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [chartViewMode, setChartViewMode] = useState<'both' | 'candles' | 'timeline'>('both');
  const [aiAdvice, setAiAdvice] = useState<any | null>(null);
  const [isAdvising, setIsAdvising] = useState<boolean>(false);

  const handleConsultAiDoctor = async () => {
    if (!activeReport) return;
    setIsAdvising(true);
    try {
      const res = await fetch('/api/ai/strategy-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyName: activeReport.strategyName,
          strategyId: activeReport.strategyId,
          symbol: activeReport.symbol,
          timeframe: activeReport.timeframe,
          params: selectedStrategy?.params || {},
          report: activeReport,
          strategyCode: selectedStrategy?.code,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiAdvice(data);
      }
    } catch (e) {
      console.error('Failed AI strategy doctor call:', e);
    } finally {
      setIsAdvising(false);
    }
  };

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);
  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];

  const handleRunBacktest = () => {
    if (!selectedDataset) {
      setRunError('Please select a valid dataset.');
      return;
    }
    if (!selectedStrategy) {
      setRunError('Please select a valid strategy.');
      return;
    }
    if (selectedDataset.candles.length === 0) {
      setRunError('Dataset is empty. Cannot backtest on zero candles.');
      return;
    }

    setIsRunning(true);
    setRunError(null);

    try {
      const report = runBacktest(selectedStrategy, selectedDataset, {
        initialBalance: 10000,
        spreadPips,
        commissionPerLot: commission,
        slippagePips,
        reserveHoldoutPct: 20,
      });
      setActiveReport(report);
    } catch (err: any) {
      setRunError(err?.message || 'Backtest failed to execute.');
    } finally {
      setIsRunning(false);
    }
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Configuration Bar */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-blue-400" />
              Quantitative Backtest Lab
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict intrabar worst-case SL execution, realistic transaction costs, and 20% holdout isolation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeReport && (
              <>
                <button
                  type="button"
                  onClick={() => onSaveReport(activeReport)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Save Report
                </button>
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  Print / Save PDF
                </button>
              </>
            )}
            <button
              type="button"
              disabled={isRunning}
              onClick={handleRunBacktest}
              className="flex items-center gap-2 px-5 py-2 rounded text-xs font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              {isRunning ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>
        </div>

        {/* Parameter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4 text-xs font-mono">
          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-sans">
              Historical Dataset
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.symbol} {d.timeframe} ({d.provenance})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-sans">
              Strategy Algorithm
            </label>
            <select
              value={selectedStrategyId}
              onChange={(e) => setSelectedStrategyId(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.id.startsWith('custom') || s.id.startsWith('strat-copy') ? '(Custom)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-sans">
              Broker Spread (pips)
            </label>
            <input
              type="number"
              step="0.1"
              value={spreadPips}
              onChange={(e) => setSpreadPips(parseFloat(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-sans">
              Commission ($/lot)
            </label>
            <input
              type="number"
              step="0.5"
              value={commission}
              onChange={(e) => setCommission(parseFloat(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1 font-sans">
              Slippage (pips)
            </label>
            <input
              type="number"
              step="0.1"
              value={slippagePips}
              onChange={(e) => setSlippagePips(parseFloat(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Selected Dataset Provenance Banner */}
        {selectedDataset && (
          <div className="mt-3 flex flex-wrap items-center justify-between px-3 py-2 rounded bg-slate-950 border border-slate-800/80 text-xs">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-sans">Provenance:</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider font-mono uppercase ${
                  selectedDataset.provenance === 'MT5 BRIDGE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : selectedDataset.provenance === 'USER CSV'
                    ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {selectedDataset.provenance}
              </span>
              <span className="text-slate-500 font-mono">
                {selectedDataset.candleCount} candles · {selectedDataset.symbol} {selectedDataset.timeframe}
              </span>
              <span className="text-slate-500 font-mono">
                UTC+{selectedDataset.utcOffsetHours}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Quality Score:</span>
              <span className="font-mono font-bold text-emerald-400">
                {selectedDataset.qualityScore}%
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                  selectedDataset.isResearchEligible
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {selectedDataset.isResearchEligible ? 'RESEARCH READY' : 'INELIGIBLE'}
              </span>
            </div>
          </div>
        )}

        {runError && (
          <div className="mt-3 p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{runError}</span>
          </div>
        )}
      </div>

      {/* Chart View Switcher Bar */}
      {selectedDataset && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-slate-300">Simulation Visualizer Engines:</span>
          </div>

          <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setChartViewMode('both')}
              className={`px-3 py-1 rounded transition-colors ${
                chartViewMode === 'both'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Stacked View (Both Engines)
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('candles')}
              className={`px-3 py-1 rounded transition-colors ${
                chartViewMode === 'candles'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Candlesticks (Pan & Zoom)
            </button>
            <button
              type="button"
              onClick={() => setChartViewMode('timeline')}
              className={`px-3 py-1 rounded transition-colors ${
                chartViewMode === 'timeline'
                  ? 'bg-blue-600 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              D3 Simulation Timeline
            </button>
          </div>
        </div>
      )}

      {/* 1. Candlestick & Trade Markers Chart with TradingView Pan & Zoom */}
      {selectedDataset && (chartViewMode === 'both' || chartViewMode === 'candles') && (
        <CandlestickChart
          candles={selectedDataset.candles}
          trades={activeReport?.trades || []}
          visualBlocks={activeReport?.visualBlocks || []}
          visualLines={activeReport?.visualLines || []}
          visualMarkers={activeReport?.visualMarkers || []}
          symbol={selectedDataset.symbol}
          timeframe={selectedDataset.timeframe}
          height={460}
        />
      )}

      {/* 2. D3 Interactive Simulation Timeline (Dual Pane, Holding Intervals, Drawdowns) */}
      {selectedDataset && (chartViewMode === 'both' || chartViewMode === 'timeline') && (
        <D3SimulationTimeline
          candles={selectedDataset.candles}
          trades={activeReport?.trades || []}
          equityCurve={
            activeReport?.equityCurve && activeReport.equityCurve.length > 0
              ? activeReport.equityCurve
              : selectedDataset.candles.map((c) => ({
                  time: c.time,
                  equity: 10000,
                  drawdownPct: 0,
                }))
          }
          symbol={selectedDataset.symbol}
          initialBalance={activeReport?.initialBalance || 10000}
          height={460}
        />
      )}

      {/* Quantitative Results Section */}
      {activeReport ? (
        <div className="space-y-6">
          {/* 10-Part Performance Metrics Cards */}
          {/* Performance Header with AI Doctor trigger */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Audited Performance Attribution
              </h3>
              <button
                type="button"
                onClick={handleConsultAiDoctor}
                disabled={isAdvising}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAdvising ? 'animate-spin' : ''}`} />
                {isAdvising ? 'Diagnosing with Gemini...' : 'AI Strategy Doctor & Suggestions'}
              </button>
            </div>

            {aiAdvice && (
              <div className="rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/20 via-[#0E1524] to-slate-900 p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      AI Quantitative Strategy Diagnosis
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">
                      Score: {aiAdvice.overallScore}/100
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {aiAdvice.performanceVerdict.replace(/_/g, ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAiAdvice(null)}
                      className="text-xs text-slate-500 hover:text-slate-300 ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{aiAdvice.executiveCritique}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* Parameter Tuning Suggestions */}
                  <div className="p-3.5 rounded bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                    <span className="font-semibold text-blue-400 uppercase text-[11px] block">
                      Parameter Tuning Suggestions
                    </span>
                    <div className="space-y-2">
                      {aiAdvice.parameterSuggestions?.map((p: any, i: number) => (
                        <div key={i} className="p-2 rounded bg-slate-950/60 border border-slate-800 space-y-1">
                          <div className="flex justify-between font-mono text-[11px]">
                            <span className="text-indigo-400">{p.parameter}</span>
                            <span className="text-slate-400">
                              {p.currentValue} → <strong className="text-emerald-400">{p.suggestedValue}</strong>
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">{p.rationale}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottlenecks & Regime Filters */}
                  <div className="p-3.5 rounded bg-slate-900/80 border border-slate-800 space-y-2 text-xs">
                    <span className="font-semibold text-amber-400 uppercase text-[11px] block">
                      Bottlenecks & Regime Gates
                    </span>
                    <ul className="space-y-1 text-slate-300 text-[11px]">
                      {aiAdvice.bottlenecks?.map((b: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-400">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                    {aiAdvice.regimeFilters?.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1">
                        <span className="font-semibold text-emerald-400 text-[11px] block">
                          Suggested Filter: {aiAdvice.regimeFilters[0].filterName}
                        </span>
                        <p className="text-[10px] text-slate-400">{aiAdvice.regimeFilters[0].description}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Net Profit</span>
                <div
                  className={`mt-1 text-base font-bold tabular-nums ${
                    activeReport.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {activeReport.netProfit >= 0 ? '+' : ''}${activeReport.netProfit.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {activeReport.netProfitPct >= 0 ? '+' : ''}
                  {activeReport.netProfitPct}%
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Profit Factor</span>
                <div className="mt-1 text-base font-bold text-white tabular-nums">
                  {activeReport.profitFactor.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Gross Win / Gross Loss</div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Max Drawdown</span>
                <div className="mt-1 text-base font-bold text-rose-400 tabular-nums">
                  ${activeReport.maxDrawdown.toFixed(2)}
                </div>
                <div className="text-[10px] text-rose-500 font-mono">
                  {activeReport.maxDrawdownPct.toFixed(2)}% peak-to-trough
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Win Rate</span>
                <div className="mt-1 text-base font-bold text-blue-400 tabular-nums">
                  {activeReport.winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500">
                  {activeReport.winningTrades}W / {activeReport.losingTrades}L ({activeReport.totalTrades})
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Sharpe Ratio</span>
                <div className="mt-1 text-base font-bold text-emerald-400 tabular-nums">
                  {activeReport.sharpeRatio.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Sortino: {activeReport.sortinoRatio.toFixed(2)}</div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <span className="text-[11px] font-sans text-slate-400">Expectancy</span>
                <div className="mt-1 text-base font-bold text-indigo-400 tabular-nums">
                  ${activeReport.expectancy.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Avg Trade: ${activeReport.avgTrade.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Friction Costs Breakdown & Holdout Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Friction Cost Deductions
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Spread Deductions:</span>
                  <div className="text-rose-400 font-bold">${activeReport.totalSpreadCost.toFixed(2)}</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Commission ($7/lot):</span>
                  <div className="text-rose-400 font-bold">${activeReport.totalCommission.toFixed(2)}</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Swap Financing:</span>
                  <div className="text-slate-200 font-bold">${activeReport.totalSwapCost.toFixed(2)}</div>
                </div>
                <div className="p-2 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Modeled Slippage:</span>
                  <div className="text-rose-400 font-bold">${activeReport.totalSlippageCost.toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                20% Holdout & Overfitting Analysis
              </h4>
              {activeReport.holdoutInfo && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Holdout Bars Reserved:</span>
                    <strong className="text-white">{activeReport.holdoutInfo.holdoutBarsCount} bars (20%)</strong>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">In-Sample Sharpe:</span>
                    <strong className="text-emerald-400">{activeReport.holdoutInfo.inSampleSharpe}</strong>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Out-of-Sample Sharpe:</span>
                    <strong className="text-blue-400">{activeReport.holdoutInfo.outOfSampleSharpe}</strong>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 mt-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-300">Overfitting Score:</span>
                      <span
                        className={`font-mono ${
                          activeReport.overfitting.score < 25
                            ? 'text-emerald-400'
                            : activeReport.overfitting.score <= 50
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {activeReport.overfitting.score} / 100 ({activeReport.overfitting.label})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {activeReport.overfitting.plainExplanation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trade Execution Ledger */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Executed Trades ({activeReport.trades.length})
            </h4>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                  <tr>
                    <th className="py-2">Ticket</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Open Price</th>
                    <th>Close Price</th>
                    <th>SL / TP Targets</th>
                    <th>R:R</th>
                    <th>Exit Reason</th>
                    <th>Pips</th>
                    <th>Net P&L ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeReport.trades.map((t) => {
                    const isWin = t.pnl >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-800/30">
                        <td className="py-2 text-slate-300 font-semibold">#{t.ticket}</td>
                        <td>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.side === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {t.side}
                          </span>
                        </td>
                        <td>{t.volume.toFixed(2)}</td>
                        <td>{t.openPrice}</td>
                        <td>{t.closePrice}</td>
                        <td>
                          <span className="text-rose-400">SL: {t.sl}</span> |{' '}
                          <span className="text-emerald-400">TP1: {t.tp || '-'}</span>
                          {t.tp2 && <span className="text-emerald-300"> | TP2: {t.tp2}</span>}
                          {t.tp3 && <span className="text-emerald-200"> | TP3: {t.tp3}</span>}
                        </td>
                        <td className="text-blue-400 font-bold">
                          {t.riskRewardRatio ? `1:${t.riskRewardRatio}` : '1:2.0'}
                        </td>
                        <td>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-sans">
                            {t.exitReason}
                          </span>
                        </td>
                        <td className={`font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnlPips ? `${t.pnlPips >= 0 ? '+' : ''}${t.pnlPips} p` : `${isWin ? '+' : ''}${(t.pnl / 10).toFixed(1)} p`}
                        </td>
                        <td
                          className={`font-bold tabular-nums ${
                            isWin ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isWin ? '+' : ''}
                          {t.pnl.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500 text-xs">
          Configure strategy settings above and click <strong>Run Simulation</strong> to compute 10-part metrics and render trade markers.
        </div>
      )}

      {/* Saved Reports Drawer */}
      {savedReports.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
            Saved Backtest Reports Archive ({savedReports.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedReports.map((r) => (
              <div
                key={r.id}
                className="rounded border border-slate-800 bg-slate-950 p-3 text-xs font-mono space-y-1.5 hover:border-slate-700"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <strong className="text-white font-sans block">{r.strategyName}</strong>
                    <span className="text-[10px] text-slate-400">
                      {r.symbol} {r.timeframe} · {r.provenance}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteReport(r.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Net Profit:</span>
                  <span
                    className={`font-bold ${
                      r.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {r.netProfit >= 0 ? '+' : ''}${r.netProfit.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Profit Factor:</span>
                  <span className="text-white font-bold">{r.profitFactor.toFixed(2)}</span>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveReport(r)}
                    className="w-full py-1 rounded text-[11px] font-sans font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors"
                  >
                    Load Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
