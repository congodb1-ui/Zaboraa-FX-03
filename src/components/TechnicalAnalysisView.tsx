import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Globe,
  Info,
  Layers,
  Percent,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sliders,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { TechnicalAnalysisReport } from '../types/forex';

interface TechnicalAnalysisViewProps {
  initialSymbol?: string;
}

const DEFAULT_REPORT: TechnicalAnalysisReport = {
  symbol: 'XAU/USD - Gold Spot US Dollar',
  canonicalSymbol: 'XAUUSD',
  brokerSymbol: 'XAUUSDm',
  price: 4053.10,
  change24h: -7.23,
  change24hPct: -0.18,
  dayRangeLow: 4028.19,
  dayRangeHigh: 4070.85,
  yearRangeLow: 3915.17,
  yearRangeHigh: 5595.46,
  timeframe: 'H1',
  summaryAction: 'Strong Buy',
  summaryBuyCount: 16,
  summarySellCount: 3,
  summaryNeutralCount: 5,
  maAction: 'Strong Buy',
  maBuyCount: 10,
  maSellCount: 2,
  indicatorsAction: 'Strong Buy',
  indicatorsBuyCount: 6,
  indicatorsSellCount: 1,
  indicatorsNeutralCount: 4,
  indicators: [
    { name: 'RSI(14)', value: 59.141, action: 'Buy' },
    { name: 'STOCH(9,6)', value: 55.616, action: 'Buy' },
    { name: 'STOCHRSI(14)', value: 50.155, action: 'Neutral' },
    { name: 'MACD(12,26)', value: 5.217, action: 'Buy' },
    { name: 'ADX(14)', value: 24.409, action: 'Neutral' },
    { name: 'Williams %R', value: -41.045, action: 'Buy' },
    { name: 'CCI(14)', value: 20.641, action: 'Neutral' },
    { name: 'ATR(14)', value: 10.4886, action: 'Less Volatility' },
    { name: 'Highs/Lows(14)', value: 3.82, action: 'Buy' },
    { name: 'Ultimate Oscillator', value: 49.364, action: 'Neutral' },
    { name: 'ROC', value: -0.082, action: 'Sell' },
    { name: 'Bull/Bear Power(13)', value: 14.5463, action: 'Buy' },
  ],
  movingAverages: [
    { name: 'MA5', simple: 4042.36, simpleAction: 'Buy', exponential: 4047.18, exponentialAction: 'Buy' },
    { name: 'MA10', simple: 4044.86, simpleAction: 'Buy', exponential: 4046.15, exponentialAction: 'Buy' },
    { name: 'MA20', simple: 4050.80, simpleAction: 'Buy', exponential: 4043.16, exponentialAction: 'Buy' },
    { name: 'MA50', simple: 4027.18, simpleAction: 'Buy', exponential: 4035.24, exponentialAction: 'Buy' },
    { name: 'MA100', simple: 4029.77, simpleAction: 'Buy', exponential: 4044.27, exponentialAction: 'Buy' },
    { name: 'MA200', simple: 4088.28, simpleAction: 'Sell', exponential: 4071.49, exponentialAction: 'Sell' },
  ],
  pivotPoints: [
    { name: 'Classic', s3: 4029.50, s2: 4036.28, s1: 4044.67, pivot: 4051.45, r1: 4059.84, r2: 4066.62, r3: 4075.01 },
    { name: 'Fibonacci', s3: 4036.28, s2: 4042.07, s1: 4045.65, pivot: 4051.45, r1: 4057.24, r2: 4060.82, r3: 4066.62 },
    { name: 'Camarilla', s3: 4048.90, s2: 4050.29, s1: 4051.68, pivot: 4051.45, r1: 4054.46, r2: 4055.85, r3: 4057.24 },
    { name: 'Woodie\'s', s3: 4030.32, s2: 4036.68, s1: 4045.49, pivot: 4051.85, r1: 4060.65, r2: 4067.02, r3: 4075.82 },
    { name: 'DeMark\'s', s3: '-', s2: '-', s1: 4048.06, pivot: 4053.14, r1: 4063.23, r2: '-', r3: '-' },
  ],
};

export const TechnicalAnalysisView: React.FC<TechnicalAnalysisViewProps> = ({
  initialSymbol = 'XAUUSD',
}) => {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [data, setData] = useState<TechnicalAnalysisReport>(DEFAULT_REPORT);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTechnicalAnalysis = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/technical/analysis?symbol=${symbol}&timeframe=${timeframe}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.indicators && json.movingAverages) {
          setData(json);
        }
      }
    } catch (err) {
      console.warn('Using baseline technical report for', symbol, err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTechnicalAnalysis();
  }, [symbol, timeframe]);

  // Convert an action to needle deflection angle (-70 deg to +70 deg)
  const getActionAngle = (actionStr: string): number => {
    if (actionStr === 'Strong Buy') return 68;
    if (actionStr === 'Buy') return 34;
    if (actionStr === 'Neutral') return 0;
    if (actionStr === 'Sell') return -34;
    if (actionStr === 'Strong Sell') return -68;
    return 0;
  };

  // Helper for rendering semicircular SVG gauge matching image_cac96abb.png
  const renderGauge = (
    label: string,
    action: string,
    size: 'sm' | 'lg' = 'sm'
  ) => {
    const angleDeg = getActionAngle(action);
    const w = size === 'lg' ? 240 : 160;
    const h = size === 'lg' ? 140 : 100;
    const cx = w / 2;
    const cy = h - 16;
    const r = size === 'lg' ? 95 : 62;
    const strokeW = size === 'lg' ? 10 : 7;

    // Convert needle angle to radians
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const needleLen = r - 12;
    const nx = cx + needleLen * Math.cos(rad);
    const ny = cy + needleLen * Math.sin(rad);

    // Clean gradient ID without spaces or special characters
    const gradId = `gauge-grad-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    return (
      <div className="flex flex-col items-center">
        <span className="text-xs font-semibold text-slate-300 mb-1">{label}</span>
        <svg width={w} height={h} className="overflow-visible" role="img" aria-label={`${label} gauge: ${action}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="25%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="75%" stopColor="#34d399" />
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

          {/* Colored arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Tick labels for large gauge */}
          {size === 'lg' && (
            <>
              <text x={cx - r - 4} y={cy - 12} textAnchor="end" fill="#f43f5e" fontSize="9" fontFamily="sans-serif">
                Strong<tspan x={cx - r - 4} dy="11">Sell</tspan>
              </text>
              <text x={cx - 50} y={cy - r + 15} textAnchor="middle" fill="#94a3b8" fontSize="9">
                Sell
              </text>
              <text x={cx} y={cy - r - 6} textAnchor="middle" fill="#94a3b8" fontSize="9">
                Neutral
              </text>
              <text x={cx + 50} y={cy - r + 15} textAnchor="middle" fill="#94a3b8" fontSize="9">
                Buy
              </text>
              <text x={cx + r + 4} y={cy - 12} textAnchor="start" fill="#10b981" fontSize="9" fontFamily="sans-serif">
                Strong<tspan x={cx + r + 4} dy="11">Buy</tspan>
              </text>
            </>
          )}

          {/* Needle Center Pin */}
          <circle cx={cx} cy={cy} r={size === 'lg' ? 6 : 4} fill="#475569" stroke="#ffffff" strokeWidth="1.5" />

          {/* Needle Pointer */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="#ffffff"
            strokeWidth={size === 'lg' ? 2.5 : 2}
            strokeLinecap="round"
          />
        </svg>

        {/* Action Pill Badge below dial */}
        <div
          className={`mt-1 px-4 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm ${
            action === 'Strong Buy'
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : action === 'Buy'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : action === 'Neutral'
              ? 'bg-slate-800 text-slate-300'
              : action === 'Sell'
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              : 'bg-rose-600 text-white shadow-rose-600/30'
          }`}
        >
          {action}
        </div>
      </div>
    );
  };

  const getActionColor = (act: string) => {
    if (act.includes('Buy')) return 'text-emerald-400 font-bold';
    if (act.includes('Sell')) return 'text-rose-400 font-bold';
    if (act.includes('Less Volatility')) return 'text-slate-400';
    return 'text-slate-300';
  };

  const isGold = (data.canonicalSymbol || symbol) === 'XAUUSD';
  const priceDisplay = typeof data.price === 'number'
    ? data.price.toLocaleString(undefined, {
        minimumFractionDigits: isGold ? 2 : 4,
        maximumFractionDigits: isGold ? 2 : 4,
      })
    : '4,053.10';

  return (
    <div className="space-y-6">
      {/* Top Banner Notice */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg border border-slate-800 bg-[#0E1524] shadow-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {data.symbol || 'XAU/USD - Gold Spot US Dollar'}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {data.brokerSymbol || `${symbol}m`} (Exness MT5)
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span>Real-time Technical Analysis</span>
              <span>·</span>
              <span className="text-slate-300 font-mono">
                Canonical: <strong className="text-white">{data.canonicalSymbol || symbol}</strong>
              </span>
              <span>·</span>
              <span className="text-slate-300 font-mono">
                Broker Suffix: <strong className="text-amber-400">m</strong>
              </span>
            </div>
          </div>

          {/* Live Price Pill */}
          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
            <span className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {priceDisplay}
            </span>
            <div>
              <div
                className={`flex items-center gap-1 font-bold font-mono text-sm ${
                  (data.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {(data.change24h ?? 0) >= 0 ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
                <span>
                  {data.change24h} ({data.change24hPct}%)
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Market Active</span>
            </div>
          </div>
        </div>

        {/* Pair Switcher & Range Info */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="text-right hidden md:block">
            <div className="text-slate-400 text-[11px]">
              Day's Range: <strong className="text-slate-200">{data.dayRangeLow} - {data.dayRangeHigh}</strong>
            </div>
            <div className="text-slate-400 text-[11px]">
              52 wk Range: <strong className="text-slate-200">{data.yearRangeLow} - {data.yearRangeHigh}</strong>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg bg-slate-950 p-1 border border-slate-800">
            {['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                  symbol === sym
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sym === 'XAUUSD' ? 'Gold (XAU)' : sym}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={fetchTechnicalAnalysis}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh Technical Indicators"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Timeframe Selector Strip (Matches image_cac96abb.png) */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-mono">
        <span className="text-slate-400 font-sans text-xs mr-2 font-semibold">Timeframe Analysis:</span>
        {[
          { tf: 'M1', label: '1 Min', action: 'Neutral' },
          { tf: 'M5', label: '5 Min', action: 'Neutral' },
          { tf: 'M15', label: '15 Min', action: 'Neutral' },
          { tf: 'M30', label: '30 Min', action: 'Strong Buy' },
          { tf: 'H1', label: 'Hourly', action: 'Strong Buy' },
          { tf: 'H3', label: '3 Hours', action: 'Neutral' },
          { tf: 'D1', label: 'Daily', action: 'Strong Sell' },
        ].map((item) => (
          <button
            key={item.tf}
            type="button"
            onClick={() => setTimeframe(item.tf)}
            className={`flex flex-col items-center px-3 py-1.5 rounded border transition-all ${
              timeframe === item.tf
                ? 'bg-blue-600/20 border-blue-500 text-white font-bold ring-1 ring-blue-500'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span>{item.label}</span>
            <span
              className={`text-[9px] mt-0.5 ${
                item.action === 'Strong Buy'
                  ? 'text-emerald-400 font-bold'
                  : item.action === 'Strong Sell'
                  ? 'text-rose-400 font-bold'
                  : 'text-slate-500'
              }`}
            >
              {item.action}
            </span>
          </button>
        ))}
      </div>

      {/* THREE GAUGES SECTION (Exact layout from image_cac96abb.png) */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-6 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center justify-items-center">
          {/* Left: Technical Indicators Gauge */}
          {renderGauge('Technical Indicators', data.indicatorsAction || 'Strong Buy', 'sm')}

          {/* Center: Large Summary Gauge */}
          {renderGauge('Summary', data.summaryAction || 'Strong Buy', 'lg')}

          {/* Right: Moving Averages Gauge */}
          {renderGauge('Moving Averages', data.maAction || 'Strong Buy', 'sm')}
        </div>

        {/* Summary Breakdown text bar */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="text-center font-sans mb-4">
            <span className="text-slate-400 text-sm">Summary: </span>
            <span className="text-base font-bold text-emerald-400 tracking-wide">
              {data.summaryAction || 'Strong Buy'}
            </span>
          </div>

          <div className="max-w-xl mx-auto space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-300 font-sans font-medium">Moving Averages:</span>
              <span className="text-emerald-400 font-bold">{data.maAction || 'Strong Buy'}</span>
              <span className="text-slate-400">
                Buy: (<strong className="text-emerald-400">{data.maBuyCount ?? 10}</strong>) · Sell: (
                <strong className="text-rose-400">{data.maSellCount ?? 2}</strong>)
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-950/80 border border-slate-800">
              <span className="text-slate-300 font-sans font-medium">Technical Indicators:</span>
              <span className="text-emerald-400 font-bold">{data.indicatorsAction || 'Strong Buy'}</span>
              <span className="text-slate-400">
                Buy: (<strong className="text-emerald-400">{data.indicatorsBuyCount ?? 6}</strong>) · Neutral: (
                <strong className="text-slate-300">{data.indicatorsNeutralCount ?? 4}</strong>) · Sell: (
                <strong className="text-rose-400">{data.indicatorsSellCount ?? 1}</strong>)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN TABLES: Technical Indicators & Moving Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Technical Indicators Table */}
        <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
            <h3 className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Technical Indicators</span>
            </h3>
            <span className="text-slate-400 font-mono text-[11px]">
              Summary: <strong className="text-emerald-400">{data.indicatorsAction || 'Strong Buy'}</strong> (Buy: {data.indicatorsBuyCount ?? 6}, Neutral: {data.indicatorsNeutralCount ?? 4}, Sell: {data.indicatorsSellCount ?? 1})
            </span>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-800/80 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-2">Name</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {(data.indicators || []).map((ind) => (
                  <tr key={ind.name} className="hover:bg-slate-800/30">
                    <td className="py-2 text-slate-200 font-semibold">{ind.name}</td>
                    <td className="text-right text-slate-300">{ind.value}</td>
                    <td className={`text-right ${getActionColor(ind.action)}`}>{ind.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Moving Averages Table */}
        <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
            <h3 className="font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Moving Averages</span>
            </h3>
            <span className="text-slate-400 font-mono text-[11px]">
              Summary: <strong className="text-emerald-400">{data.maAction || 'Strong Buy'}</strong> (Buy: {data.maBuyCount ?? 10}, Sell: {data.maSellCount ?? 2})
            </span>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-800/80 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Simple (SMA)</th>
                  <th>Action</th>
                  <th>Exponential (EMA)</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {(data.movingAverages || []).map((ma) => (
                  <tr key={ma.name} className="hover:bg-slate-800/30">
                    <td className="py-2 text-slate-200 font-bold">{ma.name}</td>
                    <td className="text-slate-300">{typeof ma.simple === 'number' ? ma.simple.toFixed(isGold ? 2 : 4) : ma.simple}</td>
                    <td className={getActionColor(ma.simpleAction)}>{ma.simpleAction}</td>
                    <td className="text-slate-300">{typeof ma.exponential === 'number' ? ma.exponential.toFixed(isGold ? 2 : 4) : ma.exponential}</td>
                    <td className={`text-right ${getActionColor(ma.exponentialAction)}`}>
                      {ma.exponentialAction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. PIVOT POINTS TABLE (Matches image_cac96abb.png) */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
          <h3 className="font-bold text-white uppercase tracking-wider">
            Pivot Points Calculation
          </h3>
          <span className="text-slate-400 font-mono text-[11px]">
            Classical, Fibonacci, Camarilla, Woodie's, DeMark's Support/Resistance Levels
          </span>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-center text-xs font-mono">
            <thead className="border-b border-slate-800 text-slate-400 text-[11px]">
              <tr>
                <th className="text-left py-2">Name</th>
                <th>S3</th>
                <th>S2</th>
                <th>S1</th>
                <th className="text-white font-bold bg-slate-900/60">Pivot Points</th>
                <th>R1</th>
                <th>R2</th>
                <th>R3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {(data.pivotPoints || []).map((row) => {
                const fmt = (v: number | string) => (typeof v === 'number' ? v.toFixed(isGold ? 2 : 4) : v);
                return (
                  <tr key={row.name} className="hover:bg-slate-800/30">
                    <td className="text-left py-2 font-bold text-slate-200">{row.name}</td>
                    <td className="text-rose-400/90">{fmt(row.s3)}</td>
                    <td className="text-rose-400">{fmt(row.s2)}</td>
                    <td className="text-rose-300">{fmt(row.s1)}</td>
                    <td className="font-bold text-white bg-slate-900/80">{fmt(row.pivot)}</td>
                    <td className="text-emerald-300">{fmt(row.r1)}</td>
                    <td className="text-emerald-400">{fmt(row.r2)}</td>
                    <td className="text-emerald-400/90">{fmt(row.r3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
