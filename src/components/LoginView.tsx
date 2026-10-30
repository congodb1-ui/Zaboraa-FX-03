import React, { useState } from 'react';
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
  Sparkles,
  ArrowLeft,
  Users,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { Button, Input, Card } from './ui';

interface LoginViewProps {
  onBackToPublic?: () => void;
  onLoginSuccess?: (targetTab?: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onBackToPublic, onLoginSuccess }) => {
  const { signInWithPassword, signInWithOtp, signInWithLocalAccount, isConfigured } = useAuth();
  const [activeTab, setActiveTab] = useState<'signin' | 'roles' | 'register'>('signin');
  const [authMethod, setAuthMethod] = useState<'password' | 'magic_link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // Register form state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'trader' | 'viewer'>('trader');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (authMethod === 'password') {
      const result = await signInWithPassword(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        onLoginSuccess?.('markets');
      }
    } else {
      const result = await signInWithOtp(email);
      if (result.error) {
        setError(result.error);
      } else {
        setMagicLinkSent(true);
      }
    }
    setLoading(false);
  };

  const handleQuickRoleLogin = async (targetEmail: string, role: string) => {
    setError(null);
    setLoading(true);
    await signInWithLocalAccount(targetEmail, role);
    setLoading(false);
    if (role === 'admin' || role === 'master_admin') {
      onLoginSuccess?.('accounts');
    } else {
      onLoginSuccess?.('markets');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Creates active local account or registers
    await signInWithLocalAccount(regEmail, regRole);
    setLoading(false);
    setRegSuccess(true);
    setTimeout(() => {
      onLoginSuccess?.('markets');
    }, 1200);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-bg text-text transition-colors">
      {/* Top Navigation Strip */}
      <div className="w-full max-w-md flex items-center justify-between mb-4">
        {onBackToPublic && (
          <button
            type="button"
            onClick={onBackToPublic}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Public Portal</span>
          </button>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="w-3.5 h-3.5 text-success" />
          <span>Institutional 256-bit TLS</span>
        </div>
      </div>

      <div className="w-full max-w-md space-y-5">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-1">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text font-sans">
            Zaboraa FX Authentication Portal
          </h1>
          <p className="text-xs text-text-muted font-sans">
            Secure Role-Based Access for Algorithmic Trading & Desk Operations
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
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
              setActiveTab('roles');
              setError(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Role Logins
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setError(null);
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            Request Access
          </button>
        </div>

        {/* TAB 1: STANDARD SIGN IN */}
        {activeTab === 'signin' && (
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-text font-sans">
                  {authMethod === 'password' ? 'Credentials Sign In' : 'Magic Link Verification'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod(authMethod === 'password' ? 'magic_link' : 'password');
                  setError(null);
                  setMagicLinkSent(false);
                }}
                className="text-xs text-primary hover:underline cursor-pointer"
              >
                {authMethod === 'password' ? 'Use Magic Link' : 'Use Password'}
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {magicLinkSent ? (
              <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-success text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
                <div className="font-semibold text-xs">Magic link sent!</div>
                <p className="text-[11px] text-text-muted font-sans">
                  Check your email inbox for the secure authentication link.
                </p>
                <button
                  type="button"
                  onClick={() => setMagicLinkSent(false)}
                  className="text-xs text-primary underline mt-2 block mx-auto cursor-pointer"
                >
                  Return to login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@zaboraa.com"
                  leftIcon={<Mail className="w-4 h-4 text-text-muted" />}
                />

                {authMethod === 'password' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-text font-sans">Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[11px] text-text-muted hover:text-text flex items-center gap-1 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
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
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full mt-2"
                  loading={loading}
                  disabled={loading}
                >
                  <span>{authMethod === 'password' ? 'Sign In to Portal' : 'Send Magic Link'}</span>
                  {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
                </Button>
              </form>
            )}

            <div className="pt-2 text-center border-t border-border/60">
              <span className="text-[11px] text-text-muted">
                Need quick role access?{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('roles')}
                  className="text-primary hover:underline font-semibold cursor-pointer"
                >
                  Select from Demo Accounts
                </button>
              </span>
            </div>
          </Card>
        )}

        {/* TAB 2: INSTANT ROLE LOGINS */}
        {activeTab === 'roles' && (
          <Card padding="lg" className="space-y-3.5">
            <div className="border-b border-border pb-2.5">
              <h2 className="text-sm font-bold text-text font-sans flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                <span>Instant Role Logins & Preview</span>
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5 font-sans">
                Select any verified institutional persona to inspect role-specific permissions and navigation.
              </p>
            </div>

            <div className="space-y-2">
              {/* Master Admin */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickRoleLogin('master_admin@zaboraa.com', 'master_admin')}
                className="w-full p-3 rounded-xl bg-bg border border-danger/30 hover:border-danger hover:bg-danger/5 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-text">Master Administrator</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-danger/10 text-danger border border-danger/20">
                      Full Access
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    master_admin@zaboraa.com · Full kill switch, firewall, role elevation & audits
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-danger opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>

              {/* Admin */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickRoleLogin('admin@zaboraa.com', 'admin')}
                className="w-full p-3 rounded-xl bg-bg border border-info/30 hover:border-info hover:bg-info/5 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-text">Trading Desk Admin</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-info/10 text-info border border-info/20">
                      Website & Ops
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    admin@zaboraa.com · Website modifications, user accounts, and risk firewalling
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-info opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>

              {/* Trader */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickRoleLogin('trader@zaboraa.com', 'trader')}
                className="w-full p-3 rounded-xl bg-bg border border-success/30 hover:border-success hover:bg-success/5 transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-text">Quantitative Trader</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-success/10 text-success border border-success/20">
                      Trading Desk
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    trader@zaboraa.com · Live trading desk, automated bot fleet, and strategy studio
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-success opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>

              {/* Viewer */}
              <button
                type="button"
                disabled={loading}
                onClick={() => handleQuickRoleLogin('viewer@zaboraa.com', 'viewer')}
                className="w-full p-3 rounded-xl bg-bg border border-border hover:border-primary hover:bg-surface transition-all text-left flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-text">Institutional Analyst (Viewer)</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-surface text-text-muted border border-border">
                      Read Only
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    viewer@zaboraa.com · Market research, COT smart money analysis, read-only charts
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            </div>
          </Card>
        )}

        {/* TAB 3: REGISTER / REQUEST ACCESS */}
        {activeTab === 'register' && (
          <Card padding="lg" className="space-y-4">
            <div className="border-b border-border pb-2.5">
              <h2 className="text-sm font-bold text-text font-sans flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-primary" />
                <span>Request Account Access</span>
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5 font-sans">
                Set up a new institutional trader or analyst profile on the Zaboraa FX desk.
              </p>
            </div>

            {regSuccess ? (
              <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-success text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
                <div className="font-semibold text-xs">Account configured!</div>
                <p className="text-[11px] text-text-muted font-sans">
                  Redirecting to your active trading workspace...
                </p>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <Input
                  label="Business Email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="analyst@firm.com"
                  leftIcon={<Mail className="w-4 h-4 text-text-muted" />}
                />

                <Input
                  label="Set Password"
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  leftIcon={<KeyRound className="w-4 h-4 text-text-muted" />}
                />

                <div>
                  <label className="block text-xs font-semibold text-text mb-1 font-sans">
                    Requested Desk Role
                  </label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as 'trader' | 'viewer')}
                    className="w-full px-3 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans"
                  >
                    <option value="trader">Quantitative Trader (Desk Execution & Bots)</option>
                    <option value="viewer">Market Analyst (Read-Only Research & Analytics)</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full mt-2"
                  loading={loading}
                  disabled={loading}
                >
                  <span>Create Account & Sign In</span>
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </form>
            )}
          </Card>
        )}

        {/* Security Disclosures */}
        <div className="p-3 rounded-xl bg-surface/60 border border-border text-center space-y-1">
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
