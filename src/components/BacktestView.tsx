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
  Code2,
  GitCompare,
  Table,
  CheckCircle2,
  Sliders,
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
  onNavigateToStrategyStudio?: (strategyId?: string) => void;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  datasets,
  strategies = BUILT_IN_STRATEGIES,
  activeReport,
  setActiveReport,
  savedReports,
  onSaveReport,
  onDeleteReport,
  onNavigateToStrategyStudio,
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
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Subtabs within Backtesting Lab
  const [subTab, setSubTab] = useState<'single' | 'batch' | 'comparison' | 'walkforward'>('single');

  // Batch runner state (N strategies x M symbols)
  const [batchStrategies, setBatchStrategies] = useState<string[]>(strategies.map((s) => s.id));
  const [batchDatasets, setBatchDatasets] = useState<string[]>(datasets.map((d) => d.id));
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<number>(0);
  const [batchResults, setBatchResults] = useState<BacktestReport[]>([]);

  // Side-by-Side comparison state
  const [compareReportAId, setCompareReportAId] = useState<string>('');
  const [compareReportBId, setCompareReportBId] = useState<string>('');

  // Handle Export Trades CSV
  const handleExportTradesCsv = () => {
    if (!activeReport || activeReport.trades.length === 0) return;
    const headers = 'Ticket,Time,Symbol,Side,Lots,OpenPrice,ClosePrice,PnL,Commission,Swap,SlippagePips,ExitReason\n';
    const rows = activeReport.trades
      .map(
        (t) =>
          `${t.ticket},${new Date(t.openTime * 1000).toISOString()},${t.symbol},${t.side},${t.volume},${t.openPrice},${t.closePrice},${t.pnl},${t.commission},${t.swap},${t.slippagePips},${t.exitReason}`
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trades_${activeReport.strategyName}_${activeReport.symbol}_${activeReport.timeframe}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Run Batch Matrix (N strategies x M datasets)
  const handleRunBatch = async () => {
    if (batchStrategies.length === 0 || batchDatasets.length === 0) return;
    setIsBatchRunning(true);
    setBatchProgress(0);
    const results: BacktestReport[] = [];
    const totalCombos = batchStrategies.length * batchDatasets.length;
    let completed = 0;

    for (const stratId of batchStrategies) {
      const strat = strategies.find((s) => s.id === stratId);
      if (!strat) continue;

      for (const dsId of batchDatasets) {
        const ds = datasets.find((d) => d.id === dsId);
        if (!ds || ds.candles.length === 0) continue;

        try {
          const report = runBacktest(strat, ds, {
            spreadPips,
            commissionPerLot: commission,
            slippagePips,
          });
          results.push(report);
        } catch (e) {
          console.error('Batch combo failed:', strat.name, ds.symbol, e);
        }

        completed++;
        setBatchProgress(Math.round((completed / totalCombos) * 100));
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
    setBatchResults(results);
    setIsBatchRunning(false);
  };

  // Walk-forward isolation state
  const [isWfRunning, setIsWfRunning] = useState<boolean>(false);
  const [wfResult, setWfResult] = useState<{
    isReport: BacktestReport;
    oosReport: BacktestReport;
    isCandleCount: number;
    oosCandleCount: number;
    sharpeDegradation: number;
    pfDegradation: number;
    returnDegradation: number;
    verdict: 'ROBUST GENERALIZATION' | 'MODERATE DECAY' | 'OVERFITTED';
  } | null>(null);

  const handleRunWalkForward = () => {
    if (!selectedDataset || selectedDataset.candles.length < 50) return;
    const strat = selectedStrategy;
    if (!strat) return;

    setIsWfRunning(true);
    try {
      const allCandles = selectedDataset.candles;
      const splitIdx = Math.floor(allCandles.length * 0.70);
      const isCandles = allCandles.slice(0, splitIdx);
      const oosCandles = allCandles.slice(splitIdx);

      const isDataset: DatasetRecord = {
        ...selectedDataset,
        id: `${selectedDataset.id}-is`,
        candles: isCandles,
      };
      const oosDataset: DatasetRecord = {
        ...selectedDataset,
        id: `${selectedDataset.id}-oos`,
        candles: oosCandles,
      };

      const isReport = runBacktest(strat, isDataset, { spreadPips, commissionPerLot: commission, slippagePips });
      const oosReport = runBacktest(strat, oosDataset, { spreadPips, commissionPerLot: commission, slippagePips });

      const isSharpe = isReport.sharpeRatio || 0;
      const oosSharpe = oosReport.sharpeRatio || 0;
      const sharpeDegradation = isSharpe !== 0 ? (oosSharpe / isSharpe) * 100 : 0;

      const isPf = isReport.profitFactor || 1;
      const oosPf = oosReport.profitFactor || 1;
      const pfDegradation = isPf !== 0 ? (oosPf / isPf) * 100 : 0;

      const isRet = isReport.netProfitPct || 0;
      const oosRet = oosReport.netProfitPct || 0;
      const returnDegradation = isRet !== 0 ? (oosRet / isRet) * 100 : 0;

      let verdict: 'ROBUST GENERALIZATION' | 'MODERATE DECAY' | 'OVERFITTED' = 'OVERFITTED';
      if (oosReport.netProfit > 0 && oosReport.profitFactor >= 1.2 && sharpeDegradation >= 60) {
        verdict = 'ROBUST GENERALIZATION';
      } else if (oosReport.netProfit > 0) {
        verdict = 'MODERATE DECAY';
      }

      setWfResult({
        isReport,
        oosReport,
        isCandleCount: isCandles.length,
        oosCandleCount: oosCandles.length,
        sharpeDegradation,
        pfDegradation,
        returnDegradation,
        verdict,
      });
    } catch (e) {
      console.error('Walk-forward failed:', e);
    } finally {
      setIsWfRunning(false);
    }
  };

  const handleSaveReportClick = () => {
    if (!activeReport) return;
    onSaveReport(activeReport);
    setSaveToast(`Report "${activeReport.strategyName} - ${activeReport.symbol}" saved to SQLite database.`);
    setTimeout(() => setSaveToast(null), 3500);
  };

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
                  onClick={handleSaveReportClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Save Report
                </button>
                <button
                  type="button"
                  onClick={handleExportTradesCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  title="Export completed trades to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  Export CSV
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

        {/* Subtabs Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('single')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                subTab === 'single'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Single Backtest & Charts
            </button>
            <button
              type="button"
              onClick={() => setSubTab('batch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                subTab === 'batch'
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Batch Suite ({strategies.length} Strats × {datasets.length} Sets)
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab('comparison');
                if (!compareReportAId && activeReport) setCompareReportAId(activeReport.id);
                if (!compareReportBId && savedReports.length > 0) setCompareReportBId(savedReports[0].id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                subTab === 'comparison'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Side-by-Side Comparison
            </button>
            <button
              type="button"
              onClick={() => setSubTab('walkforward')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                subTab === 'walkforward'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Walk-Forward Isolation
            </button>
          </div>

          <span className="text-[11px] font-mono text-slate-500">
            Intrabar Tick & Bar Resolution
          </span>
        </div>

        {saveToast && (
          <div className="mt-3 px-3 py-2 rounded bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in duration-200">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              {saveToast}
            </span>
            <button
              type="button"
              onClick={() => setSaveToast(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-bold ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Single Backtest Tab Parameters */}
        {subTab === 'single' && (
          <div>
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-400 text-[11px] font-sans">
                Strategy Algorithm
              </label>
              {onNavigateToStrategyStudio && (
                <button
                  type="button"
                  onClick={() => onNavigateToStrategyStudio(selectedStrategyId)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-sans cursor-pointer hover:underline"
                  title="Edit strategy code and parameters in Strategy Studio"
                >
                  <Code2 className="w-3 h-3" />
                  Edit in Studio
                </button>
              )}
            </div>
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
        )}
      </div>

      {subTab === 'single' && (
        <>
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

          {/* Promotion Gate Evaluation Checklist */}
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Strategy Promotion Gate Checklist (Live & Demo Criteria)
                </h4>
                {(() => {
                  const passTrades = activeReport.totalTrades >= 30;
                  const passPf = activeReport.profitFactor >= 1.25;
                  const passDd = activeReport.maxDrawdownPct <= 15;
                  const passSharpe = activeReport.sharpeRatio >= 1.0;
                  const passOos = (activeReport.holdoutInfo?.outOfSampleSharpe ?? 1) > 0;
                  const allPass = passTrades && passPf && passDd && passSharpe && passOos;
                  return (
                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${
                        allPass
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      }`}
                    >
                      {allPass ? 'GATE PASSED: ELIGIBLE FOR PAPER / DEMO' : 'UNVERIFIED: DOES NOT MEET GATES'}
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">Min Trades (&ge;30)</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {activeReport.totalTrades >= 30 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-white font-bold">{activeReport.totalTrades} Trades</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">Profit Factor (&ge;1.25)</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {activeReport.profitFactor >= 1.25 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-white font-bold">{activeReport.profitFactor.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">Max DD (&le;15%)</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {activeReport.maxDrawdownPct <= 15 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="text-white font-bold">{activeReport.maxDrawdownPct.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">Sharpe Ratio (&ge;1.0)</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {activeReport.sharpeRatio >= 1.0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-white font-bold">{activeReport.sharpeRatio.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-slate-400 block text-[10px] font-sans">OOS Sharpe (&gt;0)</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    {(activeReport.holdoutInfo?.outOfSampleSharpe ?? 1) > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="text-white font-bold">
                      {activeReport.holdoutInfo?.outOfSampleSharpe ?? 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Underwater Drawdown Curve */}
            {activeReport.equityCurve && activeReport.equityCurve.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">
                    Underwater Drawdown Profile (% Depth from Highest Equity Highwater Mark)
                  </h4>
                  <span className="text-xs font-mono text-rose-400 font-bold">
                    Max Depth: -{activeReport.maxDrawdownPct.toFixed(2)}%
                  </span>
                </div>
                <div className="h-28 w-full">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 50">
                    <defs>
                      <linearGradient id="underwaterGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="2" x2="100" y2="2" stroke="#475569" strokeDasharray="2,2" strokeWidth="0.5" />
                    <path
                      d={`M 0,2 ${activeReport.equityCurve
                        .map((pt, i) => {
                          const x = (i / (activeReport.equityCurve.length - 1)) * 100;
                          const maxDd = Math.max(activeReport.maxDrawdownPct, 5);
                          const y = 2 + (pt.drawdownPct / maxDd) * 45;
                          return `L ${x.toFixed(2)},${y.toFixed(2)}`;
                        })
                        .join(' ')} L 100,2 Z`}
                      fill="url(#underwaterGrad)"
                    />
                    <path
                      d={`M 0,2 ${activeReport.equityCurve
                        .map((pt, i) => {
                          const x = (i / (activeReport.equityCurve.length - 1)) * 100;
                          const maxDd = Math.max(activeReport.maxDrawdownPct, 5);
                          const y = 2 + (pt.drawdownPct / maxDd) * 45;
                          return `L ${x.toFixed(2)},${y.toFixed(2)}`;
                        })
                        .join(' ')}`}
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1"
                    />
                  </svg>
                </div>
              </div>
            )}

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
    </>
  )}

      {/* 2. Batch Test Suite Tab */}
      {subTab === 'batch' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Table className="w-4 h-4 text-indigo-400" />
                  Cross-Asset & Strategy Matrix Runner (N × M)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Execute multiple algorithmic strategies across all stored SQLite historical datasets concurrently.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunBatch}
                disabled={isBatchRunning || batchStrategies.length === 0 || batchDatasets.length === 0}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Play className={`w-4 h-4 fill-white ${isBatchRunning ? 'animate-spin' : ''}`} />
                {isBatchRunning ? `Running Matrix (${batchProgress}%)...` : `Run Matrix (${batchStrategies.length * batchDatasets.length} Tests)`}
              </button>
            </div>

            {/* Matrix Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Strategies Select */}
              <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Select Strategies ({batchStrategies.length}/{strategies.length})</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchStrategies(strategies.map((s) => s.id))}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchStrategies([])}
                      className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {strategies.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchStrategies.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setBatchStrategies((prev) => [...prev, s.id]);
                          else setBatchStrategies((prev) => prev.filter((id) => id !== s.id));
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                      />
                      <span className="font-mono text-[11px] truncate">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Datasets Select */}
              <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Select Stored Datasets ({batchDatasets.length}/{datasets.length})</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBatchDatasets(datasets.map((d) => d.id))}
                      className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchDatasets([])}
                      className="text-[10px] text-slate-500 hover:underline cursor-pointer"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {datasets.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-xs text-slate-300 hover:text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={batchDatasets.includes(d.id)}
                        onChange={(e) => {
                          if (e.target.checked) setBatchDatasets((prev) => [...prev, d.id]);
                          else setBatchDatasets((prev) => prev.filter((id) => id !== d.id));
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600"
                      />
                      <span className="font-mono text-[11px] truncate">
                        {d.symbol} {d.timeframe} ({d.candles.length} bars)
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {isBatchRunning && (
              <div className="space-y-1 pt-2">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>Batch Simulation Progress</span>
                  <span>{batchProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-200"
                    style={{ width: `${batchProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Batch Results Leaderboard */}
          {batchResults.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Batch Execution Leaderboard ({batchResults.length} Runs Ranked by Sharpe Ratio)
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/90 border-b border-slate-800 text-slate-400 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="px-3">Strategy</th>
                      <th className="px-3">Asset</th>
                      <th className="px-3">TF</th>
                      <th className="px-3">Trades</th>
                      <th className="px-3">Win Rate</th>
                      <th className="px-3">Profit Factor</th>
                      <th className="px-3">Net Profit</th>
                      <th className="px-3">Max DD</th>
                      <th className="px-3">Sharpe</th>
                      <th className="px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {batchResults.map((r, idx) => {
                      const isWin = r.netProfit >= 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-bold text-indigo-400">#{idx + 1}</td>
                          <td className="px-3 text-white font-sans font-semibold">{r.strategyName}</td>
                          <td className="px-3 text-slate-300">{r.symbol}</td>
                          <td className="px-3 text-slate-400">{r.timeframe}</td>
                          <td className="px-3">{r.totalTrades}</td>
                          <td className="px-3">{r.winRate.toFixed(1)}%</td>
                          <td className="px-3 font-bold">{r.profitFactor.toFixed(2)}</td>
                          <td className={`px-3 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}${r.netProfit.toFixed(2)}
                          </td>
                          <td className="px-3 text-rose-400">{r.maxDrawdownPct.toFixed(1)}%</td>
                          <td className="px-3 font-bold text-blue-400">{r.sharpeRatio.toFixed(2)}</td>
                          <td className="px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReport(r);
                                setSubTab('single');
                              }}
                              className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white font-sans text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Load in Lab
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Side-by-Side Comparison Tab */}
      {subTab === 'comparison' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-indigo-400" />
              Side-by-Side Strategy Run Comparison
            </h3>
            <p className="text-xs text-slate-400">
              Benchmark two backtest simulations directly against one another with automated differential scoring.
            </p>

            {/* Run Selection Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-indigo-400 block uppercase tracking-wider">
                  Run A (Benchmark Candidate)
                </label>
                <select
                  value={compareReportAId}
                  onChange={(e) => setCompareReportAId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono"
                >
                  <option value="">-- Select Run A --</option>
                  {activeReport && <option value={activeReport.id}>[Active] {activeReport.strategyName} ({activeReport.symbol} {activeReport.timeframe})</option>}
                  {savedReports.map((r) => (
                    <option key={`a-${r.id}`} value={r.id}>
                      {r.strategyName} - {r.symbol} {r.timeframe} (Sharpe {r.sharpeRatio.toFixed(2)})
                    </option>
                  ))}
                  {batchResults.map((r, i) => (
                    <option key={`batch-a-${i}`} value={r.id}>
                      [Batch #{i + 1}] {r.strategyName} - {r.symbol} (PF {r.profitFactor.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-emerald-400 block uppercase tracking-wider">
                  Run B (Challenger Candidate)
                </label>
                <select
                  value={compareReportBId}
                  onChange={(e) => setCompareReportBId(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-800 text-slate-200 text-xs font-mono"
                >
                  <option value="">-- Select Run B --</option>
                  {activeReport && <option value={activeReport.id}>[Active] {activeReport.strategyName} ({activeReport.symbol} {activeReport.timeframe})</option>}
                  {savedReports.map((r) => (
                    <option key={`b-${r.id}`} value={r.id}>
                      {r.strategyName} - {r.symbol} {r.timeframe} (Sharpe {r.sharpeRatio.toFixed(2)})
                    </option>
                  ))}
                  {batchResults.map((r, i) => (
                    <option key={`batch-b-${i}`} value={r.id}>
                      [Batch #{i + 1}] {r.strategyName} - {r.symbol} (PF {r.profitFactor.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Comparison Matrix Table */}
          {(() => {
            const allAvailable = [
              ...(activeReport ? [activeReport] : []),
              ...savedReports,
              ...batchResults,
            ];
            const reportA = allAvailable.find((r) => r.id === compareReportAId);
            const reportB = allAvailable.find((r) => r.id === compareReportBId);

            if (!reportA || !reportB) {
              return (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500 text-xs">
                  Select both Run A and Run B above to render the side-by-side comparative matrix.
                </div>
              );
            }

            const metrics = [
              { label: 'Strategy Name', a: reportA.strategyName, b: reportB.strategyName, higherIsBetter: null },
              { label: 'Symbol & Timeframe', a: `${reportA.symbol} ${reportA.timeframe}`, b: `${reportB.symbol} ${reportB.timeframe}`, higherIsBetter: null },
              { label: 'Net Profit ($)', a: reportA.netProfit, b: reportB.netProfit, format: (v: number) => `$${v.toFixed(2)}`, higherIsBetter: true },
              { label: 'Return (%)', a: reportA.netProfitPct, b: reportB.netProfitPct, format: (v: number) => `${v.toFixed(2)}%`, higherIsBetter: true },
              { label: 'Profit Factor', a: reportA.profitFactor, b: reportB.profitFactor, format: (v: number) => v.toFixed(2), higherIsBetter: true },
              { label: 'Sharpe Ratio', a: reportA.sharpeRatio, b: reportB.sharpeRatio, format: (v: number) => v.toFixed(2), higherIsBetter: true },
              { label: 'Max Drawdown (%)', a: reportA.maxDrawdownPct, b: reportB.maxDrawdownPct, format: (v: number) => `${v.toFixed(2)}%`, higherIsBetter: false },
              { label: 'Win Rate (%)', a: reportA.winRate, b: reportB.winRate, format: (v: number) => `${v.toFixed(1)}%`, higherIsBetter: true },
              { label: 'Total Trades', a: reportA.totalTrades, b: reportB.totalTrades, format: (v: number) => v.toString(), higherIsBetter: null },
              { label: 'Expectancy ($)', a: reportA.expectancy, b: reportB.expectancy, format: (v: number) => `$${v.toFixed(2)}`, higherIsBetter: true },
              { label: 'Avg Trade PnL ($)', a: reportA.avgTrade, b: reportB.avgTrade, format: (v: number) => `$${v.toFixed(2)}`, higherIsBetter: true },
            ];

            return (
              <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-3 px-4 font-sans font-semibold">Evaluation Metric</th>
                        <th className="px-4 text-indigo-400 font-bold">Run A: {reportA.strategyName}</th>
                        <th className="px-4 text-emerald-400 font-bold">Run B: {reportB.strategyName}</th>
                        <th className="px-4 text-right font-sans">Attribution Advantage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {metrics.map((m, i) => {
                        let advantage = '-';
                        let winA = false;
                        let winB = false;

                        if (m.higherIsBetter !== null && typeof m.a === 'number' && typeof m.b === 'number') {
                          if (m.higherIsBetter) {
                            if (m.a > m.b) { advantage = 'Run A Ahead'; winA = true; }
                            else if (m.b > m.a) { advantage = 'Run B Ahead'; winB = true; }
                            else { advantage = 'Tied'; }
                          } else {
                            if (m.a < m.b) { advantage = 'Run A Lower Risk'; winA = true; }
                            else if (m.b < m.a) { advantage = 'Run B Lower Risk'; winB = true; }
                            else { advantage = 'Tied'; }
                          }
                        }

                        return (
                          <tr key={i} className="hover:bg-slate-800/20">
                            <td className="py-2.5 px-4 font-sans font-semibold text-slate-300">{m.label}</td>
                            <td className={`px-4 ${winA ? 'text-emerald-400 font-bold' : 'text-slate-300'}`}>
                              {m.format ? m.format(m.a as number) : m.a}
                              {winA && <span className="ml-1.5 text-[10px] text-emerald-400">★</span>}
                            </td>
                            <td className={`px-4 ${winB ? 'text-emerald-400 font-bold' : 'text-slate-300'}`}>
                              {m.format ? m.format(m.b as number) : m.b}
                              {winB && <span className="ml-1.5 text-[10px] text-emerald-400">★</span>}
                            </td>
                            <td className="px-4 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                                  winA
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : winB
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'text-slate-500'
                                }`}
                              >
                                {advantage}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 4. Walk-Forward Isolation Tab */}
      {subTab === 'walkforward' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Walk-Forward Out-of-Sample (OOS) Generalization Tester
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Protects against curve-fitting and data snooping by dividing the dataset into 70% In-Sample (Optimization) and 30% Out-of-Sample (Blind Forward Test).
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunWalkForward}
                disabled={isWfRunning || !selectedDataset}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                <Play className={`w-4 h-4 fill-white ${isWfRunning ? 'animate-spin' : ''}`} />
                {isWfRunning ? 'Running Walk-Forward...' : 'Execute Walk-Forward Isolation'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-semibold block">Target Strategy:</span>
                <span className="text-white font-mono">{selectedStrategy?.name || 'None'}</span>
              </div>
              <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-semibold block">Target Dataset:</span>
                <span className="text-white font-mono">
                  {selectedDataset ? `${selectedDataset.symbol} ${selectedDataset.timeframe} (${selectedDataset.candles.length} bars)` : 'None'}
                </span>
              </div>
            </div>
          </div>

          {wfResult && (
            <div className="space-y-6">
              {/* Verdict Banner */}
              <div
                className={`rounded-lg border p-5 shadow-xl flex items-center justify-between ${
                  wfResult.verdict === 'ROBUST GENERALIZATION'
                    ? 'border-emerald-500/40 bg-emerald-950/20'
                    : wfResult.verdict === 'MODERATE DECAY'
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : 'border-rose-500/40 bg-rose-950/20'
                }`}
              >
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                    Walk-Forward Robustness Verdict
                  </span>
                  <h4
                    className={`text-lg font-black tracking-wide ${
                      wfResult.verdict === 'ROBUST GENERALIZATION'
                        ? 'text-emerald-400'
                        : wfResult.verdict === 'MODERATE DECAY'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {wfResult.verdict}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    {wfResult.verdict === 'ROBUST GENERALIZATION'
                      ? 'The strategy maintains over 60% of its Sharpe ratio and stays profitable on completely unseen forward bars.'
                      : wfResult.verdict === 'MODERATE DECAY'
                      ? 'The strategy stays net positive in out-of-sample forward testing, but performance exhibits notable variance.'
                      : 'Severe performance degradation in out-of-sample data. Strategy parameters are likely overfitted to in-sample noise.'}
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-xs text-slate-400 block">Sharpe Retention</span>
                  <span className="text-xl font-black text-white">{wfResult.sharpeDegradation.toFixed(1)}%</span>
                </div>
              </div>

              {/* IS vs OOS Metrics Table */}
              <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Partition Breakdown (70% In-Sample vs 30% Out-of-Sample)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2.5 px-3">Window</th>
                        <th className="px-3">Bars</th>
                        <th className="px-3">Trades</th>
                        <th className="px-3">Win Rate</th>
                        <th className="px-3">Profit Factor</th>
                        <th className="px-3">Net Profit</th>
                        <th className="px-3">Max DD</th>
                        <th className="px-3">Sharpe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      <tr className="hover:bg-slate-800/20">
                        <td className="py-2.5 px-3 font-bold text-blue-400">In-Sample (70%)</td>
                        <td className="px-3">{wfResult.isCandleCount}</td>
                        <td className="px-3">{wfResult.isReport.totalTrades}</td>
                        <td className="px-3">{wfResult.isReport.winRate.toFixed(1)}%</td>
                        <td className="px-3 font-bold">{wfResult.isReport.profitFactor.toFixed(2)}</td>
                        <td className={`px-3 font-bold ${wfResult.isReport.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${wfResult.isReport.netProfit.toFixed(2)}
                        </td>
                        <td className="px-3 text-rose-400">{wfResult.isReport.maxDrawdownPct.toFixed(1)}%</td>
                        <td className="px-3 font-bold text-blue-400">{wfResult.isReport.sharpeRatio.toFixed(2)}</td>
                      </tr>
                      <tr className="hover:bg-slate-800/20">
                        <td className="py-2.5 px-3 font-bold text-emerald-400">Out-of-Sample (30%)</td>
                        <td className="px-3">{wfResult.oosCandleCount}</td>
                        <td className="px-3">{wfResult.oosReport.totalTrades}</td>
                        <td className="px-3">{wfResult.oosReport.winRate.toFixed(1)}%</td>
                        <td className="px-3 font-bold">{wfResult.oosReport.profitFactor.toFixed(2)}</td>
                        <td className={`px-3 font-bold ${wfResult.oosReport.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ${wfResult.oosReport.netProfit.toFixed(2)}
                        </td>
                        <td className="px-3 text-rose-400">{wfResult.oosReport.maxDrawdownPct.toFixed(1)}%</td>
                        <td className="px-3 font-bold text-blue-400">{wfResult.oosReport.sharpeRatio.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
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

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveReport(r)}
                    className="flex-1 py-1 rounded text-[11px] font-sans font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 transition-colors"
                  >
                    Load Report
                  </button>
                  {onNavigateToStrategyStudio && (
                    <button
                      type="button"
                      onClick={() => onNavigateToStrategyStudio(r.strategyId)}
                      className="px-2.5 py-1 rounded text-[11px] font-sans font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1 transition-colors"
                      title="Edit this strategy in Strategy Studio"
                    >
                      <Code2 className="w-3 h-3 text-blue-400" />
                      Edit Strategy
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
