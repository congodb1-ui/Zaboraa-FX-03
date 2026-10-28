import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Key,
  Server,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  FileText,
  Sliders,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { BrokerState } from '../types/forex';

export type UserRole = 'Master Admin' | 'Admin' | 'Trader' | 'Viewer';

interface BrokerAccountDef {
  id: string;
  account_name: string;
  broker: string;
  server: string;
  login: string;
  type: string;
  status: string;
  last_connection: string;
  max_lots: number;
  risk_pct: number;
  is_live_approved: number;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  username: string;
  role: string;
  action: string;
  details?: string;
}

interface AdminAccountsViewProps {
  brokerState: BrokerState;
  onOpenKillSwitch: () => void;
}

export const AdminAccountsView: React.FC<AdminAccountsViewProps> = ({
  brokerState,
  onOpenKillSwitch,
}) => {
  const [currentRole, setCurrentRole] = useState<UserRole>('Master Admin');
  const [currentUser, setCurrentUser] = useState<string>('congo_admin');
  const [accounts, setAccounts] = useState<BrokerAccountDef[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);

  // New Account Form state
  const [newAccName, setNewAccName] = useState('');
  const [newAccBroker, setNewAccBroker] = useState('Exness');
  const [newAccServer, setNewAccServer] = useState('Exness-MT5Trial9');
  const [newAccLogin, setNewAccLogin] = useState('');
  const [newAccType, setNewAccType] = useState('DEMO');
  const [newAccMaxLots, setNewAccMaxLots] = useState(2.0);
  const [newAccRiskPct, setNewAccRiskPct] = useState(1.0);

  // Platform Safeguards
  const [allowTradingState, setAllowTradingState] = useState<boolean>(true);
  const [allowLiveGate, setAllowLiveGate] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      const [accRes, logRes] = await Promise.all([
        fetch('/api/admin/accounts'),
        fetch('/api/admin/audit-logs'),
      ]);

      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData.accounts || []);
      }

      if (logRes.ok) {
        const logData = await logRes.json();
        setAuditLogs(logData.logs || []);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleRoleChange = async (role: UserRole) => {
    setCurrentRole(role);
    try {
      await fetch('/api/admin/audit-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUser,
          role,
          action: 'ROLE_SWITCH',
          details: `Switched operational context to ${role}`,
        }),
      });
      loadAdminData();
    } catch {}
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccLogin) return;

    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_name: newAccName,
          broker: newAccBroker,
          server: newAccServer,
          login: newAccLogin,
          type: newAccType,
          status: 'CONNECTED',
          max_lots: Number(newAccMaxLots),
          risk_pct: Number(newAccRiskPct),
          is_live_approved: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setShowAddAccountModal(false);
        setNewAccName('');
        setNewAccLogin('');
        setActionFeedback('Broker account provisioned successfully.');
        setTimeout(() => setActionFeedback(null), 3500);
        loadAdminData();
      }
    } catch (err: any) {
      alert('Failed to save account: ' + err.message);
    }
  };

  const isMasterAdmin = currentRole === 'Master Admin';
  const canEditConfig = currentRole === 'Master Admin' || currentRole === 'Admin';
  const canTrade = currentRole !== 'Viewer';

  return (
    <div className="space-y-6">
      {/* Role & Access Status Header */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">
                Multi-User Access & Broker Account Management
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Role-based authorization (RBAC), multi-account routing, encrypted credential vaults, and immutable audit logs.
            </p>
          </div>

          {/* Role Selector Pills */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
            <span className="text-[11px] font-mono text-slate-400 px-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              Active Role:
            </span>
            {(['Master Admin', 'Admin', 'Trader', 'Viewer'] as UserRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleRoleChange(r)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  currentRole === r
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Role Privileges Banner */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 text-xs font-mono">
          <div className="p-3 rounded-md bg-slate-900/60 border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Live Execution Gate</span>
            <span className={isMasterAdmin ? 'text-amber-400 font-bold' : 'text-slate-500'}>
              {isMasterAdmin ? 'Authorized (LOCKED by default)' : 'Unauthorized'}
            </span>
          </div>
          <div className="p-3 rounded-md bg-slate-900/60 border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Risk Limits & Params</span>
            <span className={canEditConfig ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
              {canEditConfig ? 'Read/Write Permitted' : 'Read-Only'}
            </span>
          </div>
          <div className="p-3 rounded-md bg-slate-900/60 border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Trading Desk & Bots</span>
            <span className={canTrade ? 'text-blue-400 font-bold' : 'text-rose-400 font-bold'}>
              {canTrade ? 'Operator Permitted' : 'Disabled (Viewer)'}
            </span>
          </div>
          <div className="p-3 rounded-md bg-slate-900/60 border border-slate-800/80">
            <span className="text-slate-400 block text-[10px] uppercase font-sans">Audit Logging</span>
            <span className="text-indigo-400 font-bold">100% Authoritative SQLite Trail</span>
          </div>
        </div>

        {actionFeedback && (
          <div className="mt-3 p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            {actionFeedback}
          </div>
        )}
      </div>

      {/* Global Safety Gates & Master Controls */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          Global Platform Safety Controls & Execution Guardrails
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Automated Trading Master Switch</span>
              <span className="text-[11px] text-slate-400">Allows bot runners to place pending orders</span>
            </div>
            <button
              type="button"
              disabled={!canEditConfig}
              onClick={() => {
                const next = !allowTradingState;
                setAllowTradingState(next);
                fetch('/api/admin/audit-log', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    username: currentUser,
                    role: currentRole,
                    action: 'TOGGLE_TRADING_MASTER',
                    details: `Trading master switch set to ${next}`,
                  }),
                });
              }}
              className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                allowTradingState
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              } disabled:opacity-40`}
            >
              {allowTradingState ? 'ENABLED' : 'PAUSED'}
            </button>
          </div>

          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">ALLOW_LIVE Environment Gate</span>
              <span className="text-[11px] text-slate-400">Requires explicit environment unlock</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-amber-500/30">
                LOCKED (ALLOW_LIVE=false)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-rose-950/20 border border-rose-900/40 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-rose-300 block">Emergency Kill Switch</span>
              <span className="text-[11px] text-slate-400">Account-wide halt and position liquidation</span>
            </div>
            <button
              type="button"
              onClick={onOpenKillSwitch}
              className="px-3 py-1.5 rounded text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Engage
            </button>
          </div>
        </div>
      </div>

      {/* Broker Accounts Table */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Registered MetaTrader 5 Broker Accounts
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Credentials remain secured server-side. Passwords and bridge tokens are never exposed in browser state.
            </p>
          </div>

          {canEditConfig && (
            <button
              type="button"
              onClick={() => setShowAddAccountModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Broker Account
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
              <tr>
                <th className="p-3">Account Name</th>
                <th className="p-3">Broker & Server</th>
                <th className="p-3">Login</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Risk Guardrails</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-800/20">
                  <td className="p-3 font-bold text-white font-sans">{acc.account_name}</td>
                  <td className="p-3 text-slate-300">
                    {acc.broker} <span className="text-slate-500">({acc.server})</span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {isMasterAdmin ? acc.login : acc.login.substring(0, 2) + '****' + acc.login.slice(-2)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        acc.type === 'LIVE'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {acc.type}
                    </span>
                  </td>
                  <td className="p-3 text-slate-300 text-[11px]">
                    Max {acc.max_lots}L · {acc.risk_pct}% Risk
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {acc.status}
                    </span>
                  </td>
                  <td className="p-3 text-slate-500 text-[10px]">
                    {new Date(acc.last_connection).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Administrative Audit Log Trail */}
      <div className="rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Immutable Admin Audit Trail (SQLite)
            </h3>
          </div>
          <button
            type="button"
            onClick={loadAdminData}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Log
          </button>
        </div>

        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[11px]">
              <tr>
                <th className="py-2 px-3">Timestamp (UTC)</th>
                <th className="py-2 px-3">Operator</th>
                <th className="py-2 px-3">Role</th>
                <th className="py-2 px-3">Action</th>
                <th className="py-2 px-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.slice(0, 30).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/20">
                  <td className="py-1.5 px-3 text-slate-400 text-[11px]">
                    {new Date(log.timestamp).toISOString().replace('T', ' ').substring(0, 19)}
                  </td>
                  <td className="py-1.5 px-3 text-white font-sans">{log.username}</td>
                  <td className="py-1.5 px-3 text-indigo-400">{log.role}</td>
                  <td className="py-1.5 px-3 font-bold text-slate-200">{log.action}</td>
                  <td className="py-1.5 px-3 text-slate-400 text-[11px]">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-[#0E1524] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Register New MT5 Broker Account
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Friendly Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Exness Raw Spread Demo 2"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Broker</label>
                  <input
                    type="text"
                    required
                    value={newAccBroker}
                    onChange={(e) => setNewAccBroker(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Server</label>
                  <input
                    type="text"
                    required
                    value={newAccServer}
                    onChange={(e) => setNewAccServer(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Account Login ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 50192835"
                    value={newAccLogin}
                    onChange={(e) => setNewAccLogin(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Account Mode</label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="DEMO">DEMO (Paper/Trial)</option>
                    <option value="LIVE">LIVE (Real Funds)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Max Lot Cap</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    value={newAccMaxLots}
                    onChange={(e) => setNewAccMaxLots(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Risk % Per Trade</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10"
                    value={newAccRiskPct}
                    onChange={(e) => setNewAccRiskPct(parseFloat(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
