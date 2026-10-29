import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Candle, TradeRecord } from '../types/forex';
import {
  TrendingUp,
  TrendingDown,
  Maximize2,
  Minimize2,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';

interface D3SimulationTimelineProps {
  candles: Candle[];
  trades: TradeRecord[];
  equityCurve: Array<{ time: number; equity: number; drawdownPct: number }>;
  symbol: string;
  initialBalance?: number;
  height?: number;
}

export const D3SimulationTimeline: React.FC<D3SimulationTimelineProps> = ({
  candles,
  trades = [],
  equityCurve = [],
  symbol,
  initialBalance = 10000,
  height = 440,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [hoveredData, setHoveredData] = useState<{
    time: Date;
    price?: number;
    equity?: number;
    drawdownPct?: number;
    activeTrade?: TradeRecord;
  } | null>(null);

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [zoomDomain, setZoomDomain] = useState<[Date, Date] | null>(null);

  // Filter trades based on user toggle
  const filteredTrades = useMemo(() => {
    if (activeFilter === 'WINS') return trades.filter((t) => t.pnl >= 0);
    if (activeFilter === 'LOSSES') return trades.filter((t) => t.pnl < 0);
    return trades;
  }, [trades, activeFilter]);

  // Total time span
  const fullDomain = useMemo<[Date, Date]>(() => {
    if (candles.length === 0) {
      return [new Date(), new Date()];
    }
    const t0 = new Date(candles[0].time * 1000);
    const t1 = new Date(candles[candles.length - 1].time * 1000);
    return [t0, t1];
  }, [candles]);

  const currentDomain = zoomDomain || fullDomain;

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || candles.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth || 920;
    const totalHeight = height;

    const margin = { top: 24, right: 65, bottom: 65, left: 65 };
    const chartWidth = width - margin.left - margin.right;
    
    // Split vertical space:
    // Upper Price Pane: 52% of space
    // Lower Equity & Drawdown Pane: 32% of space
    // Bottom Brush / Overview Navigator: 16% of space
    const pricePaneHeight = Math.floor((totalHeight - margin.top - margin.bottom) * 0.52);
    const gap = 16;
    const equityPaneHeight = Math.floor((totalHeight - margin.top - margin.bottom) * 0.32);
    const brushPaneHeight = Math.floor((totalHeight - margin.top - margin.bottom) * 0.16);
    const brushY = margin.top + pricePaneHeight + gap + equityPaneHeight + 14;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('width', width)
      .attr('height', totalHeight)
      .attr('viewBox', `0 0 ${width} ${totalHeight}`);

    // Create defs for gradients and clip paths
    const defs = svg.append('defs');

    // Clip path for main upper and lower charts
    defs
      .append('clipPath')
      .attr('id', 'clip-main-panes')
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', chartWidth)
      .attr('height', pricePaneHeight + gap + equityPaneHeight);

    // Price gradient
    const priceGradient = defs
      .append('linearGradient')
      .attr('id', 'price-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    priceGradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.28);
    priceGradient.append('stop').attr('offset', '100%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.0);

    // Equity gradient
    const equityGradient = defs
      .append('linearGradient')
      .attr('id', 'equity-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    equityGradient.append('stop').attr('offset', '0%').attr('stop-color', '#10b981').attr('stop-opacity', 0.35);
    equityGradient.append('stop').attr('offset', '100%').attr('stop-color', '#10b981').attr('stop-opacity', 0.02);

    // Drawdown gradient
    const ddGradient = defs
      .append('linearGradient')
      .attr('id', 'dd-grad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    ddGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.05);
    ddGradient.append('stop').attr('offset', '100%').attr('stop-color', '#f43f5e').attr('stop-opacity', 0.35);

    // --- SCALES ---
    // X Scale for current visible window
    const xScale = d3.scaleTime().domain(currentDomain).range([0, chartWidth]);

    // Full X Scale for the Navigator / Brush Pane
    const xOverviewScale = d3.scaleTime().domain(fullDomain).range([0, chartWidth]);

    // Filter candles in visible domain
    const visibleCandles = candles.filter((c) => {
      const t = new Date(c.time * 1000);
      return t >= currentDomain[0] && t <= currentDomain[1];
    });

    const activeCandles = visibleCandles.length > 0 ? visibleCandles : candles;

    // Price Y Scale
    const minPrice = d3.min(activeCandles, (d) => d.low) ?? 0;
    const maxPrice = d3.max(activeCandles, (d) => d.high) ?? 1;
    const pricePadding = (maxPrice - minPrice) * 0.08 || 0.001;

    const yPriceScale = d3
      .scaleLinear()
      .domain([minPrice - pricePadding, maxPrice + pricePadding])
      .range([pricePaneHeight, 0]);

    // Equity Y Scale
    const minEq = d3.min(equityCurve, (d) => d.equity) ?? initialBalance * 0.9;
    const maxEq = d3.max(equityCurve, (d) => d.equity) ?? initialBalance * 1.1;
    const eqPad = (maxEq - minEq) * 0.1 || 100;
    const yEquityScale = d3
      .scaleLinear()
      .domain([Math.min(initialBalance, minEq) - eqPad, Math.max(initialBalance, maxEq) + eqPad])
      .range([equityPaneHeight, 0]);

    // Drawdown Y Scale (0% at top of equity pane, max DD at bottom)
    const maxDd = d3.max(equityCurve, (d) => d.drawdownPct) ?? 10;
    const yDdScale = d3
      .scaleLinear()
      .domain([0, Math.max(10, maxDd * 1.2)])
      .range([0, equityPaneHeight]);

    // --- MAIN GROUPS ---
    const gMain = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Gridlines background
    const gridGroup = gMain.append('g').attr('class', 'gridlines').attr('opacity', 0.15);

    // Price horizontal grid
    yPriceScale.ticks(5).forEach((val) => {
      gridGroup
        .append('line')
        .attr('x1', 0)
        .attr('x2', chartWidth)
        .attr('y1', yPriceScale(val))
        .attr('y2', yPriceScale(val))
        .attr('stroke', '#94a3b8')
        .attr('stroke-dasharray', '3 3');
    });

    // Content container with clip path
    const contentGroup = gMain.append('g').attr('clip-path', 'url(#clip-main-panes)');

    // 1. PRICE AREA & LINE
    const priceAreaGen = d3
      .area<Candle>()
      .x((d) => xScale(new Date(d.time * 1000)))
      .y0(pricePaneHeight)
      .y1((d) => yPriceScale(d.close))
      .curve(d3.curveMonotoneX);

    const priceLineGen = d3
      .line<Candle>()
      .x((d) => xScale(new Date(d.time * 1000)))
      .y((d) => yPriceScale(d.close))
      .curve(d3.curveMonotoneX);

    contentGroup
      .append('path')
      .datum(activeCandles)
      .attr('fill', 'url(#price-grad)')
      .attr('d', priceAreaGen);

    contentGroup
      .append('path')
      .datum(activeCandles)
      .attr('fill', 'none')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1.8)
      .attr('d', priceLineGen);

    // 2. TRADE DURATION INTERVALS & ENTRY/EXIT MARKERS
    const tradeIntervalsGroup = contentGroup.append('g').attr('class', 'trade-intervals');

    filteredTrades.forEach((trade) => {
      const openDate = new Date(trade.openTime * 1000);
      const closeDate = new Date(trade.closeTime * 1000);

      // Check intersection with current domain
      if (closeDate < currentDomain[0] || openDate > currentDomain[1]) return;

      const xOpen = Math.max(0, xScale(openDate));
      const xClose = Math.min(chartWidth, xScale(closeDate));
      const yOpen = yPriceScale(trade.openPrice);
      const yClose = yPriceScale(trade.closePrice);
      const isWin = trade.pnl >= 0;
      const isBuy = trade.side === 'BUY';

      // Duration interval band: shaded horizontal zone across the holding period
      const intervalBandHeight = Math.max(16, Math.abs(yClose - yOpen) + 12);
      const bandTop = Math.min(yOpen, yClose) - 6;

      const intervalG = tradeIntervalsGroup
        .append('g')
        .attr('class', 'trade-interval-item')
        .attr('cursor', 'pointer')
        .on('mouseenter', () => {
          setHoveredData({
            time: openDate,
            price: trade.openPrice,
            activeTrade: trade,
          });
        })
        .on('mouseleave', () => setHoveredData(null));

      // Shaded trade duration interval rectangle
      intervalG
        .append('rect')
        .attr('x', xOpen)
        .attr('y', bandTop)
        .attr('width', Math.max(4, xClose - xOpen))
        .attr('height', intervalBandHeight)
        .attr('fill', isWin ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)')
        .attr('stroke', isWin ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 3')
        .attr('rx', 3);

      // Trajectory line linking Entry price to Exit price
      intervalG
        .append('line')
        .attr('x1', xOpen)
        .attr('y1', yOpen)
        .attr('x2', xClose)
        .attr('y2', yClose)
        .attr('stroke', isWin ? '#10b981' : '#f43f5e')
        .attr('stroke-width', 1.6);

      // Entry Marker (Triangle Arrow)
      const arrowSymbol = isBuy ? d3.symbolTriangle : d3.symbolTriangle;
      const arrowRot = isBuy ? 0 : 180;
      intervalG
        .append('path')
        .attr('d', d3.symbol().type(arrowSymbol).size(45)())
        .attr('transform', `translate(${xOpen}, ${yOpen}) rotate(${arrowRot})`)
        .attr('fill', isBuy ? '#10b981' : '#f43f5e')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 0.8);

      // Exit Marker (Circle)
      intervalG
        .append('circle')
        .attr('cx', xClose)
        .attr('cy', yClose)
        .attr('r', 3.5)
        .attr('fill', isWin ? '#10b981' : '#f43f5e')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);

      // Mini PnL badge on interval
      if (xClose - xOpen > 36) {
        intervalG
          .append('text')
          .attr('x', xOpen + 4)
          .attr('y', bandTop + 11)
          .attr('fill', isWin ? '#34d399' : '#fb7185')
          .attr('font-size', '9px')
          .attr('font-weight', 'bold')
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(`${isWin ? '+' : ''}$${trade.pnl.toFixed(0)}`);
      }
    });

    // 3. LOWER PANE: CUMULATIVE EQUITY & UNDERWATER DRAWDOWN
    const gEquity = contentGroup
      .append('g')
      .attr('transform', `translate(0, ${pricePaneHeight + gap})`);

    // Pane divider line
    gMain
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', pricePaneHeight + gap / 2)
      .attr('y2', pricePaneHeight + gap / 2)
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 1);

    // Underwater Drawdown Area
    const ddAreaGen = d3
      .area<{ time: number; equity: number; drawdownPct: number }>()
      .x((d) => xScale(new Date(d.time * 1000)))
      .y0(0)
      .y1((d) => yDdScale(d.drawdownPct))
      .curve(d3.curveStepAfter);

    gEquity
      .append('path')
      .datum(equityCurve)
      .attr('fill', 'url(#dd-grad)')
      .attr('d', ddAreaGen);

    // Initial Balance baseline line ($10,000)
    gEquity
      .append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', yEquityScale(initialBalance))
      .attr('y2', yEquityScale(initialBalance))
      .attr('stroke', '#64748b')
      .attr('stroke-dasharray', '2 2')
      .attr('stroke-width', 1);

    // Cumulative Equity Area & Line
    const eqAreaGen = d3
      .area<{ time: number; equity: number; drawdownPct: number }>()
      .x((d) => xScale(new Date(d.time * 1000)))
      .y0(equityPaneHeight)
      .y1((d) => yEquityScale(d.equity))
      .curve(d3.curveMonotoneX);

    const eqLineGen = d3
      .line<{ time: number; equity: number; drawdownPct: number }>()
      .x((d) => xScale(new Date(d.time * 1000)))
      .y((d) => yEquityScale(d.equity))
      .curve(d3.curveMonotoneX);

    gEquity
      .append('path')
      .datum(equityCurve)
      .attr('fill', 'url(#equity-grad)')
      .attr('d', eqAreaGen);

    gEquity
      .append('path')
      .datum(equityCurve)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.8)
      .attr('d', eqLineGen);

    // 4. AXES RENDERING
    // Upper Y Axis (Price)
    const yPriceAxis = d3
      .axisRight(yPriceScale)
      .ticks(4)
      .tickFormat((d) => Number(d).toFixed(symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5));

    gMain
      .append('g')
      .attr('class', 'y-price-axis')
      .attr('transform', `translate(${chartWidth}, 0)`)
      .call(yPriceAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10px').attr('font-family', 'JetBrains Mono'));

    // Lower Left Y Axis (Equity $)
    const yEquityAxis = d3
      .axisLeft(yEquityScale)
      .ticks(3)
      .tickFormat((d) => `$${Number(d).toLocaleString()}`);

    gMain
      .append('g')
      .attr('class', 'y-equity-axis')
      .attr('transform', `translate(0, ${pricePaneHeight + gap})`)
      .call(yEquityAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('text').attr('fill', '#34d399').attr('font-size', '9px').attr('font-family', 'JetBrains Mono'));

    // Lower Right Y Axis (Drawdown %)
    const yDdAxis = d3
      .axisRight(yDdScale)
      .ticks(3)
      .tickFormat((d) => `-${Number(d).toFixed(0)}%`);

    gMain
      .append('g')
      .attr('class', 'y-dd-axis')
      .attr('transform', `translate(${chartWidth}, ${pricePaneHeight + gap})`)
      .call(yDdAxis)
      .call((g) => g.select('.domain').remove())
      .call((g) => g.selectAll('text').attr('fill', '#f43f5e').attr('font-size', '9px').attr('font-family', 'JetBrains Mono'));

    // Middle X Axis (Date)
    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => d3.timeFormat('%b %d, %H:%M')(d as Date));

    gMain
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${pricePaneHeight + gap + equityPaneHeight})`)
      .call(xAxis)
      .call((g) => g.select('.domain').attr('stroke', '#334155'))
      .call((g) => g.selectAll('text').attr('fill', '#64748b').attr('font-size', '10px').attr('font-family', 'JetBrains Mono'));

    // Pane Labels
    gMain
      .append('text')
      .attr('x', 6)
      .attr('y', 14)
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'JetBrains Mono')
      .text(`${symbol} Price & Trade Intervals`);

    gMain
      .append('text')
      .attr('x', 6)
      .attr('y', pricePaneHeight + gap + 14)
      .attr('fill', '#34d399')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'JetBrains Mono')
      .text(`Cumulative Equity & Drawdown (% DD in red)`);

    // 5. TIMELINE SCRUBBER / BRUSH MINI-MAP (Overview Pane at Bottom)
    const gBrushPane = svg.append('g').attr('transform', `translate(${margin.left}, ${brushY})`);

    // Background for brush pane
    gBrushPane
      .append('rect')
      .attr('width', chartWidth)
      .attr('height', brushPaneHeight)
      .attr('fill', '#0B111E')
      .attr('stroke', '#1e293b')
      .attr('rx', 3);

    // Mini preview equity line across entire dataset
    const miniEqScale = d3
      .scaleLinear()
      .domain([minEq, maxEq])
      .range([brushPaneHeight - 4, 4]);

    const miniEqLine = d3
      .line<{ time: number; equity: number }>()
      .x((d) => xOverviewScale(new Date(d.time * 1000)))
      .y((d) => miniEqScale(d.equity));

    gBrushPane
      .append('path')
      .datum(equityCurve)
      .attr('fill', 'none')
      .attr('stroke', '#10b98188')
      .attr('stroke-width', 1.2)
      .attr('d', miniEqLine);

    // D3 Brush for interactive scrubbing and zooming
    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [chartWidth, brushPaneHeight],
      ])
      .on('brush end', (event) => {
        if (!event.selection) {
          // If cleared, reset to full domain
          setZoomDomain(null);
          return;
        }
        const [x0, x1] = event.selection as [number, number];
        const newDomain: [Date, Date] = [
          xOverviewScale.invert(x0),
          xOverviewScale.invert(x1),
        ];
        // Prevent microscopic zero-width brush
        if (newDomain[1].getTime() - newDomain[0].getTime() > 60000) {
          setZoomDomain(newDomain);
        }
      });

    const brushGroup = gBrushPane.append('g').attr('class', 'brush').call(brush);

    // Initialize brush selection to match currentDomain
    const initX0 = xOverviewScale(currentDomain[0]);
    const initX1 = xOverviewScale(currentDomain[1]);
    brushGroup.call(brush.move, [initX0, initX1]);

    // Style brush handles
    brushGroup.selectAll('.selection').attr('fill', 'rgba(59, 130, 246, 0.2)').attr('stroke', '#3b82f6').attr('stroke-width', 1.5);

    // 6. INTERACTIVE CROSSHAIR & HOVER TRACKER
    const crosshair = gMain.append('g').attr('class', 'crosshair').style('display', 'none');

    const crosshairX = crosshair
      .append('line')
      .attr('y1', 0)
      .attr('y2', pricePaneHeight + gap + equityPaneHeight)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3');

    const crosshairPriceDot = crosshair.append('circle').attr('r', 4).attr('fill', '#3b82f6').attr('stroke', '#ffffff').attr('stroke-width', 1.5);
    const crosshairEqDot = crosshair.append('circle').attr('r', 4).attr('fill', '#10b981').attr('stroke', '#ffffff').attr('stroke-width', 1.5);

    // Overlay rect for capturing mouse events
    contentGroup
      .append('rect')
      .attr('class', 'overlay-interactive')
      .attr('width', chartWidth)
      .attr('height', pricePaneHeight + gap + equityPaneHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .attr('cursor', 'crosshair')
      .on('mouseenter', () => crosshair.style('display', null))
      .on('mouseleave', () => {
        crosshair.style('display', 'none');
        setHoveredData(null);
      })
      .on('mousemove', (event) => {
        const [mx] = d3.pointer(event);
        const hoveredDate = xScale.invert(mx);
        const hoveredTimeSec = Math.floor(hoveredDate.getTime() / 1000);

        // Bisect nearest candle
        const bisectCandle = d3.bisector<Candle, number>((d) => d.time).center;
        const cIdx = bisectCandle(candles, hoveredTimeSec);
        const candle = candles[Math.max(0, Math.min(candles.length - 1, cIdx))];

        // Bisect nearest equity point
        const bisectEq = d3.bisector<{ time: number }, number>((d) => d.time).center;
        const eqIdx = bisectEq(equityCurve, hoveredTimeSec);
        const eqPt = equityCurve[Math.max(0, Math.min(equityCurve.length - 1, eqIdx))];

        // Find active trade overlapping this time
        const activeTrade = trades.find(
          (t) => hoveredTimeSec >= t.openTime && hoveredTimeSec <= t.closeTime
        );

        if (candle) {
          const cx = xScale(new Date(candle.time * 1000));
          const cyPrice = yPriceScale(candle.close);

          crosshairX.attr('x1', cx).attr('x2', cx);
          crosshairPriceDot.attr('cx', cx).attr('cy', cyPrice);

          if (eqPt) {
            const cyEq = pricePaneHeight + gap + yEquityScale(eqPt.equity);
            crosshairEqDot.attr('cx', cx).attr('cy', cyEq);
          }

          setHoveredData({
            time: new Date(candle.time * 1000),
            price: candle.close,
            equity: eqPt?.equity,
            drawdownPct: eqPt?.drawdownPct,
            activeTrade,
          });
        }
      });
  }, [candles, filteredTrades, equityCurve, currentDomain, symbol, initialBalance, height]);

  // Quick range jump helpers
  const handleZoomRange = (days: number) => {
    if (candles.length === 0) return;
    const tEnd = new Date(candles[candles.length - 1].time * 1000);
    const tStart = new Date(tEnd.getTime() - days * 24 * 3600 * 1000);
    const fullStart = new Date(candles[0].time * 1000);
    setZoomDomain([tStart < fullStart ? fullStart : tStart, tEnd]);
  };

  const handleResetZoom = () => {
    setZoomDomain(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-border bg-surface p-4 shadow-2xl"
    >
      {/* Visualizer Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              D3 Interactive Simulation Timeline
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface text-blue-400 font-mono">
                D3.js Vector Engine
              </span>
            </h3>
            <p className="text-[11px] text-text-muted">
              Entry/exit trajectory paths, holding durations, and peak-to-trough drawdowns mapped against market bars.
            </p>
          </div>
        </div>

        {/* Trade Filter & Timeframe Range Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Trade Filter Toggle */}
          <div className="flex items-center rounded bg-bg p-0.5 border border-border text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeFilter === 'ALL'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              All Trades ({trades.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('WINS')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeFilter === 'WINS'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-text-muted hover:text-emerald-400'
              }`}
            >
              Wins
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('LOSSES')}
              className={`px-2 py-0.5 rounded transition-colors ${
                activeFilter === 'LOSSES'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'text-text-muted hover:text-rose-400'
              }`}
            >
              Losses
            </button>
          </div>

          {/* Quick Zoom Buttons */}
          <div className="flex items-center rounded bg-bg p-0.5 border border-border text-[11px] font-mono">
            <button
              type="button"
              onClick={() => handleZoomRange(7)}
              className="px-2 py-0.5 rounded text-text-muted hover:text-text"
            >
              7D
            </button>
            <button
              type="button"
              onClick={() => handleZoomRange(30)}
              className="px-2 py-0.5 rounded text-text-muted hover:text-text"
            >
              1M
            </button>
            <button
              type="button"
              onClick={() => handleZoomRange(90)}
              className="px-2 py-0.5 rounded text-text-muted hover:text-text"
            >
              3M
            </button>
            <button
              type="button"
              onClick={() => handleZoomRange(365)}
              className="px-2 py-0.5 rounded text-text-muted hover:text-text"
            >
              1Y
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-blue-400 hover:bg-surface font-bold"
            >
              <RotateCcw className="w-3 h-3" />
              All
            </button>
          </div>
        </div>
      </div>

      {/* Floating Info Tooltip */}
      {hoveredData && (
        <div className="absolute top-16 left-6 z-20 pointer-events-none rounded-lg border border-border bg-bg p-3 text-xs shadow-2xl backdrop-blur-md font-mono text-text min-w-64">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-border text-[11px] text-text-muted">
            <span>{hoveredData.time.toLocaleString()}</span>
            <span className="text-blue-400 font-bold">{symbol}</span>
          </div>

          {hoveredData.price !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Market Price:</span>
              <strong className="text-white">
                {hoveredData.price.toFixed(symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5)}
              </strong>
            </div>
          )}

          {hoveredData.equity !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Simulated Equity:</span>
              <strong className="text-emerald-400">${hoveredData.equity.toFixed(2)}</strong>
            </div>
          )}

          {hoveredData.drawdownPct !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Drawdown from Peak:</span>
              <strong className="text-rose-400">-{hoveredData.drawdownPct.toFixed(2)}%</strong>
            </div>
          )}

          {hoveredData.activeTrade && (
            <div className="mt-2 pt-1.5 border-t border-border">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className={hoveredData.activeTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  Trade #{hoveredData.activeTrade.ticket} ({hoveredData.activeTrade.side})
                </span>
                <span className={hoveredData.activeTrade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {hoveredData.activeTrade.pnl >= 0 ? '+' : ''}${hoveredData.activeTrade.pnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                <span>
                  Entry: {hoveredData.activeTrade.openPrice} → Exit: {hoveredData.activeTrade.closePrice}
                </span>
                <span>{hoveredData.activeTrade.exitReason}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SVG Canvas Mount */}
      <div className="w-full overflow-hidden mt-2">
        <svg ref={svgRef} className="w-full" style={{ height }} />
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-[10px] font-mono text-text-muted">
        <span>Use the bottom timeline scrubber handles to pan and zoom across the entire multi-year dataset</span>
        <span>Green = Equity curve · Red shaded = Peak drawdown · Colored bands = Trade holding periods</span>
      </div>
    </div>
  );
};
