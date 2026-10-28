import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  FileText,
  Flame,
  Globe,
  Info,
  Layers,
  Newspaper,
  Percent,
  RefreshCw,
  Scale,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  NewsSentimentHeadline,
  RetailSentimentRecord,
} from '../types/forex';
import { TechnicalAnalysisView } from './TechnicalAnalysisView';
import { ErrorBoundary } from './ErrorBoundary';

interface CotReportItem {
  symbol: string;
  reportDate: string;
  commercialLong: number;
  commercialShort: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  netSpeculatorPosition: number;
  netCommercialPosition: number;
  cotIndex: number;
  speculatorBias: string;
  institutionalFlow: string;
}

interface CentralBankRate {
  bank: string;
  rate: number;
  bias: string;
  nextMeeting: string;
}

interface MacroMetric {
  indicator: string;
  value: number;
  previous: number;
  target?: number;
  impact: string;
}

interface CurrencyBias {
  pair: string;
  score: number;
  rating: string;
  reason: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  blackoutRequired: boolean;
}

export const FundamentalView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'sentiment' | 'technical' | 'cot_macro'>('sentiment');

  const [cotList, setCotList] = useState<CotReportItem[]>([]);
  const [centralBanks, setCentralBanks] = useState<CentralBankRate[]>([]);
  const [macroMetrics, setMacroMetrics] = useState<MacroMetric[]>([]);
  const [currencyBiases, setCurrencyBiases] = useState<CurrencyBias[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [isNewsBlackoutActive, setIsNewsBlackoutActive] = useState<boolean>(false);
  const [selectedCotSymbol, setSelectedCotSymbol] = useState<string>('EUR');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // News Sentiment & Retail Sentiment Data
  const [sentimentData, setSentimentData] = useState<{
    overallSentiment: {
      score: number;
      label: string;
      bullishPct: number;
      neutralPct: number;
      bearishPct: number;
      sampleSize: number;
    };
    retailSentimentGold: RetailSentimentRecord;
    headlines: NewsSentimentHeadline[];
  } | null>(null);

  const fetchFundamentalData = async () => {
    setIsLoading(true);
    try {
      const [cotRes, macroRes, calRes, sentRes] = await Promise.all([
        fetch('/api/fundamentals/cot'),
        fetch('/api/fundamentals/macro'),
        fetch('/api/fundamentals/calendar'),
        fetch('/api/fundamentals/sentiment'),
      ]);

      if (cotRes.ok) {
        const d = await cotRes.json();
        setCotList(d.cot || []);
      }
      if (macroRes.ok) {
        const d = await macroRes.json();
        setCentralBanks(d.centralBankRates || []);
        setMacroMetrics(d.keyMetrics || []);
        setCurrencyBiases(d.currencyBiasScores || []);
      }
      if (calRes.ok) {
        const d = await calRes.json();
        setCalendarEvents(d.events || []);
        setIsNewsBlackoutActive(d.isNewsBlackoutActive || false);
      }
      if (sentRes.ok) {
        const d = await sentRes.json();
        setSentimentData(d);
      }
    } catch (err) {
      console.error('Failed to load fundamentals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFundamentalData();
  }, []);

  const activeCot = cotList.find((c) => c.symbol === selectedCotSymbol) || cotList[0];

  // Semicircular SVG dial gauge for sentiment score (-100 to +100)
  const renderSentimentGauge = (score: number, label: string) => {
    const w = 220;
    const h = 130;
    const cx = w / 2;
    const cy = h - 15;
    const r = 85;
    const strokeW = 10;

    // Map score -100 to +100 onto angle -90 to +90 deg
    const angleDeg = (score / 100) * 85;
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const needleLen = r - 10;
    const nx = cx + needleLen * Math.cos(rad);
    const ny = cy + needleLen * Math.sin(rad);

    return (
      <div className="flex flex-col items-center">
        <svg width={w} height={h} className="overflow-visible">
          <defs>
            <linearGradient id="sentiment-gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="35%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="65%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {/* Background arc track */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="#1e293b"
            strokeWidth={strokeW + 4}
            strokeLinecap="round"
          />

          {/* Colored gradient arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="url(#sentiment-gauge-grad)"
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Zone labels */}
          <text x={cx - r - 4} y={cy - 6} textAnchor="end" fill="#f43f5e" fontSize="9" fontWeight="bold">
            Bearish
          </text>
          <text x={cx} y={cy - r - 6} textAnchor="middle" fill="#94a3b8" fontSize="9">
            Neutral
          </text>
          <text x={cx + r + 4} y={cy - 6} textAnchor="start" fill="#10b981" fontSize="9" fontWeight="bold">
            Bullish
          </text>

          {/* Needle center pin */}
          <circle cx={cx} cy={cy} r={5} fill="#475569" stroke="#ffffff" strokeWidth="1.5" />

          {/* Needle pointer */}
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        <div className="mt-1 flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold font-mono tracking-wider ${
              score >= 30
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : score <= -30
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {label.replace('_', ' ')} ({score > 0 ? `+${score}` : score})
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              Fundamentals, News Sentiment & Gold Technical Lab
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Natural Language news headline sentiment parsing, Exness MT5 retail gold positioning, and Investing.com technical gauges.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Live News Blackout Pill */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold ${
                isNewsBlackoutActive
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300 animate-pulse'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>
                {isNewsBlackoutActive
                  ? 'HIGH IMPACT NEWS BLACKOUT (Trading Halted)'
                  : 'NEWS FIREWALL: CLEAR (0 Blackout Events)'}
              </span>
            </div>

            <button
              type="button"
              onClick={fetchFundamentalData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Sub-Tab Navigation Bar */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('sentiment')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'sentiment'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>News & Retail Sentiment (Gold XAUUSD)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('technical')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'technical'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Technical Analysis Gauges (Investing.com Layout)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('cot_macro')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === 'cot_macro'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>CFTC Institutional COT & Central Banks</span>
          </button>
        </div>
      </div>

      {/* TAB 1: NEWS SENTIMENT & RETAIL SENTIMENT FOR GOLD */}
      {activeSubTab === 'sentiment' && (
        <div className="space-y-6">
          {/* Top Section: News Sentiment Gauge & Retail Gold Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. News Sentiment Analysis Gauge */}
            <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Newspaper className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Financial News Sentiment Gauge
                  </h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  NLP Keyword Parser
                </span>
              </div>

              <div className="mt-4 flex flex-col items-center">
                {sentimentData &&
                  renderSentimentGauge(
                    sentimentData.overallSentiment.score,
                    sentimentData.overallSentiment.label
                  )}

                {/* Sentiment Distribution Bar */}
                {sentimentData && (
                  <div className="w-full mt-5 space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-emerald-400 font-bold">
                        {sentimentData.overallSentiment.bullishPct}% Bullish
                      </span>
                      <span className="text-slate-400 font-bold">
                        {sentimentData.overallSentiment.neutralPct}% Neutral
                      </span>
                      <span className="text-rose-400 font-bold">
                        {sentimentData.overallSentiment.bearishPct}% Bearish
                      </span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-950 flex overflow-hidden border border-slate-800">
                      <div
                        style={{ width: `${sentimentData.overallSentiment.bullishPct}%` }}
                        className="bg-emerald-500 h-full"
                      />
                      <div
                        style={{ width: `${sentimentData.overallSentiment.neutralPct}%` }}
                        className="bg-slate-500 h-full"
                      />
                      <div
                        style={{ width: `${sentimentData.overallSentiment.bearishPct}%` }}
                        className="bg-rose-500 h-full"
                      />
                    </div>

                    <p className="text-[11px] text-slate-400 text-center mt-2">
                      Aggregate sentiment derived from {sentimentData.overallSentiment.sampleSize} institutional financial wires and geopolitical headlines.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Retail Sentiment for Gold (XAUUSD / XAUUSDm Exness Match) */}
            <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Retail Positioning for Gold (XAUUSD)
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="text-slate-400">Exness MT5:</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30">
                    {sentimentData?.retailSentimentGold.brokerSymbol || 'XAUUSDm'}
                  </span>
                </div>
              </div>

              {sentimentData && (
                <div className="mt-4 space-y-4">
                  {/* Retail Long vs Short Bar */}
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1.5">
                      <span className="font-bold text-emerald-400 flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Retail Long: {sentimentData.retailSentimentGold.longPct}%
                      </span>
                      <span className="font-bold text-rose-400 flex items-center gap-1">
                        Retail Short: {sentimentData.retailSentimentGold.shortPct}%
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    <div className="w-full h-4 rounded-full bg-slate-950 flex overflow-hidden border border-slate-800 shadow-inner">
                      <div
                        style={{ width: `${sentimentData.retailSentimentGold.longPct}%` }}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full flex items-center justify-start pl-2 text-[10px] font-bold text-slate-950"
                      >
                        {sentimentData.retailSentimentGold.longPct}%
                      </div>
                      <div
                        style={{ width: `${sentimentData.retailSentimentGold.shortPct}%` }}
                        className="bg-gradient-to-r from-rose-500 to-rose-700 h-full flex items-center justify-end pr-2 text-[10px] font-bold text-white"
                      >
                        {sentimentData.retailSentimentGold.shortPct}%
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Retail Statistics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Net Retail Position</span>
                      <strong className="text-emerald-400 text-sm">
                        +{sentimentData.retailSentimentGold.netPosition}%
                      </strong>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">24h Shift</span>
                      <strong className="text-blue-400 text-sm">
                        +{sentimentData.retailSentimentGold.dailyShiftPct}%
                      </strong>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Open Retail Lots</span>
                      <strong className="text-white text-sm">
                        {sentimentData.retailSentimentGold.volumeLots.toLocaleString()}
                      </strong>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 text-[10px] block">Avg Long Price</span>
                      <strong className="text-slate-200 text-sm">
                        ${sentimentData.retailSentimentGold.avgLongPrice}
                      </strong>
                    </div>
                  </div>

                  {/* Contrarian Indicator Banner */}
                  <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-300">
                      <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        CONTRARIAN INSTITUTIONAL BIAS:{' '}
                        {sentimentData.retailSentimentGold.contrarianBias.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      {sentimentData.retailSentimentGold.contrarianSummary}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Parsed Financial Headlines Feed */}
          <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
              <h3 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Parsed Financial Headlines & Algorithmic Sentiment
              </h3>
              <span className="text-slate-400 font-mono text-[11px]">
                Showing {sentimentData?.headlines.length || 0} parsed wires
              </span>
            </div>

            <div className="divide-y divide-slate-800/60 mt-2">
              {sentimentData?.headlines.map((item) => (
                <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                          item.sentiment === 'BULLISH'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : item.sentiment === 'BEARISH'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.sentiment} ({item.score > 0 ? `+${item.score}` : item.score})
                      </span>
                      <span className="text-slate-500 text-[11px] font-mono">
                        {item.source} · {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="px-1.5 py-0.2 rounded font-mono text-[10px] bg-slate-900 text-blue-400 border border-slate-800">
                        {item.relatedSymbol}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 font-medium">{item.headline}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {item.keywords.map((kw, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-slate-400 font-mono border border-slate-800">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-mono block">Impact Weight</span>
                    <span
                      className={`text-xs font-bold font-mono ${
                        item.impact === 'HIGH' ? 'text-amber-400' : 'text-slate-400'
                      }`}
                    >
                      {item.impact}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TECHNICAL ANALYSIS (Investing.com Layout from User Image) */}
      {activeSubTab === 'technical' && (
        <ErrorBoundary fallbackTitle="Investing.com Technical Analysis">
          <TechnicalAnalysisView initialSymbol="XAUUSD" />
        </ErrorBoundary>
      )}

      {/* TAB 3: CFTC INSTITUTIONAL COT & CENTRAL BANKS */}
      {activeSubTab === 'cot_macro' && (
        <div className="space-y-6">
          {/* COT Report Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                CFTC Contract Explorer
              </h3>
              <div className="space-y-2">
                {cotList.map((c) => (
                  <button
                    key={c.symbol}
                    type="button"
                    onClick={() => setSelectedCotSymbol(c.symbol)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedCotSymbol === c.symbol
                        ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-sm'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{c.symbol} Futures</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          c.speculatorBias.includes('BULLISH')
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {c.speculatorBias}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>COT Index: {c.cotIndex}%</span>
                      <span>Net: {c.netSpeculatorPosition > 0 ? `+${c.netSpeculatorPosition.toLocaleString()}` : c.netSpeculatorPosition.toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Active COT Speculator vs Commercial Breakdown */}
            {activeCot && (
              <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-emerald-400" />
                      CFTC Commitments of Traders: {activeCot.symbol}
                    </h3>
                    <span className="text-xs text-slate-400">
                      Report Date: {activeCot.reportDate} · Source: US Commodity Futures Trading Commission
                    </span>
                  </div>

                  <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    COT Index: {activeCot.cotIndex}% Percentile
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Non-Commercial (Speculators / Hedge Funds)</span>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Long Contracts:</span>
                        <span className="text-emerald-400">{activeCot.nonCommercialLong.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Short Contracts:</span>
                        <span className="text-rose-400">{activeCot.nonCommercialShort.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-slate-300">Net Position:</span>
                        <span className={activeCot.netSpeculatorPosition >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {activeCot.netSpeculatorPosition > 0 ? '+' : ''}{activeCot.netSpeculatorPosition.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Commercial (Hedgers / Smart Money Producers)</span>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Long Contracts:</span>
                        <span className="text-emerald-400">{activeCot.commercialLong.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Short Contracts:</span>
                        <span className="text-rose-400">{activeCot.commercialShort.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-800 font-bold">
                        <span className="text-slate-300">Net Position:</span>
                        <span className={activeCot.netCommercialPosition >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {activeCot.netCommercialPosition > 0 ? '+' : ''}{activeCot.netCommercialPosition.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-300 mb-1">
                    <Info className="w-4 h-4 text-blue-400" />
                    <span>Institutional Flow Interpretation</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {activeCot.institutionalFlow}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Central Bank Rates & Currency Bias */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-400" />
                Central Bank Policy Rates
              </h3>
              <div className="space-y-2 text-xs font-mono">
                {centralBanks.map((cb) => (
                  <div
                    key={cb.bank}
                    className="flex items-center justify-between p-2.5 rounded bg-slate-950 border border-slate-800"
                  >
                    <div>
                      <div className="font-bold text-white">{cb.bank}</div>
                      <span className="text-[10px] text-slate-500">Next Meeting: {cb.nextMeeting}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-400">{cb.rate.toFixed(2)}%</span>
                      <span className="block text-[10px] text-slate-400">{cb.bias}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-400" />
                Macro Currency Pair Biases
              </h3>
              <div className="space-y-2 text-xs">
                {currencyBiases.map((bias) => (
                  <div
                    key={bias.pair}
                    className="p-2.5 rounded bg-slate-950 border border-slate-800"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-white text-sm">{bias.pair}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          bias.rating.includes('BULLISH')
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {bias.rating}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">{bias.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
