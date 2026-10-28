import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Candle,
  StrategyVisualBlock,
  StrategyVisualLine,
  StrategyVisualMarker,
  TradeRecord,
} from '../types/forex';
import {
  Eye,
  Layers,
  TrendingUp,
  ShieldAlert,
  Target,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronsRight,
  MoveHorizontal,
  Calendar,
} from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
  trades?: TradeRecord[];
  symbol: string;
  timeframe: string;
  height?: number;
  visualBlocks?: StrategyVisualBlock[];
  visualLines?: StrategyVisualLine[];
  visualMarkers?: StrategyVisualMarker[];
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  trades = [],
  symbol,
  timeframe,
  height = 460,
  visualBlocks = [],
  visualLines = [],
  visualMarkers = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  // Default viewport: show newest 80 bars
  const defaultBarsCount = 80;
  const [viewRange, setViewRange] = useState<{ start: number; end: number }>(() => {
    const total = candles.length;
    return {
      start: Math.max(0, total - defaultBarsCount),
      end: Math.max(0, total - 1),
    };
  });

  // Track dragging state for mouse drag-to-pan
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef({ start: 0, end: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Hover states
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<StrategyVisualBlock | null>(null);
  const [hoveredTrade, setHoveredTrade] = useState<TradeRecord | null>(null);

  // Layer Visibility Toggles
  const [showPositionBoxes, setShowPositionBoxes] = useState<boolean>(true);
  const [showRanges, setShowRanges] = useState<boolean>(true);
  const [showTrendRibbon, setShowTrendRibbon] = useState<boolean>(true);
  const [showSweepMarkers, setShowSweepMarkers] = useState<boolean>(true);

  // Sync view range when dataset length changes significantly
  useEffect(() => {
    if (candles.length > 0) {
      setViewRange((prev) => {
        // If range was default or out of bounds, snap to end
        if (prev.end === 0 || prev.end >= candles.length || prev.start >= candles.length) {
          return {
            start: Math.max(0, candles.length - defaultBarsCount),
            end: Math.max(0, candles.length - 1),
          };
        }
        return prev;
      });
    }
  }, [candles.length]);

  // Total candles count
  const totalBars = candles.length;

  // Clamped view indices
  const clampedStart = Math.max(0, Math.min(totalBars - 10, viewRange.start));
  const clampedEnd = Math.min(totalBars - 1, Math.max(clampedStart + 9, viewRange.end));
  const visibleCandles = useMemo(() => {
    if (totalBars === 0) return [];
    return candles.slice(clampedStart, clampedEnd + 1);
  }, [candles, clampedStart, clampedEnd, totalBars]);

  // Dynamic Y-axis scale based on visible window
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (visibleCandles.length === 0) return { minPrice: 0, maxPrice: 1, priceRange: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    // Include visual blocks in current view bounds
    const startTime = visibleCandles[0].time;
    const endTime = visibleCandles[visibleCandles.length - 1].time;
    for (const b of visualBlocks) {
      if (b.endTime >= startTime && b.startTime <= endTime) {
        if (b.lowPrice < min) min = b.lowPrice;
        if (b.highPrice > max) max = b.highPrice;
      }
    }
    const padding = (max - min) * 0.08 || 0.001;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      priceRange: max - min + padding * 2 || 1,
    };
  }, [visibleCandles, visualBlocks]);

  // Non-passive wheel listener for smooth TradingView-style zoom & pan
  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (candles.length === 0) return;

      const rect = el.getBoundingClientRect();
      const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const cursorRatio = mouseX / rect.width;

      setViewRange((prev) => {
        const curCount = prev.end - prev.start + 1;

        // 1. Zooming with Vertical Wheel (deltaY)
        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && !e.shiftKey) {
          const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85; // deltaY > 0: zoom out, deltaY < 0: zoom in
          const newCount = Math.round(curCount * zoomFactor);
          const clampedCount = Math.max(12, Math.min(candles.length, newCount));

          const cursorIndex = prev.start + cursorRatio * curCount;
          let newStart = Math.round(cursorIndex - cursorRatio * clampedCount);
          let newEnd = newStart + clampedCount - 1;

          if (newStart < 0) {
            newStart = 0;
            newEnd = Math.min(candles.length - 1, clampedCount - 1);
          }
          if (newEnd >= candles.length) {
            newEnd = candles.length - 1;
            newStart = Math.max(0, candles.length - clampedCount);
          }

          return { start: newStart, end: newEnd };
        }

        // 2. Panning with Horizontal Wheel or Shift+Wheel (deltaX or shiftKey)
        const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const shiftBars = Math.round((scrollDelta / 16) * Math.max(1, Math.round(curCount / 60)));
        if (shiftBars === 0) return prev;

        let newStart = prev.start + shiftBars;
        let newEnd = prev.end + shiftBars;

        if (newStart < 0) {
          newEnd += -newStart;
          newStart = 0;
        }
        if (newEnd >= candles.length) {
          const overflow = newEnd - (candles.length - 1);
          newStart = Math.max(0, newStart - overflow);
          newEnd = candles.length - 1;
        }

        return { start: newStart, end: newEnd };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [candles.length]);

  // Mouse Drag Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = { ...viewRange };
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current || candles.length === 0) return;

      const deltaX = e.clientX - dragStartXRef.current;
      const count = dragStartRangeRef.current.end - dragStartRangeRef.current.start + 1;
      const containerWidth = chartWrapperRef.current?.clientWidth || 920;
      const slotWidth = containerWidth / count;

      // Dragging right (deltaX > 0) pans back in time (decreases index)
      const barsMoved = Math.round(deltaX / slotWidth);
      if (barsMoved === 0) return;

      let newStart = dragStartRangeRef.current.start - barsMoved;
      let newEnd = dragStartRangeRef.current.end - barsMoved;

      if (newStart < 0) {
        newEnd += -newStart;
        newStart = 0;
      }
      if (newEnd >= candles.length) {
        const overflow = newEnd - (candles.length - 1);
        newStart = Math.max(0, newStart - overflow);
        newEnd = candles.length - 1;
      }

      setViewRange({ start: newStart, end: newEnd });
    },
    [candles.length]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Quick navigation helpers
  const handleJumpToLatest = () => {
    if (candles.length === 0) return;
    const curCount = Math.max(30, viewRange.end - viewRange.start + 1);
    setViewRange({
      start: Math.max(0, candles.length - curCount),
      end: candles.length - 1,
    });
  };

  const handleFitAll = () => {
    if (candles.length === 0) return;
    setViewRange({
      start: 0,
      end: candles.length - 1,
    });
  };

  const handleZoomIn = () => {
    setViewRange((prev) => {
      const curCount = prev.end - prev.start + 1;
      const newCount = Math.max(15, Math.round(curCount * 0.7));
      const mid = Math.round((prev.start + prev.end) / 2);
      const newStart = Math.max(0, mid - Math.round(newCount / 2));
      const newEnd = Math.min(candles.length - 1, newStart + newCount - 1);
      return { start: newStart, end: newEnd };
    });
  };

  const handleZoomOut = () => {
    setViewRange((prev) => {
      const curCount = prev.end - prev.start + 1;
      const newCount = Math.min(candles.length, Math.round(curCount * 1.4));
      const mid = Math.round((prev.start + prev.end) / 2);
      let newStart = Math.max(0, mid - Math.round(newCount / 2));
      let newEnd = newStart + newCount - 1;
      if (newEnd >= candles.length) {
        newEnd = candles.length - 1;
        newStart = Math.max(0, candles.length - newCount);
      }
      return { start: newStart, end: newEnd };
    });
  };

  if (visibleCandles.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-[#0E1524] p-6 text-center shadow-xl"
      >
        <span className="text-sm font-medium text-slate-400">No Historical Market Bars Loaded</span>
        <span className="mt-1 text-xs text-slate-500">
          Load or download a dataset in the Data Manager to display live simulation candles and strategy visuals.
        </span>
      </div>
    );
  }

  const svgWidth = 920;
  const chartHeight = height - 90;
  const candleSlotWidth = svgWidth / visibleCandles.length;
  const candleBodyWidth = Math.max(2.0, candleSlotWidth * 0.7);

  const priceToY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  const timeToX = (time: number) => {
    const idx = visibleCandles.findIndex((c) => c.time >= time);
    if (idx === -1) {
      if (time < visibleCandles[0].time) return -50;
      return svgWidth + 50;
    }
    return idx * candleSlotWidth + candleSlotWidth / 2;
  };

  const precision = symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5;

  // Filter strategy visuals that intersect current viewport window
  const startTime = visibleCandles[0].time;
  const endTime = visibleCandles[visibleCandles.length - 1].time;

  const relevantBlocks = visualBlocks.filter(
    (b) => b.endTime >= startTime && b.startTime <= endTime
  );

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-slate-800 bg-[#0E1524] p-3 shadow-2xl select-none"
    >
      {/* Top Controls & Meta Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-100 font-mono text-sm">{symbol}</span>
            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-800 text-blue-400 font-bold border border-slate-700">
              {timeframe}
            </span>
            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-slate-900 text-slate-400 border border-slate-800">
              {visibleCandles.length} / {totalBars} bars
            </span>
          </div>

          {hoveredCandle ? (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300 bg-slate-950/70 px-2.5 py-1 rounded border border-slate-800">
              <span>O: <strong className="text-white">{hoveredCandle.open.toFixed(precision)}</strong></span>
              <span>H: <strong className="text-emerald-400">{hoveredCandle.high.toFixed(precision)}</strong></span>
              <span>L: <strong className="text-rose-400">{hoveredCandle.low.toFixed(precision)}</strong></span>
              <span>C: <strong className="text-white">{hoveredCandle.close.toFixed(precision)}</strong></span>
              <span>Vol: <strong className="text-slate-400">{hoveredCandle.tickVolume}</strong></span>
              <span>Spr: <strong className="text-blue-400">{hoveredCandle.spread}</strong></span>
            </div>
          ) : (
            <div className="text-slate-500 text-[11px] font-mono flex items-center gap-1.5">
              <MoveHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Scroll wheel to zoom · Drag horizontally to pan across 2-year history</span>
            </div>
          )}
        </div>

        {/* Visual Layer Toggles & Zoom Controls */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setShowPositionBoxes(!showPositionBoxes)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              showPositionBoxes
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <Target className="w-3 h-3" />
            <span>Position SL/TP</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRanges(!showRanges)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              showRanges
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Range Blocks</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTrendRibbon(!showTrendRibbon)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              showTrendRibbon
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>VWAP Ribbon</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSweepMarkers(!showSweepMarkers)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border transition-colors ${
              showSweepMarkers
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            <span>✕ Sweeps</span>
          </button>

          {/* Quick Zoom In/Out Buttons */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            <button
              type="button"
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitAll}
              title="Fit Entire History (2Y)"
              className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-blue-400 border border-slate-800 text-[10px] font-bold"
            >
              Fit All
            </button>
            <button
              type="button"
              onClick={handleJumpToLatest}
              title="Jump to Latest Candle"
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-sm"
            >
              <ChevronsRight className="w-3 h-3" />
              Latest
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Chart Wrapper with Drag cursor */}
      <div
        ref={chartWrapperRef}
        onMouseDown={handleMouseDown}
        className={`relative mt-2 overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {/* Floating Tooltip Card */}
        {(hoveredBlock || hoveredTrade) && (
          <div className="absolute top-3 left-4 z-20 pointer-events-none rounded-lg border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-2xl backdrop-blur-md font-mono text-slate-200 min-w-56">
            {hoveredBlock && hoveredBlock.type === 'POSITION_BOX' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800 font-bold">
                  <span className={hoveredBlock.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>
                    {hoveredBlock.label || (hoveredBlock.direction === 'LONG' ? 'LONG BREAKOUT' : 'SHORT BREAKDOWN')}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                    {hoveredBlock.direction}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Entry Price:</span>
                  <strong className="text-white">{hoveredBlock.entryPrice?.toFixed(precision)}</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Stop Loss (SL):</span>
                  <strong className="text-rose-400">{hoveredBlock.slPrice?.toFixed(precision)}</strong>
                </div>
                {hoveredBlock.tp1Price && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Take Profit 1:</span>
                    <strong className="text-emerald-400">{hoveredBlock.tp1Price.toFixed(precision)}</strong>
                  </div>
                )}
                {hoveredBlock.tp2Price && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Take Profit 2:</span>
                    <strong className="text-emerald-300">{hoveredBlock.tp2Price.toFixed(precision)}</strong>
                  </div>
                )}
                {hoveredBlock.tp3Price && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Take Profit 3:</span>
                    <strong className="text-emerald-200">{hoveredBlock.tp3Price.toFixed(precision)}</strong>
                  </div>
                )}
              </div>
            )}

            {hoveredBlock && hoveredBlock.type === 'CONSOLIDATION_RANGE' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800 font-bold text-rose-400">
                  <span>CONSOLIDATION RANGE</span>
                  <span className="text-[10px] text-slate-400">Order Block</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Range High:</span>
                  <strong className="text-rose-300">{hoveredBlock.highPrice.toFixed(precision)}</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Range Low:</span>
                  <strong className="text-emerald-300">{hoveredBlock.lowPrice.toFixed(precision)}</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Range Height:</span>
                  <strong className="text-slate-200">
                    {((hoveredBlock.highPrice - hoveredBlock.lowPrice) * (symbol === 'USDJPY' ? 100 : symbol === 'XAUUSD' ? 1 : 10000)).toFixed(1)} pips
                  </strong>
                </div>
              </div>
            )}

            {hoveredTrade && (
              <div className="space-y-1">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800 font-bold">
                  <span className={hoveredTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    Ticket #{hoveredTrade.ticket} ({hoveredTrade.side})
                  </span>
                  <span className={`text-[11px] font-bold ${hoveredTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {hoveredTrade.pnl >= 0 ? '+' : ''}${hoveredTrade.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">P&L Pips:</span>
                  <strong className={hoveredTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {hoveredTrade.pnlPips ? `${hoveredTrade.pnlPips >= 0 ? '+' : ''}${hoveredTrade.pnlPips} pips` : 'N/A'}
                  </strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">R:R Ratio:</span>
                  <strong className="text-blue-400">{hoveredTrade.riskRewardRatio || 2.0} R</strong>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Exit Reason:</span>
                  <strong className="text-slate-300">{hoveredTrade.exitReason}</strong>
                </div>
              </div>
            )}
          </div>
        )}

        <svg
          viewBox={`0 0 ${svgWidth} ${chartHeight}`}
          className="w-full overflow-visible"
          style={{ height: chartHeight }}
        >
          {/* Horizontal Price Grid Lines */}
          {[0.15, 0.35, 0.55, 0.75, 0.95].map((ratio) => {
            const y = chartHeight * ratio;
            const price = maxPrice - ratio * priceRange;
            return (
              <g key={ratio}>
                <line
                  x1={0}
                  y1={y}
                  x2={svgWidth}
                  y2={y}
                  stroke="#172033"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={svgWidth - 6}
                  y={y - 3}
                  textAnchor="end"
                  fill="#475569"
                  fontSize="10"
                  fontFamily="JetBrains Mono"
                >
                  {price.toFixed(precision)}
                </text>
              </g>
            );
          })}

          {/* 1. RENDER CONSOLIDATION RANGE BLOCKS */}
          {showRanges &&
            relevantBlocks
              .filter((b) => b.type === 'CONSOLIDATION_RANGE')
              .map((block) => {
                const x1 = Math.max(0, timeToX(block.startTime));
                const x2 = Math.min(svgWidth, timeToX(block.endTime));
                const width = Math.max(candleSlotWidth * 2.5, x2 - x1);
                const yTop = priceToY(block.highPrice);
                const yBottom = priceToY(block.lowPrice);
                const blockHeight = Math.max(3, yBottom - yTop);

                return (
                  <g
                    key={block.id}
                    onMouseEnter={() => setHoveredBlock(block)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                  >
                    <rect
                      x={x1}
                      y={yTop}
                      width={width}
                      height={blockHeight}
                      fill="rgba(225, 29, 72, 0.12)"
                      stroke="rgba(225, 29, 72, 0.4)"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                      rx="2"
                    />
                    <line x1={x1} y1={yTop} x2={x1 + width} y2={yTop} stroke="#fb7185" strokeWidth="1.2" />
                    <line x1={x1} y1={yBottom} x2={x1 + width} y2={yBottom} stroke="#fb7185" strokeWidth="1.2" />
                    <text x={x1 + 6} y={yTop + 12} fill="#fda4af" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                      RANGE CONSOLIDATION
                    </text>
                  </g>
                );
              })}

          {/* 2. RENDER TRADINGVIEW POSITION SL/TP BOXES */}
          {showPositionBoxes &&
            relevantBlocks
              .filter((b) => b.type === 'POSITION_BOX')
              .map((pos) => {
                const x1 = Math.max(0, timeToX(pos.startTime));
                const x2 = Math.min(svgWidth, timeToX(pos.endTime || visibleCandles[visibleCandles.length - 1].time));
                const width = Math.max(candleSlotWidth * 3.5, x2 - x1);

                const entryY = priceToY(pos.entryPrice || 0);
                const slY = pos.slPrice ? priceToY(pos.slPrice) : entryY + 25;
                const tp1Y = pos.tp1Price ? priceToY(pos.tp1Price) : entryY - 35;
                const tp2Y = pos.tp2Price ? priceToY(pos.tp2Price) : null;
                const tp3Y = pos.tp3Price ? priceToY(pos.tp3Price) : null;

                const isLong = pos.direction === 'LONG';

                const riskTop = Math.min(entryY, slY);
                const riskHeight = Math.max(2, Math.abs(slY - entryY));

                const maxTpY = tp3Y ?? tp2Y ?? tp1Y;
                const rewardTop = Math.min(entryY, maxTpY);
                const rewardHeight = Math.max(2, Math.abs(maxTpY - entryY));

                return (
                  <g
                    key={pos.id}
                    onMouseEnter={() => setHoveredBlock(pos)}
                    onMouseLeave={() => setHoveredBlock(null)}
                    className="cursor-pointer transition-opacity hover:opacity-95"
                  >
                    {/* Red Risk Shading */}
                    <rect
                      x={x1}
                      y={riskTop}
                      width={width}
                      height={riskHeight}
                      fill="rgba(244, 63, 94, 0.16)"
                      stroke="rgba(244, 63, 94, 0.45)"
                      strokeWidth="1"
                    />

                    {/* Green Reward Shading */}
                    <rect
                      x={x1}
                      y={rewardTop}
                      width={width}
                      height={rewardHeight}
                      fill="rgba(16, 185, 129, 0.16)"
                      stroke="rgba(16, 185, 129, 0.45)"
                      strokeWidth="1"
                    />

                    {/* SL Line & Label */}
                    <line x1={x1} y1={slY} x2={x1 + width} y2={slY} stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="4 3" />
                    <text x={x1 + width - 4} y={slY - 3} textAnchor="end" fill="#f43f5e" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                      SL {pos.slPrice?.toFixed(precision)}
                    </text>

                    {/* TP1 Line & Label */}
                    <line x1={x1} y1={tp1Y} x2={x1 + width} y2={tp1Y} stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" />
                    <text x={x1 + width - 4} y={tp1Y - 3} textAnchor="end" fill="#10b981" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                      TP1 {pos.tp1Price?.toFixed(precision)}
                    </text>

                    {/* TP2 Line & Label */}
                    {tp2Y !== null && (
                      <>
                        <line x1={x1} y1={tp2Y} x2={x1 + width} y2={tp2Y} stroke="#34d399" strokeWidth="1" strokeDasharray="3 3" />
                        <text x={x1 + width - 4} y={tp2Y - 3} textAnchor="end" fill="#34d399" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                          TP2 {pos.tp2Price?.toFixed(precision)}
                        </text>
                      </>
                    )}

                    {/* TP3 Line & Label */}
                    {tp3Y !== null && (
                      <>
                        <line x1={x1} y1={tp3Y} x2={x1 + width} y2={tp3Y} stroke="#6ee7b7" strokeWidth="1" strokeDasharray="3 3" />
                        <text x={x1 + width - 4} y={tp3Y - 3} textAnchor="end" fill="#6ee7b7" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                          TP3 {pos.tp3Price?.toFixed(precision)}
                        </text>
                      </>
                    )}

                    {/* White Solid Entry Line */}
                    <line x1={x1} y1={entryY} x2={x1 + width} y2={entryY} stroke="#ffffff" strokeWidth="1.5" />

                    {/* Entry Pill Badge */}
                    <g transform={`translate(${x1 + 6}, ${entryY - 9})`}>
                      <rect width={100} height={18} rx="9" fill={isLong ? '#065f46' : '#881337'} stroke={isLong ? '#34d399' : '#f43f5e'} strokeWidth="1" />
                      <text x={50} y={12} textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="JetBrains Mono">
                        {isLong ? 'BREAKOUT ↑' : 'BREAKDOWN ↓'}
                      </text>
                    </g>
                  </g>
                );
              })}

          {/* 3. DYNAMIC TREND RIBBON (VWAP Curve) */}
          {showTrendRibbon &&
            visualLines.map((vLine, lineIdx) => {
              const pts = vLine.points.filter((p) => p.time >= startTime && p.time <= endTime);
              if (pts.length < 2) return null;

              return (
                <g key={vLine.name + '-' + lineIdx}>
                  {pts.map((p, idx) => {
                    if (idx === 0) return null;
                    const prevP = pts[idx - 1];
                    const xA = timeToX(prevP.time);
                    const yA = priceToY(prevP.price);
                    const xB = timeToX(p.time);
                    const yB = priceToY(p.price);

                    return (
                      <line
                        key={p.time + '-' + idx}
                        x1={xA}
                        y1={yA}
                        x2={xB}
                        y2={yB}
                        stroke={p.color || vLine.color || '#ec4899'}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* 4. CANDLESTICK BARS & WICKS */}
          {visibleCandles.map((c, idx) => {
            const xCenter = idx * candleSlotWidth + candleSlotWidth / 2;
            const isBullish = c.close >= c.open;
            const color = isBullish ? '#10b981' : '#f43f5e';
            const bodyTop = priceToY(Math.max(c.open, c.close));
            const bodyBottom = priceToY(Math.min(c.open, c.close));
            const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);

            const highY = priceToY(c.high);
            const lowY = priceToY(c.low);

            return (
              <g
                key={c.time + '-' + idx}
                onMouseEnter={() => setHoveredCandle(c)}
                onMouseLeave={() => setHoveredCandle(null)}
                className="cursor-crosshair transition-opacity hover:opacity-80"
              >
                <line x1={xCenter} y1={highY} x2={xCenter} y2={lowY} stroke={color} strokeWidth="1.3" />
                <rect
                  x={xCenter - candleBodyWidth / 2}
                  y={bodyTop}
                  width={candleBodyWidth}
                  height={bodyHeight}
                  fill={color}
                  rx="1"
                />
              </g>
            );
          })}

          {/* 5. LIQUIDITY SWEEP 'X' MARKERS & PIVOT DIAMONDS */}
          {showSweepMarkers &&
            visualMarkers
              .filter((m) => m.time >= startTime && m.time <= endTime)
              .map((mark) => {
                const x = timeToX(mark.time);
                const y = priceToY(mark.price);

                if (mark.shape === 'cross') {
                  const isBull = mark.color.includes('10b981') || mark.color.includes('emerald');
                  const yOffset = isBull ? y + 14 : y - 10;
                  return (
                    <text
                      key={mark.id}
                      x={x}
                      y={yOffset}
                      textAnchor="middle"
                      fill={mark.color}
                      fontSize="12"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono"
                      className="cursor-pointer"
                    >
                      ✕
                    </text>
                  );
                }

                if (mark.shape === 'diamond') {
                  return (
                    <polygon
                      key={mark.id}
                      points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`}
                      fill={mark.color}
                      stroke="#ffffff"
                      strokeWidth="0.8"
                    />
                  );
                }

                return null;
              })}

          {/* 6. TRADE EXECUTION ARROW MARKERS */}
          {trades.map((t) => {
            if (t.openTime < startTime || t.openTime > endTime) return null;
            const candleIndex = visibleCandles.findIndex(
              (c) => Math.abs(c.time - t.openTime) < 3600
            );
            if (candleIndex === -1) return null;

            const x = candleIndex * candleSlotWidth + candleSlotWidth / 2;
            const y = priceToY(t.openPrice);
            const isBuy = t.side === 'BUY';

            return (
              <g
                key={t.id}
                onMouseEnter={() => setHoveredTrade(t)}
                onMouseLeave={() => setHoveredTrade(null)}
                className="cursor-pointer"
              >
                <polygon
                  points={
                    isBuy
                      ? `${x},${y + 10} ${x - 6},${y + 22} ${x + 6},${y + 22}`
                      : `${x},${y - 10} ${x - 6},${y - 22} ${x + 6},${y - 22}`
                  }
                  fill={isBuy ? '#10b981' : '#f43f5e'}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
                <circle cx={x} cy={y} r="3" fill="#ffffff" stroke={isBuy ? '#10b981' : '#f43f5e'} strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>

        {/* X-axis date labels */}
        <div className="flex justify-between pt-1 border-t border-slate-800 text-[10px] font-mono text-slate-500">
          <span>{new Date(visibleCandles[0].time * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span>
            {new Date(
              visibleCandles[Math.floor(visibleCandles.length / 2)].time * 1000
            ).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </span>
          <span>
            {new Date(
              visibleCandles[visibleCandles.length - 1].time * 1000
            ).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        </div>
      </div>

      {/* FULL TIMELINE MINI-MAP / SCRUBBER BAR */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-blue-400" />
            <span>2-Year Full Simulation Timeline ({totalBars} total candles)</span>
          </span>
          <span className="text-slate-500">
            Viewing bars {clampedStart + 1} - {clampedEnd + 1} ({Math.round(((clampedEnd - clampedStart + 1) / totalBars) * 100)}% span)
          </span>
        </div>

        {/* Interactive Scrubber Track */}
        <div
          className="relative h-6 rounded bg-slate-950 border border-slate-800 cursor-pointer overflow-hidden"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const count = clampedEnd - clampedStart + 1;
            const targetCenter = Math.round(clickRatio * totalBars);
            let newStart = Math.round(targetCenter - count / 2);
            let newEnd = newStart + count - 1;
            if (newStart < 0) {
              newStart = 0;
              newEnd = Math.min(totalBars - 1, count - 1);
            }
            if (newEnd >= totalBars) {
              newEnd = totalBars - 1;
              newStart = Math.max(0, totalBars - count);
            }
            setViewRange({ start: newStart, end: newEnd });
          }}
        >
          {/* Entire timeline mini bar density preview */}
          <div className="absolute inset-0 flex items-center px-1 opacity-25">
            <div className="w-full h-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 rounded-sm" />
          </div>

          {/* Active Viewport Highlight Box */}
          <div
            style={{
              left: `${(clampedStart / totalBars) * 100}%`,
              width: `${Math.max(2.5, ((clampedEnd - clampedStart + 1) / totalBars) * 100)}%`,
            }}
            className="absolute top-0 bottom-0 bg-blue-500/25 border-y-2 border-x border-blue-400 rounded-sm shadow-sm flex items-center justify-between px-1"
          >
            <div className="w-1 h-3 bg-blue-300 rounded-full" />
            <div className="w-1 h-3 bg-blue-300 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
