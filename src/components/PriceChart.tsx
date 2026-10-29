import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronsRight,
  MoveHorizontal,
  Layers,
  Download,
  FileSpreadsheet,
  Settings,
  Bookmark,
  Calendar,
  Eye,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  Candle,
  StrategyVisualBlock,
  StrategyVisualLine,
  StrategyVisualMarker,
  TradeRecord,
} from '../types/forex';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateKeltnerChannels,
  calculateDonchianChannels,
  calculateIchimoku,
  calculateSupertrend,
  calculateParabolicSAR,
  calculateTickVWAP,
  calculatePivotPoints,
  calculateSessionBoxes,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateATR,
  calculateVolumeMA,
  calculateCCI,
  calculateWilliamsR,
  calculateADX,
  SessionBox,
} from '../engine/technicalIndicators';

export type ChartType = 'candles' | 'heikin-ashi' | 'line' | 'bars';
export type SubPaneType = 'none' | 'rsi' | 'macd' | 'stochastic' | 'atr' | 'volume' | 'adx' | 'cci' | 'williamsR';

export interface PriceChartProps {
  candles: Candle[];
  symbol: string;
  timeframe: string;
  height?: number;
  trades?: TradeRecord[];
  visualBlocks?: StrategyVisualBlock[];
  visualLines?: StrategyVisualLine[];
  visualMarkers?: StrategyVisualMarker[];
  onSymbolChange?: (sym: string) => void;
  onTimeframeChange?: (tf: string) => void;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  candles,
  symbol,
  timeframe,
  height = 500,
  trades = [],
  visualBlocks = [],
  visualLines = [],
  visualMarkers = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Chart configuration state
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [subPane, setSubPane] = useState<SubPaneType>('rsi');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Active overlay toggles
  const [showSMA20, setShowSMA20] = useState<boolean>(true);
  const [showEMA50, setShowEMA50] = useState<boolean>(false);
  const [showBollinger, setShowBollinger] = useState<boolean>(false);
  const [showKeltner, setShowKeltner] = useState<boolean>(false);
  const [showDonchian, setShowDonchian] = useState<boolean>(false);
  const [showIchimoku, setShowIchimoku] = useState<boolean>(false);
  const [showSupertrend, setShowSupertrend] = useState<boolean>(false);
  const [showParabolicSAR, setShowParabolicSAR] = useState<boolean>(false);
  const [showVWAP, setShowVWAP] = useState<boolean>(false);
  const [showPivots, setShowPivots] = useState<boolean>(false);
  const [showSessions, setShowSessions] = useState<boolean>(false);

  // Layouts menu
  const [showLayoutMenu, setShowLayoutMenu] = useState<boolean>(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState<boolean>(false);
  const [savedLayouts, setSavedLayouts] = useState<Array<{ id: string; name: string }>>([]);
  const [layoutNameInput, setLayoutNameInput] = useState<string>('');

  // Default viewport: newest 80 bars
  const defaultBarsCount = 80;
  const [viewRange, setViewRange] = useState<{ start: number; end: number }>(() => {
    const total = candles.length;
    return {
      start: Math.max(0, total - defaultBarsCount),
      end: Math.max(0, total - 1),
    };
  });

  // Dragging state
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartRangeRef = useRef({ start: 0, end: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Hover crosshair state
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; barIndex: number } | null>(null);

  // Sync view range when candle length changes
  useEffect(() => {
    if (candles.length > 0) {
      setViewRange((prev) => {
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

  // Load saved chart layouts on mount
  useEffect(() => {
    fetch('/api/chart/layouts?scope=global')
      .then((res) => (res.ok ? res.json() : { layouts: [] }))
      .then((data) => {
        if (data && data.layouts) {
          setSavedLayouts(data.layouts.map((l: any) => ({ id: l.id, name: l.name })));
        }
      })
      .catch(() => {});
  }, []);

  // Save current layout
  const handleSaveLayout = async () => {
    const name = layoutNameInput.trim() || `Layout ${new Date().toLocaleTimeString()}`;
    const indicators = [];
    if (showSMA20) indicators.push('SMA20');
    if (showEMA50) indicators.push('EMA50');
    if (showBollinger) indicators.push('Bollinger');
    if (showKeltner) indicators.push('Keltner');
    if (showDonchian) indicators.push('Donchian');
    if (showIchimoku) indicators.push('Ichimoku');
    if (showSupertrend) indicators.push('Supertrend');
    if (showParabolicSAR) indicators.push('ParabolicSAR');
    if (showVWAP) indicators.push('VWAP');
    if (showPivots) indicators.push('Pivots');
    if (showSessions) indicators.push('Sessions');

    try {
      const res = await fetch('/api/chart/layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope: 'global',
          chart_type: chartType,
          indicators,
          moving_averages: [subPane],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setSavedLayouts((prev) => [{ id: json.id, name }, ...prev]);
        setLayoutNameInput('');
        setShowLayoutMenu(false);
      }
    } catch {}
  };

  // Heikin Ashi candle calculations
  const haCandles = useMemo(() => {
    if (chartType !== 'heikin-ashi' || candles.length === 0) return [];
    const ha: Candle[] = [];
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const haClose = (c.open + c.high + c.low + c.close) / 4;
      const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
      const haHigh = Math.max(c.high, haOpen, haClose);
      const haLow = Math.min(c.low, haOpen, haClose);
      ha.push({
        time: c.time,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        tickVolume: c.tickVolume,
        spread: c.spread,
      });
    }
    return ha;
  }, [candles, chartType]);

  const activeCandles = chartType === 'heikin-ashi' ? haCandles : candles;
  const totalBars = activeCandles.length;

  const clampedStart = Math.max(0, Math.min(totalBars - 10, viewRange.start));
  const clampedEnd = Math.min(totalBars - 1, Math.max(clampedStart + 9, viewRange.end));

  const visibleCandles = useMemo(() => {
    if (totalBars === 0) return [];
    return activeCandles.slice(clampedStart, clampedEnd + 1);
  }, [activeCandles, clampedStart, clampedEnd, totalBars]);

  // Pre-calculate full indicator vectors
  const closes = useMemo(() => activeCandles.map((c) => c.close), [activeCandles]);

  const indicatorData = useMemo(() => {
    if (activeCandles.length === 0) return null;
    return {
      sma20: showSMA20 ? calculateSMA(closes, 20) : null,
      ema50: showEMA50 ? calculateEMA(closes, 50) : null,
      bollinger: showBollinger ? calculateBollingerBands(closes, 20, 2) : null,
      keltner: showKeltner ? calculateKeltnerChannels(activeCandles, 20, 10, 2) : null,
      donchian: showDonchian ? calculateDonchianChannels(activeCandles, 20) : null,
      ichimoku: showIchimoku ? calculateIchimoku(activeCandles, 9, 26, 52) : null,
      supertrend: showSupertrend ? calculateSupertrend(activeCandles, 10, 3) : null,
      parabolicSAR: showParabolicSAR ? calculateParabolicSAR(activeCandles) : null,
      vwap: showVWAP ? calculateTickVWAP(activeCandles, 2) : null,
      pivots: showPivots ? calculatePivotPoints(activeCandles, 'classic') : null,
      sessionBoxes: showSessions ? calculateSessionBoxes(activeCandles, 0) : [],
      // Sub-panes
      rsi: subPane === 'rsi' ? calculateRSI(closes, 14) : null,
      macd: subPane === 'macd' ? calculateMACD(closes, 12, 26, 9) : null,
      stochastic: subPane === 'stochastic' ? calculateStochastic(activeCandles, 14, 3, 3) : null,
      atr: subPane === 'atr' ? calculateATR(activeCandles, 14) : null,
      volumeMA: subPane === 'volume' ? calculateVolumeMA(activeCandles, 20) : null,
      adx: subPane === 'adx' ? calculateADX(activeCandles, 14) : null,
      cci: subPane === 'cci' ? calculateCCI(activeCandles, 20) : null,
      williamsR: subPane === 'williamsR' ? calculateWilliamsR(activeCandles, 14) : null,
    };
  }, [
    activeCandles,
    closes,
    showSMA20,
    showEMA50,
    showBollinger,
    showKeltner,
    showDonchian,
    showIchimoku,
    showSupertrend,
    showParabolicSAR,
    showVWAP,
    showPivots,
    showSessions,
    subPane,
  ]);

  // Fullscreen toggle ('F' key and button)
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {
        setIsFullscreen(true);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen]);

  // Export PNG
  const handleExportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${timeframe}_chart.png`;
    a.click();
  };

  // Export CSV
  const handleExportCSV = () => {
    let csv = 'Timestamp,Open,High,Low,Close,TickVolume\n';
    for (const c of candles) {
      csv += `${new Date(c.time * 1000).toISOString()},${c.open},${c.high},${c.low},${c.close},${c.tickVolume}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${timeframe}_data.csv`;
    a.click();
  };

  // Mouse wheel zoom / pan handler
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (totalBars === 0) return;

      const rect = el.getBoundingClientRect();
      const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const cursorRatio = mouseX / rect.width;

      setViewRange((prev) => {
        const curCount = prev.end - prev.start + 1;

        if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && !e.shiftKey) {
          const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
          const newCount = Math.round(curCount * zoomFactor);
          const clampedCount = Math.max(12, Math.min(totalBars, newCount));

          const cursorIndex = prev.start + cursorRatio * curCount;
          let newStart = Math.round(cursorIndex - cursorRatio * clampedCount);
          let newEnd = newStart + clampedCount - 1;

          if (newStart < 0) {
            newStart = 0;
            newEnd = Math.min(totalBars - 1, clampedCount - 1);
          }
          if (newEnd >= totalBars) {
            newEnd = totalBars - 1;
            newStart = Math.max(0, totalBars - clampedCount);
          }
          return { start: newStart, end: newEnd };
        }

        const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        const shiftBars = Math.round((scrollDelta / 16) * Math.max(1, Math.round(curCount / 60)));
        if (shiftBars === 0) return prev;

        let newStart = prev.start + shiftBars;
        let newEnd = prev.end + shiftBars;

        if (newStart < 0) {
          newEnd += -newStart;
          newStart = 0;
        }
        if (newEnd >= totalBars) {
          const overflow = newEnd - (totalBars - 1);
          newStart = Math.max(0, newStart - overflow);
          newEnd = totalBars - 1;
        }
        return { start: newStart, end: newEnd };
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [totalBars]);

  // Mouse drag panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartRangeRef.current = { ...viewRange };
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDraggingRef.current && totalBars > 0) {
        const deltaX = e.clientX - dragStartXRef.current;
        const count = dragStartRangeRef.current.end - dragStartRangeRef.current.start + 1;
        const containerWidth = canvasRef.current?.clientWidth || 920;
        const slotWidth = containerWidth / count;
        const barsMoved = Math.round(deltaX / slotWidth);

        if (barsMoved !== 0) {
          let newStart = dragStartRangeRef.current.start - barsMoved;
          let newEnd = dragStartRangeRef.current.end - barsMoved;
          if (newStart < 0) {
            newEnd += -newStart;
            newStart = 0;
          }
          if (newEnd >= totalBars) {
            const overflow = newEnd - (totalBars - 1);
            newStart = Math.max(0, newStart - overflow);
            newEnd = totalBars - 1;
          }
          setViewRange({ start: newStart, end: newEnd });
        }
      }

      // Update crosshair
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
          const count = clampedEnd - clampedStart + 1;
          const slotW = rect.width / count;
          const barIdx = Math.min(count - 1, Math.max(0, Math.floor(x / slotW)));
          setCrosshair({ x, y, barIndex: clampedStart + barIdx });
        } else {
          setCrosshair(null);
        }
      }
    },
    [clampedStart, clampedEnd, totalBars]
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

  // Main Canvas Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || visibleCandles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI Canvas scaling
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const rawHeight = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = rawHeight * dpr;
    ctx.scale(dpr, dpr);

    // Read dynamic CSS Variables
    const computedStyles = getComputedStyle(document.documentElement);
    const bgColor = computedStyles.getPropertyValue('--bg').trim() || '#0E1524';
    const surfaceColor = computedStyles.getPropertyValue('--surface').trim() || '#111A2E';
    const borderColor = computedStyles.getPropertyValue('--border').trim() || '#223049';
    const textColor = computedStyles.getPropertyValue('--text').trim() || '#E6ECF5';
    const textMuted = computedStyles.getPropertyValue('--text-muted').trim() || '#9FB0C8';

    // Clear background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, rawHeight);

    // Split heights between main price pane and optional sub-pane
    const hasSubPane = subPane !== 'none';
    const subPaneHeight = hasSubPane ? Math.min(120, rawHeight * 0.28) : 0;
    const pricePaneHeight = rawHeight - subPaneHeight - (hasSubPane ? 24 : 0);

    // Dynamic price bounds
    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of visibleCandles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }
    const padding = (maxP - minP) * 0.08 || 0.001;
    const yMin = minP - padding;
    const yMax = maxP + padding;
    const yRange = yMax - yMin;

    const count = visibleCandles.length;
    const slotWidth = width / count;
    const candleWidth = Math.max(2, slotWidth * 0.7);

    const priceToY = (price: number) => {
      return pricePaneHeight - ((price - yMin) / yRange) * pricePaneHeight;
    };

    // Draw Price Grid & Y-Axis Labels
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = textMuted;
    ctx.font = '10px JetBrains Mono, monospace';

    const gridLines = 5;
    for (let i = 0; i < gridLines; i++) {
      const ratio = (i + 1) / (gridLines + 1);
      const y = pricePaneHeight * ratio;
      const p = yMax - ratio * yRange;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      const precision = symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5;
      ctx.fillText(p.toFixed(precision), width - 58, y - 3);
    }
    ctx.setLineDash([]);

    // 1. Session Boxes
    if (showSessions && indicatorData?.sessionBoxes) {
      for (const box of indicatorData.sessionBoxes) {
        const sIdx = visibleCandles.findIndex((c) => c.time >= box.startTime);
        const eIdx = visibleCandles.findIndex((c) => c.time >= box.endTime);
        if (sIdx !== -1) {
          const x1 = sIdx * slotWidth;
          const x2 = (eIdx !== -1 ? eIdx : count) * slotWidth;
          const y1 = priceToY(box.high);
          const y2 = priceToY(box.low);
          ctx.fillStyle = box.color;
          ctx.fillRect(x1, y1, Math.max(slotWidth, x2 - x1), Math.max(2, y2 - y1));
        }
      }
    }

    // 2. Ichimoku Cloud Shading
    if (showIchimoku && indicatorData?.ichimoku) {
      const { senkouA, senkouB } = indicatorData.ichimoku;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const fullIdx = clampedStart + i;
        const sa = senkouA[fullIdx];
        const sb = senkouB[fullIdx];
        if (sa !== null && sb !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const yA = priceToY(sa);
          const yB = priceToY(sb);
          ctx.fillStyle = sa >= sb ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)';
          ctx.fillRect(x - slotWidth / 2, Math.min(yA, yB), slotWidth, Math.abs(yA - yB));
        }
      }
    }

    // 3. Bollinger Bands
    if (showBollinger && indicatorData?.bollinger) {
      const { upper, middle, lower } = indicatorData.bollinger;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;

      // Draw upper
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const v = upper[clampedStart + i];
        if (v !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw middle
      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const v = middle[clampedStart + i];
        if (v !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw lower
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const v = lower[clampedStart + i];
        if (v !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(v);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // 4. Parabolic SAR Dots
    if (showParabolicSAR && indicatorData?.parabolicSAR) {
      ctx.fillStyle = '#ec4899';
      for (let i = 0; i < count; i++) {
        const val = indicatorData.parabolicSAR[clampedStart + i];
        if (val !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(val);
          ctx.beginPath();
          ctx.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 5. Draw Price Bars / Candlesticks
    for (let i = 0; i < count; i++) {
      const c = visibleCandles[i];
      const x = i * slotWidth + slotWidth / 2;
      const isBull = c.close >= c.open;
      const color = isBull ? '#10b981' : '#f43f5e';

      if (chartType === 'line') {
        const yClose = priceToY(c.close);
        if (i === 0) {
          ctx.beginPath();
          ctx.moveTo(x, yClose);
        } else {
          ctx.lineTo(x, yClose);
        }
        if (i === count - 1) {
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }
      } else if (chartType === 'bars') {
        const yHigh = priceToY(c.high);
        const yLow = priceToY(c.low);
        const yOpen = priceToY(c.open);
        const yClose = priceToY(c.close);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        // Open tick (left)
        ctx.moveTo(x - candleWidth / 2, yOpen);
        ctx.lineTo(x, yOpen);
        // Close tick (right)
        ctx.moveTo(x, yClose);
        ctx.lineTo(x + candleWidth / 2, yClose);
        ctx.stroke();
      } else {
        // Candlesticks & Heikin Ashi
        const yHigh = priceToY(c.high);
        const yLow = priceToY(c.low);
        const yOpen = priceToY(c.open);
        const yClose = priceToY(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // Body
        ctx.fillStyle = color;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      }
    }

    // 6. Overlays: SMA20, EMA50, Supertrend, VWAP
    const drawOverlayLine = (data: (number | null)[] | null, strokeColor: string, lineWidth = 1.8) => {
      if (!data) return;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < count; i++) {
        const val = data[clampedStart + i];
        if (val !== null) {
          const x = i * slotWidth + slotWidth / 2;
          const y = priceToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    };

    drawOverlayLine(indicatorData?.sma20 ?? null, '#38bdf8', 1.8);
    drawOverlayLine(indicatorData?.ema50 ?? null, '#f59e0b', 1.8);
    drawOverlayLine(indicatorData?.vwap ?? null, '#a855f7', 1.6);

    if (showSupertrend && indicatorData?.supertrend) {
      drawOverlayLine(indicatorData.supertrend.supertrend, '#10b981', 2.0);
    }

    // 7. Sub-Pane Rendering (RSI, MACD, Stochastic, ATR, etc.)
    if (hasSubPane) {
      const subTop = pricePaneHeight + 20;

      // Divider line
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, subTop);
      ctx.lineTo(width, subTop);
      ctx.stroke();

      ctx.fillStyle = textMuted;
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(subPane.toUpperCase(), 10, subTop + 14);

      if (subPane === 'rsi' && indicatorData?.rsi) {
        // Draw 70 and 30 guide lines
        const rsiToY = (val: number) => subTop + 20 + subPaneHeight * (1 - val / 100);
        ctx.strokeStyle = '#334155';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, rsiToY(70));
        ctx.lineTo(width, rsiToY(70));
        ctx.moveTo(0, rsiToY(30));
        ctx.lineTo(width, rsiToY(30));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < count; i++) {
          const r = indicatorData.rsi[clampedStart + i];
          if (r !== null) {
            const x = i * slotWidth + slotWidth / 2;
            const y = rsiToY(r);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      } else if (subPane === 'macd' && indicatorData?.macd) {
        const { macd, signal, histogram } = indicatorData.macd;
        const subMid = subTop + 20 + subPaneHeight / 2;

        for (let i = 0; i < count; i++) {
          const h = histogram[clampedStart + i];
          if (h !== null) {
            const x = i * slotWidth + slotWidth / 2;
            const barH = h * 3000;
            ctx.fillStyle = h >= 0 ? '#10b981' : '#f43f5e';
            ctx.fillRect(x - candleWidth / 2, subMid, candleWidth, -barH);
          }
        }
      }
    }

    // 8. Crosshair Render
    if (crosshair) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(crosshair.x, 0);
      ctx.lineTo(crosshair.x, rawHeight);
      ctx.moveTo(0, crosshair.y);
      ctx.lineTo(width, crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    visibleCandles,
    chartType,
    subPane,
    symbol,
    showSMA20,
    showEMA50,
    showBollinger,
    showKeltner,
    showDonchian,
    showIchimoku,
    showSupertrend,
    showParabolicSAR,
    showVWAP,
    showSessions,
    indicatorData,
    clampedStart,
    crosshair,
  ]);

  const activeCandle = crosshair
    ? activeCandles[crosshair.barIndex]
    : visibleCandles[visibleCandles.length - 1];

  const precision = symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col rounded-xl border border-slate-200 dark:border-[#223049] bg-white dark:bg-[#111A2E] shadow-xl overflow-hidden select-none transition-colors ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* Top Header & Chart Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-slate-200 dark:border-[#223049] text-xs">
        {/* Symbol & Timeframe & OHLC Info */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="font-bold text-slate-900 dark:text-[#E6ECF5] text-sm">{symbol}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
              {timeframe}
            </span>
          </div>

          {activeCandle && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-700 dark:text-[#E6ECF5] bg-slate-100 dark:bg-[#0B1020] px-2.5 py-1 rounded border border-slate-200 dark:border-[#223049]">
              <span>O: <strong className="text-slate-900 dark:text-white">{activeCandle.open.toFixed(precision)}</strong></span>
              <span>H: <strong className="text-emerald-500">{activeCandle.high.toFixed(precision)}</strong></span>
              <span>L: <strong className="text-rose-500">{activeCandle.low.toFixed(precision)}</strong></span>
              <span>C: <strong className="text-slate-900 dark:text-white">{activeCandle.close.toFixed(precision)}</strong></span>
              <span>Vol: <strong className="text-indigo-500">{activeCandle.tickVolume}</strong></span>
            </div>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Style Switcher */}
          <div className="flex items-center rounded-lg bg-slate-100 dark:bg-[#0B1020] p-0.5 border border-slate-200 dark:border-[#223049]">
            {(['candles', 'heikin-ashi', 'line', 'bars'] as ChartType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setChartType(type)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors ${
                  chartType === type
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {type.replace('-', ' ')}
              </button>
            ))}
          </div>

          {/* Sub-Pane Selector */}
          <select
            value={subPane}
            onChange={(e) => setSubPane(e.target.value as SubPaneType)}
            className="px-2 py-1 rounded text-[11px] font-mono bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-700 dark:text-[#E6ECF5] focus:outline-none"
          >
            <option value="none">No Sub-Pane</option>
            <option value="rsi">RSI(14)</option>
            <option value="macd">MACD(12,26,9)</option>
            <option value="stochastic">Stochastic(14,3,3)</option>
            <option value="atr">ATR(14)</option>
            <option value="adx">ADX(14)</option>
            <option value="volume">Volume + MA</option>
            <option value="cci">CCI(20)</option>
            <option value="williamsR">Williams %R</option>
          </select>

          {/* Indicators Dropdown Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowIndicatorMenu(!showIndicatorMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-700 dark:text-[#E6ECF5] hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>Overlays</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showIndicatorMenu && (
              <div className="absolute right-0 top-8 z-30 w-56 rounded-xl border border-slate-200 dark:border-[#223049] bg-white dark:bg-[#111A2E] p-2 shadow-2xl space-y-1 text-xs">
                {[
                  { label: 'SMA 20', val: showSMA20, toggle: () => setShowSMA20(!showSMA20) },
                  { label: 'EMA 50', val: showEMA50, toggle: () => setShowEMA50(!showEMA50) },
                  { label: 'Bollinger Bands', val: showBollinger, toggle: () => setShowBollinger(!showBollinger) },
                  { label: 'Keltner Channels', val: showKeltner, toggle: () => setShowKeltner(!showKeltner) },
                  { label: 'Donchian Channels', val: showDonchian, toggle: () => setShowDonchian(!showDonchian) },
                  { label: 'Ichimoku Cloud', val: showIchimoku, toggle: () => setShowIchimoku(!showIchimoku) },
                  { label: 'Supertrend', val: showSupertrend, toggle: () => setShowSupertrend(!showSupertrend) },
                  { label: 'Parabolic SAR', val: showParabolicSAR, toggle: () => setShowParabolicSAR(!showParabolicSAR) },
                  { label: 'Tick VWAP', val: showVWAP, toggle: () => setShowVWAP(!showVWAP) },
                  { label: 'Session Boxes', val: showSessions, toggle: () => setShowSessions(!showSessions) },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.toggle}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer"
                  >
                    <span className="text-slate-800 dark:text-slate-200">{item.label}</span>
                    {item.val && <Check className="w-3.5 h-3.5 text-indigo-500 font-bold" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layouts Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLayoutMenu(!showLayoutMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-700 dark:text-[#E6ECF5] hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <Bookmark className="w-3.5 h-3.5 text-indigo-500" />
              <span>Layout</span>
            </button>

            {showLayoutMenu && (
              <div className="absolute right-0 top-8 z-30 w-64 rounded-xl border border-slate-200 dark:border-[#223049] bg-white dark:bg-[#111A2E] p-3 shadow-2xl space-y-2 text-xs">
                <span className="font-bold text-slate-900 dark:text-[#E6ECF5] block">Save Current Layout</span>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={layoutNameInput}
                    onChange={(e) => setLayoutNameInput(e.target.value)}
                    placeholder="Layout name..."
                    className="w-full px-2 py-1 rounded border border-slate-200 dark:border-[#223049] bg-slate-50 dark:bg-[#0B1020] text-slate-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveLayout}
                    className="px-2.5 py-1 rounded bg-indigo-600 text-white font-bold"
                  >
                    Save
                  </button>
                </div>
                {savedLayouts.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 dark:border-[#223049] space-y-1">
                    <span className="text-[11px] text-slate-500 dark:text-[#9FB0C8] font-bold">Saved Layouts</span>
                    {savedLayouts.map((l) => (
                      <div key={l.id} className="text-[11px] text-slate-700 dark:text-slate-300 py-0.5">
                        {l.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export PNG & CSV */}
          <button
            type="button"
            onClick={handleExportPNG}
            title="Export PNG Screenshot"
            className="p-1 rounded bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            title="Export CSV Bars"
            className="p-1 rounded bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen (F)"
            className="p-1 rounded bg-slate-100 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Chart Area */}
      <div
        className={`relative flex-1 overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
        }`}
        style={{ minHeight: height }}
        onMouseDown={handleMouseDown}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Bottom Mini-Map Scrubber Timeline */}
      <div className="p-2 border-t border-slate-200 dark:border-[#223049] bg-slate-50 dark:bg-[#0B1020]/50 text-[10px] font-mono">
        <div className="flex items-center justify-between text-slate-500 dark:text-[#9FB0C8] mb-1">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-indigo-500" />
            <span>Timeline: {totalBars} bars</span>
          </span>
          <span>
            Bars {clampedStart + 1} - {clampedEnd + 1} ({Math.round(((clampedEnd - clampedStart + 1) / Math.max(1, totalBars)) * 100)}% span)
          </span>
        </div>

        <div
          className="relative h-4 rounded bg-slate-200 dark:bg-slate-900 cursor-pointer overflow-hidden border border-slate-300 dark:border-slate-800"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const count = clampedEnd - clampedStart + 1;
            const target = Math.round(ratio * totalBars);
            let nStart = Math.max(0, target - Math.round(count / 2));
            let nEnd = Math.min(totalBars - 1, nStart + count - 1);
            if (nEnd >= totalBars - 1) {
              nStart = Math.max(0, totalBars - count);
            }
            setViewRange({ start: nStart, end: nEnd });
          }}
        >
          <div
            style={{
              left: `${(clampedStart / Math.max(1, totalBars)) * 100}%`,
              width: `${Math.max(2.5, ((clampedEnd - clampedStart + 1) / Math.max(1, totalBars)) * 100)}%`,
            }}
            className="absolute top-0 bottom-0 bg-indigo-500/40 border border-indigo-400 rounded-sm"
          />
        </div>
      </div>
    </div>
  );
};
