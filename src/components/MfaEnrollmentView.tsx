import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSupabaseClient } from '../services/supabaseClient';
import { ShieldCheck, QrCode, Key, Copy, Check, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button, Input, Card } from './ui';

interface MfaEnrollmentViewProps {
  onEnrolled?: () => void;
  onCancel?: () => void;
}

export const MfaEnrollmentView: React.FC<MfaEnrollmentViewProps> = ({ onEnrolled, onCancel }) => {
  const { getAccessToken } = useAuth();
  const [step, setStep] = useState<'scan' | 'verify' | 'recovery_codes'>('scan');
  const [factorId, setFactorId] = useState<string>('');
  const [qrCodeUri, setQrCodeUri] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

  useEffect(() => {
    async function startEnrollment() {
      setError(null);
      setLoading(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Supabase client not initialized');
        setLoading(false);
        return;
      }

      try {
        const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          issuer: 'Zaboraa FX',
        });

        if (enrollErr || !data) {
          setError(enrollErr?.message || 'Failed to start MFA enrollment');
        } else {
          setFactorId(data.id);
          setSecret(data.totp.secret);
          setQrCodeUri(data.totp.qr_code);
        }
      } catch (err: any) {
        setError(err.message || 'MFA initialization failed');
      } finally {
        setLoading(false);
      }
    }

    startEnrollment();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = getSupabaseClient();
    if (!supabase || !factorId) {
      setError('MFA session expired. Please retry.');
      setLoading(false);
      return;
    }

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setError(challenge.error.message);
        setLoading(false);
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode.trim(),
      });

      if (verify.error) {
        setError(verify.error.message);
        setLoading(false);
        return;
      }

      // Fetch server-generated hashed recovery codes
      const token = getAccessToken();
      const recRes = await fetch('/api/admin/users/mfa/recovery-codes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (recRes.ok) {
        const recData = await recRes.json();
        setRecoveryCodes(recData.recoveryCodes || []);
        setStep('recovery_codes');
      } else {
        if (onEnrolled) onEnrolled();
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const copyAllRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  return (
    <Card padding="lg" className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-text font-sans">
            Two-Factor Authentication (TOTP MFA)
          </h2>
          <p className="text-xs text-text-muted font-sans">
            Enhance administrative account security with Google Authenticator or 1Password
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'scan' && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted font-sans">
            1. Scan this QR code in your Authenticator app (e.g. Google Authenticator, Authy):
          </p>

          <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-bg border border-border">
            {qrCodeUri ? (
              <img
                src={qrCodeUri}
                alt="TOTP MFA QR Code"
                className="w-48 h-48 rounded-lg shadow-xs"
              />
            ) : loading ? (
              <div className="h-48 flex items-center justify-center text-xs text-text-muted">
                Generating TOTP QR code...
              </div>
            ) : null}

            {secret && (
              <div className="mt-3 text-center">
                <span className="text-[11px] text-text-muted block mb-1 font-sans">Manual entry key:</span>
                <code className="text-xs font-mono font-bold text-primary px-2 py-1 rounded bg-surface border border-border select-all">
                  {secret}
                </code>
              </div>
            )}
          </div>

          <form onSubmit={handleVerify} className="space-y-3 pt-2">
            <Input
              label="2. Enter the 6-digit confirmation code from your app:"
              type="text"
              required
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center tracking-widest text-lg font-mono"
            />

            <div className="flex items-center justify-end gap-3 pt-3">
              {onCancel && (
                <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                type="submit"
                loading={loading}
                disabled={loading || verifyCode.length !== 6}
              >
                <span>Verify & Activate MFA</span>
                {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === 'recovery_codes' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-success/10 border border-success/20 text-success text-xs font-sans">
            <strong>MFA is now successfully activated!</strong> Save these one-time recovery codes in a secure place. If you ever lose your authenticator, each code can be used once to access your account.
          </div>

          <div className="p-4 rounded-xl bg-bg border border-border space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text font-sans">
                One-Time Emergency Recovery Codes
              </span>
              <button
                type="button"
                onClick={copyAllRecoveryCodes}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer"
              >
                {copiedCodes ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCodes ? 'Copied!' : 'Copy All'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-surface border border-border text-xs font-mono text-center font-bold select-all"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-text-muted font-sans">
            Note: If you lose both your authenticator and recovery codes, contact a Master Admin to run <code className="font-mono bg-surface px-1 py-0.5 rounded border border-border">npm run admin:reset-mfa</code>.
          </div>

          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => onEnrolled && onEnrolled()}
          >
            I Have Saved My Recovery Codes — Continue
          </Button>
        </div>
      )}
    </Card>
  );
};
