import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  CheckCircle,
  Database,
  Download,
  FileCheck,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  Upload,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { Candle, DatasetRecord, ForexSymbol, Timeframe } from '../types/forex';

interface DataManagerViewProps {
  onSelectDatasetForBacktest?: (dataset: DatasetRecord) => void;
}

export const DataManagerView: React.FC<DataManagerViewProps> = ({
  onSelectDatasetForBacktest,
}) => {
  const [catalog, setCatalog] = useState<Omit<DatasetRecord, 'candles'>[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [loadedCandles, setLoadedCandles] = useState<Candle[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);

  // Fetch from MT5 Bridge Modal State
  const [isFetchModalOpen, setIsFetchModalOpen] = useState<boolean>(false);
  const [fetchSymbol, setFetchSymbol] = useState<ForexSymbol>('EURUSD');
  const [fetchTimeframe, setFetchTimeframe] = useState<Timeframe>('H1');
  const [fetchCount, setFetchCount] = useState<number>(500);
  const [isFetchingFromBridge, setIsFetchingFromBridge] = useState<boolean>(false);
  const [fetchStatusMessage, setFetchStatusMessage] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // CSV Import Modal State
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [importCsvText, setImportCsvText] = useState<string>('');
  const [importSymbol, setImportSymbol] = useState<ForexSymbol>('EURUSD');
  const [importTimeframe, setImportTimeframe] = useState<Timeframe>('H1');
  const [importUtcOffset, setImportUtcOffset] = useState<number>(0);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Autofix logs
  const [autofixLogs, setAutofixLogs] = useState<string[]>([]);

  // View mode switcher: Catalog Datasets vs Complete SQLite Historical Vault
  const [activeTabMode, setActiveTabMode] = useState<'catalog' | 'vault'>('catalog');
  const [storageSummary, setStorageSummary] = useState<{
    totalCandles: number;
    datasets: Array<{
      symbol: string;
      timeframe: string;
      candleCount: number;
      minTime: number;
      maxTime: number;
      minDateIso: string;
      maxDateIso: string;
    }>;
    persisted: boolean;
    message: string;
  } | null>(null);

  // Vault Browser State
  const [vaultSymbol, setVaultSymbol] = useState<string>('ALL');
  const [vaultTimeframe, setVaultTimeframe] = useState<string>('ALL');
  const [vaultPage, setVaultPage] = useState<number>(1);
  const [vaultPageSize, setVaultPageSize] = useState<number>(50);
  const [vaultCandles, setVaultCandles] = useState<Candle[]>([]);
  const [vaultTotal, setVaultTotal] = useState<number>(0);
  const [vaultTotalPages, setVaultTotalPages] = useState<number>(1);
  const [isLoadingVault, setIsLoadingVault] = useState<boolean>(false);

  // Catalog Table Pagination
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [catalogPageSize, setCatalogPageSize] = useState<number>(50);

  // AI Data Review state
  const [aiReview, setAiReview] = useState<any | null>(null);
  const [isAiReviewing, setIsAiReviewing] = useState<boolean>(false);
  const [isSeedingData, setIsSeedingData] = useState<boolean>(false);

  const handleSeedHistorical = async () => {
    setIsSeedingData(true);
    try {
      const res = await fetch('/api/data/seed-historical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setFetchStatusMessage({
          success: true,
          message: data.message || `Seeded ${data.totalCandles} historical candles across all 4 symbols into SQLite.`,
        });
        await loadCatalogFromBackend();
      }
    } catch (err: any) {
      setFetchStatusMessage({
        success: false,
        message: `Failed to seed data: ${err.message}`,
      });
    } finally {
      setIsSeedingData(false);
    }
  };

  const handleRunAiAudit = async () => {
    const active = catalog.find((c) => c.id === selectedDatasetId);
    if (!active) return;
    setIsAiReviewing(true);
    try {
      const res = await fetch('/api/ai/review-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: active.symbol,
          timeframe: active.timeframe,
          candleCount: active.candleCount,
          qualityScore: active.qualityScore,
          gapCount: active.gapCount,
          isResearchEligible: active.isResearchEligible,
          anomalies: active.gapCount > 0 ? [`${active.gapCount} data gaps identified`] : [],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiReview(data);
      }
    } catch (e) {
      console.error('Failed AI audit:', e);
    } finally {
      setIsAiReviewing(false);
    }
  };

  // Load catalog and permanent storage summary from SQLite database
  const loadStorageSummary = async () => {
    try {
      const res = await fetch('/api/data/storage-summary');
      if (res.ok) {
        const data = await res.json();
        setStorageSummary(data);
      }
    } catch {}
  };

  const loadVaultData = async (
    page = vaultPage,
    sym = vaultSymbol,
    tf = vaultTimeframe,
    size = vaultPageSize
  ) => {
    setIsLoadingVault(true);
    try {
      let url = `/api/data/browse?page=${page}&pageSize=${size}`;
      if (sym !== 'ALL') url += `&symbol=${sym}`;
      if (tf !== 'ALL') url += `&timeframe=${tf}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVaultCandles(data.candles || []);
        setVaultTotal(data.total || 0);
        setVaultTotalPages(data.totalPages || 1);
        setVaultPage(data.page || 1);
      }
    } catch (e) {
      console.error('Failed to browse vault candles:', e);
    } finally {
      setIsLoadingVault(false);
    }
  };

  const loadCatalogFromBackend = async () => {
    try {
      const res = await fetch('/api/data/catalog');
      if (res.ok) {
        const data = await res.json();
        const records = data.catalog || [];
        setCatalog(records);
        if (records.length > 0 && !selectedDatasetId) {
          setSelectedDatasetId(records[0].id);
        }
      }
      loadStorageSummary();
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  };

  useEffect(() => {
    loadCatalogFromBackend();
    loadStorageSummary();
    loadVaultData(1, 'ALL', 'ALL', 50);
  }, []);

  // When selected dataset changes, load candles from SQLite
  useEffect(() => {
    if (!selectedDatasetId) {
      setLoadedCandles([]);
      return;
    }

    const ds = catalog.find((c) => c.id === selectedDatasetId);
    if (!ds) return;

    setIsLoadingCandles(true);
    fetch(`/api/data/load?symbol=${ds.symbol}&timeframe=${ds.timeframe}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.candles) {
          setLoadedCandles(data.candles);
        } else {
          setLoadedCandles([]);
        }
      })
      .catch((err) => {
        console.error('Failed to load candles from SQLite:', err);
        setLoadedCandles([]);
      })
      .finally(() => {
        setIsLoadingCandles(false);
      });
  }, [selectedDatasetId, catalog]);

  // Handle dynamic bulk fetch from MT5 Bridge
  const handleExecuteBridgeFetch = async () => {
    setIsFetchingFromBridge(true);
    setFetchStatusMessage(null);

    try {
      const res = await fetch('/api/data/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: fetchSymbol,
          timeframe: fetchTimeframe,
          count: fetchCount,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setFetchStatusMessage({
          success: true,
          message: `Successfully downloaded and saved ${data.importedCount} genuine candles for ${data.symbol} ${data.timeframe} into SQLite!`,
        });
        await loadCatalogFromBackend();
        setSelectedDatasetId(
          `ds-${fetchSymbol.toLowerCase()}-${fetchTimeframe.toLowerCase()}-bridge`
        );
      } else {
        setFetchStatusMessage({
          success: false,
          message:
            data.message ||
            'Failed to fetch from MT5 bridge. Ensure Exness MT5 and uvicorn bridge are active.',
        });
      }
    } catch (err: any) {
      setFetchStatusMessage({
        success: false,
        message:
          'Bridge unreachable: Could not contact backend or MT5 bridge on 127.0.0.1:8001.',
      });
    } finally {
      setIsFetchingFromBridge(false);
    }
  };

  // Handle CSV Import
  const handleCommitImport = async () => {
    if (!importCsvText.trim()) return;

    try {
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'x-import-options': JSON.stringify({
            symbol: importSymbol,
            timeframe: importTimeframe,
            utcOffsetHours: importUtcOffset,
          }),
        },
        body: importCsvText,
      });

      const data = await res.json();
      if (res.ok) {
        setImportFeedback(
          `Imported ${data.imported} candles. Quality score: ${data.qualityScore}%.`
        );
        await loadCatalogFromBackend();
        setTimeout(() => {
          setIsImportOpen(false);
          setImportCsvText('');
          setImportFeedback(null);
        }, 1500);
      } else {
        setImportFeedback(`Import error: ${data.error || 'Failed'}`);
      }
    } catch (err: any) {
      setImportFeedback(`Failed to import CSV: ${err.message}`);
    }
  };

  // Handle Run Autofix
  const handleRunAutofix = async () => {
    const active = catalog.find((c) => c.id === selectedDatasetId);
    if (!active) return;

    try {
      const res = await fetch('/api/data/autofix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: active.symbol,
          timeframe: active.timeframe,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAutofixLogs(data.log?.map((l: any) => `${l.timeIso}: ${l.details}`) || []);
        await loadCatalogFromBackend();
      }
    } catch (err) {
      console.error('Autofix error:', err);
    }
  };

  // Handle Export CSV
  const handleExportCsv = () => {
    const active = catalog.find((c) => c.id === selectedDatasetId);
    if (!active) return;
    window.location.href = `/api/data/export?symbol=${active.symbol}&timeframe=${active.timeframe}`;
  };

  const activeDs = catalog.find((c) => c.id === selectedDatasetId);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Historical Market Data Catalog (SQLite Local Source of Truth)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict 3-tier provenance tracking (<code className="text-emerald-400">MT5 BRIDGE</code>, <code className="text-blue-400">USER CSV</code>, <code className="text-amber-400">SIMULATED</code>) across all 8 broker timeframes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFetchModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
            >
              <Server className="w-3.5 h-3.5" />
              Fetch from MT5 Bridge
            </button>
            <button
              type="button"
              onClick={handleSeedHistorical}
              disabled={isSeedingData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Database className={`w-3.5 h-3.5 ${isSeedingData ? 'animate-spin' : ''}`} />
              {isSeedingData ? 'Seeding...' : 'Seed 6-Month Historical Data'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Custom CSV
            </button>
            {activeDs && (
              <>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={handleRunAutofix}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-all cursor-pointer"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Run Integrity Autofix
                </button>
                <button
                  type="button"
                  onClick={handleRunAiAudit}
                  disabled={isAiReviewing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiReviewing ? 'animate-spin' : ''}`} />
                  {isAiReviewing ? 'Auditing...' : 'AI Data Quality Review'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation Switcher: Catalog vs Complete Stored Historical Vault */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTabMode('catalog')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTabMode === 'catalog'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Catalog Datasets ({catalog.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTabMode('vault');
                loadVaultData(1, vaultSymbol, vaultTimeframe, vaultPageSize);
                loadStorageSummary();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTabMode === 'vault'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              Complete Stored Historical Vault ({storageSummary?.totalCandles?.toLocaleString() || '...'} Total Bars)
            </button>
          </div>

          <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            SQLite Storage: 100% Permanent & Append-Only (Zero Deletions)
          </div>
        </div>

        {/* Catalog List / Tabs */}
        {catalog.length === 0 ? (
          <div className="mt-6 py-10 text-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 p-6">
            <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-slate-300">Catalog is Currently Empty</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              No historical datasets are stored in SQLite yet. Click <strong>"Fetch from MT5 Bridge"</strong> to dynamically download genuine broker candles from Exness MT5, or <strong>"Import Custom CSV"</strong> to load your own data.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {catalog.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDatasetId(d.id)}
                className={`px-3 py-2 rounded-lg border text-xs font-mono whitespace-nowrap text-left transition-all ${
                  selectedDatasetId === d.id
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                    : 'border-slate-800 bg-slate-950 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{d.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    {d.timeframe}
                  </span>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                      d.provenance === 'MT5 BRIDGE'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : d.provenance === 'USER CSV'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {d.provenance}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {d.candleCount} bars · Score: {d.qualityScore}%
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dataset Details & Stored OHLC Inspection */}
      {activeDs && (
        <>
          {aiReview && (
            <div className="rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-950/20 via-[#0E1524] to-slate-900 p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    AI Data Health Audit & Research Appraisal
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Score: {aiReview.healthScore}%</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      aiReview.verdict === 'PRODUCTION_READY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {aiReview.verdict.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAiReview(null)}
                    className="text-xs text-slate-500 hover:text-slate-300 ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{aiReview.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="font-semibold text-indigo-400">Weekend & Gap Analysis:</span>
                  <p className="text-slate-300 text-[11px]">{aiReview.gapAnalysis}</p>
                </div>
                <div className="p-3 rounded bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="font-semibold text-emerald-400">Slippage & Spread Considerations:</span>
                  <p className="text-slate-300 text-[11px]">{aiReview.slippageSpreadRisks}</p>
                </div>
              </div>

              {aiReview.cleaningRecommendations?.length > 0 && (
                <div className="pt-1 text-xs">
                  <span className="font-semibold text-slate-400 block mb-1">AI Cleaning Suggestions:</span>
                  <ul className="space-y-1">
                    {aiReview.cleaningRecommendations.map((r: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 text-slate-300 text-[11px]">
                        <span className="text-indigo-400">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Metadata Card */}
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl space-y-3 font-mono text-xs">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">
              Dataset Provenance & Verification
            </h3>

            <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Symbol & Timeframe:</span>
                <strong className="text-white">
                  {activeDs.symbol} {activeDs.timeframe}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Provenance Tier:</span>
                <strong
                  className={
                    activeDs.provenance === 'MT5 BRIDGE'
                      ? 'text-emerald-400'
                      : 'text-blue-400'
                  }
                >
                  {activeDs.provenance}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Research Eligibility:</span>
                <strong
                  className={
                    activeDs.isResearchEligible ? 'text-emerald-400' : 'text-rose-400'
                  }
                >
                  {activeDs.isResearchEligible ? 'RESEARCH READY' : 'BLOCKED'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Candle Count:</span>
                <strong className="text-white">{activeDs.candleCount}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Broker Server:</span>
                <strong className="text-slate-300">
                  {activeDs.brokerServer || 'Local Import'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Quality Score:</span>
                <strong className="text-emerald-400">{activeDs.qualityScore}%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Gaps Detected:</span>
                <strong className="text-slate-300">{activeDs.gapCount}</strong>
              </div>
              <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 break-all">
                SHA-256: {activeDs.sha256}
              </div>
            </div>

            {/* Autofix Logs */}
            {autofixLogs.length > 0 && (
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1 text-[11px]">
                <strong className="text-amber-400 block font-sans">
                  Autofix Actions Executed:
                </strong>
                {autofixLogs.map((log, i) => (
                  <div key={i} className="text-slate-400">• {log}</div>
                ))}
              </div>
            )}
          </div>

          {/* Stored OHLC Table */}
          <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between pb-2 border-b border-slate-800 gap-2">
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">
                  Stored OHLC Market Bars ({loadedCandles.length} Bars in Dataset)
                </h3>
                <span className="text-[10px] text-emerald-400 font-mono">
                  Showing {loadedCandles.length > 0 ? (catalogPage - 1) * catalogPageSize + 1 : 0} – {Math.min(catalogPage * catalogPageSize, loadedCandles.length)} of {loadedCandles.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={catalogPageSize}
                  onChange={(e) => {
                    setCatalogPageSize(Number(e.target.value));
                    setCatalogPage(1);
                  }}
                  className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300"
                >
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={250}>250 / page</option>
                  <option value={1000}>1000 / page</option>
                </select>
                <div className="flex items-center gap-1 font-mono text-xs">
                  <button
                    type="button"
                    disabled={catalogPage <= 1}
                    onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Prev
                  </button>
                  <span className="px-1.5 text-slate-400 text-[11px]">
                    {catalogPage} / {Math.max(1, Math.ceil(loadedCandles.length / catalogPageSize))}
                  </span>
                  <button
                    type="button"
                    disabled={catalogPage >= Math.ceil(loadedCandles.length / catalogPageSize)}
                    onClick={() => setCatalogPage((p) => p + 1)}
                    className="px-2 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {isLoadingCandles ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                Loading candles from SQLite database...
              </div>
            ) : loadedCandles.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-xs">
                No candle records found in SQLite for this dataset.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto mt-2">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                    <tr>
                      <th className="py-2">Time (UTC)</th>
                      <th>Open</th>
                      <th>High</th>
                      <th>Low</th>
                      <th>Close</th>
                      <th>Tick Volume</th>
                      <th>Spread</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadedCandles
                      .slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize)
                      .map((c, i) => (
                        <tr key={c.time + '-' + i} className="hover:bg-slate-800/30">
                          <td className="py-1.5 text-slate-400">
                            {new Date(c.time * 1000)
                              .toISOString()
                              .replace('T', ' ')
                              .substring(0, 19)}
                          </td>
                          <td className="text-white">{c.open}</td>
                          <td className="text-emerald-400">{c.high}</td>
                          <td className="text-rose-400">{c.low}</td>
                          <td className="text-white">{c.close}</td>
                          <td className="text-slate-400">{c.tickVolume}</td>
                          <td className="text-blue-400">{c.spread}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </>
    )}

      {/* COMPLETE STORED HISTORICAL DATA VAULT */}
      {activeTabMode === 'vault' && (
        <div className="space-y-6">
          {/* Storage Summary Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-slate-800 bg-[#0E1524] shadow-md">
              <span className="text-[11px] font-sans text-slate-400 uppercase tracking-wider block">
                Total Historical Bars in SQLite
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                {storageSummary?.totalCandles?.toLocaleString() || '0'}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Permanently persisted in data/zaboraa.sqlite
              </span>
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-[#0E1524] shadow-md">
              <span className="text-[11px] font-sans text-slate-400 uppercase tracking-wider block">
                Tracked Pair Series
              </span>
              <span className="text-2xl font-bold font-mono text-white mt-1 block">
                {storageSummary?.datasets?.length || 0} Sets
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Unique symbol + timeframe combinations
              </span>
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-[#0E1524] shadow-md">
              <span className="text-[11px] font-sans text-slate-400 uppercase tracking-wider block">
                Persistence Policy
              </span>
              <span className="text-base font-bold font-mono text-blue-400 mt-1 block">
                Append-Only
              </span>
              <span className="text-[10px] text-emerald-400 mt-1 block">
                Zero Deletions / No Pruning
              </span>
            </div>

            <div className="p-4 rounded-lg border border-slate-800 bg-[#0E1524] shadow-md">
              <span className="text-[11px] font-sans text-slate-400 uppercase tracking-wider block">
                Disk Integrity
              </span>
              <span className="text-base font-bold font-mono text-emerald-400 mt-1 block flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                Synchronous WAL
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Index: (symbol, timeframe, time)
              </span>
            </div>
          </div>

          {/* Stored Datasets Matrix */}
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Stored Historical Series Overview
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All historical candles stored locally in the database. Select any row to inspect bars in the universal browser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  loadStorageSummary();
                  loadVaultData(1, vaultSymbol, vaultTimeframe, vaultPageSize);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Vault
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                  <tr>
                    <th className="p-3">Symbol</th>
                    <th className="p-3">Timeframe</th>
                    <th className="p-3">Total Bars Stored</th>
                    <th className="p-3">Earliest Recorded Bar (UTC)</th>
                    <th className="p-3">Latest Recorded Bar (UTC)</th>
                    <th className="p-3">Storage Status</th>
                    <th className="p-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {storageSummary?.datasets?.map((ds) => (
                    <tr key={ds.symbol + '-' + ds.timeframe} className="hover:bg-slate-800/20">
                      <td className="p-3 font-bold text-white font-sans">{ds.symbol}</td>
                      <td className="p-3 text-slate-300">{ds.timeframe}</td>
                      <td className="p-3 font-bold text-emerald-400">
                        {ds.candleCount.toLocaleString()}
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {ds.minDateIso ? ds.minDateIso.replace('T', ' ').substring(0, 19) : 'N/A'}
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {ds.maxDateIso ? ds.maxDateIso.replace('T', ' ').substring(0, 19) : 'N/A'}
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          PERMANENT SQLITE
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => {
                            setVaultSymbol(ds.symbol);
                            setVaultTimeframe(ds.timeframe);
                            loadVaultData(1, ds.symbol, ds.timeframe, vaultPageSize);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-semibold cursor-pointer"
                        >
                          Inspect Bars
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Universal Historical Candle Browser */}
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-400" />
                  Universal Historical Candle Explorer
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Browse and verify every single candle persisted in SQLite across all pairs.
                </p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <div>
                  <label className="text-slate-400 mr-1.5 font-sans">Symbol:</label>
                  <select
                    value={vaultSymbol}
                    onChange={(e) => {
                      setVaultSymbol(e.target.value);
                      loadVaultData(1, e.target.value, vaultTimeframe, vaultPageSize);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value="ALL">ALL SYMBOLS</option>
                    <option value="EURUSD">EURUSD</option>
                    <option value="GBPUSD">GBPUSD</option>
                    <option value="USDJPY">USDJPY</option>
                    <option value="XAUUSD">XAUUSD</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 mr-1.5 font-sans">Timeframe:</label>
                  <select
                    value={vaultTimeframe}
                    onChange={(e) => {
                      setVaultTimeframe(e.target.value);
                      loadVaultData(1, vaultSymbol, e.target.value, vaultPageSize);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value="ALL">ALL TIMEFRAMES</option>
                    <option value="M1">M1</option>
                    <option value="M5">M5</option>
                    <option value="M10">M10</option>
                    <option value="M15">M15</option>
                    <option value="M30">M30</option>
                    <option value="H1">H1</option>
                    <option value="H3">H3</option>
                    <option value="D1">D1</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 mr-1.5 font-sans">Per Page:</label>
                  <select
                    value={vaultPageSize}
                    onChange={(e) => {
                      const sz = Number(e.target.value);
                      setVaultPageSize(sz);
                      loadVaultData(1, vaultSymbol, vaultTimeframe, sz);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-white"
                  >
                    <option value={50}>50 bars</option>
                    <option value={100}>100 bars</option>
                    <option value={250}>250 bars</option>
                    <option value={500}>500 bars</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between text-xs font-mono pt-1">
              <span className="text-slate-400">
                Found <strong className="text-emerald-400">{vaultTotal.toLocaleString()}</strong> historical bars in SQLite
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={vaultPage <= 1 || isLoadingVault}
                  onClick={() => loadVaultData(vaultPage - 1, vaultSymbol, vaultTimeframe, vaultPageSize)}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2 text-slate-300">
                  Page {vaultPage} of {vaultTotalPages}
                </span>
                <button
                  type="button"
                  disabled={vaultPage >= vaultTotalPages || isLoadingVault}
                  onClick={() => loadVaultData(vaultPage + 1, vaultSymbol, vaultTimeframe, vaultPageSize)}
                  className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>

            {/* Bars Table */}
            {isLoadingVault ? (
              <div className="py-20 text-center text-slate-500 text-xs font-mono">
                Querying SQLite candle repository...
              </div>
            ) : vaultCandles.length === 0 ? (
              <div className="py-20 text-center text-slate-500 text-xs font-mono">
                No matching historical candles found in SQLite for current filter.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3">Time (UTC)</th>
                      <th className="py-2.5 px-3">Epoch</th>
                      <th className="py-2.5 px-3">Open</th>
                      <th className="py-2.5 px-3">High</th>
                      <th className="py-2.5 px-3">Low</th>
                      <th className="py-2.5 px-3">Close</th>
                      <th className="py-2.5 px-3">Tick Volume</th>
                      <th className="py-2.5 px-3">Spread (pts)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {vaultCandles.map((c, i) => (
                      <tr key={c.time + '-' + i} className="hover:bg-slate-800/20">
                        <td className="py-1.5 px-3 text-slate-300">
                          {new Date(c.time * 1000).toISOString().replace('T', ' ').substring(0, 19)}
                        </td>
                        <td className="py-1.5 px-3 text-slate-500">{c.time}</td>
                        <td className="py-1.5 px-3 text-white">{c.open}</td>
                        <td className="py-1.5 px-3 text-emerald-400">{c.high}</td>
                        <td className="py-1.5 px-3 text-rose-400">{c.low}</td>
                        <td className="py-1.5 px-3 text-white font-bold">{c.close}</td>
                        <td className="py-1.5 px-3 text-slate-400">{c.tickVolume}</td>
                        <td className="py-1.5 px-3 text-blue-400">{c.spread}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fetch from MT5 Bridge Modal */}
      {isFetchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                Fetch Data from Local MT5 Bridge
              </h3>
              <button
                type="button"
                onClick={() => setIsFetchModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Connects to the local Python FastAPI bridge on <code className="text-slate-100">127.0.0.1:8001</code>. Automatically appends broker suffix (<code className="text-emerald-400">EURUSDm</code>, <code className="text-emerald-400">XAUUSDm</code>) for Exness demo terminals, excludes the forming bar, and stores canonical data in SQLite.
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1 font-sans">Symbol</label>
                <select
                  value={fetchSymbol}
                  onChange={(e) => setFetchSymbol(e.target.value as ForexSymbol)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="EURUSD">EURUSD</option>
                  <option value="GBPUSD">GBPUSD</option>
                  <option value="USDJPY">USDJPY</option>
                  <option value="XAUUSD">XAUUSD (Gold)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-sans">Timeframe</label>
                <select
                  value={fetchTimeframe}
                  onChange={(e) => setFetchTimeframe(e.target.value as Timeframe)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="M1">M1 (1 Minute)</option>
                  <option value="M5">M5 (5 Minutes)</option>
                  <option value="M10">M10 (10 Minutes)</option>
                  <option value="M15">M15 (15 Minutes)</option>
                  <option value="M30">M30 (30 Minutes)</option>
                  <option value="H1">H1 (1 Hour)</option>
                  <option value="H3">H3 (3 Hours)</option>
                  <option value="D1">D1 (1 Day)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1 font-sans">
                Bar Count Depth
              </label>
              <select
                value={fetchCount}
                onChange={(e) => setFetchCount(parseInt(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white font-mono text-xs"
              >
                <option value={100}>100 Bars</option>
                <option value={300}>300 Bars</option>
                <option value={500}>500 Bars</option>
                <option value={1000}>1,000 Bars</option>
                <option value={2000}>2,000 Bars</option>
                <option value={5000}>5,000 Bars (Max Page)</option>
              </select>
            </div>

            {fetchStatusMessage && (
              <div
                className={`p-2.5 rounded text-xs border ${
                  fetchStatusMessage.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {fetchStatusMessage.message}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsFetchModalOpen(false)}
                className="px-4 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isFetchingFromBridge}
                onClick={handleExecuteBridgeFetch}
                className="px-4 py-2 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {isFetchingFromBridge ? 'Fetching from MT5...' : 'Execute Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-400" />
              Import Custom Forex Candle CSV
            </h3>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1 font-sans">Symbol</label>
                <select
                  value={importSymbol}
                  onChange={(e) => setImportSymbol(e.target.value as ForexSymbol)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="EURUSD">EURUSD</option>
                  <option value="GBPUSD">GBPUSD</option>
                  <option value="USDJPY">USDJPY</option>
                  <option value="XAUUSD">XAUUSD</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-sans">Timeframe</label>
                <select
                  value={importTimeframe}
                  onChange={(e) => setImportTimeframe(e.target.value as Timeframe)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="M1">M1</option>
                  <option value="M5">M5</option>
                  <option value="M10">M10</option>
                  <option value="M15">M15</option>
                  <option value="M30">M30</option>
                  <option value="H1">H1</option>
                  <option value="H3">H3</option>
                  <option value="D1">D1</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-sans">UTC Offset</label>
                <input
                  type="number"
                  value={importUtcOffset}
                  onChange={(e) => setImportUtcOffset(parseInt(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1 font-sans">
                Paste CSV Lines (Format: Time,Open,High,Low,Close,Volume,Spread)
              </label>
              <textarea
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                placeholder="Time,Open,High,Low,Close,Volume,Spread&#10;2026-10-20 10:00:00,1.0850,1.0865,1.0840,1.0855,300,1.0&#10;2026-10-20 11:00:00,1.0855,1.0870,1.0850,1.0862,420,1.0"
                rows={7}
                className="w-full rounded bg-slate-950 p-2.5 font-mono text-xs text-white border border-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            {importFeedback && (
              <div className="p-2 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono">
                {importFeedback}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                className="px-4 py-2 rounded text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Audit & Commit to SQLite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
