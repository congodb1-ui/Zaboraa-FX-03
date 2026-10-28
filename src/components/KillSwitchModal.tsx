import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { BrokerState, PositionRecord } from '../types/forex';

interface KillSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  brokerState: BrokerState;
  positions: PositionRecord[];
  onExecuteKill: () => Promise<{ success: boolean; loudFailure: boolean; message: string }>;
  onResetKillSwitch: () => void;
}

export const KillSwitchModal: React.FC<KillSwitchModalProps> = ({
  isOpen,
  onClose,
  brokerState,
  positions,
  onExecuteKill,
  onResetKillSwitch,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [loudFailure, setLoudFailure] = useState<boolean>(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTrigger = async () => {
    setIsProcessing(true);
    setLoudFailure(false);
    setResultMessage(null);

    try {
      const res = await onExecuteKill();
      if (res.loudFailure) {
        setLoudFailure(true);
        setResultMessage(res.message);
      } else {
        setLoudFailure(false);
        setResultMessage(res.message);
      }
    } catch (err: any) {
      setLoudFailure(true);
      setResultMessage(
        'CRITICAL FAILURE: Bridge is unreachable. Emergency liquidation could not be verified by broker! Positions may still be open.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-500/60 bg-[#0E1524] p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-red-500/30 pb-3">
          <div className="flex items-center gap-2.5 text-red-500">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Global Emergency Kill Switch
              </h2>
              <span className="text-xs text-red-400 font-mono">
                Persistent Account-Wide Execution Halt
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Body */}
        <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            Engaging the Kill Switch immediately executes the following safety protocols:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-400 font-mono text-[11px]">
            <li>Liquidates all <strong>{positions.length}</strong> open broker market positions.</li>
            <li>Cancels all pending limit and stop orders.</li>
            <li>Halts all automated trading bots fleet-wide.</li>
            <li>
              Sets persistent <code className="text-red-400">no_new_orders = true</code> in SQLite system state.
            </li>
          </ul>
        </div>

        {/* Loud Failure Banner if unclosed positions remain or bridge down */}
        {loudFailure && (
          <div className="p-3.5 rounded-lg border border-red-500 bg-red-950/80 text-red-200 text-xs space-y-2 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-white">
              <ShieldAlert className="w-5 h-5 text-red-400 animate-bounce" />
              <span>LOUD FAILURE STATE: UNVERIFIED LIQUIDATION</span>
            </div>
            <p className="text-[11px] font-mono leading-relaxed">{resultMessage}</p>
            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleTrigger}
                className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-md flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Now
              </button>
            </div>
          </div>
        )}

        {/* Success / Flat Confirmation */}
        {resultMessage && !loudFailure && (
          <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/60 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{resultMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          {brokerState.killSwitchActive ? (
            <button
              type="button"
              onClick={onResetKillSwitch}
              className="px-4 py-2 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 transition-colors"
            >
              Reset Emergency Halt
            </button>
          ) : (
            <div className="text-[11px] text-slate-500 font-mono">
              Broker: {brokerState.server}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleTrigger}
              className="px-5 py-2 rounded text-xs font-bold uppercase tracking-wider bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <AlertOctagon className="w-4 h-4" />
              {isProcessing ? 'Liquidating...' : 'Engage Kill Switch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
