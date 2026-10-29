import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Database,
  BarChart3,
  Sliders,
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Compass,
  ArrowRight,
  Code2,
  Layers,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import { ForexSymbol, Timeframe, DatasetRecord, BacktestReport } from '../types/forex';
import { BUILT_IN_STRATEGIES, StrategyDefinition } from '../engine/workerSandbox';

interface AIAnalysisViewProps {
  onNavigateToTab?: (tab: any) => void;
  activeReport?: BacktestReport | null;
  strategies?: StrategyDefinition[];
}

export const AIAnalysisView: React.FC<AIAnalysisViewProps> = ({
  onNavigateToTab,
  activeReport,
  strategies = BUILT_IN_STRATEGIES,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'market' | 'data' | 'strategy' | 'chat'>('market');

  // Market Review state
  const [marketSymbol, setMarketSymbol] = useState<ForexSymbol>('XAUUSD');
  const [marketTimeframe, setMarketTimeframe] = useState<string>('H1');
  const [isAnalyzingMarket, setIsAnalyzingMarket] = useState<boolean>(false);
  const [marketAnalysisResult, setMarketAnalysisResult] = useState<any | null>(null);

  // Data Review state
  const [catalog, setCatalog] = useState<Omit<DatasetRecord, 'candles'>[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [isReviewingData, setIsReviewingData] = useState<boolean>(false);
  const [dataReviewResult, setDataReviewResult] = useState<any | null>(null);

  // Strategy Advisor state
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(
    strategies[0]?.id || 'trend_pullback_pro_v1'
  );
  const [isAdvisingStrategy, setIsAdvisingStrategy] = useState<boolean>(false);
  const [strategyAdvisorResult, setStrategyAdvisorResult] = useState<any | null>(null);

  // Quant Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: 'Hello! I am your Zaboraa FX Quantitative AI Advisor powered by Gemini 3.8 Flash. I can review your historical market data, critique strategy rules (such as Trend Pullback Pro), analyze COT institutional flows, and suggest parameter optimizations. How can I assist your quantitative research today?',
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Load catalog on mount
  useEffect(() => {
    fetch('/api/data/catalog')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.catalog) {
          setCatalog(data.catalog);
          if (data.catalog.length > 0 && !selectedDatasetId) {
            setSelectedDatasetId(data.catalog[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // 1. Run Market Analysis
  const handleRunMarketAnalysis = async () => {
    setIsAnalyzingMarket(true);
    try {
      // Gather technical, cot, and macro inputs
      const [techRes, cotRes, macroRes, sentRes] = await Promise.all([
        fetch(`/api/technical/analysis?symbol=${marketSymbol}&timeframe=${marketTimeframe}`).then((r) => r.json()).catch(() => null),
        fetch('/api/fundamentals/cot').then((r) => r.json()).catch(() => null),
        fetch('/api/fundamentals/macro').then((r) => r.json()).catch(() => null),
        fetch('/api/fundamentals/sentiment').then((r) => r.json()).catch(() => null),
      ]);

      const res = await fetch('/api/ai/analyze-market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: marketSymbol,
          timeframe: marketTimeframe,
          price: techRes?.price,
          technicalReport: techRes,
          cotData: cotRes?.cot?.find((c: any) => c.symbol === (marketSymbol === 'XAUUSD' ? 'XAU' : marketSymbol.slice(0, 3))),
          macroData: macroRes,
          sentimentData: sentRes?.overallSentiment,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMarketAnalysisResult(data);
      }
    } catch (err) {
      console.error('Failed to run AI Market analysis:', err);
    } finally {
      setIsAnalyzingMarket(false);
    }
  };

  // 2. Run Data Health Review
  const handleRunDataReview = async () => {
    setIsReviewingData(true);
    try {
      const targetDs = catalog.find((c) => c.id === selectedDatasetId) || {
        symbol: 'EURUSD',
        timeframe: 'H1',
        candleCount: 500,
        qualityScore: 92,
        gapCount: 0,
        isResearchEligible: true,
      };

      const res = await fetch('/api/ai/review-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: targetDs.symbol,
          timeframe: targetDs.timeframe,
          candleCount: targetDs.candleCount,
          qualityScore: targetDs.qualityScore,
          gapCount: targetDs.gapCount,
          isResearchEligible: targetDs.isResearchEligible,
          anomalies: targetDs.gapCount > 0 ? [`${targetDs.gapCount} potential interval gaps found`] : [],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDataReviewResult(data);
      }
    } catch (err) {
      console.error('Failed to run AI Data review:', err);
    } finally {
      setIsReviewingData(false);
    }
  };

  // 3. Run Strategy Advisor
  const handleRunStrategyAdvisor = async (customPrompt?: string) => {
    setIsAdvisingStrategy(true);
    try {
      const strat = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];

      const res = await fetch('/api/ai/strategy-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyName: strat?.name || 'Trend Pullback Pro',
          strategyId: strat?.id || 'trend_pullback_pro_v1',
          symbol: activeReport?.symbol || 'EURUSD',
          timeframe: activeReport?.timeframe || 'H1',
          params: strat?.params || {},
          report: activeReport || {
            netProfit: 1240.5,
            profitFactor: 1.62,
            winRate: 54.5,
            maxDrawdown: 380,
            maxDrawdownPct: 3.8,
            totalTrades: 66,
            expectancy: 18.8,
            sharpeRatio: 1.48,
          },
          strategyCode: strat?.code,
          userQuery: customPrompt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStrategyAdvisorResult(data);
      }
    } catch (err) {
      console.error('Failed to run AI Strategy advisor:', err);
    } finally {
      setIsAdvisingStrategy(false);
    }
  };

  // 4. Send Quant Chat Message
  const handleSendChatMessage = async (presetText?: string) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || isChatLoading) return;

    const newMessages = [...chatMessages, { role: 'user' as const, text: textToSend }];
    setChatMessages(newMessages);
    if (!presetText) setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await fetch('/api/ai/quant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          contextData: {
            marketSymbol,
            marketTimeframe,
            activeStrategy: selectedStrategyId,
            backtestReportAvailable: Boolean(activeReport),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages([...newMessages, { role: 'assistant', text: data.text }]);
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 via-blue-600 to-purple-600 text-white shadow-lg shadow-primary/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white">AI Quantitative Analysis & Advisor</h1>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-primary/10 text-primary border border-primary/30">
                  Gemini 3.8 Flash
                </span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-success/10 text-success border border-success/20">
                  SERVER-SIDE API
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Deep institutional synthesis of Technicals, COT smart money positioning, SQLite historical candle quality, and strategy parameter optimization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (activeSubTab === 'market') handleRunMarketAnalysis();
                else if (activeSubTab === 'data') handleRunDataReview();
                else if (activeSubTab === 'strategy') handleRunStrategyAdvisor();
              }}
              disabled={isAnalyzingMarket || isReviewingData || isAdvisingStrategy}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-primary hover:bg-primary text-white text-xs font-semibold shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingMarket || isReviewingData || isAdvisingStrategy ? 'animate-spin' : ''}`} />
              Run Full Analysis
            </button>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center gap-2 mt-5 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setActiveSubTab('market')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeSubTab === 'market'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Market & COT Synthesis
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('data')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeSubTab === 'data'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Data Quality Audit
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('strategy')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeSubTab === 'strategy'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Strategy Doctor & Suggestions
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('chat')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              activeSubTab === 'chat'
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-text-muted hover:text-text hover:bg-surface'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Quant Assistant (Interactive Chat)
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: MARKET & COT SYNTHESIS */}
      {activeSubTab === 'market' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="rounded-lg border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-text-muted font-medium">Instrument:</label>
              <select
                value={marketSymbol}
                onChange={(e) => setMarketSymbol(e.target.value as ForexSymbol)}
                className="bg-bg border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-primary"
              >
                <option value="XAUUSD">XAUUSD (Gold Spot $4,053)</option>
                <option value="EURUSD">EURUSD (Euro Spot)</option>
                <option value="GBPUSD">GBPUSD (Cable Spot)</option>
                <option value="USDJPY">USDJPY (Yen Spot)</option>
              </select>

              <label className="text-xs text-text-muted font-medium ml-2">Timeframe:</label>
              <select
                value={marketTimeframe}
                onChange={(e) => setMarketTimeframe(e.target.value)}
                className="bg-bg border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-primary"
              >
                <option value="M15">M15 (15 Min)</option>
                <option value="H1">H1 (1 Hour - Primary)</option>
                <option value="H3">H3 (3 Hour)</option>
                <option value="D1">D1 (Daily)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleRunMarketAnalysis}
              disabled={isAnalyzingMarket}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isAnalyzingMarket ? 'Analyzing with Gemini...' : 'Analyze Market Telemetry'}
            </button>
          </div>

          {/* Results Display */}
          {marketAnalysisResult ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Bias & Trade Setup */}
              <div className="space-y-6">
                {/* Bias Card */}
                <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Institutional Bias
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${
                        marketAnalysisResult.bias.includes('BULLISH')
                          ? 'bg-success/20 text-success border border-success/30'
                          : marketAnalysisResult.bias.includes('BEARISH')
                          ? 'bg-danger/20 text-danger border border-danger/30'
                          : 'bg-warning/20 text-warning border border-warning/30'
                      }`}
                    >
                      {marketAnalysisResult.bias.replace('_', ' ')}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-text-muted">Model Confidence</span>
                      <span className="font-mono font-bold text-white">{marketAnalysisResult.confidenceScore}%</span>
                    </div>
                    <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full"
                        style={{ width: `${marketAnalysisResult.confidenceScore}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-text-muted leading-relaxed border-t border-border pt-3">
                    {marketAnalysisResult.executiveSummary}
                  </p>
                </div>

                {/* Suggested Trade Setup Card */}
                {marketAnalysisResult.suggestedTradeSetup && (
                  <div className="rounded-lg border border-primary/30 bg-gradient-to-b from-blue-950/20 to-[var(--surface)] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                        <TrendingUp className="w-4 h-4" />
                        AI Quantitative Trade Setup
                      </h3>
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-primary/20 text-primary">
                        {marketAnalysisResult.suggestedTradeSetup.direction}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-text-muted">Entry Zone</span>
                        <span className="font-mono font-semibold text-white">{marketAnalysisResult.suggestedTradeSetup.entryZone}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-text-muted">Stop Loss</span>
                        <span className="font-mono font-semibold text-danger">{marketAnalysisResult.suggestedTradeSetup.stopLoss}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-text-muted">Target 1 (1.5R)</span>
                        <span className="font-mono font-semibold text-success">{marketAnalysisResult.suggestedTradeSetup.takeProfit1}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-text-muted">Target 2 (Runner)</span>
                        <span className="font-mono font-semibold text-success">{marketAnalysisResult.suggestedTradeSetup.takeProfit2}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border">
                        <span className="text-text-muted">Risk : Reward</span>
                        <span className="font-mono font-bold text-primary">{marketAnalysisResult.suggestedTradeSetup.riskRewardRatio}</span>
                      </div>
                    </div>

                    <p className="text-xs text-text-muted italic pt-1">
                      Invalidation: {marketAnalysisResult.suggestedTradeSetup.invalidationCondition}
                    </p>
                  </div>
                )}
              </div>

              {/* Middle & Right: Deep Verdicts & Inflection Levels */}
              <div className="lg:col-span-2 space-y-6">
                {/* 3 Verdict Pillars */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Technicals
                    </span>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {marketAnalysisResult.technicalVerdict}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <span className="text-xs font-bold text-success uppercase tracking-wider flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5" />
                      COT Positioning
                    </span>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {marketAnalysisResult.cotVerdict}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <span className="text-xs font-bold text-warning uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5" />
                      Macro & Yields
                    </span>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {marketAnalysisResult.macroVerdict}
                    </p>
                  </div>
                </div>

                {/* Key Inflection Levels */}
                {marketAnalysisResult.keyInflectionLevels && (
                  <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      Key Institutional Inflection & Liquidity Levels
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="p-3 rounded bg-danger/10 border border-danger/20 text-center">
                        <span className="text-xs text-danger block font-semibold">Major Resistance</span>
                        <span className="text-xs font-mono font-bold text-white mt-1 block">
                          {marketAnalysisResult.keyInflectionLevels.majorResistance}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-warning/10 border border-warning/20 text-center">
                        <span className="text-xs text-warning block font-semibold">Immediate Resistance</span>
                        <span className="text-xs font-mono font-bold text-white mt-1 block">
                          {marketAnalysisResult.keyInflectionLevels.immediateResistance}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-primary/10 border border-primary/20 text-center">
                        <span className="text-xs text-primary block font-semibold">Pivot Baseline</span>
                        <span className="text-xs font-mono font-bold text-white mt-1 block">
                          {marketAnalysisResult.keyInflectionLevels.pivotPoint}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-success/10 border border-success/20 text-center">
                        <span className="text-xs text-success block font-semibold">Immediate Support</span>
                        <span className="text-xs font-mono font-bold text-white mt-1 block">
                          {marketAnalysisResult.keyInflectionLevels.immediateSupport}
                        </span>
                      </div>
                      <div className="p-3 rounded bg-success/10 border border-success/20 text-center">
                        <span className="text-xs text-success block font-semibold">Major Support</span>
                        <span className="text-xs font-mono font-bold text-white mt-1 block">
                          {marketAnalysisResult.keyInflectionLevels.majorSupport}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Risk Warnings & Actionable Takeaways */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-danger/20 bg-danger/15 p-4 space-y-2">
                    <span className="text-xs font-bold text-danger flex items-center gap-1.5 uppercase">
                      <ShieldAlert className="w-4 h-4" />
                      Risk Warnings & Traps
                    </span>
                    <ul className="space-y-1.5 text-xs text-text-muted">
                      {marketAnalysisResult.riskWarnings?.map((w: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-danger mt-0.5">•</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/15 p-4 space-y-2">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase">
                      <CheckCircle2 className="w-4 h-4" />
                      Actionable Takeaways
                    </span>
                    <ul className="space-y-1.5 text-xs text-text-muted">
                      {marketAnalysisResult.actionableTakeaways?.map((t: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-12 text-center space-y-3">
              <Sparkles className="w-10 h-10 text-primary mx-auto opacity-60" />
              <h3 className="text-sm font-bold text-white">Click "Analyze Market Telemetry" to Review {marketSymbol}</h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Gemini will combine spot price action, 12 technical indicators, COT hedge fund vs dealer commitments, and central bank yield differentials to deliver a unified quantitative assessment.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: DATA QUALITY AUDIT */}
      {activeSubTab === 'data' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-text-muted font-medium">Dataset to Audit:</label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="bg-bg border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-primary"
              >
                {catalog.length > 0 ? (
                  catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.symbol} {c.timeframe} — {c.provenance} ({c.candleCount} bars, {c.qualityScore}%)
                    </option>
                  ))
                ) : (
                  <option value="eurusd-h1">EURUSD H1 (Bridge Benchmark)</option>
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={handleRunDataReview}
              disabled={isReviewingData}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-primary hover:bg-primary text-white text-xs font-semibold shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              {isReviewingData ? 'Auditing with Gemini...' : 'Audit Selected Dataset'}
            </button>
          </div>

          {dataReviewResult ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Data Integrity Verdict
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${
                      dataReviewResult.verdict === 'PRODUCTION_READY'
                        ? 'bg-success/20 text-success border border-success/30'
                        : 'bg-warning/20 text-warning border border-warning/30'
                    }`}
                  >
                    {dataReviewResult.verdict.replace(/_/g, ' ')}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-muted">Data Health Score</span>
                    <span className="font-mono font-bold text-white">{dataReviewResult.healthScore}%</span>
                  </div>
                  <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-success h-2 rounded-full"
                      style={{ width: `${dataReviewResult.healthScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-text-muted leading-relaxed border-t border-border pt-3">
                  {dataReviewResult.summary}
                </p>

                <div className="space-y-2 text-xs border-t border-border pt-3">
                  <div>
                    <span className="text-text-muted font-semibold block mb-0.5">Weekend & Gap Analysis:</span>
                    <p className="text-text-muted">{dataReviewResult.gapAnalysis}</p>
                  </div>
                  <div>
                    <span className="text-text-muted font-semibold block mb-0.5">Slippage & Spread Considerations:</span>
                    <p className="text-text-muted">{dataReviewResult.slippageSpreadRisks}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  Research Cleaning Recommendations
                </h3>

                <ul className="space-y-2 text-xs text-text-muted">
                  {dataReviewResult.cleaningRecommendations?.map((rec: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 p-2.5 rounded bg-bg border border-border">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t border-border pt-3 text-xs space-y-1">
                  <span className="text-text-muted font-semibold block">Sample Size & Statistical Power:</span>
                  <p className="text-text-muted">{dataReviewResult.sampleSizeViability}</p>
                </div>

                {onNavigateToTab && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTab('data')}
                    className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 rounded bg-surface hover:bg-surface text-xs font-medium text-white transition-colors cursor-pointer"
                  >
                    Open Data Manager to Run Autofix
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-12 text-center space-y-3">
              <Database className="w-10 h-10 text-primary mx-auto opacity-60" />
              <h3 className="text-sm font-bold text-white">Select a Dataset and Click "Audit Selected Dataset"</h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                AI will inspect gaps, timestamp ordering, tick volume viability, and provide cleaning instructions.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: STRATEGY DOCTOR & SUGGESTIONS */}
      {activeSubTab === 'strategy' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs text-text-muted font-medium">Select Strategy:</label>
              <select
                value={selectedStrategyId}
                onChange={(e) => setSelectedStrategyId(e.target.value)}
                className="bg-bg border border-border rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-primary"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleRunStrategyAdvisor()}
              disabled={isAdvisingStrategy}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-primary hover:bg-primary text-white text-xs font-semibold shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              {isAdvisingStrategy ? 'Consulting Quant Model...' : 'Diagnose & Suggest Optimizations'}
            </button>
          </div>

          {strategyAdvisorResult ? (
            <div className="space-y-6">
              {/* Executive Assessment Header */}
              <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-muted uppercase">Assessment:</span>
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                      {strategyAdvisorResult.performanceVerdict.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-text-muted">Robustness Score: </span>
                    <span className="font-bold text-white">{strategyAdvisorResult.overallScore}/100</span>
                  </div>
                </div>

                <p className="text-xs text-text-muted leading-relaxed">
                  {strategyAdvisorResult.executiveCritique}
                </p>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Parameter Suggestions */}
                <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-primary" />
                    Specific Parameter Adjustments
                  </h3>

                  <div className="space-y-3">
                    {strategyAdvisorResult.parameterSuggestions?.map((param: any, idx: number) => (
                      <div key={idx} className="p-3 rounded bg-bg border border-border space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-primary">{param.parameter}</span>
                          <div className="flex items-center gap-2 font-mono text-xs">
                            <span className="text-text-muted line-through">{String(param.currentValue)}</span>
                            <ArrowRight className="w-3 h-3 text-text-muted" />
                            <span className="font-bold text-success">{String(param.suggestedValue)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">{param.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Regime Filters & Code Optimizations */}
                <div className="space-y-6">
                  {/* Regime Filters */}
                  <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-success" />
                      Recommended Regime & Filter Gates
                    </h3>
                    <div className="space-y-2">
                      {strategyAdvisorResult.regimeFilters?.map((rf: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded bg-bg border border-border text-xs space-y-1">
                          <span className="font-semibold text-success">{rf.filterName}</span>
                          <p className="text-text-muted text-xs">{rf.description}</p>
                          <span className="text-xs text-primary block italic">Impact: {rf.expectedImpact}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottlenecks & Code Improvements */}
                  <div className="rounded-lg border border-border bg-surface p-5 space-y-3">
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-primary" />
                      Code & Execution Improvements
                    </h3>
                    <ul className="space-y-1.5 text-xs text-text-muted">
                      {strategyAdvisorResult.codeOptimizations?.map((co: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{co}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface p-12 text-center space-y-3">
              <Sliders className="w-10 h-10 text-primary mx-auto opacity-60" />
              <h3 className="text-sm font-bold text-white">Click "Diagnose & Suggest Optimizations"</h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                Gemini will inspect backtest metrics, parameter sensitivity, and code structure to provide mathematical advice.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: QUANT ASSISTANT (INTERACTIVE CHAT) */}
      {activeSubTab === 'chat' && (
        <div className="space-y-4">
          {/* Quick Prompt Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted font-medium">Quick Prompts:</span>
            {[
              'Audit Trend Pullback Pro rules on EURUSD H1',
              'Analyze Gold COT institutional saturation risk',
              'Suggest optimal ATR multiplier for 2.0R target',
              'Evaluate weekend gap protection logic',
            ].map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendChatMessage(prompt)}
                className="px-2.5 py-1 rounded bg-bg hover:bg-surface border border-border text-xs text-text-muted transition-colors cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Window */}
          <div className="rounded-lg border border-border bg-surface h-[480px] flex flex-col overflow-hidden shadow-xl">
            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded bg-primary/30 border border-primary/40 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-lg p-3.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white font-medium'
                        : 'bg-bg border border-border text-text shadow-sm'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>

                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-end mt-2 pt-2 border-t border-border">
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.text, idx)}
                          className="text-xs text-text-muted hover:text-text flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="w-3 h-3 text-success" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy Analysis
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded bg-primary/30 border border-primary/40 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-spin" />
                  </div>
                  <div className="bg-bg border border-border rounded-lg px-4 py-2 text-xs text-text-muted flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                    Gemini 3.8 Flash is analyzing quantitative telemetry...
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="border-t border-border p-3 bg-bg flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                placeholder="Ask Gemini to review market data, backtest metrics, or strategy rules..."
                className="flex-1 bg-bg border border-border rounded-lg px-3.5 py-2 text-xs text-text placeholder-text-muted focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => handleSendChatMessage()}
                disabled={!chatInput.trim() || isChatLoading}
                className="flex items-center justify-center px-4 py-2 rounded-lg bg-primary hover:bg-primary text-white text-xs font-semibold shadow disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
