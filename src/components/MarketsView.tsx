import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  HelpCircle,
  Lock,
  Percent,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import { BrokerState, ForexSymbol, OrderRecord, PositionRecord } from '../types/forex';
import { calculatePipValue } from '../engine/engineMath';
import { globalRiskManager } from '../engine/riskManager';

interface MarketsViewProps {
  brokerState: BrokerState;
  positions: PositionRecord[];
  orders: OrderRecord[];
  onPlaceOrder: (order: {
    symbol: ForexSymbol;
    side: 'BUY' | 'SELL';
    volume: number;
    sl: number;
    tp?: number;
  }) => void;
  onClosePosition: (ticket: number) => void;
}

export const MarketsView: React.FC<MarketsViewProps> = ({
  brokerState,
  positions,
  orders,
  onPlaceOrder,
  onClosePosition,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<ForexSymbol>('EURUSD');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [volume, setVolume] = useState<number>(1.0);
  const [slPrice, setSlPrice] = useState<string>('1.08200');
  const [tpPrice, setTpPrice] = useState<string>('1.09200');

  // Confirmation modals
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [pendingCloseTicket, setPendingCloseTicket] = useState<number | null>(null);
  const [orderFeedback, setOrderFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Live quotes with day range & pips
  const quotes: Record<
    ForexSymbol,
    { bid: number; ask: number; spreadPips: number; change24h: number; high: number; low: number; pipSize: number }
  > = {
    EURUSD: { bid: 1.0852, ask: 1.08532, spreadPips: 1.2, change24h: 0.28, high: 1.0875, low: 1.0818, pipSize: 0.0001 },
    GBPUSD: { bid: 1.2965, ask: 1.29668, spreadPips: 1.8, change24h: -0.15, high: 1.2995, low: 1.294, pipSize: 0.0001 },
    USDJPY: { bid: 151.34, ask: 151.352, spreadPips: 1.2, change24h: 0.42, high: 151.8, low: 150.9, pipSize: 0.01 },
    XAUUSD: { bid: 2648.5, ask: 2648.75, spreadPips: 2.5, change24h: 1.15, high: 2658.0, low: 2635.2, pipSize: 0.1 },
  };

  const currentQuote = quotes[selectedSymbol];
  const decimals = selectedSymbol === 'XAUUSD' ? 2 : selectedSymbol === 'USDJPY' ? 3 : 5;

  // Preset pip helper calculations
  const applyPipPreset = (type: 'SL' | 'TP', pips: number) => {
    const entry = side === 'BUY' ? currentQuote.ask : currentQuote.bid;
    const delta = pips * currentQuote.pipSize;
    if (type === 'SL') {
      const target = side === 'BUY' ? entry - delta : entry + delta;
      setSlPrice(target.toFixed(decimals));
    } else {
      const target = side === 'BUY' ? entry + delta : entry - delta;
      setTpPrice(target.toFixed(decimals));
    }
  };

  // Review step calculations
  const slNum = parseFloat(slPrice);
  const tpNum = tpPrice ? parseFloat(tpPrice) : undefined;
  const entryPrice = side === 'BUY' ? currentQuote.ask : currentQuote.bid;

  let slPips = 0;
  let dollarRisk = 0;
  let riskPct = 0;
  let tpPips = 0;
  let dollarReward = 0;
  let rrRatio = 'N/A';
  let marginRequired = (volume * (selectedSymbol === 'XAUUSD' ? 100 : 100000)) / 100; // 1:100 leverage

  if (!isNaN(slNum) && slNum > 0) {
    slPips = Math.abs(entryPrice - slNum) / currentQuote.pipSize;
    const pipValue = calculatePipValue(selectedSymbol, volume, entryPrice);
    dollarRisk = Number((slPips * pipValue).toFixed(2));
    riskPct = Number(((dollarRisk / brokerState.balance) * 100).toFixed(2));

    if (tpNum && !isNaN(tpNum) && tpNum > 0) {
      tpPips = Math.abs(tpNum - entryPrice) / currentQuote.pipSize;
      dollarReward = Number((tpPips * pipValue).toFixed(2));
      rrRatio = `1 : ${(dollarReward / Math.max(1, dollarRisk)).toFixed(1)}`;
    }
  }

  // Pre-validate before opening review modal
  const handleInitiateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFeedback(null);

    if (isNaN(slNum) || slNum <= 0) {
      setOrderFeedback({
        success: false,
        message: 'A valid Stop-Loss price greater than zero is required by platform risk rule.',
      });
      return;
    }

    if (side === 'BUY' && slNum >= entryPrice) {
      setOrderFeedback({
        success: false,
        message: `For BUY orders, Stop-Loss (${slNum}) must be strictly below entry price (${entryPrice}).`,
      });
      return;
    }
    if (side === 'SELL' && slNum <= entryPrice) {
      setOrderFeedback({
        success: false,
        message: `For SELL orders, Stop-Loss (${slNum}) must be strictly above entry price (${entryPrice}).`,
      });
      return;
    }

    setIsReviewModalOpen(true);
  };

  // Firewall rejection remediation state
  const [remediation, setRemediation] = useState<{
    rule: string;
    ruleName: string;
    limit: any;
    attempted: any;
    suggestedLots: number | null;
    message: string;
  } | null>(null);

  const handleConfirmOrder = async () => {
    setIsReviewModalOpen(false);
    setRemediation(null);
    setOrderFeedback(null);

    const idempotencyKey = crypto.randomUUID();
    let authToken = '';
    try {
      const stored = localStorage.getItem('sb-auth-token');
      if (stored) {
        authToken = JSON.parse(stored).access_token || '';
      }
    } catch {}

    try {
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          accountId: brokerState.accountLogin || '50192834',
          accountType: brokerState.mode === 'REAL' ? 'live' : 'demo',
          symbol: selectedSymbol,
          side,
          volume,
          price: entryPrice,
          sl: slNum,
          tp: tpNum,
          currentSpreadPips: currentQuote.spreadPips,
          balance: brokerState.balance,
          openPositionsCount: positions.length,
        }),
      });

      const data = await resp.json();

      if (resp.status === 422) {
        // 422 Risk Firewall Rejection
        setRemediation({
          rule: data.rule,
          ruleName: data.ruleName || data.rule,
          limit: data.limit,
          attempted: data.attempted,
          suggestedLots: data.suggestedLots ?? null,
          message: data.message || 'Risk Firewall rejected this trade.',
        });
        setOrderFeedback({
          success: false,
          message: data.message || 'Risk Firewall rejected this order.',
        });
        return;
      }

      if (!resp.ok) {
        setOrderFeedback({
          success: false,
          message: data.message || data.error || `Order failed (${resp.status})`,
        });
        return;
      }

      onPlaceOrder({
        symbol: selectedSymbol,
        side,
        volume,
        sl: slNum,
        tp: tpNum,
      });

      setOrderFeedback({
        success: true,
        message: data.message || `Order submitted: ${side} ${volume.toFixed(2)} lot ${selectedSymbol} with SL at ${slNum}`,
      });
    } catch (e: any) {
      setOrderFeedback({
        success: false,
        message: `Network error placing order: ${e.message}`,
      });
    }
  };

  const handleApplySuggestedLots = () => {
    if (remediation && remediation.suggestedLots !== null) {
      setVolume(remediation.suggestedLots);
      setRemediation(null);
      setOrderFeedback({
        success: true,
        message: `Volume adjusted to ${remediation.suggestedLots} lots. Review and submit order.`,
      });
    }
  };

  // Positions table totals
  const totalLots = positions.reduce((acc, p) => acc + p.volume, 0);
  const totalPnl = positions.reduce((acc, p) => acc + p.pnl, 0);
  const profitablePositions = positions.filter((p) => p.pnl > 0);

  return (
    <div className="space-y-6">
      {/* 1. TOP BROKER ACCOUNT SUMMARY KPI STRIP */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors">
          <div className="text-xs text-slate-500 dark:text-[#9FB0C8] font-medium">Account Balance</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#E6ECF5] tabular-nums mt-1">
            ${brokerState.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Demo Equity Base</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors">
          <div className="text-xs text-slate-500 dark:text-[#9FB0C8] font-medium">Floating Equity</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              brokerState.equity >= brokerState.balance
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            ${brokerState.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            P&L: {(brokerState.equity - brokerState.balance >= 0 ? '+' : '')}$
            {(brokerState.equity - brokerState.balance).toFixed(2)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors">
          <div className="text-xs text-slate-500 dark:text-[#9FB0C8] font-medium">Margin in Use</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#E6ECF5] tabular-nums mt-1">
            ${brokerState.margin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Leverage 1:100</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors">
          <div className="text-xs text-slate-500 dark:text-[#9FB0C8] font-medium">Free Margin</div>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-[#E6ECF5] tabular-nums mt-1">
            ${brokerState.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium">Margin Nominal</div>
        </div>
      </div>

      {/* 2. LIVE MARKET QUOTE CARDS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-[#E6ECF5]">
            Market Quotes
          </h2>
          <span className="text-xs text-slate-500 dark:text-[#9FB0C8]">Updated 2s ago</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(Object.keys(quotes) as ForexSymbol[]).map((sym) => {
            const q = quotes[sym];
            const isSelected = selectedSymbol === sym;
            const symDecimals = sym === 'XAUUSD' ? 2 : sym === 'USDJPY' ? 3 : 5;
            const rangePct = Math.round(((q.bid - q.low) / (q.high - q.low)) * 100);

            return (
              <div
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`p-4 rounded-2xl bg-white dark:bg-[#111A2E] border transition-all cursor-pointer shadow-sm ${
                  isSelected
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                    : 'border-slate-200 dark:border-[#223049] hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-base text-slate-900 dark:text-[#E6ECF5]">{sym}</div>
                  <div
                    className={`flex items-center gap-1 font-semibold text-xs font-mono ${
                      q.change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {q.change24h >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>{q.change24h >= 0 ? `+${q.change24h}%` : `${q.change24h}%`}</span>
                  </div>
                </div>

                {/* BID / ASK Display with unified styling */}
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-[#223049]/60">
                  <div>
                    <div className="text-[11px] text-slate-400 font-medium">BID</div>
                    <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 tabular-nums">
                      {q.bid.toFixed(symDecimals)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400 font-medium">ASK</div>
                    <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 tabular-nums">
                      {q.ask.toFixed(symDecimals)}
                    </div>
                  </div>
                </div>

                {/* Micro Day Range Bar & Pip Spread */}
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${Math.max(5, Math.min(95, rangePct))}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-[#9FB0C8] font-mono mt-1.5">
                    <span>Spread: {q.spreadPips} pips</span>
                    <span>Range: {rangePct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. ORDER DESK & POSITIONS AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Order Desk Card (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#223049]">
            <h2 className="text-base font-bold text-slate-900 dark:text-[#E6ECF5]">
              Order Execution Desk
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0B1020] text-slate-700 dark:text-[#9FB0C8] border border-slate-200 dark:border-[#223049]">
              {selectedSymbol}
            </span>
          </div>

          <form onSubmit={handleInitiateOrder} className="space-y-4">
            {/* Buy / Sell Tab Switcher with subtle tints */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  side === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 ring-2 ring-emerald-500'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                }`}
              >
                <span>Buy</span>
                <span className="font-mono text-xs tabular-nums">({currentQuote.ask.toFixed(decimals)})</span>
              </button>

              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  side === 'SELL'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30 ring-2 ring-rose-500'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                }`}
              >
                <span>Sell</span>
                <span className="font-mono text-xs tabular-nums">({currentQuote.bid.toFixed(decimals)})</span>
              </button>
            </div>

            {/* Volume & Quick Lot Presets */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Volume (Lots)</label>
                <div className="flex gap-1">
                  {[0.01, 0.1, 0.5, 1.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVolume(preset)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                        volume === preset
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value) || 0.01)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-900 dark:text-white font-mono tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Stop Loss (Neutral Styling with Amber Warning) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <span>Stop Loss Price</span>
                  <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 font-sans">
                    (Required by safety rule)
                  </span>
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => applyPipPreset('SL', 20)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    20 pips
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPipPreset('SL', 30)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    30 pips
                  </button>
                </div>
              </div>
              <input
                type="number"
                step="0.0001"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="Enter SL price..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-slate-300 dark:border-[#223049] text-slate-900 dark:text-white font-mono tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Take Profit (Optional) */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Take Profit Price <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => applyPipPreset('TP', 50)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  50 pips
                </button>
              </div>
              <input
                type="number"
                step="0.0001"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="Enter TP price..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-slate-900 dark:text-white font-mono tabular-nums text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Risk Firewall Rejection Remediation Banner */}
            {remediation && (
              <div className="p-3.5 rounded-xl text-xs bg-rose-500/15 border-2 border-rose-500/50 text-rose-900 dark:text-rose-200 space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-rose-600 dark:text-rose-400">
                      Risk Firewall Violation: {remediation.ruleName}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {remediation.message}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white/60 dark:bg-black/30 p-2 rounded-lg">
                  <div>
                    <span className="text-slate-500">Allowed Limit:</span>{' '}
                    <span className="font-bold text-slate-800 dark:text-slate-200">{String(remediation.limit)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Attempted:</span>{' '}
                    <span className="font-bold text-rose-600 dark:text-rose-400">{String(remediation.attempted)}</span>
                  </div>
                </div>

                {remediation.suggestedLots !== null ? (
                  <button
                    type="button"
                    onClick={handleApplySuggestedLots}
                    className="w-full py-2 px-3 rounded-lg font-semibold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Reduce to {remediation.suggestedLots} {remediation.suggestedLots === 1 ? 'lot' : 'lots'}</span>
                    <span className="text-[10px] opacity-80">(within risk budget)</span>
                  </button>
                ) : (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 italic bg-amber-500/10 p-1.5 rounded">
                    Stop-loss distance exceeds risk limit for minimum allowable 0.01 lot. Tighten stop loss to proceed.
                  </div>
                )}
              </div>
            )}

            {/* Standard Feedback Message (when not firewall remediation) */}
            {orderFeedback && !remediation && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  orderFeedback.success
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                }`}
              >
                {orderFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                )}
                <span>{orderFeedback.message}</span>
              </div>
            )}

            {/* Natural Order Button with Review Step */}
            <button
              type="submit"
              disabled={!brokerState.allowTrading || brokerState.killSwitchActive}
              className={`w-full py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all cursor-pointer ${
                !brokerState.allowTrading || brokerState.killSwitchActive
                  ? 'bg-slate-400 dark:bg-slate-800 cursor-not-allowed opacity-60'
                  : side === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
              }`}
            >
              {!brokerState.allowTrading
                ? 'Trading Disabled in Settings'
                : brokerState.killSwitchActive
                ? 'Emergency Halt Engaged'
                : `${side === 'BUY' ? 'Buy' : 'Sell'} ${volume.toFixed(2)} ${volume === 1 ? 'lot' : 'lots'} ${selectedSymbol}`}
            </button>
          </form>
        </div>

        {/* Right: Open Positions Table & Actions (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm transition-colors space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#223049]">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-[#E6ECF5]">
                Active Positions ({positions.length})
              </h2>
              <span className="text-xs text-slate-500 dark:text-[#9FB0C8]">Real-time MTM valuation</span>
            </div>

            {positions.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => positions.forEach((p) => onClosePosition(p.ticket))}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer"
                >
                  Close all
                </button>
                {profitablePositions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => profitablePositions.forEach((p) => onClosePosition(p.ticket))}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors cursor-pointer"
                  >
                    Close profitable ({profitablePositions.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {positions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <Clock className="w-8 h-8 text-slate-400" />
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">No active positions</div>
              <p className="text-xs text-slate-500 dark:text-[#9FB0C8] max-w-sm">
                Configure your trade parameters on the order desk to open a new simulated or demo market position.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-[#9FB0C8]">
                    <th className="text-left py-2 font-medium">Ticket</th>
                    <th className="text-left py-2 font-medium">Side / Pair</th>
                    <th className="text-right py-2 font-medium">Lots</th>
                    <th className="text-right py-2 font-medium">Open Price</th>
                    <th className="text-right py-2 font-medium">Current</th>
                    <th className="text-right py-2 font-medium">Floating P&L</th>
                    <th className="text-center py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {positions.map((pos) => {
                    const isGain = pos.pnl >= 0;
                    return (
                      <tr key={pos.ticket} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 text-slate-500">#{pos.ticket}</td>
                        <td className="py-2.5 font-sans">
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold mr-1.5 ${
                              pos.side === 'BUY'
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {pos.side}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{pos.symbol}</span>
                        </td>
                        <td className="py-2.5 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {pos.volume.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                          {pos.openPrice.toFixed(pos.symbol === 'XAUUSD' ? 2 : 5)}
                        </td>
                        <td className="py-2.5 text-right text-slate-800 dark:text-slate-200 font-semibold tabular-nums">
                          {pos.currentPrice.toFixed(pos.symbol === 'XAUUSD' ? 2 : 5)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-bold tabular-nums ${
                            isGain ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isGain ? '+' : ''}${pos.pnl.toFixed(2)}
                        </td>
                        <td className="py-2.5 text-center font-sans">
                          {pendingCloseTicket === pos.ticket ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onClosePosition(pos.ticket);
                                  setPendingCloseTicket(null);
                                }}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingCloseTicket(null)}
                                className="px-2 py-0.5 rounded text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPendingCloseTicket(pos.ticket)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/10 hover:text-rose-600 transition-colors cursor-pointer"
                            >
                              Close
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals Row */}
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold font-mono text-xs">
                    <td colSpan={2} className="py-2.5 font-sans text-slate-800 dark:text-slate-200">Total</td>
                    <td className="py-2.5 text-right text-slate-800 dark:text-slate-200 tabular-nums">
                      {totalLots.toFixed(2)}
                    </td>
                    <td colSpan={2} />
                    <td
                      className={`py-2.5 text-right font-bold tabular-nums ${
                        totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 4. TWO-STEP ORDER REVIEW MODAL */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full p-6 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#223049]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-[#E6ECF5]">
                  Order Confirmation & Risk Review
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-[#9FB0C8]">Intent</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {side} {volume.toFixed(2)} {volume === 1 ? 'lot' : 'lots'} {selectedSymbol}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono">
                <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Est. Execution Price</span>
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                  {entryPrice.toFixed(decimals)}
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono">
                <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Stop Loss</span>
                <span className="font-bold text-amber-500 tabular-nums">
                  {slNum.toFixed(decimals)} ({slPips.toFixed(1)} pips)
                </span>
              </div>

              {tpNum && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono">
                  <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Take Profit</span>
                  <span className="font-bold text-emerald-500 tabular-nums">
                    {tpNum.toFixed(decimals)} ({tpPips.toFixed(1)} pips)
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono">
                <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Dollar Risk</span>
                <span className="font-bold text-rose-500 tabular-nums">
                  ${dollarRisk} ({riskPct}% of balance)
                </span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 font-mono">
                <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Reward-to-Risk</span>
                <span className="font-bold text-indigo-500 tabular-nums">{rrRatio}</span>
              </div>

              <div className="flex justify-between py-1.5 font-mono">
                <span className="text-slate-500 dark:text-[#9FB0C8] font-sans">Margin Required</span>
                <span className="text-slate-700 dark:text-slate-300 tabular-nums">
                  ${marginRequired.toFixed(2)} (Spread: {currentQuote.spreadPips} pips)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmOrder}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
