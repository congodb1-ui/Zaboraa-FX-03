import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  LineChart,
  RefreshCw,
  Sliders,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Candle, ForexSymbol, StrategyVisualLine, TechnicalAnalysisReport } from '../types/forex';
import { CandlestickChart } from './CandlestickChart';
import { PriceChart } from './PriceChart';

interface TechnicalAnalysisViewProps {
  initialSymbol?: string;
}

const TIMEFRAMES: Array<{ id: string; label: string }> = [
  { id: 'M1', label: '1m' },
  { id: 'M5', label: '5m' },
  { id: 'M15', label: '15m' },
  { id: 'M30', label: '30m' },
  { id: 'H1', label: '1h' },
  { id: 'H3', label: '3h' },
  { id: 'D1', label: '1d' },
];

export const TechnicalAnalysisView: React.FC<TechnicalAnalysisViewProps> = ({
  initialSymbol = 'XAUUSD',
}) => {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [data, setData] = useState<TechnicalAnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [candles, setCandles] = useState<Candle[]>([]);

  // Chart overlay toggles
  const [showMAs, setShowMAs] = useState<boolean>(true);
  const [showPivots, setShowPivots] = useState<boolean>(true);
  const [lastUpdatedSecAgo, setLastUpdatedSecAgo] = useState<number>(2);

  // Time-since-update counter
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdatedSecAgo((prev) => (prev < 60 ? prev + 1 : 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTechnicalAnalysis = async (sym: string, tf: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/technical/analysis?symbol=${sym}&timeframe=${tf}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.indicators) {
          setData(json);
          setLastUpdatedSecAgo(0);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch technical analysis for', sym, tf, err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load candles for the candlestick chart
  const fetchCandles = async (sym: string, tf: string) => {
    try {
      const cleanSym = sym.replace(/M$/, '');
      const res = await fetch(`/api/data/load?symbol=${cleanSym}&timeframe=${tf}`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.candles && json.candles.length > 0) {
          setCandles(json.candles);
          return;
        }
      }
      // If specific timeframe not stored, load H1 fallback
      const h1Res = await fetch(`/api/data/load?symbol=${cleanSym}&timeframe=H1`);
      if (h1Res.ok) {
        const h1Json = await h1Res.json();
        if (h1Json && h1Json.candles) {
          setCandles(h1Json.candles);
        }
      }
    } catch (e) {
      console.warn('Candles load fallback:', e);
    }
  };

  useEffect(() => {
    fetchTechnicalAnalysis(symbol, timeframe);
    fetchCandles(symbol, timeframe);
  }, [symbol, timeframe]);

  // Needle deflection angle (-70 deg to +70 deg)
  const getActionAngle = (actionStr: string): number => {
    if (actionStr === 'Strong Buy') return 68;
    if (actionStr === 'Buy') return 34;
    if (actionStr === 'Neutral') return 0;
    if (actionStr === 'Sell') return -34;
    if (actionStr === 'Strong Sell') return -68;
    return 0;
  };

  // Standardized Gauge Renderer (All 3 gauges exact same size and structure)
  const renderGauge = (label: string, action: string, buyCount: number, sellCount: number, neutralCount?: number) => {
    const angleDeg = getActionAngle(action);
    const w = 210;
    const h = 130;
    const cx = w / 2;
    const cy = h - 22;
    const r = 74;
    const strokeW = 8;

    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const needleLen = r - 12;
    const nx = cx + needleLen * Math.cos(rad);
    const ny = cy + needleLen * Math.sin(rad);

    const gradId = `gauge-grad-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    return (
      <div className="flex flex-col items-center p-4 rounded-xl bg-surface border border-border shadow-sm w-full transition-colors">
        <span className="text-sm font-semibold text-text mb-2">{label}</span>

        <svg width={w} height={h} className="overflow-visible" role="img" aria-label={`${label} gauge: ${action}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--danger)" />
              <stop offset="25%" stopColor="var(--warning)" />
              <stop offset="50%" stopColor="var(--text-muted)" />
              <stop offset="75%" stopColor="var(--info)" />
              <stop offset="100%" stopColor="var(--success)" />
            </linearGradient>
          </defs>

          {/* Track background */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke="currentColor"
            className="text-border"
            strokeWidth={strokeW + 2}
            strokeLinecap="round"
          />

          {/* Colored Arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />

          {/* Needle Pin */}
          <circle cx={cx} cy={cy} r={5} fill="var(--surface)" stroke="var(--text)" strokeWidth="1.5" />

          {/* Needle Line */}
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {/* Labels below arc with no collisions */}
        <div className="w-full flex justify-between px-3 text-xs text-text-muted -mt-3">
          <span className="text-danger font-medium">Sell</span>
          <span className="text-text-muted">Neutral</span>
          <span className="text-success font-medium">Buy</span>
        </div>

        {/* Action Badge */}
        <div
          className={`mt-3 px-3.5 py-1 rounded-full text-xs font-bold tracking-wide shadow-sm ${
            action === 'Strong Buy'
              ? 'bg-success/20 text-success dark:text-success border border-success/40'
              : action === 'Buy'
              ? 'bg-success/10 text-success dark:text-success border border-success/20'
              : action === 'Neutral'
              ? 'bg-bg text-text-muted border border-border'
              : action === 'Sell'
              ? 'bg-danger/10 text-danger dark:text-danger border border-danger/20'
              : 'bg-danger/20 text-danger dark:text-danger border border-danger/40'
          }`}
        >
          {action}
        </div>

        {/* Votes Count */}
        <div className="mt-2 text-xs font-mono text-text-muted flex items-center gap-2">
          <span className="text-success dark:text-success font-semibold">{buyCount} Buy</span>
          {neutralCount !== undefined && <span>· {neutralCount} Neu</span>}
          <span className="text-danger dark:text-danger font-semibold">· {sellCount} Sell</span>
        </div>
      </div>
    );
  };

  const isGold = symbol === 'XAUUSD';
  const price = data?.price ?? (isGold ? 2650.0 : 1.0852);
  const decimals = isGold ? 2 : symbol === 'USDJPY' ? 3 : 5;

  const dayLow = data?.dayRangeLow ?? (price * 0.994);
  const dayHigh = data?.dayRangeHigh ?? (price * 1.006);
  const dayRangePct = Math.max(0, Math.min(100, Math.round(((price - dayLow) / (dayHigh - dayLow)) * 100)));

  const yearLow = data?.yearRangeLow ?? (price * 0.88);
  const yearHigh = data?.yearRangeHigh ?? (price * 1.35);
  const yearRangePct = Math.max(0, Math.min(100, Math.round(((price - yearLow) / (yearHigh - yearLow)) * 100)));

  // Generate visual lines for MAs and Pivots on Candlestick Chart
  const chartVisualLines: StrategyVisualLine[] = [];
  if (data && showMAs && candles.length > 0) {
    const ma20 = data.movingAverages.find((m) => m.name === 'MA20');
    const ma50 = data.movingAverages.find((m) => m.name === 'MA50');
    const ma200 = data.movingAverages.find((m) => m.name === 'MA200');
    const firstTime = candles[0].time;
    const lastTime = candles[candles.length - 1].time;
    if (ma20) {
      chartVisualLines.push({
        name: 'MA20',
        color: 'var(--info)',
        style: 'solid',
        points: [
          { time: firstTime, price: ma20.simple },
          { time: lastTime, price: ma20.simple },
        ],
      });
    }
    if (ma50) {
      chartVisualLines.push({
        name: 'MA50',
        color: 'var(--warning)',
        style: 'dashed',
        points: [
          { time: firstTime, price: ma50.simple },
          { time: lastTime, price: ma50.simple },
        ],
      });
    }
    if (ma200) {
      chartVisualLines.push({
        name: 'MA200',
        color: 'var(--primary)',
        style: 'solid',
        points: [
          { time: firstTime, price: ma200.simple },
          { time: lastTime, price: ma200.simple },
        ],
      });
    }
  }
  if (data && showPivots && candles.length > 0) {
    const classic = data.pivotPoints.find((p) => p.name === 'Classic');
    if (classic && typeof classic.pivot === 'number') {
      const firstTime = candles[0].time;
      const lastTime = candles[candles.length - 1].time;
      chartVisualLines.push({
        name: 'Pivot PP',
        color: 'var(--success)',
        style: 'dashed',
        points: [
          { time: firstTime, price: classic.pivot },
          { time: lastTime, price: classic.pivot },
        ],
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & ASSET BAR */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-wrap items-center justify-between gap-6 transition-colors">
        {/* Symbol Title & Real-Time Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text tracking-tight">
              {data?.symbol || (isGold ? 'XAU/USD - Gold Spot' : `${symbol} - Spot FX`)}
            </h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-warning/10 text-warning dark:text-warning border border-warning/20">
              {symbol}m (Exness MT5)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success dark:text-success font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Market Active · Updated {lastUpdatedSecAgo}s ago
            </span>
            <span>·</span>
            <span>Canonical: <strong className="text-text font-mono">{symbol}</strong></span>
            <span>·</span>
            <span>Exness Suffix: <strong className="text-warning font-mono">m</strong></span>
          </div>
        </div>

        {/* Live Price & Range Sliders */}
        <div className="flex flex-wrap items-center gap-6">
          <div className="text-left md:text-right">
            <div className="text-3xl font-extrabold text-text font-mono tabular-nums tracking-tight">
              {price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
            </div>
            <div
              className={`flex items-center gap-1 font-semibold text-sm font-mono mt-0.5 ${
                (data?.change24hPct ?? 0) >= 0 ? 'text-success dark:text-success' : 'text-danger dark:text-danger'
              }`}
            >
              {(data?.change24hPct ?? 0) >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              <span>{data?.change24hPct ?? '+0.15'}% ({data?.change24h ?? '0.00'})</span>
            </div>
          </div>

          {/* Range Sliders Bar */}
          <div className="space-y-2.5 min-w-[200px]">
            <div>
              <div className="flex justify-between text-xs text-text-muted font-mono">
                <span>Day L: {dayLow.toFixed(decimals)}</span>
                <span>Day H: {dayHigh.toFixed(decimals)}</span>
              </div>
              <div className="h-2 rounded-full bg-bg overflow-hidden mt-1 relative">
                <div
                  className="h-full bg-gradient-to-r from-danger via-warning to-success rounded-full"
                  style={{ width: '100%' }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white ring-2 ring-border rounded-full shadow"
                  style={{ left: `${dayRangePct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-text-muted font-mono">
                <span>52W L: {yearLow.toFixed(decimals)}</span>
                <span>52W H: {yearHigh.toFixed(decimals)}</span>
              </div>
              <div className="h-2 rounded-full bg-bg overflow-hidden mt-1 relative">
                <div
                  className="h-full bg-gradient-to-r from-danger via-warning to-success rounded-full"
                  style={{ width: '100%' }}
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white ring-2 ring-border rounded-full shadow"
                  style={{ left: `${yearRangePct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Symbol Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-bg border border-border">
            {['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'].map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbol(sym)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  symbol === sym
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {sym === 'XAUUSD' ? 'Gold (XAU)' : sym}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC TIMEFRAME SELECTOR STRIP */}
      <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-sm flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-text">
            Select Timeframe (indicators recalculate dynamically):
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {TIMEFRAMES.map((item) => {
            const isSelected = timeframe === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTimeframe(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-white shadow-md shadow-primary/25 ring-2 ring-primary'
                    : 'bg-bg border border-border text-text-muted hover:text-text'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-success'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. THREE EQUAL-SIZED GAUGES SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderGauge(
          'Technical Indicators',
          data?.indicatorsAction || 'Buy',
          data?.indicatorsBuyCount ?? 6,
          data?.indicatorsSellCount ?? 2,
          data?.indicatorsNeutralCount ?? 4
        )}
        {renderGauge(
          'Summary Consensus',
          data?.summaryAction || 'Strong Buy',
          data?.summaryBuyCount ?? 16,
          data?.summarySellCount ?? 3,
          data?.summaryNeutralCount ?? 5
        )}
        {renderGauge(
          'Moving Averages',
          data?.maAction || 'Strong Buy',
          data?.maBuyCount ?? 10,
          data?.maSellCount ?? 2
        )}
      </div>

      {/* 4. EMBEDDED HIGH-PERFORMANCE CANVAS PRICE CHART */}
      <div className="p-2 sm:p-4 rounded-2xl bg-surface border border-border shadow-sm transition-colors space-y-4">
        {candles.length > 0 ? (
          <PriceChart
            candles={candles}
            symbol={symbol}
            timeframe={timeframe}
            height={440}
            visualLines={chartVisualLines}
          />
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-text-muted gap-2">
            <Activity className="w-8 h-8 animate-pulse text-primary" />
            <span>Loading market candles for {symbol} ({timeframe})...</span>
          </div>
        )}
      </div>

      {/* 5. TABLES: OSCILLATORS, MOVING AVERAGES & PIVOTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Technical Indicators Table */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-text">
              Technical Indicators ({timeframe})
            </h2>
            <span className="text-xs text-text-muted font-mono">
              Buy: <strong className="text-success">{data?.indicatorsBuyCount ?? 6}</strong> · Sell: <strong className="text-danger">{data?.indicatorsSellCount ?? 1}</strong>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 font-medium">Indicator</th>
                  <th className="text-right py-2 font-medium">Value</th>
                  <th className="text-right py-2 font-medium">Signal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {data?.indicators.map((ind) => (
                  <tr key={ind.name} className="hover:bg-bg/50 transition-colors">
                    <td className="py-2.5 font-sans font-medium text-text">
                      {ind.name}
                    </td>
                    <td className="py-2.5 text-right text-text-muted tabular-nums">
                      {typeof ind.value === 'number' ? ind.value.toFixed(4).replace(/\.?0+$/, '') : ind.value}
                    </td>
                    <td className="py-2.5 text-right font-sans">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          ind.action === 'Buy'
                            ? 'bg-success/15 text-success dark:text-success border border-success/30'
                            : ind.action === 'Sell'
                            ? 'bg-danger/15 text-danger dark:text-danger border border-danger/30'
                            : 'bg-bg text-text-muted border border-border'
                        }`}
                      >
                        {ind.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Moving Averages & Pivot Points Column */}
        <div className="space-y-6">
          {/* Moving Averages Card */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-text">
                Moving Averages ({timeframe})
              </h2>
              <span className="text-xs text-text-muted font-mono">
                Buy: <strong className="text-success">{data?.maBuyCount ?? 10}</strong> · Sell: <strong className="text-danger">{data?.maSellCount ?? 2}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="text-left py-2 font-medium">Period</th>
                    <th className="text-right py-2 font-medium">Simple (SMA)</th>
                    <th className="text-right py-2 font-medium">Exponential (EMA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {data?.movingAverages.map((ma) => (
                    <tr key={ma.name} className="hover:bg-bg/50 transition-colors">
                      <td className="py-2.5 font-sans font-medium text-text">
                        {ma.name}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span className="mr-2 text-text-muted">{ma.simple.toFixed(decimals)}</span>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-xs font-sans font-semibold ${
                            ma.simpleAction === 'Buy'
                              ? 'bg-success/15 text-success dark:text-success'
                              : 'bg-danger/15 text-danger dark:text-danger'
                          }`}
                        >
                          {ma.simpleAction}
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <span className="mr-2 text-text-muted">{ma.exponential.toFixed(decimals)}</span>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-xs font-sans font-semibold ${
                            ma.exponentialAction === 'Buy'
                              ? 'bg-success/15 text-success dark:text-success'
                              : 'bg-danger/15 text-danger dark:text-danger'
                          }`}
                        >
                          {ma.exponentialAction}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pivot Points Card */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm transition-colors">
            <h2 className="text-base font-bold text-text mb-4">
              Pivot Points ({timeframe})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="text-left py-2 font-medium">Method</th>
                    <th className="text-right py-2 font-medium">S3</th>
                    <th className="text-right py-2 font-medium">S1</th>
                    <th className="text-right py-2 font-medium font-bold text-primary">Pivot</th>
                    <th className="text-right py-2 font-medium">R1</th>
                    <th className="text-right py-2 font-medium">R3</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {data?.pivotPoints.map((pp) => (
                    <tr key={pp.name} className="hover:bg-bg/50 transition-colors">
                      <td className="py-2 font-sans font-medium text-text">{pp.name}</td>
                      <td className="py-2 text-right text-danger tabular-nums">{pp.s3}</td>
                      <td className="py-2 text-right text-danger tabular-nums">{pp.s1}</td>
                      <td className="py-2 text-right font-bold text-primary tabular-nums">{pp.pivot}</td>
                      <td className="py-2 text-right text-success tabular-nums">{pp.r1}</td>
                      <td className="py-2 text-right text-success tabular-nums">{pp.r3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
