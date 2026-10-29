import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, AlertTriangle, KeyRound, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button, Input, Card } from './ui';

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
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg text-text transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text font-sans">
            Zaboraa FX
          </h1>
          <p className="text-xs text-text-muted font-sans">
            Automated Algorithmic Trading & Risk Firewall Portal
          </p>
        </div>

        {/* Unconfigured Alert Banner */}
        {!isConfigured && (
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-warning space-y-2">
            <div className="flex items-center gap-2 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Authentication is not configured</span>
            </div>
            <p className="text-[11px] leading-relaxed text-text-muted">
              Add <code className="px-1 py-0.5 rounded bg-warning/15 font-mono text-warning">SUPABASE_URL</code> and{' '}
              <code className="px-1 py-0.5 rounded bg-warning/15 font-mono text-warning">SUPABASE_ANON_KEY</code> to your{' '}
              <code className="font-mono">.env</code> to activate authenticated operations.
            </p>
          </div>
        )}

        {/* Login Card */}
        <Card padding="lg" className="space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-text font-sans">
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
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              {mode === 'password' ? 'Use Magic Link' : 'Use Password'}
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
                Check your email inbox for the sign-in link to access your portal session.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email Address"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@zaboraa.com"
                leftIcon={<Mail className="w-4 h-4 text-text-muted" />}
              />

              {mode === 'password' && (
                <Input
                  label="Password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  leftIcon={<KeyRound className="w-4 h-4 text-text-muted" />}
                />
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                loading={loading}
                disabled={loading || !isConfigured}
              >
                <span>{mode === 'password' ? 'Sign In to Portal' : 'Send Magic Link'}</span>
                {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
              </Button>
            </form>
          )}

          <div className="pt-2 text-center text-[11px] text-text-muted font-sans">
            Invite-only portal access. Contact your Master Admin to receive an account invitation.
          </div>
        </Card>
      </div>
    </div>
  );
};
