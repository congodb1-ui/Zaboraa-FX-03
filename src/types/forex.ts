export type ForexSymbol = 'EURUSD' | 'GBPUSD' | 'USDJPY' | 'XAUUSD';

export type Timeframe = 'M1' | 'M5' | 'M10' | 'M15' | 'M30' | 'H1' | 'H3' | 'D1';

export type ProvenanceType = 'MT5 BRIDGE' | 'USER CSV' | 'SIMULATED';

export type AccountMode = 'DEMO' | 'REAL' | 'CONTEST' | 'UNKNOWN';

export type BotMode = 'PAPER' | 'DEMO' | 'LIVE';

export type BotStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export type OrderSide = 'BUY' | 'SELL';

export type OrderStatus = 'PENDING_BROKER' | 'SENT' | 'FILLED' | 'REJECTED' | 'UNKNOWN';

export interface Candle {
  time: number; // UTC epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  spread: number;
}

export interface DatasetRecord {
  id: string;
  symbol: ForexSymbol;
  timeframe: Timeframe;
  provenance: ProvenanceType;
  candleCount: number;
  startDate: string;
  endDate: string;
  isResearchEligible: boolean;
  qualityScore: number;
  gapCount: number;
  sha256: string;
  brokerServer?: string;
  utcOffsetHours: number;
  fileName?: string;
  candles: Candle[];
}

export interface OrderRecord {
  id: string;
  idempotencyKey: string;
  botId: string;
  magicNumber: number;
  ticket?: number;
  symbol: ForexSymbol;
  side: OrderSide;
  volume: number;
  intentPrice: number;
  fillPrice?: number;
  sl: number;
  tp?: number;
  status: OrderStatus;
  comment: string;
  createdAt: number;
  filledAt?: number;
  rejectReason?: string;
}

export interface PositionRecord {
  ticket: number;
  botId?: string;
  magicNumber?: number;
  symbol: ForexSymbol;
  side: OrderSide;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp?: number;
  pnl: number;
  swap: number;
  commission: number;
  openTime: number;
  comment: string;
  mode: BotMode;
}

export interface RiskLimits {
  maxLots: number;
  maxSpreadPips: number;
  maxDrawdownPct: number;
  maxRiskPerTradePct: number;
  dailyLossLimitPct: number;
  maxOpenPositions: number;
  mandatoryStopLoss: boolean;
  tradingHours: {
    startUtcHour: number;
    endUtcHour: number;
  };
}

export interface BotRecord {
  id: string;
  name: string;
  magicNumber: number;
  strategyId: string;
  strategyName: string;
  symbol: ForexSymbol;
  timeframe: Timeframe;
  mode: BotMode;
  status: BotStatus;
  riskLimits: RiskLimits;
  todayPnl: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  lastEvaluatedBarTime?: number;
  errorMessage?: string;
}

export interface TradeRecord {
  id: string;
  ticket: number;
  botId?: string;
  strategyName: string;
  symbol: ForexSymbol;
  side: OrderSide;
  volume: number;
  openPrice: number;
  closePrice: number;
  sl: number;
  tp?: number;
  tp2?: number;
  tp3?: number;
  riskRewardRatio?: number;
  pnl: number;
  pnlPips?: number;
  swap: number;
  commission: number;
  slippagePips: number;
  openTime: number;
  closeTime: number;
  exitReason: 'SL' | 'TP' | 'SIGNAL' | 'KILL_SWITCH';
  maePips: number;
  mfePips: number;
}

export interface StrategyVisualBlock {
  id: string;
  type: 'CONSOLIDATION_RANGE' | 'ORDER_BLOCK' | 'LIQUIDITY_ZONE' | 'POSITION_BOX';
  startTime: number;
  endTime: number;
  highPrice: number;
  lowPrice: number;
  entryPrice?: number;
  slPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  tp3Price?: number;
  direction?: 'LONG' | 'SHORT';
  color: string;
  label?: string;
}

export interface StrategyVisualLine {
  name: string;
  points: Array<{ time: number; price: number; color?: string }>;
  color: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

export interface StrategyVisualMarker {
  id: string;
  time: number;
  price: number;
  shape: 'triangle_up' | 'triangle_down' | 'diamond' | 'cross' | 'circle';
  color: string;
  label?: string;
}

export interface OverfittingReport {
  score: number; // 0 to 100
  label: 'Lower Estimated Overfitting Risk' | 'Moderate Empirical Divergence' | 'Elevated Overfitting Indication';
  terms: {
    oosDegradation: number;
    paramSensitivity: number;
    tradesPerParam: number;
    trialCount: number;
    sampleSize: number;
  };
  plainExplanation: string;
}

export interface BacktestReport {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: ForexSymbol;
  timeframe: Timeframe;
  periodStart: string;
  periodEnd: string;
  barCount: number;
  provenance: ProvenanceType;
  utcOffsetHours: number;
  initialBalance: number;
  finalBalance: number;
  netProfit: number;
  netProfitPct: number;
  profitFactor: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgTrade: number;
  expectancy: number;
  totalSpreadCost: number;
  totalCommission: number;
  totalSwapCost: number;
  totalSlippageCost: number;
  trades: TradeRecord[];
  visualBlocks?: StrategyVisualBlock[];
  visualLines?: StrategyVisualLine[];
  visualMarkers?: StrategyVisualMarker[];
  equityCurve: { time: number; equity: number; drawdownPct: number }[];
  overfitting: OverfittingReport;
  monteCarlo: {
    reshuffledWorstDrawdown: number;
    bootstrapDrawdown95CI: [number, number];
    bootstrapSharpe95CI: [number, number];
    simulationsCount: number;
  };
  holdoutInfo?: {
    holdoutBarsCount: number;
    holdoutStart: string;
    inSampleSharpe: number;
    outOfSampleSharpe: number;
  };
  createdAt: string;
}

export interface MathematicalSelfTest {
  id: string;
  name: string;
  category: 'Pip Math' | 'Friction Costs' | 'SL/TP Execution' | 'No-Lookahead' | 'Drawdown';
  description: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  note: string;
}

export interface BrokerState {
  connected: boolean;
  terminalRunning: boolean;
  algoTradingEnabled: boolean;
  server: string;
  accountLogin: string;
  mode: AccountMode;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  utcOffsetHours: number;
  symbolSuffix: string;
  allowTrading: boolean;
  killSwitchActive: boolean;
}

export interface RiskEvent {
  id: string;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
  rule: string;
  message: string;
  details?: Record<string, any>;
}

export interface NewsSentimentHeadline {
  id: string;
  headline: string;
  source: string;
  timestamp: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // -100 to +100
  keywords: string[];
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  relatedSymbol: string;
}

export interface RetailSentimentRecord {
  canonicalSymbol: string;
  brokerSymbol: string;
  price: number;
  change24h: number;
  longPct: number;
  shortPct: number;
  netPosition: number;
  dailyShiftPct: number;
  volumeLots: number;
  avgLongPrice: number;
  avgShortPrice: number;
  contrarianBias: 'BULLISH' | 'BEARISH_REVERSAL_RISK' | 'NEUTRAL';
  contrarianSummary: string;
}

export interface TechnicalIndicatorItem {
  name: string;
  value: number;
  action: 'Buy' | 'Sell' | 'Neutral' | 'Less Volatility';
}

export interface MovingAverageItem {
  name: string;
  simple: number;
  simpleAction: 'Buy' | 'Sell' | 'Neutral';
  exponential: number;
  exponentialAction: 'Buy' | 'Sell' | 'Neutral';
}

export interface PivotPointRow {
  name: string;
  s3: number | string;
  s2: number | string;
  s1: number | string;
  pivot: number;
  r1: number | string;
  r2: number | string;
  r3: number | string;
}

export interface TechnicalAnalysisReport {
  symbol: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  price: number;
  change24h: number;
  change24hPct: number;
  dayRangeLow: number;
  dayRangeHigh: number;
  yearRangeLow: number;
  yearRangeHigh: number;
  timeframe: string;
  summaryAction: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
  summaryBuyCount: number;
  summarySellCount: number;
  summaryNeutralCount: number;
  maAction: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
  maBuyCount: number;
  maSellCount: number;
  indicatorsAction: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
  indicatorsBuyCount: number;
  indicatorsSellCount: number;
  indicatorsNeutralCount: number;
  indicators: TechnicalIndicatorItem[];
  movingAverages: MovingAverageItem[];
  pivotPoints: PivotPointRow[];
}
