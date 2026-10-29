import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, AlertTriangle, KeyRound, ArrowRight, CheckCircle2 } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { signInWithPassword, signInWithOtp, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic_link'>('password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === 'password') {
      const result = await signInWithPassword(email, password);
      if (result.error) {
        setError(result.error);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-[#E6ECF5] transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20 mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Zaboraa FX
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#9FB0C8]">
            Automated Algorithmic Trading & Risk Firewall Portal
          </p>
        </div>

        {/* Unconfigured Alert Banner */}
        {!isConfigured && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>Authentication is not configured</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-[#9FB0C8]">
              Add <code className="px-1 py-0.5 rounded bg-amber-500/15 font-mono text-amber-600 dark:text-amber-300">SUPABASE_URL</code> and{' '}
              <code className="px-1 py-0.5 rounded bg-amber-500/15 font-mono text-amber-600 dark:text-amber-300">SUPABASE_ANON_KEY</code> to your{' '}
              <code className="font-mono">.env</code> to activate authenticated operations.
            </p>
          </div>
        )}

        {/* Login Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {mode === 'password' ? 'Sign In' : 'Magic Link'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'password' ? 'magic_link' : 'password');
                setError(null);
                setMagicLinkSent(false);
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              {mode === 'password' ? 'Use Magic Link' : 'Use Password'}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {magicLinkSent ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <div className="font-semibold text-xs">Magic link sent!</div>
              <p className="text-[11px] text-slate-500 dark:text-[#9FB0C8]">
                Check your email inbox for the sign-in link to access your portal session.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@zaboraa.com"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                  />
                </div>
              </div>

              {mode === 'password' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1020] border border-slate-200 dark:border-[#223049] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !isConfigured}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>{mode === 'password' ? 'Sign In to Portal' : 'Send Magic Link'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="pt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            Invite-only portal access. Contact your Master Admin to receive an account invitation.
          </div>
        </div>
      </div>
    </div>
  );
};
