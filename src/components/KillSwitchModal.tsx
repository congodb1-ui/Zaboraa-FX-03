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
import { Button } from './ui';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl border border-danger/60 bg-surface p-6 shadow-2xl space-y-4 text-text">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-danger/30 pb-3">
          <div className="flex items-center gap-2.5 text-danger">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
            <div>
              <h2 className="text-base font-bold text-text tracking-tight font-sans">
                Global Emergency Kill Switch
              </h2>
              <span className="text-xs text-danger font-mono">
                Persistent Account-Wide Execution Halt
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text cursor-pointer p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Body */}
        <div className="text-xs text-text-muted space-y-2 leading-relaxed font-sans">
          <p>
            Engaging the Kill Switch immediately executes the following safety protocols:
          </p>
          <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-text-muted">
            <li>Liquidates all <strong className="text-text">{positions.length}</strong> open broker market positions.</li>
            <li>Cancels all pending limit and stop orders.</li>
            <li>Halts all automated trading bots fleet-wide.</li>
            <li>
              Sets persistent <code className="text-danger">no_new_orders = true</code> in SQLite system state.
            </li>
          </ul>
        </div>

        {/* Loud Failure Banner if unclosed positions remain or bridge down */}
        {loudFailure && (
          <div className="p-3.5 rounded-lg border border-danger bg-danger/10 text-danger text-xs space-y-2 shadow-xs">
            <div className="flex items-center gap-2 font-bold">
              <ShieldAlert className="w-5 h-5 text-danger animate-bounce" />
              <span>LOUD FAILURE STATE: UNVERIFIED LIQUIDATION</span>
            </div>
            <p className="text-[11px] font-mono leading-relaxed">{resultMessage}</p>
            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleTrigger}
                className="px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-danger hover:brightness-110 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Now
              </button>
            </div>
          </div>
        )}

        {/* Success / Flat Confirmation */}
        {resultMessage && !loudFailure && (
          <div className="p-3 rounded-lg border border-success/40 bg-success/10 text-success text-xs flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <span>{resultMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          {brokerState.killSwitchActive ? (
            <button
              type="button"
              onClick={onResetKillSwitch}
              className="px-4 py-2 rounded text-xs font-bold bg-surface hover:bg-border/30 text-primary border border-border transition-colors cursor-pointer"
            >
              Reset Emergency Halt
            </button>
          ) : (
            <div className="text-[11px] text-text-muted font-mono">
              Broker: {brokerState.server}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={isProcessing}
              disabled={isProcessing}
              onClick={handleTrigger}
              icon={<AlertOctagon className="w-4 h-4" />}
            >
              {isProcessing ? 'Liquidating...' : 'Engage Kill Switch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
