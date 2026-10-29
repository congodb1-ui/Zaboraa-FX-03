import React, { useState } from 'react';
import {
  CheckCircle2,
  Code2,
  Cpu,
  HelpCircle,
  Play,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Terminal,
  XCircle,
} from 'lucide-react';
import { BrokerState, MathematicalSelfTest } from '../types/forex';
import { runKnownAnswerSelfTests } from '../engine/knownAnswerTests';

interface SettingsViewProps {
  brokerState: BrokerState;
  onUpdateBrokerState: (state: Partial<BrokerState>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  brokerState,
  onUpdateBrokerState,
}) => {
  const [selfTests, setSelfTests] = useState<MathematicalSelfTest[]>(() =>
    runKnownAnswerSelfTests()
  );
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [pingResult, setPingResult] = useState<{
    status: 'ONLINE' | 'OFFLINE';
    message: string;
  } | null>(null);

  const handleRunTests = () => {
    const results = runKnownAnswerSelfTests();
    setSelfTests(results);
  };

  const handleTestBridge = async () => {
    setIsPinging(true);
    setPingResult(null);

    try {
      // In web browser preview, local bridge on 127.0.0.1:8001 can be tested
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const resp = await fetch('http://127.0.0.1:8001/health', {
        headers: { Authorization: 'Bearer zaboraa_bridge_secure_token_demo' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        setPingResult({
          status: 'ONLINE',
          message: 'Bridge reachable on 127.0.0.1:8001. Terminal status confirmed.',
        });
        onUpdateBrokerState({ connected: true });
      } else {
        setPingResult({
          status: 'OFFLINE',
          message: `Bridge responded with HTTP ${resp.status}`,
        });
      }
    } catch (err: any) {
      setPingResult({
        status: 'OFFLINE',
        message:
          'Local MT5 Bridge is unreachable on 127.0.0.1:8001. Operating in Simulation Mode.',
      });
    } finally {
      setIsPinging(false);
    }
  };

  const allPassed = selfTests.every((t) => t.status === 'PASS');

  return (
    <div className="space-y-6">
      {/* Engine Mathematical Self-Test Card */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">
                Engine Mathematical Self-Test Suite
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase ${
                  allPassed
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}
              >
                {allPassed ? 'ALL 9 TESTS PASSING' : 'TESTS FAILING'}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-1">
              Rigorous hand-calculated known-answer fixtures proving Pip Math, Friction Deductions, Intrabar Worst-Case SL Conflicts, and Zero-Lookahead Isolation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunTests}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-surface hover:bg-surface text-blue-400 border border-border transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-run Self-Tests
          </button>
        </div>

        {/* Tests Table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-border text-text-muted text-[11px]">
                <th className="py-2">Test Case</th>
                <th>Category</th>
                <th>Expected Value</th>
                <th>Actual Value</th>
                <th>Status</th>
                <th>Verification Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selfTests.map((t) => {
                const isPass = t.status === 'PASS';
                return (
                  <tr key={t.id} className="hover:bg-surface">
                    <td className="py-2.5 font-bold text-white font-sans">{t.name}</td>
                    <td>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface text-text-muted">
                        {t.category}
                      </span>
                    </td>
                    <td className="text-emerald-400 font-semibold">{t.expected}</td>
                    <td className="text-white font-semibold">{t.actual}</td>
                    <td>
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold w-fit ${
                          isPass
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {isPass ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {t.status}
                      </span>
                    </td>
                    <td className="text-[11px] text-text-muted font-sans">{t.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MT5 Bridge Diagnostics & Windows Setup Commands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              Exness MT5 Python Bridge Diagnostics
            </h3>
            <span className="text-xs font-mono text-text-muted">127.0.0.1:8001</span>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            The bridge connects to the local Exness MT5 desktop terminal on Windows via IPC. By design, the browser calls the bridge through Bearer authentication with <code className="text-text">ALLOW_TRADING=false</code> protection by default.
          </p>

          <div className="p-3 rounded bg-bg border border-border text-xs font-mono space-y-2">
            <div className="flex justify-between">
              <span className="text-text-muted">Server Endpoint:</span>
              <strong className="text-white">http://127.0.0.1:8001</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Broker Server:</span>
              <strong className="text-emerald-400">{brokerState.server}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Account Login:</span>
              <strong className="text-white">{brokerState.accountLogin} (Demo)</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Dynamic UTC Offset:</span>
              <strong className="text-text">+{brokerState.utcOffsetHours} Hours</strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPinging}
              onClick={handleTestBridge}
              className="px-4 py-2 rounded text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all disabled:opacity-50"
            >
              {isPinging ? 'Pinging 127.0.0.1:8001...' : 'Test Bridge Connection'}
            </button>
            {pingResult && (
              <span
                className={`text-xs font-mono font-semibold ${
                  pingResult.status === 'ONLINE' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                ● {pingResult.message}
              </span>
            )}
          </div>
        </div>

        {/* Windows PowerShell Setup Commands */}
        <div className="rounded-lg border border-border bg-surface p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Windows Terminal Launch Guide
            </h3>
            <span className="text-[10px] font-mono text-text-muted">PowerShell 7+</span>
          </div>

          <p className="text-xs text-text-muted">
            To run the live bridge locally with Exness MetaTrader 5:
          </p>

          <pre className="p-3 rounded bg-bg border border-border font-mono text-xs text-text-muted overflow-x-auto leading-relaxed">
{`# 1. Open Windows PowerShell in project root
cd mt5-bridge

# 2. Activate virtual environment
.venv\\Scripts\\activate

# 3. Start bridge on 127.0.0.1:8001
uvicorn main:app --host 127.0.0.1 --port 8001`}
          </pre>

          <div className="text-[11px] text-text-muted">
            Note: In Exness MT5, ensure <strong>"Allow algorithmic trading"</strong> is ticked under Tools → Options → Expert Advisors.
          </div>
        </div>
      </div>
    </div>
  );
};
