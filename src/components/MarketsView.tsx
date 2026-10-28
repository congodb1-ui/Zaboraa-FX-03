import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  DollarSign,
  Lock,
  Percent,
  Play,
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
  const [orderFeedback, setOrderFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Live market quotes (simulated from broker bridge)
  const quotes: Record<
    ForexSymbol,
    { bid: number; ask: number; spread: number; change24h: number; high: number; low: number }
  > = {
    EURUSD: { bid: 1.0852, ask: 1.08532, spread: 1.2, change24h: 0.28, high: 1.0875, low: 1.0818 },
    GBPUSD: { bid: 1.2965, ask: 1.29668, spread: 1.8, change24h: -0.15, high: 1.2995, low: 1.294 },
    USDJPY: { bid: 151.34, ask: 151.352, spread: 1.2, change24h: 0.42, high: 151.8, low: 150.9 },
    XAUUSD: { bid: 2648.5, ask: 2648.75, spread: 25.0, change24h: 1.15, high: 2658.0, low: 2635.2 },
  };

  const currentQuote = quotes[selectedSymbol];

  const handleQuickOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderFeedback(null);

    const slNum = parseFloat(slPrice);
    const tpNum = tpPrice ? parseFloat(tpPrice) : undefined;

    // Check mandatory Stop-Loss firewall
    if (isNaN(slNum) || slNum <= 0) {
      setOrderFeedback({
        success: false,
        message: 'MANDATORY STOP-LOSS: Order blocked! Every order must specify a valid SL > 0.',
      });
      return;
    }

    const currentPrice = side === 'BUY' ? currentQuote.ask : currentQuote.bid;

    // Validate SL side
    if (side === 'BUY' && slNum >= currentPrice) {
      setOrderFeedback({
        success: false,
        message: `INVALID STOP-LOSS: For BUY orders, SL (${slNum}) must be strictly below current ask (${currentPrice}).`,
      });
      return;
    }
    if (side === 'SELL' && slNum <= currentPrice) {
      setOrderFeedback({
        success: false,
        message: `INVALID STOP-LOSS: For SELL orders, SL (${slNum}) must be strictly above current bid (${currentPrice}).`,
      });
      return;
    }

    // Evaluate Risk Manager limits
    const riskCheck = globalRiskManager.evaluateOrderRisk(
      {
        symbol: selectedSymbol,
        side,
        volume,
        price: currentPrice,
        sl: slNum,
        tp: tpNum,
        currentSpreadPips: currentQuote.spread,
      },
      {
        maxLots: 5.0,
        maxSpreadPips: 5.0,
        maxDrawdownPct: 10.0,
        maxRiskPerTradePct: 2.0,
        dailyLossLimitPct: 4.0,
        maxOpenPositions: 5,
        mandatoryStopLoss: true,
        tradingHours: { startUtcHour: 0, endUtcHour: 24 },
      },
      {
        balance: brokerState.balance,
        equity: brokerState.equity,
        openPositions: positions,
        todayPnl: 0,
      }
    );

    if (!riskCheck.allowed) {
      setOrderFeedback({
        success: false,
        message: `RISK FIREWALL BLOCKED: ${riskCheck.reason}`,
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
      message: `Order submitted successfully to broker! Ticket created with SL @ ${slNum}.`,
    });
  };

  const handleSymbolSelect = (sym: ForexSymbol) => {
    setSelectedSymbol(sym);
    const q = quotes[sym];
    const pipScale = sym === 'USDJPY' ? 0.01 : sym === 'XAUUSD' ? 1.0 : 0.0001;
    if (side === 'BUY') {
      setSlPrice((q.ask - 25 * pipScale).toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5));
      setTpPrice((q.ask + 50 * pipScale).toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5));
    } else {
      setSlPrice((q.bid + 25 * pipScale).toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5));
      setTpPrice((q.bid - 50 * pipScale).toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5));
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[11px] font-medium text-slate-400">Account Balance</span>
          <div className="mt-1 font-mono text-lg font-bold text-white tabular-nums">
            ${brokerState.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Exness Demo Equity</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[11px] font-medium text-slate-400">Floating Equity</span>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
            ${brokerState.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Real-time MTM</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[11px] font-medium text-slate-400">Used Margin</span>
          <div className="mt-1 font-mono text-lg font-bold text-slate-200 tabular-nums">
            ${brokerState.margin.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Leverage 1:100</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <span className="text-[11px] font-medium text-slate-400">Free Margin</span>
          <div className="mt-1 font-mono text-lg font-bold text-blue-400 tabular-nums">
            ${brokerState.freeMargin.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">Available for orders</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 col-span-2 md:col-span-1">
          <span className="text-[11px] font-medium text-slate-400">Today P&L</span>
          <div className="mt-1 font-mono text-lg font-bold text-emerald-400 tabular-nums">
            +$245.80
          </div>
          <div className="text-[10px] text-emerald-500/80 font-mono">+2.46% (Closed)</div>
        </div>
      </div>

      {/* Market Watch Quotes Strip */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Broker Market Quotes (Exness MT5)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(quotes) as ForexSymbol[]).map((sym) => {
            const q = quotes[sym];
            const isSelected = selectedSymbol === sym;
            const isUp = q.change24h >= 0;

            return (
              <div
                key={sym}
                onClick={() => handleSymbolSelect(sym)}
                className={`cursor-pointer rounded-lg border p-3 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/10 ring-1 ring-blue-500'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{sym}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      Spr: {q.spread} pt
                    </span>
                  </div>
                  <div
                    className={`flex items-center text-xs font-mono font-medium ${
                      isUp ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {q.change24h}%
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-center font-mono">
                  <div className="rounded bg-slate-950/60 p-1.5 border border-slate-800/80">
                    <span className="block text-[10px] text-slate-500">BID</span>
                    <span className="text-sm font-semibold text-rose-400 tabular-nums">
                      {q.bid.toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5)}
                    </span>
                  </div>
                  <div className="rounded bg-slate-950/60 p-1.5 border border-slate-800/80">
                    <span className="block text-[10px] text-slate-500">ASK</span>
                    <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                      {q.ask.toFixed(sym === 'USDJPY' ? 3 : sym === 'XAUUSD' ? 2 : 5)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trading Desk: Order Entry + Active Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Ticket with Mandatory SL Firewall */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Order Execution Desk</h3>
            </div>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {selectedSymbol}
            </span>
          </div>

          <form onSubmit={handleQuickOrder} className="mt-4 space-y-3">
            {/* Buy / Sell Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSide('BUY')}
                className={`py-2 rounded font-bold text-xs tracking-wider transition-colors ${
                  side === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                BUY / LONG
              </button>
              <button
                type="button"
                onClick={() => setSide('SELL')}
                className={`py-2 rounded font-bold text-xs tracking-wider transition-colors ${
                  side === 'SELL'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                SELL / SHORT
              </button>
            </div>

            {/* Volume Input */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Volume (Standard Lots)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="5.0"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value) || 0.1)}
                className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>Pip Value: ${(calculatePipValue(selectedSymbol, volume)).toFixed(2)}</span>
                <span>Max Allowed: 5.00 lots</span>
              </div>
            </div>

            {/* Mandatory Stop Loss */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-rose-400" />
                  Mandatory Stop-Loss (SL)
                </label>
                <span className="text-[10px] font-mono text-rose-400 font-semibold uppercase">
                  Required by rule
                </span>
              </div>
              <input
                type="text"
                required
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
                placeholder="Required e.g. 1.08200"
                className="w-full px-3 py-1.5 rounded bg-slate-950 border border-rose-500/40 font-mono text-xs text-rose-300 focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Take Profit */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Take-Profit (TP) Target
              </label>
              <input
                type="text"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
                placeholder="Optional e.g. 1.09200"
                className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Feedback Message */}
            {orderFeedback && (
              <div
                className={`p-2.5 rounded text-xs border ${
                  orderFeedback.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {orderFeedback.message}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className={`w-full py-2.5 rounded font-bold text-xs uppercase tracking-wider transition-all shadow-md ${
                side === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
              }`}
            >
              Execute {side} {volume} Lots on {selectedSymbol}
            </button>
            <div className="text-[10px] text-center text-slate-500">
              Protected by Pre-logged Intent & Authoritative Risk Firewall
            </div>
          </form>
        </div>

        {/* Active Open Positions Table */}
        <div className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900/90 p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm text-white">
                  Broker Open Positions ({positions.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Exness MT5 Live IPC
              </span>
            </div>

            {positions.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active positions open on broker account. Account is 100% flat.
              </div>
            ) : (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="py-2">Ticket</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Lots</th>
                      <th>Open</th>
                      <th>Current</th>
                      <th>SL</th>
                      <th>TP</th>
                      <th>P&L ($)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {positions.map((pos) => {
                      const isProfit = pos.pnl >= 0;
                      return (
                        <tr key={pos.ticket} className="hover:bg-slate-800/30">
                          <td className="py-2.5 font-semibold text-slate-300">
                            #{pos.ticket}
                          </td>
                          <td className="font-bold text-white">{pos.symbol}</td>
                          <td>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                pos.side === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {pos.side}
                            </span>
                          </td>
                          <td>{pos.volume.toFixed(2)}</td>
                          <td>{pos.openPrice}</td>
                          <td>{pos.currentPrice}</td>
                          <td className="text-rose-400 font-semibold">{pos.sl}</td>
                          <td className="text-emerald-400">{pos.tp || '-'}</td>
                          <td
                            className={`font-bold tabular-nums ${
                              isProfit ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isProfit ? '+' : ''}
                            {pos.pnl.toFixed(2)}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => onClosePosition(pos.ticket)}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors"
                            >
                              Close
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-400">
            <span>Broker Mode: <strong className="text-emerald-400 font-mono">DEMO</strong></span>
            <span>Unhedged Margin: <strong className="text-slate-200 font-mono">${brokerState.margin.toFixed(2)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
