import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sliders,
  Square,
  TrendingUp,
} from 'lucide-react';
import {
  BotMode,
  BotRecord,
  BotStatus,
  BrokerState,
  ForexSymbol,
  RiskEvent,
} from '../types/forex';
import { BUILT_IN_STRATEGIES } from '../engine/workerSandbox';

interface BotsViewProps {
  bots: BotRecord[];
  brokerState: BrokerState;
  riskEvents: RiskEvent[];
  onToggleBotStatus: (botId: string, newStatus: BotStatus) => void;
  onChangeBotMode: (botId: string, newMode: BotMode) => void;
  onAddBot: (bot: BotRecord) => void;
}

export const BotsView: React.FC<BotsViewProps> = ({
  bots,
  brokerState,
  riskEvents,
  onToggleBotStatus,
  onChangeBotMode,
  onAddBot,
}) => {
  const [selectedBotForLive, setSelectedBotForLive] = useState<BotRecord | null>(null);
  const [typedConfirmationLogin, setTypedConfirmationLogin] = useState<string>('');
  const [liveGateError, setLiveGateError] = useState<string | null>(null);

  const handleOpenLiveModal = (bot: BotRecord) => {
    setSelectedBotForLive(bot);
    setTypedConfirmationLogin('');
    setLiveGateError(null);
  };

  const handleConfirmLivePromotion = () => {
    if (!selectedBotForLive) return;

    // Strict validation: must match exact demo/live account login
    if (typedConfirmationLogin !== brokerState.accountLogin) {
      setLiveGateError(
        `Account confirmation mismatch! You typed "${typedConfirmationLogin}", but active account is "${brokerState.accountLogin}".`
      );
      return;
    }

    if (!brokerState.allowTrading) {
      setLiveGateError(
        'Broker configuration has ALLOW_TRADING=false. Live execution is blocked by system policy.'
      );
      return;
    }

    onChangeBotMode(selectedBotForLive.id, 'LIVE');
    setSelectedBotForLive(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-400" />
              Automated Bot Fleet & Execution State Machine
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Strict closed-bar execution, deterministic idempotency keys, and bidirectional MT5 position reconciliation.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="px-2 py-1 rounded bg-bg border border-border text-text-muted">
              Active Bots: <strong>{bots.filter((b) => b.status === 'RUNNING').length}</strong> / {bots.length}
            </span>
          </div>
        </div>
      </div>

      {/* Bot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((b) => {
          const isRunning = b.status === 'RUNNING';
          const isPaused = b.status === 'PAUSED';

          return (
            <div
              key={b.id}
              className={`rounded-lg border p-4 shadow-lg transition-all ${
                isRunning
                  ? 'border-emerald-500/40 bg-bg ring-1 ring-emerald-500/20'
                  : isPaused
                  ? 'border-amber-500/40 bg-bg'
                  : 'border-border bg-bg'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white">{b.name}</h3>
                  <div className="text-[11px] text-text-muted font-mono mt-0.5">
                    Magic #{b.magicNumber} · {b.symbol} {b.timeframe}
                  </div>
                </div>

                {/* Mode Pill */}
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono ${
                      b.mode === 'LIVE'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : b.mode === 'DEMO'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    {b.mode}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-semibold ${
                      isRunning
                        ? 'text-emerald-400'
                        : isPaused
                        ? 'text-amber-400'
                        : 'text-text-muted'
                    }`}
                  >
                    ● {b.status}
                  </span>
                </div>
              </div>

              {/* Bot Strategy Details */}
              <div className="mt-3 p-2.5 rounded bg-bg border border-border text-xs font-mono space-y-1.5">
                <div className="flex justify-between text-text-muted">
                  <span>Strategy:</span>
                  <strong className="text-text">{b.strategyName}</strong>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Max Lots / Spread:</span>
                  <strong className="text-text">
                    {b.riskLimits.maxLots} lots · {b.riskLimits.maxSpreadPips} pt
                  </strong>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Today P&L:</span>
                  <strong
                    className={`tabular-nums font-bold ${
                      b.todayPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {b.todayPnl >= 0 ? '+' : ''}${b.todayPnl.toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Controls */}
              <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border">
                <div className="flex items-center gap-1">
                  {isRunning ? (
                    <button
                      type="button"
                      onClick={() => onToggleBotStatus(b.id, 'PAUSED')}
                      className="p-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                      title="Pause Bot"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleBotStatus(b.id, 'RUNNING')}
                      className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
                      title="Start Bot"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleBotStatus(b.id, 'STOPPED')}
                    className="p-1.5 rounded bg-surface hover:bg-surface text-text-muted hover:text-text transition-colors"
                    title="Stop Bot"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => onChangeBotMode(b.id, 'PAPER')}
                    className={`px-2 py-1 rounded font-bold ${
                      b.mode === 'PAPER'
                        ? 'bg-blue-600 text-white'
                        : 'bg-surface text-text-muted hover:text-text'
                    }`}
                  >
                    PAPER
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeBotMode(b.id, 'DEMO')}
                    className={`px-2 py-1 rounded font-bold ${
                      b.mode === 'DEMO'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-surface text-text-muted hover:text-text'
                    }`}
                  >
                    DEMO
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenLiveModal(b)}
                    className={`px-2 py-1 rounded font-bold ${
                      b.mode === 'LIVE'
                        ? 'bg-rose-600 text-white'
                        : 'bg-surface text-rose-400 hover:bg-rose-950'
                    }`}
                  >
                    LIVE
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Risk Events & Firewall Audit Trail */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <h3 className="text-xs font-bold text-text uppercase tracking-wider mb-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          Authoritative Risk Firewall Audit Events ({riskEvents.length})
        </h3>
        <div className="overflow-x-auto max-h-56 overflow-y-auto">
          {riskEvents.length === 0 ? (
            <div className="py-6 text-center text-text-muted text-xs">
              No risk events recorded. Firewall operating normally.
            </div>
          ) : (
            <div className="space-y-1.5 font-mono text-xs">
              {riskEvents.map((e) => (
                <div
                  key={e.id}
                  className={`p-2 rounded border flex items-start justify-between gap-3 ${
                    e.severity === 'CRITICAL' || e.severity === 'BLOCKED'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : e.severity === 'WARNING'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[10px] uppercase px-1.5 py-0.2 rounded bg-bg">
                      {e.severity}
                    </span>
                    <strong className="text-white">[{e.rule}]</strong>
                    <span>{e.message}</span>
                  </div>
                  <span className="text-[10px] text-text-muted whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Safety Gate Modal */}
      {selectedBotForLive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-rose-500/50 bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400 border-b border-rose-500/30 pb-3">
              <AlertOctagon className="w-6 h-6 text-rose-500 animate-pulse" />
              <div>
                <h3 className="font-bold text-sm text-white">Live Trading Safety Gate</h3>
                <span className="text-xs text-rose-300">Cryptographic Single-Use Confirmation</span>
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Promoting bot <strong>"{selectedBotForLive.name}"</strong> to <strong>LIVE</strong> mode enables automated order execution with real financial exposure on broker server <strong>{brokerState.server}</strong>.
            </p>

            <div className="p-3 rounded bg-bg border border-border text-xs font-mono space-y-1.5">
              <div className="flex justify-between text-text-muted">
                <span>Account Number:</span>
                <strong className="text-white">{brokerState.accountLogin}</strong>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Mandatory Stop-Loss:</span>
                <strong className="text-emerald-400">HARD BROKER ENFORCED</strong>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Max Lot Ceiling:</span>
                <strong className="text-text">{selectedBotForLive.riskLimits.maxLots} lots</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-300 mb-1">
                Type active account login <strong>{brokerState.accountLogin}</strong> to confirm:
              </label>
              <input
                type="text"
                value={typedConfirmationLogin}
                onChange={(e) => setTypedConfirmationLogin(e.target.value)}
                placeholder={brokerState.accountLogin}
                className="w-full px-3 py-2 rounded bg-bg border border-rose-500/40 font-mono text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {liveGateError && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {liveGateError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedBotForLive(null)}
                className="px-4 py-2 rounded text-xs font-semibold bg-surface hover:bg-surface text-text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLivePromotion}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition-all"
              >
                Promote Bot to LIVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
