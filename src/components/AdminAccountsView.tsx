import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Filter,
  History,
  Key,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  X,
  Building,
  TrendingUp,
} from 'lucide-react';
import { BrokerState } from '../types/forex';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export type AdminSubTab = 'firewall' | 'users' | 'accounts' | 'audit' | 'branding';

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
}

interface FirewallSettings {
  maxRiskPerTradePct: number;
  maxLots: number;
  maxOpenPositions: number;
  dailyLossLimitPct: number;
  maxDrawdownPct: number;
  mandatoryStopLoss: boolean;
  maxSpreadPipsEURUSD: number;
  maxSpreadPipsGBPUSD: number;
  maxSpreadPipsUSDJPY: number;
  maxSpreadPointsXAUUSD: number;
  tradingHoursStartUtc: number;
  tradingHoursEndUtc: number;
  newsBlackoutMinutes: number;
}

interface FirewallState {
  scope: string;
  enabled: boolean;
  disabled_at?: string | null;
  disabled_until?: string | null;
  disabled_by?: string | null;
  reason?: string | null;
}

interface FirewallAuditEntry {
  id: number;
  timestamp: string;
  actor: string;
  role: string;
  scope: string;
  key: string;
  old_value: string;
  new_value: string;
  reason: string;
  hash: string;
}

interface BlockedOrderEntry {
  id: number;
  timestamp: string;
  user_id: string;
  account_id: string;
  symbol: string;
  attempted_lots: number;
  attempted_risk_usd: number;
  rule_violated: string;
  suggested_lots: number | null;
  error_message: string;
}

interface ManagedUser {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  assignedAccounts?: string[];
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

const HARD_CEILINGS = {
  maxRiskPerTradePct: 5.0,
  dailyLossLimitPct: 10.0,
  maxLots: 10.0,
  maxOpenPositions: 20,
  maxDrawdownPct: 20.0,
};

const DEFAULT_ACCOUNTS: BrokerAccountDef[] = [
  {
    id: 'acc-exness-demo',
    account_name: 'Primary Exness MT5 Demo',
    broker: 'Exness',
    server: 'Exness-MT5Trial9',
    login: '50192834',
    type: 'DEMO',
    status: 'CONNECTED',
    last_connection: 'Just now',
    max_lots: 2.0,
    risk_pct: 1.0,
  },
  {
    id: 'acc-exness-contest',
    account_name: 'Pre-Production Paper Desk',
    broker: 'Exness',
    server: 'Exness-MT5Trial9',
    login: '50192988',
    type: 'DEMO',
    status: 'STANDBY',
    last_connection: '12m ago',
    max_lots: 5.0,
    risk_pct: 1.5,
  },
];

export const AdminAccountsView: React.FC<AdminAccountsViewProps> = ({
  brokerState,
  onOpenKillSwitch,
}) => {
  const { user, profile, effectiveRole, previewRole, setPreviewRole, getAccessToken } = useAuth();
  const [subTab, setSubTab] = useState<AdminSubTab>('firewall');

  // Firewall State & Form
  const [firewallScope, setFirewallScope] = useState<string>('global:demo');
  const [firewallState, setFirewallState] = useState<FirewallState>({
    scope: 'global:demo',
    enabled: true,
  });
  const [serverSettings, setServerSettings] = useState<FirewallSettings>({
    maxRiskPerTradePct: 2.0,
    maxLots: 5.0,
    maxOpenPositions: 10,
    dailyLossLimitPct: 5.0,
    maxDrawdownPct: 10.0,
    mandatoryStopLoss: true,
    maxSpreadPipsEURUSD: 2.5,
    maxSpreadPipsGBPUSD: 3.0,
    maxSpreadPipsUSDJPY: 2.5,
    maxSpreadPointsXAUUSD: 30.0,
    tradingHoursStartUtc: 0,
    tradingHoursEndUtc: 24,
    newsBlackoutMinutes: 30,
  });
  const [formSettings, setFormSettings] = useState<FirewallSettings>(serverSettings);
  const [firewallAudits, setFirewallAudits] = useState<FirewallAuditEntry[]>([]);
  const [blockedOrders, setBlockedOrders] = useState<BlockedOrderEntry[]>([]);

  // Modals
  const [showDisableModal, setShowDisableModal] = useState<boolean>(false);
  const [disableConfirmationInput, setDisableConfirmationInput] = useState<string>('');
  const [disableReason, setDisableReason] = useState<string>('');

  const [showDiffModal, setShowDiffModal] = useState<boolean>(false);
  const [updateReason, setUpdateReason] = useState<string>('');

  // Accounts & Users State
  const [accounts, setAccounts] = useState<BrokerAccountDef[]>(DEFAULT_ACCOUNTS);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Invite User Modal
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('trader');

  // Assign Accounts Modal
  const [assignUser, setAssignUser] = useState<ManagedUser | null>(null);

  // Broker Accounts Modal
  const [showAddAccountModal, setShowAddAccountModal] = useState<boolean>(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccServer, setNewAccServer] = useState('Exness-MT5Trial9');
  const [newAccLogin, setNewAccLogin] = useState('');
  const [newAccType, setNewAccType] = useState('DEMO');
  const [newAccMaxLots, setNewAccMaxLots] = useState(2.0);
  const [newAccRiskPct, setNewAccRiskPct] = useState(1.0);

  // Token mask state
  const [maskedTokens, setMaskedTokens] = useState<Record<string, boolean>>({});

  // Company Branding State
  const [brandingName, setBrandingName] = useState<string>('Zaboraa FX');
  const [brandingLogo, setBrandingLogo] = useState<string>('');
  const [brandingSaving, setBrandingSaving] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/company/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.companyName) setBrandingName(data.companyName);
          if (data.logoUrl) setBrandingLogo(data.logoUrl);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveBranding = async () => {
    try {
      setBrandingSaving(true);
      const token = getAccessToken();
      const res = await fetch('/api/admin/company/branding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ companyName: brandingName, logoUrl: brandingLogo }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback({ success: true, message: 'Company name and logo updated successfully.' });
        try {
          localStorage.setItem('zaboraa_company_name', brandingName);
          localStorage.setItem('zaboraa_company_logo', brandingLogo);
        } catch {}
        window.dispatchEvent(new Event('zaboraa_branding_updated'));
      } else {
        setFeedback({ success: false, message: data.message || 'Failed to update company branding.' });
      }
    } catch (e: any) {
      setFeedback({ success: false, message: e.message || 'Network error updating branding.' });
    } finally {
      setBrandingSaving(false);
    }
  };

  // 1. Fetch Firewall data on scope change
  const loadFirewallData = async (scopeToLoad: string) => {
    setIsLoading(true);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [fwRes, auditRes, blockedRes] = await Promise.all([
        fetch(`/api/admin/firewall?scope=${encodeURIComponent(scopeToLoad)}`, { headers }),
        fetch('/api/admin/firewall/audit', { headers }),
        fetch('/api/admin/firewall/blocked-orders', { headers }),
      ]);

      if (fwRes.ok) {
        const data = await fwRes.json();
        setFirewallState(data.state);
        setServerSettings(data.settings);
        setFormSettings(data.settings);
      }

      if (auditRes.ok) {
        const aData = await auditRes.json();
        setFirewallAudits(aData.audit || []);
      }

      if (blockedRes.ok) {
        const bData = await blockedRes.json();
        setBlockedOrders(bData.blockedOrders || []);
      }
    } catch (err) {
      console.warn('Failed to load firewall data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Fetch Users and Broker Accounts
  const loadUsersAndAccounts = async () => {
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [userRes, accRes, logRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/accounts', { headers }),
        fetch('/api/admin/audit-logs', { headers }),
      ]);

      if (userRes.ok) {
        const uData = await userRes.json();
        setManagedUsers(uData.users || []);
      }

      if (accRes.ok) {
        const aData = await accRes.json();
        if (aData.accounts && aData.accounts.length > 0) {
          setAccounts(aData.accounts);
        }
      }

      if (logRes.ok) {
        const lData = await logRes.json();
        setAuditLogs(lData.logs || []);
      }
    } catch (err) {
      console.warn('Failed to load users or accounts:', err);
    }
  };

  useEffect(() => {
    loadFirewallData(firewallScope);
    loadUsersAndAccounts();
  }, [firewallScope]);

  // Master Firewall Toggle (Triggered when user clicks enable/disable)
  const handleToggleFirewall = () => {
    const isLive = firewallScope.includes('live');
    if (firewallState.enabled) {
      if (isLive) {
        setFeedback({
          success: false,
          message: 'Strict Security Gate: Risk Firewall can NEVER be disabled for LIVE accounts.',
        });
        return;
      }
      // Demo scope: require typing DISABLE
      setDisableConfirmationInput('');
      setDisableReason('');
      setShowDisableModal(true);
    } else {
      // Re-enable immediately
      executeFirewallUpdate({ enabled: true, reason: 'Re-enabling Risk Firewall protection' });
    }
  };

  const confirmDisableFirewall = () => {
    if (disableConfirmationInput !== 'DISABLE') return;
    setShowDisableModal(false);
    executeFirewallUpdate({
      enabled: false,
      disableConfirmation: 'DISABLE',
      reason: disableReason || 'Manual temporary suspension for testing',
    });
  };

  // Execute PUT /api/admin/firewall
  const executeFirewallUpdate = async (payload: {
    enabled?: boolean;
    disableConfirmation?: string;
    settings?: Partial<FirewallSettings>;
    reason: string;
  }) => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/admin/firewall', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          scope: firewallScope,
          ...payload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          success: false,
          message: data.message || data.error || 'Failed to update firewall settings',
        });
      } else {
        setFeedback({
          success: true,
          message: 'Risk Firewall updated and verified against hard ceilings.',
        });
        setFirewallState(data.state);
        setServerSettings(data.settings);
        setFormSettings(data.settings);
        loadFirewallData(firewallScope);
      }
    } catch (err: any) {
      setFeedback({ success: false, message: `Update failed: ${err.message}` });
    } finally {
      setIsLoading(false);
      setShowDiffModal(false);
    }
  };

  // Diff Calculations
  const getChangedSettings = (): Array<{ key: keyof FirewallSettings; oldVal: any; newVal: any }> => {
    const changes: Array<{ key: keyof FirewallSettings; oldVal: any; newVal: any }> = [];
    (Object.keys(formSettings) as Array<keyof FirewallSettings>).forEach((k) => {
      if (formSettings[k] !== serverSettings[k]) {
        changes.push({ key: k, oldVal: serverSettings[k], newVal: formSettings[k] });
      }
    });
    return changes;
  };

  const handleOpenDiffModal = (e: React.FormEvent) => {
    e.preventDefault();
    const changes = getChangedSettings();
    if (changes.length === 0) {
      setFeedback({ success: true, message: 'No parameter modifications detected.' });
      return;
    }

    // Client-side hard ceiling validations
    if (formSettings.maxRiskPerTradePct > HARD_CEILINGS.maxRiskPerTradePct) {
      setFeedback({
        success: false,
        message: `maxRiskPerTradePct (${formSettings.maxRiskPerTradePct}%) exceeds immutable ceiling of ${HARD_CEILINGS.maxRiskPerTradePct}%.`,
      });
      return;
    }
    if (formSettings.dailyLossLimitPct > HARD_CEILINGS.dailyLossLimitPct) {
      setFeedback({
        success: false,
        message: `dailyLossLimitPct (${formSettings.dailyLossLimitPct}%) exceeds immutable ceiling of ${HARD_CEILINGS.dailyLossLimitPct}%.`,
      });
      return;
    }
    if (formSettings.maxLots > HARD_CEILINGS.maxLots) {
      setFeedback({
        success: false,
        message: `maxLots (${formSettings.maxLots}) exceeds immutable ceiling of ${HARD_CEILINGS.maxLots}.`,
      });
      return;
    }
    if (formSettings.maxOpenPositions > HARD_CEILINGS.maxOpenPositions) {
      setFeedback({
        success: false,
        message: `maxOpenPositions (${formSettings.maxOpenPositions}) exceeds immutable ceiling of ${HARD_CEILINGS.maxOpenPositions}.`,
      });
      return;
    }

    setUpdateReason('');
    setShowDiffModal(true);
  };

  const handleConfirmDiffSubmit = () => {
    executeFirewallUpdate({
      settings: formSettings,
      reason: updateReason || 'Updated risk parameters in Admin UI',
    });
  };

  // User Management Handlers
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      const token = getAccessToken();
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ success: false, message: data.message || data.error });
      } else {
        setFeedback({ success: true, message: `Invitation sent to ${inviteEmail}` });
        setShowInviteModal(false);
        setInviteEmail('');
        loadUsersAndAccounts();
      }
    } catch (e: any) {
      setFeedback({ success: false, message: e.message });
    }
  };

  const handleChangeUserRole = async (userId: string, newRole: string) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ success: false, message: data.message || data.error });
      } else {
        setFeedback({ success: true, message: `User role updated to ${newRole}` });
        loadUsersAndAccounts();
      }
    } catch (e: any) {
      setFeedback({ success: false, message: e.message });
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const disabled = currentStatus !== 'DISABLED';
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/users/${userId}/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ disabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ success: false, message: data.message || data.error });
      } else {
        setFeedback({
          success: true,
          message: `User ${disabled ? 'disabled' : 'enabled'} successfully`,
        });
        loadUsersAndAccounts();
      }
    } catch (e: any) {
      setFeedback({ success: false, message: e.message });
    }
  };

  const handleToggleAccountAssignment = async (userId: string, accountId: string, assigned: boolean) => {
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/users/${userId}/assign-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountId, action: assigned ? 'unassign' : 'assign' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ success: false, message: data.message || data.error });
      } else {
        loadUsersAndAccounts();
      }
    } catch (e: any) {
      setFeedback({ success: false, message: e.message });
    }
  };

  const isLive = firewallScope.includes('live');
  const changedSettings = getChangedSettings();

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & SUB-TAB NAVIGATION */}
      <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            Admin & Data Administration
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Institutional Risk Firewall, user role management, account assignments, and immutable audit logs.
          </p>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-bg border border-border">
          <button
            type="button"
            onClick={() => setSubTab('firewall')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'firewall'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Risk Firewall</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'users'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Users & Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('accounts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'accounts'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Broker Accounts</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'audit'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>System Audit</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('branding')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'branding'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Branding</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border shadow-sm ${
            feedback.success
              ? 'bg-success/10 text-success border-success/30'
              : 'bg-danger/10 text-danger border-danger/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-text-muted hover:text-text font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 1: RISK FIREWALL */}
      {/* ============================================================== */}
      {subTab === 'firewall' && (
        <div className="space-y-6">
          {/* Firewall Scope & Master Switch Banner */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h2 className="text-base font-bold text-text">
                    Institutional Risk Firewall Control
                  </h2>
                </div>
                <p className="text-xs text-text-muted">
                  Hard-enforced risk limits evaluated on every manual order, automated bot, and API call.
                </p>
              </div>

              {/* Scope Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted font-medium">Scope:</span>
                <select
                  value={firewallScope}
                  onChange={(e) => setFirewallScope(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-bg border border-border text-xs font-semibold text-text focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="global:demo">Global Demo (Default)</option>
                  <option value="global:live">Global Live (Locked Protection)</option>
                  {accounts.map((acc) => (
                    <option key={acc.login} value={acc.login}>
                      Account #{acc.login} ({acc.account_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Master Switch Tile */}
            <div
              className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${
                firewallState.enabled
                  ? 'bg-success/10 border-success/30 text-success dark:text-success'
                  : 'bg-danger/15 border-danger/40 text-danger dark:text-danger animate-pulse'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    firewallState.enabled ? 'bg-success' : 'bg-danger'
                  }`}
                />
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>Risk Firewall Status: {firewallState.enabled ? 'ACTIVE (Protection Engaged)' : 'OFF (Protection Disabled)'}</span>
                    {isLive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/20 text-warning dark:text-warning border border-warning/30">
                        LIVE: LOCKED ON
                      </span>
                    )}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5">
                    {firewallState.enabled
                      ? `All incoming trades on ${firewallScope} are strictly validated against risk ceilings.`
                      : `Firewall temporarily OFF until ${new Date(firewallState.disabled_until || Date.now() + 86400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (24h auto-expiry active). Reason: ${firewallState.reason || 'None'}`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleFirewall}
                disabled={isLive}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                  isLive
                    ? 'bg-bg text-text-muted cursor-not-allowed opacity-60'
                    : firewallState.enabled
                    ? 'bg-danger hover:bg-danger text-white'
                    : 'bg-success hover:bg-success text-white'
                }`}
              >
                {isLive ? 'Locked ON for Live' : firewallState.enabled ? 'Turn OFF (Demo Only)' : 'Re-Enable Firewall'}
              </button>
            </div>
          </div>

          {/* Firewall Limits Form */}
          <form onSubmit={handleOpenDiffModal} className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-text">
                  Risk Ceilings & Parameters ({firewallScope})
                </h3>
                <span className="text-xs text-text-muted">
                  Values cannot exceed immutable server ceilings defined in code.
                </span>
              </div>
              {changedSettings.length > 0 && (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-warning/15 text-warning dark:text-warning border border-warning/30">
                  {changedSettings.length} unsaved changes
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
              {/* Max Risk Per Trade % */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Max Risk Per Trade (%)</span>
                  <span className="text-text-muted font-normal">Ceiling ≤ 5.0%</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  value={formSettings.maxRiskPerTradePct}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxRiskPerTradePct: parseFloat(e.target.value) || 0.1,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">
                  Maximum percent of balance risked on a single trade's Stop-Loss distance.
                </p>
              </div>

              {/* Max Lots */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Max Lots Per Order</span>
                  <span className="text-text-muted font-normal">Ceiling ≤ 10.0</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="10.0"
                  value={formSettings.maxLots}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxLots: parseFloat(e.target.value) || 0.01,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">
                  Hard upper lot ceiling allowed for any manual ticket or automated bot order.
                </p>
              </div>

              {/* Max Open Positions */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Max Open Positions</span>
                  <span className="text-text-muted font-normal">Ceiling ≤ 20</span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={formSettings.maxOpenPositions}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxOpenPositions: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">
                  Maximum concurrent open positions allowed across all pairs.
                </p>
              </div>

              {/* Daily Loss Limit % */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Daily Loss Limit (%)</span>
                  <span className="text-text-muted font-normal">Ceiling ≤ 10.0%</span>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10.0"
                  value={formSettings.dailyLossLimitPct}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      dailyLossLimitPct: parseFloat(e.target.value) || 0.5,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">
                  Trading auto-halts for the remainder of UTC day if realized losses cross this threshold.
                </p>
              </div>

              {/* Max Drawdown % */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Max Peak Drawdown (%)</span>
                  <span className="text-text-muted font-normal">Ceiling ≤ 20.0%</span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20.0"
                  value={formSettings.maxDrawdownPct}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxDrawdownPct: parseFloat(e.target.value) || 1.0,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">
                  Account peak-to-trough trailing equity drawdown threshold.
                </p>
              </div>

              {/* Mandatory Stop Loss Toggle */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="flex justify-between font-semibold text-text-muted">
                  <span>Mandatory Stop Loss</span>
                  {isLive && <span className="text-warning font-bold">Locked ON (Live)</span>}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isLive}
                    onClick={() =>
                      setFormSettings((prev) => ({
                        ...prev,
                        mandatoryStopLoss: !prev.mandatoryStopLoss,
                      }))
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                      formSettings.mandatoryStopLoss
                        ? 'bg-success text-white'
                        : 'bg-bg text-text-muted'
                    }`}
                  >
                    {formSettings.mandatoryStopLoss ? 'ACTIVE (Required)' : 'OFF (Allowed on Demo)'}
                  </button>
                  <span className="text-[11px] text-text-muted">
                    Rejects any order submitted without a valid SL.
                  </span>
                </div>
              </div>

              {/* Spread Pips EURUSD */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="font-semibold text-text-muted">Max Spread (EURUSD)</div>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="10.0"
                  value={formSettings.maxSpreadPipsEURUSD}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxSpreadPipsEURUSD: parseFloat(e.target.value) || 0.5,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">Rejects orders if EURUSD spread exceeds this in pips.</p>
              </div>

              {/* Spread Points XAUUSD */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="font-semibold text-text-muted">Max Spread (XAUUSD Points)</div>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="100"
                  value={formSettings.maxSpreadPointsXAUUSD}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      maxSpreadPointsXAUUSD: parseFloat(e.target.value) || 5,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">Rejects Gold orders during high volatility spread spikes.</p>
              </div>

              {/* News Blackout Minutes */}
              <div className="space-y-1.5 p-3 rounded-xl bg-bg border border-border">
                <div className="font-semibold text-text-muted">News Blackout Window (Minutes)</div>
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="120"
                  value={formSettings.newsBlackoutMinutes}
                  onChange={(e) =>
                    setFormSettings((prev) => ({
                      ...prev,
                      newsBlackoutMinutes: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border font-mono text-text text-sm"
                />
                <p className="text-[11px] text-text-muted">Halts orders before and after tier-1 economic events (NFP, FOMC).</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setFormSettings(serverSettings)}
                disabled={changedSettings.length === 0}
                className="px-4 py-2 rounded-xl border border-border text-text-muted text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                Reset changes
              </button>
              <button
                type="submit"
                disabled={changedSettings.length === 0 || isLoading}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white font-bold text-xs shadow-md shadow-primary/20 disabled:opacity-40 cursor-pointer"
              >
                Review changes & Save ({changedSettings.length})
              </button>
            </div>
          </form>

          {/* Append-Only Firewall Audit Log */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-text">
                  Firewall Parameter Audit Trail
                </h3>
                <span className="text-xs text-text-muted">
                  Append-only SQLite audit log protected by database triggers (modifications and deletions blocked).
                </span>
              </div>
              <button
                type="button"
                onClick={() => loadFirewallData(firewallScope)}
                className="p-1.5 rounded-lg border border-border hover:bg-bg"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-text-muted ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {firewallAudits.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">No firewall changes recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-text-muted">
                      <th className="text-left py-2 font-medium">Timestamp</th>
                      <th className="text-left py-2 font-medium">Actor</th>
                      <th className="text-left py-2 font-medium">Scope</th>
                      <th className="text-left py-2 font-medium">Parameter</th>
                      <th className="text-left py-2 font-medium">Transition</th>
                      <th className="text-left py-2 font-medium">Reason</th>
                      <th className="text-right py-2 font-medium">Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {firewallAudits.map((entry) => (
                      <tr key={entry.id} className="hover:bg-bg/50">
                        <td className="py-2.5 text-text-muted tabular-nums">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 font-sans font-semibold text-text">
                          {entry.actor} <span className="text-text-muted font-normal">({entry.role})</span>
                        </td>
                        <td className="py-2.5 text-primary font-semibold">{entry.scope}</td>
                        <td className="py-2.5 font-sans font-medium text-text-muted">{entry.key}</td>
                        <td className="py-2.5">
                          <span className="text-danger line-through mr-1.5">{entry.old_value}</span>
                          <span className="text-success font-bold">{entry.new_value}</span>
                        </td>
                        <td className="py-2.5 font-sans text-text-muted max-w-xs truncate">
                          {entry.reason}
                        </td>
                        <td className="py-2.5 text-right text-[10px] text-text-muted font-mono" title={entry.hash}>
                          {entry.hash.substring(0, 10)}...
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Blocked Orders Log */}
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-text">
                  Firewall Blocked Orders Log
                </h3>
                <span className="text-xs text-text-muted">
                  Append-only record of all orders rejected by risk boundaries with suggested lot sizing.
                </span>
              </div>
            </div>

            {blockedOrders.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-xs">No blocked orders recorded. All submitted orders met risk parameters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-text-muted">
                      <th className="text-left py-2 font-medium">Timestamp</th>
                      <th className="text-left py-2 font-medium">Symbol</th>
                      <th className="text-right py-2 font-medium">Attempted Lots</th>
                      <th className="text-right py-2 font-medium">Attempted Risk</th>
                      <th className="text-left py-2 font-medium">Violated Rule</th>
                      <th className="text-right py-2 font-medium">Suggested Lots</th>
                      <th className="text-left py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {blockedOrders.map((ord) => (
                      <tr key={ord.id} className="hover:bg-bg/50">
                        <td className="py-2.5 text-text-muted tabular-nums">
                          {new Date(ord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 font-sans font-bold text-text">{ord.symbol}</td>
                        <td className="py-2.5 text-right text-danger font-bold">{ord.attempted_lots.toFixed(2)}</td>
                        <td className="py-2.5 text-right text-danger font-bold">${ord.attempted_risk_usd.toFixed(2)}</td>
                        <td className="py-2.5 text-warning font-semibold">{ord.rule_violated}</td>
                        <td className="py-2.5 text-right text-success font-bold">
                          {ord.suggested_lots !== null ? `${ord.suggested_lots.toFixed(2)} lots` : 'None'}
                        </td>
                        <td className="py-2.5 font-sans text-text-muted max-w-sm truncate" title={ord.error_message}>
                          {ord.error_message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 2: USERS & PERMISSIONS */}
      {/* ============================================================== */}
      {subTab === 'users' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-text">
                  Supabase User Identities & Role Assignments
                </h2>
                <span className="text-xs text-text-muted">
                  Roles stored in public.profiles with Row-Level Security. Privilege escalation is blocked on the server.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary text-white font-semibold text-xs shadow-sm cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite User</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="text-left py-2 font-medium">User Identity</th>
                    <th className="text-left py-2 font-medium">Assigned Role</th>
                    <th className="text-center py-2 font-medium">Account Access</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans">
                  {managedUsers.map((u) => {
                    const isMasterAdmin = u.role === 'master_admin';
                    const isSelf = u.id === profile?.userId;
                    return (
                      <tr key={u.id} className="hover:bg-bg/50">
                        <td className="py-3">
                          <div className="font-semibold text-text flex items-center gap-2">
                            <span>{u.email}</span>
                            {isMasterAdmin && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-warning/15 text-warning border border-warning/30">
                                MASTER
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-text-muted font-mono">ID: {u.id.substring(0, 16)}...</div>
                        </td>
                        <td className="py-3">
                          <select
                            value={u.role}
                            disabled={isMasterAdmin || effectiveRole !== 'master_admin'}
                            onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                            className="px-2.5 py-1 rounded-lg bg-bg border border-border text-xs font-semibold text-text disabled:opacity-60 cursor-pointer"
                          >
                            <option value="admin">admin</option>
                            <option value="trader">trader</option>
                            <option value="viewer">viewer</option>
                            <option value="pending">pending</option>
                          </select>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setAssignUser(u)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary bg-primary/10 dark:bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            {u.assignedAccounts && u.assignedAccounts.length > 0
                              ? `${u.assignedAccounts.length} accounts`
                              : 'Assign accounts'}
                          </button>
                        </td>
                        <td className="py-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.status === 'ACTIVE'
                                ? 'bg-success/15 text-success'
                                : 'bg-danger/15 text-danger'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 text-right space-x-2">
                          <button
                            type="button"
                            disabled={isMasterAdmin || isSelf}
                            onClick={() => handleToggleUserStatus(u.id, u.status)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                              isMasterAdmin || isSelf
                                ? 'text-text-muted cursor-not-allowed opacity-50'
                                : u.status === 'ACTIVE'
                                ? 'text-danger hover:bg-danger/10 dark:hover:bg-danger/10'
                                : 'text-success hover:bg-success/10 dark:hover:bg-success/10'
                            }`}
                          >
                            {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 3: BROKER ACCOUNTS */}
      {/* ============================================================== */}
      {subTab === 'accounts' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-border">
              <div>
                <h2 className="text-base font-bold text-text">Broker Accounts</h2>
                <span className="text-xs text-text-muted">
                  MetaTrader 5 demo and production instances registered with the local bridge.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary text-white font-semibold text-xs shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="text-left py-2 font-medium">Account Name</th>
                    <th className="text-left py-2 font-medium">Broker & Server</th>
                    <th className="text-left py-2 font-medium">Login</th>
                    <th className="text-center py-2 font-medium">Type</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Max Lots</th>
                    <th className="text-right py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-bg/50">
                      <td className="py-3 font-sans font-semibold text-text">
                        {acc.account_name}
                      </td>
                      <td className="py-3 text-text-muted">
                        <span className="font-sans font-medium text-text mr-1.5">
                          {acc.broker}
                        </span>
                        <span>({acc.server})</span>
                      </td>
                      <td className="py-3 text-text-muted">{acc.login}</td>
                      <td className="py-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-warning/10 text-warning dark:text-warning border border-warning/20">
                          {acc.type}
                        </span>
                      </td>
                      <td className="py-3 text-center font-sans">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            acc.status === 'CONNECTED'
                              ? 'bg-success/15 text-success'
                              : 'bg-bg text-text-muted'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              acc.status === 'CONNECTED' ? 'bg-success' : 'bg-text-muted'
                            }`}
                          />
                          {acc.status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-text-muted">{acc.max_lots} lots</td>
                      <td className="py-3 text-right font-sans space-x-2">
                        <button
                          type="button"
                          onClick={() => setAccounts((prev) => prev.filter((a) => a.id !== acc.id))}
                          className="px-2 py-1 rounded-md text-xs font-medium text-danger hover:bg-danger/10 dark:hover:bg-danger/10 cursor-pointer"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 4: SYSTEM AUDIT */}
      {/* ============================================================== */}
      {subTab === 'audit' && (
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h2 className="text-base font-bold text-text">System Audit Log</h2>
              <span className="text-xs text-text-muted">
                Authoritative local activity record (orders, parameter edits, emergency actions).
              </span>
            </div>
            <button
              type="button"
              onClick={loadUsersAndAccounts}
              className="p-1.5 rounded-lg border border-border hover:bg-bg"
            >
              <RefreshCw className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left py-2 font-medium">Timestamp</th>
                  <th className="text-left py-2 font-medium">Operator</th>
                  <th className="text-left py-2 font-medium">Action</th>
                  <th className="text-left py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {auditLogs.slice(0, 25).map((log) => (
                  <tr key={log.id} className="hover:bg-bg/50">
                    <td className="py-2.5 text-text-muted tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 font-sans font-semibold text-text">
                      {log.username} <span className="text-text-muted font-normal">({log.role})</span>
                    </td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-bg text-text-muted">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 text-text-muted font-sans">
                      {log.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SUB-TAB 5: COMPANY BRANDING & LOGO */}
      {/* ============================================================== */}
      {subTab === 'branding' && (
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-5 animate-in fade-in">
          <div className="pb-3 border-b border-border">
            <h2 className="text-base font-bold text-text font-sans">Company Branding & Portal Identity</h2>
            <p className="text-xs text-text-muted mt-0.5 font-sans">
              Change the portal brand wordmark, displayed company name, and header icon or logo image.
            </p>
          </div>

          <div className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1 font-sans">
                Company Name
              </label>
              <input
                type="text"
                value={brandingName}
                onChange={(e) => setBrandingName(e.target.value)}
                placeholder="e.g. Zaboraa FX or Custom Capital Desk"
                className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1 font-sans">
                Company Logo URL
              </label>
              <input
                type="text"
                value={brandingLogo}
                onChange={(e) => setBrandingLogo(e.target.value)}
                placeholder="https://... or data:image/... (leave empty for default icon)"
                className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-mono"
              />
              <span className="text-xs text-text-muted mt-1 block">
                Enter an image URL or leave empty to use the default platform icon.
              </span>
            </div>

            {/* Live Preview Card */}
            <div className="p-4 rounded-xl bg-bg border border-border space-y-2">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider font-sans">
                Header Live Preview
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-border shadow-xs w-fit">
                {brandingLogo ? (
                  <img
                    src={brandingLogo}
                    alt={brandingName}
                    className="w-8 h-8 rounded-lg object-contain bg-surface border border-border"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white shadow-xs">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-text tracking-tight font-sans">
                      {brandingName || 'Zaboraa FX'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning border border-warning/20">
                      Sample Data
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                size="md"
                loading={brandingSaving}
                onClick={handleSaveBranding}
              >
                Save Branding Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: DISABLE FIREWALL CONFIRMATION (DEMO ONLY) */}
      {/* ============================================================== */}
      {showDisableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface border border-danger/50 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-danger">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-text">
                Disable Risk Firewall (24h Auto-Expiry)
              </h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Disabling the Risk Firewall bypasses all lot size ceilings, daily loss halts, and mandatory Stop-Loss checks on DEMO accounts.
              Protection will automatically re-enable after 24 hours. A red persistent banner will be displayed across the Trading Desk.
            </p>

            <div className="space-y-3 pt-2 text-xs">
              <div>
                <label className="font-semibold text-text-muted">
                  Reason for Suspension (Required for Audit Trail)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Backtesting custom high-lot grid execution"
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text"
                />
              </div>

              <div>
                <label className="font-semibold text-text-muted">
                  Type <span className="font-mono font-bold text-danger">DISABLE</span> to confirm:
                </label>
                <input
                  type="text"
                  value={disableConfirmationInput}
                  onChange={(e) => setDisableConfirmationInput(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border font-mono text-text"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setShowDisableModal(false)}
                className="px-4 py-2 rounded-xl border border-border text-text-muted text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disableConfirmationInput !== 'DISABLE' || !disableReason}
                onClick={confirmDisableFirewall}
                className="px-5 py-2 rounded-xl bg-danger hover:bg-danger text-white font-bold text-xs shadow-md shadow-danger/30 disabled:opacity-40 cursor-pointer"
              >
                Confirm & Disable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: DIFF PREVIEW & REASON */}
      {/* ============================================================== */}
      {showDiffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-lg w-full p-6 rounded-2xl bg-surface border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-text">
                  Confirm Firewall Parameter Changes
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="text-text-muted hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-muted">
              The following modifications will be written to SQLite and logged in the append-only audit trail:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {changedSettings.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-bg border border-border text-xs font-mono"
                >
                  <span className="font-sans font-semibold text-text">{c.key}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-danger line-through">{String(c.oldVal)}</span>
                    <ArrowRight className="w-3 h-3 text-text-muted" />
                    <span className="text-success font-bold">{String(c.newVal)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-xs font-semibold text-text-muted">
                Reason for Change (Audit Requirement)
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Adjusting risk limits for prop-firm demo challenge rules"
                value={updateReason}
                onChange={(e) => setUpdateReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-xs text-text"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDiffModal(false)}
                className="px-4 py-2 rounded-xl border border-border text-text-muted text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!updateReason || isLoading}
                onClick={handleConfirmDiffSubmit}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary text-white font-bold text-xs shadow-md shadow-primary/20 disabled:opacity-40 cursor-pointer"
              >
                {isLoading ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: INVITE USER */}
      {/* ============================================================== */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface border border-border shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-text">Invite Team User</h3>
            <form onSubmit={handleInviteUser} className="space-y-3 text-xs">
              <div>
                <label className="text-text-muted font-medium">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="trader@firm.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text"
                />
              </div>

              <div>
                <label className="text-text-muted font-medium">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text"
                >
                  <option value="admin">Admin</option>
                  <option value="trader">Trader</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-text-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-white font-bold cursor-pointer"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: ASSIGN ACCOUNTS */}
      {/* ============================================================== */}
      {assignUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface border border-border shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-base font-bold text-text">
                Account Assignments: {assignUser.email}
              </h3>
              <button
                type="button"
                onClick={() => setAssignUser(null)}
                className="text-text-muted hover:text-text cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Select which broker accounts this user is authorized to trade or view:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {accounts.map((acc) => {
                const isAssigned = (assignUser.assignedAccounts || []).includes(acc.login);
                return (
                  <div
                    key={acc.login}
                    className="flex items-center justify-between p-3 rounded-xl bg-bg border border-border text-xs"
                  >
                    <div>
                      <div className="font-bold text-text">{acc.account_name}</div>
                      <div className="text-[11px] text-text-muted font-mono">
                        #{acc.login} · {acc.server}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleAccountAssignment(assignUser.id, acc.login, isAssigned)}
                      className={`px-3 py-1 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                        isAssigned
                          ? 'bg-success text-white'
                          : 'bg-bg text-text-muted'
                      }`}
                    >
                      {isAssigned ? 'Assigned ✓' : 'Assign'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAssignUser(null)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: ADD BROKER ACCOUNT */}
      {/* ============================================================== */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-surface border border-border shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-text">Register MT5 Broker Account</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAccName || !newAccLogin) return;
                const newAcc: BrokerAccountDef = {
                  id: `acc-${Date.now()}`,
                  account_name: newAccName,
                  broker: 'Exness',
                  server: newAccServer,
                  login: newAccLogin,
                  type: newAccType,
                  status: 'STANDBY',
                  last_connection: 'Never',
                  max_lots: newAccMaxLots,
                  risk_pct: newAccRiskPct,
                };
                setAccounts((prev) => [newAcc, ...prev]);
                setShowAddAccountModal(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-text-muted font-medium">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Exness Demo Primary"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text"
                />
              </div>

              <div>
                <label className="text-text-muted font-medium">MT5 Server</label>
                <input
                  type="text"
                  required
                  value={newAccServer}
                  onChange={(e) => setNewAccServer(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text font-mono"
                />
              </div>

              <div>
                <label className="text-text-muted font-medium">MT5 Login</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 50192834"
                  value={newAccLogin}
                  onChange={(e) => setNewAccLogin(e.target.value)}
                  className="w-full px-3 py-2 mt-1 rounded-xl bg-bg border border-border text-text font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-text-muted cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-primary text-white font-bold cursor-pointer"
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
