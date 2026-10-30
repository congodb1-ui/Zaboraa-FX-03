import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Lock,
  Mail,
  AlertTriangle,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  UserCheck,
  ArrowLeft,
  ShieldCheck,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Terminal,
  Building,
  User as UserIcon,
} from 'lucide-react';
import { Button, Input, Card } from './ui';

interface LoginViewProps {
  onBackToPublic?: () => void;
  onLoginSuccess?: (targetTab?: string) => void;
}

interface DemoAccount {
  role: string;
  label: string;
  email: string;
  initialPass: string;
}

export const LoginView: React.FC<LoginViewProps> = ({ onBackToPublic, onLoginSuccess }) => {
  const { signInWithCredentials, registerAccount } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');
  
  // Sign in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two-factor / MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDepartment, setRegDepartment] = useState('Quantitative Trading Desk');
  const [regRole, setRegRole] = useState<'trader' | 'viewer'>('trader');
  const [regSuccess, setRegSuccess] = useState(false);

  // Local environment helper info
  const [showLocalGuide, setShowLocalGuide] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([
    { role: 'admin', label: 'Trading Desk Administrator', email: 'admin@zaboraa.com', initialPass: 'Admin@Zaboraa2026!' },
    { role: 'trader', label: 'Quantitative Trader', email: 'trader@zaboraa.com', initialPass: 'Trader@Zaboraa2026!' },
    { role: 'master_admin', label: 'Chief Risk Officer (Master Admin)', email: 'master@zaboraa.com', initialPass: 'Master@Zaboraa2026!' },
    { role: 'viewer', label: 'Institutional Analyst (Read-Only)', email: 'viewer@zaboraa.com', initialPass: 'Viewer@Zaboraa2026!' },
  ]);

  // Dynamic branding
  const [brandName, setBrandName] = useState('Zaboraa FX');

  useEffect(() => {
    fetch('/api/company/branding')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.brandName) setBrandName(data.brandName);
      })
      .catch(() => {});

    fetch('/api/auth/bootstrap-info')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.demoAccounts && Array.isArray(data.demoAccounts)) {
          setDemoAccounts(data.demoAccounts);
        }
      })
      .catch(() => {});
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signInWithCredentials(
        email.trim(),
        password,
        mfaRequired ? mfaCode.trim() : undefined,
        rememberMe
      );

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.mfaRequired) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      // Success
      setLoading(false);
      onLoginSuccess?.();
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const result = await registerAccount({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        department: regDepartment,
        role: regRole,
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setLoading(false);
      setRegSuccess(true);
      setTimeout(() => {
        onLoginSuccess?.('markets');
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
      setLoading(false);
    }
  };

  const handleQuickFill = (acc: DemoAccount) => {
    setEmail(acc.email);
    setPassword(acc.initialPass);
    setActiveTab('signin');
    setMfaRequired(false);
    setMfaCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-bg text-text transition-colors">
      {/* Top Navigation Strip */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        {onBackToPublic ? (
          <button
            type="button"
            onClick={onBackToPublic}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Public Portal</span>
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span>Institutional PBKDF2-SHA512</span>
        </div>
      </div>

      <div className="w-full max-w-md space-y-4">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-1">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text font-sans">
            {brandName} Authentication
          </h1>
          <p className="text-xs text-text-muted font-sans">
            Enterprise Single-Sign On & Algorithmic Trading Operations Gateway
          </p>
        </div>

        {/* Portal Mode Switcher */}
        <div className="flex rounded-xl bg-surface p-1 border border-border">
          <button
            type="button"
            onClick={() => {
              setActiveTab('signin');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'signin'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Request Desk Access
          </button>
        </div>

        {/* TAB 1: ENTERPRISE SIGN IN */}
        {activeTab === 'signin' && (
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-text font-sans">
                  {mfaRequired ? 'Multi-Factor Verification' : 'Enterprise Credentials'}
                </h2>
              </div>
              <span className="text-[11px] text-text-muted">Local SQLite Vault</span>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {mfaRequired ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs text-text space-y-1">
                  <div className="font-semibold text-primary flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    <span>Two-Factor Challenge</span>
                  </div>
                  <p className="text-text-muted text-[11px] leading-relaxed">
                    Administrative access for <span className="font-mono text-text">{email}</span> requires a secondary 2FA code or recovery token.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text font-sans">
                    6-Digit TOTP or Recovery Code
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder="e.g. 123456 or rec-xxxx"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg border border-border text-text font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Default demo MFA code: <code className="bg-surface px-1 py-0.5 rounded font-mono text-text">123456</code>
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      setMfaRequired(false);
                      setMfaCode('');
                      setError(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="flex-1"
                    loading={loading}
                    disabled={loading || !mfaCode.trim()}
                  >
                    <span>Verify & Continue</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <Input
                  label="Work Email Address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@zaboraa.com"
                  leftIcon={<Mail className="w-4 h-4 text-text-muted" />}
                />

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-text font-sans">Master Password</label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-[11px] text-text-muted hover:text-text flex items-center gap-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-bg border border-border text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/40 h-4 w-4 bg-bg cursor-pointer"
                    />
                    <span className="text-text-muted text-[11px]">Remember terminal session (30 days)</span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full mt-2"
                  loading={loading}
                  disabled={loading || !email.trim() || !password}
                >
                  <span>Authenticate & Open Portal</span>
                  {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
                </Button>
              </form>
            )}
          </Card>
        )}

        {/* TAB 2: REQUEST ACCESS / REGISTRATION */}
        {activeTab === 'register' && (
          <Card padding="lg" className="space-y-4">
            <div className="border-b border-border pb-2.5">
              <h2 className="text-sm font-bold text-text font-sans flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-primary" />
                <span>Request Desk Access</span>
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5 font-sans">
                Create a new trader or analyst profile authenticated directly in the local SQLite vault.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            {regSuccess ? (
              <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-success text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
                <div className="font-semibold text-xs">Desk account provisioned!</div>
                <p className="text-[11px] text-text-muted font-sans">
                  Session initialized with salted cryptographic credentials. Opening your trading portal...
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <Input
                  label="Full Name"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="e.g. John Doe"
                  leftIcon={<UserIcon className="w-4 h-4 text-text-muted" />}
                />

                <Input
                  label="Corporate / Work Email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="j.doe@firm.com"
                  leftIcon={<Mail className="w-4 h-4 text-text-muted" />}
                />

                <Input
                  label="Create Master Password"
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  leftIcon={<KeyRound className="w-4 h-4 text-text-muted" />}
                />

                <div>
                  <label className="block text-xs font-semibold text-text mb-1 font-sans">
                    Trading Department
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                      <Building className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={regDepartment}
                      onChange={(e) => setRegDepartment(e.target.value)}
                      placeholder="e.g. Quantitative Execution Desk"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1 font-sans">
                    Requested Desk Role
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as 'trader' | 'viewer')}
                    className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans cursor-pointer"
                  >
                    <option value="trader">Quantitative Trader (Execution, Automated Bots, Backtester)</option>
                    <option value="viewer">Institutional Analyst (Read-Only Research, COT Smart Money)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full mt-2"
                  loading={loading}
                  disabled={loading || !regEmail.trim() || !regPassword || !regName.trim()}
                >
                  <span>Provision Account & Sign In</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </form>
            )}
          </Card>
        )}

        {/* COLLAPSIBLE LOCAL DEPLOYMENT HELPER */}
        <div className="rounded-xl border border-border/80 bg-surface/50 overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowLocalGuide(!showLocalGuide)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-text-muted hover:text-text cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-[11px]">Local Deployment & Seed Credentials</span>
            </div>
            {showLocalGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showLocalGuide && (
            <div className="px-3.5 pb-3 pt-1 border-t border-border/60 space-y-2 text-[11px] text-text-muted">
              <p className="leading-relaxed">
                When downloaded and executed standalone on a local Windows machine, {brandName} initializes these pre-seeded institutional accounts directly in SQLite. Click any account to prefill credentials:
              </p>
              <div className="space-y-1.5 pt-1">
                {demoAccounts.map((acc) => (
                  <div
                    key={acc.email}
                    className="flex items-center justify-between p-2 rounded-lg bg-bg border border-border/80"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-semibold text-text flex items-center gap-1.5">
                        <span className="truncate">{acc.label}</span>
                        <span className="text-[9px] uppercase px-1 rounded bg-surface border border-border text-text-muted">
                          {acc.role}
                        </span>
                      </div>
                      <div className="font-mono text-[10px] text-text-muted truncate mt-0.5">
                        {acc.email} · <span className="text-text/70">{acc.initialPass}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleQuickFill(acc)}
                      className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Prefill
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Security Disclosures */}
        <div className="p-3 rounded-xl bg-surface/40 border border-border text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-text">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>Deterministic Risk Firewall Active</span>
          </div>
          <p className="text-[11px] text-text-muted leading-tight">
            Orders exceeding hard risk limits or lacking stop-loss geometry are strictly rejected by server firewall.
          </p>
        </div>
      </div>
    </div>
  );
};
