import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Shield,
  KeyRound,
  Building,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Clock,
  Calendar,
  Save,
  ArrowLeft,
  ShieldCheck,
  Server,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { Button, Card, Input } from './ui';

interface ProfileViewProps {
  onNavigateToDesk?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigateToDesk }) => {
  const { user, profile, effectiveRole, updateProfile } = useAuth();

  // Active sub-section
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'permissions'>('profile');

  // Profile fields state
  const [name, setName] = useState(profile?.name || user?.user_metadata?.name || '');
  const [department, setDepartment] = useState(profile?.department || 'Quantitative Trading Desk');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);

  // Sync profile data when loaded/changed
  useEffect(() => {
    if (profile?.name) setName(profile.name);
    if (profile?.department) setDepartment(profile.department);
  }, [profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    if (!name.trim()) {
      setProfileError('Display name cannot be empty');
      return;
    }

    setProfileLoading(true);
    try {
      const result = await updateProfile({
        name: name.trim(),
        department: department.trim(),
      });

      if (!result.success) {
        setProfileError(result.error || 'Failed to update profile');
      } else {
        setProfileSuccess('Profile details updated successfully');
        setTimeout(() => setProfileSuccess(null), 4000);
      }
    } catch (err: any) {
      setProfileError(err?.message || 'An unexpected error occurred');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!currentPassword) {
      setPassError('Current password is required');
      return;
    }

    if (!newPassword) {
      setPassError('New password is required');
      return;
    }

    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match');
      return;
    }

    setPassLoading(true);
    try {
      const result = await updateProfile({
        currentPassword,
        newPassword,
      });

      if (!result.success) {
        if (result.error === 'INVALID_CURRENT_PASSWORD' || result.error?.includes('Current password')) {
          setPassError('Current password does not match existing credentials');
        } else if (result.error === 'PASSWORD_TOO_SHORT') {
          setPassError('New password must be at least 8 characters long');
        } else {
          setPassError(result.error || 'Failed to update password');
        }
      } else {
        setPassSuccess('Password updated successfully! Salted PBKDF2 hash regenerated.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPassSuccess(null), 5000);
      }
    } catch (err: any) {
      setPassError(err?.message || 'Failed to update password');
    } finally {
      setPassLoading(false);
    }
  };

  const getRoleBadge = (r: string) => {
    switch (r) {
      case 'master_admin':
        return { label: 'Chief Risk Officer (Master Admin)', color: 'bg-danger/15 text-danger border-danger/30' };
      case 'admin':
        return { label: 'Trading Desk Administrator', color: 'bg-info/15 text-info border-info/30' };
      case 'trader':
        return { label: 'Quantitative Trader', color: 'bg-success/15 text-success border-success/30' };
      case 'viewer':
        return { label: 'Institutional Analyst (Read-Only)', color: 'bg-surface text-text-muted border-border' };
      default:
        return { label: r.toUpperCase(), color: 'bg-warning/15 text-warning border-warning/30' };
    }
  };

  const roleInfo = getRoleBadge(effectiveRole);

  const commonDepartments = [
    'Quantitative Trading Desk',
    'Macro & Fundamental Research',
    'Desk Operations & Risk',
    'Executive Risk & Compliance',
    'Precious Metals & FX Trading',
    'Algorithmic Strategy Lab',
  ];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-surface border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {onNavigateToDesk && (
              <button
                type="button"
                onClick={onNavigateToDesk}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text cursor-pointer mr-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Trading Desk</span>
              </button>
            )}
            <span className="text-xs px-2 py-0.5 rounded font-mono uppercase bg-primary/10 text-primary border border-primary/20">
              Account Management
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text font-sans">
            User Profile & Credentials
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Manage your personal desk identity, institutional department, and cryptographic login credentials.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-bg border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile Details</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Password & Security</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'permissions'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Active Permissions</span>
          </button>
        </div>
      </div>

      {/* Identity Summary Card */}
      <div className="p-6 rounded-2xl bg-surface border border-border grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
        <div className="flex items-center gap-4 md:col-span-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl uppercase shadow-xs shrink-0">
            {profile?.name ? profile.name.slice(0, 2) : (user?.email || 'FX').slice(0, 2)}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-text font-sans">
                {profile?.name || user?.user_metadata?.name || 'Institutional Personnel'}
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${roleInfo.color}`}>
                {roleInfo.label}
              </span>
            </div>
            <p className="text-xs font-mono text-text-muted flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-text-muted" />
              <span>{user?.email || profile?.email || 'N/A'}</span>
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs border-t md:border-t-0 md:border-l border-border md:pl-6 pt-3 md:pt-0">
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Department & Desk</div>
          <div className="font-semibold text-text flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-primary" />
            <span>{profile?.department || 'Quantitative Trading Desk'}</span>
          </div>
          <div className="text-[11px] text-text-muted font-mono">
            Desk Ref: {profile?.deskId || 'DESK-ALGO-01'}
          </div>
        </div>

        <div className="space-y-1 text-xs border-t md:border-t-0 md:border-l border-border md:pl-6 pt-3 md:pt-0">
          <div className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Authentication State</div>
          <div className="font-semibold text-text flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
            <span>Verified Local Session</span>
          </div>
          <div className="text-[11px] text-text-muted font-mono">
            Assurance: <span className="text-success font-semibold">{profile?.aal?.toUpperCase() || 'AAL1'}</span> · Status: Active
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: PROFILE DETAILS & DEPARTMENT                       */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 space-y-6">
              <div className="border-b border-border pb-4">
                <h3 className="text-base font-bold text-text flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span>Personnel Information</span>
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  Update your display name and assigned trading department. Changes take effect across trade tickets and system logs immediately.
                </p>
              </div>

              {profileSuccess && (
                <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}

              {profileError && (
                <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{profileError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Work Email Address
                  </label>
                  <input
                    type="email"
                    disabled
                    value={user?.email || profile?.email || ''}
                    className="w-full px-3.5 py-2 rounded-xl bg-bg border border-border text-text-muted font-mono text-xs opacity-75 cursor-not-allowed"
                  />
                  <p className="text-[11px] text-text-muted mt-1">
                    Corporate email addresses are bound to your personnel UID and can only be altered by desk administration.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Full Display Name <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alexander Vance"
                    className="w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1">
                    Department / Division
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Quantitative Trading Desk"
                    className="w-full px-3.5 py-2 rounded-xl bg-bg border border-border text-text text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {commonDepartments.map((dept) => (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setDepartment(dept)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                          department === dept
                            ? 'bg-primary/10 text-primary border-primary/30 font-semibold'
                            : 'bg-surface text-text-muted border-border hover:text-text'
                        }`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={profileLoading}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{profileLoading ? 'Saving Changes...' : 'Save Profile Details'}</span>
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Side Info & Timestamps */}
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h4 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-info" />
                <span>Account Audit Log</span>
              </h4>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-bg border border-border space-y-1">
                  <div className="text-[10px] text-text-muted uppercase font-mono">Registered On</div>
                  <div className="font-mono text-text font-medium">
                    {profile?.createdAt ? new Date(profile.createdAt).toLocaleString() : 'System Seeded'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-bg border border-border space-y-1">
                  <div className="text-[10px] text-text-muted uppercase font-mono">Last Login</div>
                  <div className="font-mono text-text font-medium">
                    {profile?.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : 'Current Session Active'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-bg border border-border space-y-1">
                  <div className="text-[10px] text-text-muted uppercase font-mono">Assigned MT5 Terminal</div>
                  <div className="font-mono text-text font-medium flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-success" />
                    <span>Exness MT5 Demo (Terminal 50192834)</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5 border-primary/20 bg-primary/5 space-y-2">
              <div className="flex items-center gap-1.5 text-primary text-xs font-bold">
                <Info className="w-4 h-4 shrink-0" />
                <span>Local-First Persistence</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Profile modifications are committed directly to your local SQLite instance (<code className="text-text font-mono">data/zaboraa.sqlite</code>). All audit trails comply with financial isolation rules.
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: PASSWORD & CRYPTOGRAPHIC CREDENTIALS               */}
      {/* ========================================================= */}
      {activeTab === 'security' && (
        <div className="max-w-2xl space-y-6">
          <Card className="p-6 space-y-6">
            <div className="border-b border-border pb-4">
              <h3 className="text-base font-bold text-text flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-warning" />
                <span>Change Master Password</span>
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Update your account password. Verification against current hashed credentials using salted PBKDF2-SHA512 is strictly required.
              </p>
            </div>

            {passSuccess && (
              <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            {passError && (
              <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Current Password <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter existing password"
                    className="w-full pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  New Password <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Confirm New Password <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <Input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    className="w-full pr-10 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Validation Checklist */}
              <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs">
                <div className="text-[11px] font-semibold text-text">Security Standards</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${newPassword.length >= 8 ? 'text-success' : 'text-text-muted'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${newPassword && newPassword === confirmPassword ? 'text-success' : 'text-text-muted'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={passLoading || !currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 8}
                  className="flex items-center gap-2 text-xs"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{passLoading ? 'Updating Password...' : 'Update Password'}</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: ROLE PERMISSIONS MATRIX                            */}
      {/* ========================================================= */}
      {activeTab === 'permissions' && (
        <Card className="p-6 space-y-6">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-text flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Active Role Capabilities & Permissions</span>
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Your account is governed by institutional Role-Based Access Control (RBAC). The matrix below details all operational capabilities granted to your desk role.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(profile?.permissions || [
              'research.view',
              'order.place_demo',
              'bot.start_stop',
              'strategy.edit',
              'backtest.run',
              'account.view',
            ]).map((perm) => (
              <div
                key={perm}
                className="p-3.5 rounded-xl bg-bg border border-border flex items-start gap-2.5 text-xs"
              >
                <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <div>
                  <div className="font-mono font-semibold text-text">{perm}</div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {perm.startsWith('research') && 'Access to technical indicators, economic calendar, and COT models'}
                    {perm.startsWith('order.place_demo') && 'Authorized to submit orders to Exness MT5 demo accounts'}
                    {perm.startsWith('order.place_live') && 'Authorized for live order execution (locked without ALLOW_LIVE)'}
                    {perm.startsWith('bot') && 'Authorized to deploy, pause, and configure algorithmic bots'}
                    {perm.startsWith('strategy') && 'Full access to create, edit, and convert Pine Script strategies'}
                    {perm.startsWith('backtest') && 'Execution of multi-year backtests with slippage & latency simulation'}
                    {perm.startsWith('firewall') && 'Authority to view or calibrate deterministic risk firewall limits'}
                    {perm.startsWith('user') && 'Authority to provision and assign broker terminals to personnel'}
                    {perm.startsWith('audit') && 'Access to append-only financial and risk audit trails'}
                    {perm.startsWith('kill') && 'Authority to execute emergency trade liquidation kill switch'}
                    {!perm.includes('.') && 'General platform capability'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
