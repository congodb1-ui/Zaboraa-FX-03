import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Code2,
  Compass,
  Database,
  Flame,
  Footprints,
  Layers,
  Moon,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  LogIn,
  LogOut,
  User,
  Shield,
  ShieldCheck,
  AlertCircle,
  Globe,
  Lock,
  Target,
} from 'lucide-react';
import { BrokerState } from '../types/forex';
import { useAuth } from '../context/AuthContext';

export type NavTab =
  | 'public'
  | 'login'
  | 'profile'
  | 'markets'
  | 'smartmoney'
  | 'ai-analyst'
  | 'backtest'
  | 'strategies'
  | 'xau-guide'
  | 'optimization'
  | 'pine'
  | 'data'
  | 'fundamentals'
  | 'technical'
  | 'bots'
  | 'accounts'
  | 'settings';

export type NavHubId = 'public-hub' | 'research' | 'strategylab' | 'trading' | 'admin';

export interface HubDef {
  id: NavHubId;
  label: string;
  icon: React.ReactNode;
  defaultTab: NavTab;
  tabIds: NavTab[];
  tabs: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }>;
}

export const NAV_HUBS: HubDef[] = [
  {
    id: 'research',
    label: 'Market Research Hub',
    icon: <Compass className="w-4 h-4 text-success" />,
    defaultTab: 'technical',
    tabIds: ['technical', 'fundamentals', 'smartmoney', 'ai-analyst'],
    tabs: [
      { id: 'technical', label: 'Technical Analysis', icon: <Flame className="w-3.5 h-3.5 text-warning" /> },
      { id: 'fundamentals', label: 'Fundamental & Macro', icon: <Compass className="w-3.5 h-3.5 text-success" /> },
      { id: 'smartmoney', label: 'Smart Money & COT', icon: <Footprints className="w-3.5 h-3.5 text-info" /> },
      { id: 'ai-analyst', label: 'AI Quant Advisor', icon: <Sparkles className="w-3.5 h-3.5 text-primary" /> },
    ],
  },
  {
    id: 'strategylab',
    label: 'Strategy Lab',
    icon: <BarChart3 className="w-4 h-4 text-primary" />,
    defaultTab: 'xau-guide',
    tabIds: ['xau-guide', 'strategies', 'backtest', 'optimization', 'pine'],
    tabs: [
      { id: 'xau-guide', label: 'XAU Strategy Guide', icon: <Target className="w-3.5 h-3.5 text-warning" />, badge: 'DEMO' },
      { id: 'strategies', label: 'Strategy Studio', icon: <Code2 className="w-3.5 h-3.5 text-info" /> },
      { id: 'backtest', label: 'Backtest & Batch Lab', icon: <BarChart3 className="w-3.5 h-3.5 text-primary" /> },
      { id: 'optimization', label: 'Optimization & Heatmap', icon: <Sliders className="w-3.5 h-3.5 text-warning" /> },
      { id: 'pine', label: 'Pine Script Converter', icon: <Layers className="w-3.5 h-3.5 text-primary" /> },
    ],
  },
  {
    id: 'trading',
    label: 'Automated Trading Hub',
    icon: <Activity className="w-4 h-4 text-info" />,
    defaultTab: 'markets',
    tabIds: ['markets', 'bots', 'data'],
    tabs: [
      { id: 'markets', label: 'Trading Desk', icon: <Activity className="w-3.5 h-3.5 text-info" /> },
      { id: 'bots', label: 'Automated Bot Fleet', icon: <Bot className="w-3.5 h-3.5 text-success" /> },
      { id: 'data', label: 'Historical Vault', icon: <Database className="w-3.5 h-3.5 text-warning" /> },
    ],
  },
  {
    id: 'admin',
    label: 'System & Security',
    icon: <ShieldAlert className="w-4 h-4 text-danger" />,
    defaultTab: 'accounts',
    tabIds: ['accounts', 'settings'],
    tabs: [
      { id: 'accounts', label: 'Admin Console & Accounts', icon: <Users className="w-3.5 h-3.5 text-info" /> },
      { id: 'settings', label: 'Environment & Risk', icon: <Settings className="w-3.5 h-3.5 text-text-muted" /> },
    ],
  },
];

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  brokerState: BrokerState;
  onOpenKillSwitch: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  brokerState,
  onOpenKillSwitch,
  theme,
  onToggleTheme,
}) => {
  const { user, profile, role, effectiveRole, previewRole, setPreviewRole, signOut, isPublic } = useAuth();

  // Filter Hubs based on user and RBAC permissions
  const authorizedHubs = useMemo(() => {
    if (isPublic) {
      // Public visitors see public market research hub and XAU Strategy Guide (DEMO)
      return [
        {
          id: 'research' as NavHubId,
          label: 'Public Market Research',
          icon: <Compass className="w-4 h-4 text-success" />,
          defaultTab: 'technical' as NavTab,
          tabIds: ['technical', 'fundamentals', 'smartmoney', 'xau-guide'] as NavTab[],
          tabs: [
            { id: 'technical' as NavTab, label: 'Technical Analysis', icon: <Flame className="w-3.5 h-3.5 text-warning" /> },
            { id: 'fundamentals' as NavTab, label: 'Fundamental & Macro', icon: <Compass className="w-3.5 h-3.5 text-success" /> },
            { id: 'smartmoney' as NavTab, label: 'Smart Money & COT', icon: <Footprints className="w-3.5 h-3.5 text-info" /> },
            { id: 'xau-guide' as NavTab, label: 'XAU Strategy Guide', icon: <Target className="w-3.5 h-3.5 text-warning" />, badge: 'DEMO' },
          ],
        },
      ];
    }

    if (effectiveRole === 'viewer') {
      // Viewer sees research, XAU guide, and view-only trading desk
      return [
        NAV_HUBS[0], // Research
        NAV_HUBS[1], // Strategy Lab
        {
          id: 'trading' as NavHubId,
          label: 'Trading Desk (Viewer)',
          icon: <Activity className="w-4 h-4 text-info" />,
          defaultTab: 'markets' as NavTab,
          tabIds: ['markets'] as NavTab[],
          tabs: [
            { id: 'markets' as NavTab, label: 'Trading Desk (Read Only)', icon: <Activity className="w-3.5 h-3.5 text-info" /> },
          ],
        },
      ];
    }

    if (effectiveRole === 'trader') {
      // Trader has Research, Strategy Lab, and Trading Hub. Admin Hub is strictly hidden.
      return NAV_HUBS.filter((h) => h.id !== 'admin');
    }

    // Admin & Master Admin have all 4 hubs
    return NAV_HUBS;
  }, [isPublic, effectiveRole]);

  const activeHub =
    authorizedHubs.find((h) => h.tabIds.includes(activeTab)) ||
    (authorizedHubs.length > 0 ? authorizedHubs[0] : null);

  // Hold-to-confirm kill switch timer state
  const [isHoldingKill, setIsHoldingKill] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<number | null>(null);

  const startHoldKill = () => {
    setIsHoldingKill(true);
    setHoldProgress(0);
    const start = Date.now();
    const duration = 1500; // 1.5 seconds hold duration

    holdTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setHoldProgress(pct);

      if (elapsed >= duration) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        setIsHoldingKill(false);
        setHoldProgress(0);
        onOpenKillSwitch();
      }
    }, 40);
  };

  const cancelHoldKill = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHoldingKill(false);
    setHoldProgress(0);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const handleSelectHub = (hub: HubDef) => {
    if (hub.tabIds.includes(activeTab)) return;
    setActiveTab(hub.defaultTab);
  };

  // Dynamic company branding state
  const [branding, setBranding] = useState<{
    companyName: string;
    logoUrl: string;
    announcementEnabled: boolean;
    announcementText: string;
    announcementType: 'info' | 'warning' | 'danger' | 'success';
  }>(() => {
    try {
      const savedName = localStorage.getItem('zaboraa_company_name');
      const savedLogo = localStorage.getItem('zaboraa_company_logo');
      const savedAnnEnabled = localStorage.getItem('zaboraa_announcement_enabled') === 'true';
      const savedAnnText = localStorage.getItem('zaboraa_announcement_text');
      const savedAnnType = localStorage.getItem('zaboraa_announcement_type') as any;
      return {
        companyName: savedName || 'Zaboraa FX',
        logoUrl: savedLogo || '',
        announcementEnabled: savedAnnEnabled,
        announcementText: savedAnnText || 'Live algorithmic risk firewall and paper execution active.',
        announcementType: savedAnnType || 'info',
      };
    } catch {
      return {
        companyName: 'Zaboraa FX',
        logoUrl: '',
        announcementEnabled: false,
        announcementText: 'Live algorithmic risk firewall and paper execution active.',
        announcementType: 'info',
      };
    }
  });

  useEffect(() => {
    const fetchBranding = () => {
      fetch('/api/company/branding')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.companyName) {
            setBranding({
              companyName: data.companyName,
              logoUrl: data.logoUrl || '',
              announcementEnabled: Boolean(data.announcementEnabled),
              announcementText: data.announcementText || '',
              announcementType: data.announcementType || 'info',
            });
            try {
              localStorage.setItem('zaboraa_company_name', data.companyName);
              localStorage.setItem('zaboraa_company_logo', data.logoUrl || '');
              localStorage.setItem('zaboraa_announcement_enabled', String(Boolean(data.announcementEnabled)));
              localStorage.setItem('zaboraa_announcement_text', data.announcementText || '');
              localStorage.setItem('zaboraa_announcement_type', data.announcementType || 'info');
            } catch {}
          }
        })
        .catch(() => {});
    };

    fetchBranding();
    window.addEventListener('zaboraa_branding_updated', fetchBranding);
    return () => window.removeEventListener('zaboraa_branding_updated', fetchBranding);
  }, []);

  const hasConnectedAccount = brokerState.connected && Boolean(brokerState.accountLogin);

  const getRoleBadgeStyle = (userRole: string) => {
    switch (userRole) {
      case 'master_admin':
        return 'bg-danger/15 text-danger border-danger/30';
      case 'admin':
        return 'bg-info/15 text-info border-info/30';
      case 'trader':
        return 'bg-success/15 text-success border-success/30';
      case 'viewer':
        return 'bg-surface text-text-muted border-border';
      default:
        return 'bg-warning/15 text-warning border-warning/30';
    }
  };

  const getRoleLabel = (userRole: string) => {
    switch (userRole) {
      case 'master_admin':
        return 'Master Admin';
      case 'admin':
        return 'Admin';
      case 'trader':
        return 'Trader';
      case 'viewer':
        return 'Viewer';
      default:
        return userRole.toUpperCase();
    }
  };

  return (
    <header className="border-b border-border bg-bg/95 backdrop-blur sticky top-0 z-40 select-none shadow-xs transition-colors">
      {/* 0. GLOBAL ANNOUNCEMENT BANNER (IF ENABLED BY ADMIN) */}
      {branding.announcementEnabled && (
        <div
          className={`px-4 py-2 text-xs flex items-center justify-between border-b font-medium transition-colors ${
            branding.announcementType === 'warning'
              ? 'bg-warning/10 text-warning border-warning/20'
              : branding.announcementType === 'danger'
              ? 'bg-danger/10 text-danger border-danger/20'
              : branding.announcementType === 'success'
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-info/10 text-info border-info/20'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center gap-2 justify-center sm:justify-start">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{branding.announcementText}</span>
          </div>
        </div>
      )}

      {/* 1. TOP BRAND & ACCOUNT STATUS BAR */}
      <div className="border-b border-border/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Wordmark & Mode Indicator */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab(isPublic ? 'public' : 'markets')}
              className="flex items-center gap-3 text-left cursor-pointer group"
            >
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.companyName}
                  className="w-8 h-8 rounded-lg object-contain bg-surface border border-border"
                />
              ) : (
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white shadow-xs group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-text tracking-tight font-sans">
                    {branding.companyName}
                  </span>
                  {isPublic ? (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      Public Portal
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning border border-warning/20">
                      Sample Data
                    </span>
                  )}
                  <span className="text-text-muted text-xs hidden md:inline">
                    Algorithmic Forex Portal
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* User Profile, Broker Status & Actions */}
          <div className="flex items-center gap-3">
            {/* Broker Account Status (Only shown to authenticated users) */}
            {!isPublic && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs hidden sm:flex">
                <div
                  className={`w-2 h-2 rounded-full ${
                    hasConnectedAccount ? 'bg-success' : 'bg-warning'
                  }`}
                />
                {hasConnectedAccount ? (
                  <>
                    <span className="text-text font-medium">{brokerState.server}</span>
                    <span className="text-border">·</span>
                    <span className="font-mono tabular-nums text-text-muted">#{brokerState.accountLogin}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-warning/10 text-warning border border-warning/20">
                      {brokerState.mode}
                    </span>
                  </>
                ) : (
                  <span className="text-text-muted">No broker connected</span>
                )}
                <span className="text-border">|</span>
                <span className={brokerState.allowTrading ? 'text-success font-medium' : 'text-warning font-medium'}>
                  {brokerState.allowTrading ? 'Trading: On' : 'Simulated'}
                </span>
              </div>
            )}

            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-warning" />
              ) : (
                <Moon className="w-4 h-4 text-primary" />
              )}
            </button>

            {/* PUBLIC VISITOR: Sign In CTA */}
            {isPublic ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('public')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'public'
                      ? 'bg-surface text-primary border border-primary/30 shadow-xs'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Public Portal</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-white hover:opacity-90 transition-all shadow-xs cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>
            ) : (
              /* AUTHENTICATED USER: Role Badge, Previewer & Sign Out */
              <div className="flex items-center gap-2">
                {/* Master Admin Role Simulation Previewer */}
                {role === 'master_admin' && (
                  <div className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border text-xs">
                    <span className="text-[10px] text-text-muted">Preview:</span>
                    <select
                      value={previewRole || ''}
                      onChange={(e) => setPreviewRole(e.target.value || null)}
                      className="bg-transparent text-text font-semibold text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="">Master Admin (Full)</option>
                      <option value="admin">Trading Desk Admin</option>
                      <option value="trader">Quantitative Trader</option>
                      <option value="viewer">Analyst (Viewer)</option>
                    </select>
                  </div>
                )}

                {/* User Profile Button */}
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                    activeTab === 'profile'
                      ? 'bg-primary/10 border-primary/30 text-primary font-semibold shadow-xs'
                      : 'bg-surface border-border text-text hover:border-primary/30 hover:bg-surface/80'
                  }`}
                  title="View and edit profile details, department & password"
                >
                  <User className="w-3.5 h-3.5 text-primary" />
                  <span className="font-medium text-xs max-w-[130px] truncate hidden md:inline">
                    {profile?.name || user?.user_metadata?.name || profile?.email || 'Profile'}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${getRoleBadgeStyle(
                      effectiveRole
                    )}`}
                  >
                    {getRoleLabel(effectiveRole)}
                  </span>
                </button>

                {/* Hold-to-Confirm Emergency Kill Switch (For Traders & Admins) */}
                {effectiveRole !== 'viewer' && (
                  <button
                    type="button"
                    onMouseDown={startHoldKill}
                    onMouseUp={cancelHoldKill}
                    onMouseLeave={cancelHoldKill}
                    onTouchStart={startHoldKill}
                    onTouchEnd={cancelHoldKill}
                    onClick={() => onOpenKillSwitch()}
                    className={`relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-xs cursor-pointer select-none ${
                      brokerState.killSwitchActive
                        ? 'bg-danger text-white animate-pulse'
                        : 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger hover:text-white'
                    }`}
                    title="Click for review modal, or press and hold for 1.5s to engage emergency halt"
                  >
                    {isHoldingKill && (
                      <span
                        className="absolute inset-0 bg-danger/40 pointer-events-none transition-all"
                        style={{ width: `${holdProgress}%` }}
                      />
                    )}
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span className="relative z-10 hidden sm:inline">
                      {brokerState.killSwitchActive
                        ? 'HALT ENGAGED'
                        : isHoldingKill
                        ? `HOLD (${holdProgress}%)`
                        : 'Kill switch'}
                    </span>
                  </button>
                )}

                {/* Sign Out Button */}
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    setActiveTab('public');
                  }}
                  className="p-2 rounded-lg bg-surface border border-border text-text-muted hover:text-danger hover:border-danger/30 transition-colors cursor-pointer"
                  title="Sign out of portal session"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. PRIMARY NAVIGATION HUB SELECTION BAR */}
      <div className="border-b border-border/60 bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Public Portal Button */}
            {isPublic && (
              <button
                type="button"
                onClick={() => setActiveTab('public')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'public'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Public Overview</span>
              </button>
            )}

            {authorizedHubs.map((hub) => {
              const isSelectedHub = activeHub?.id === hub.id;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => handleSelectHub(hub)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    isSelectedHub && activeTab !== 'public' && activeTab !== 'login'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                >
                  {hub.icon}
                  <span>{hub.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Portal Switcher button */}
          {!isPublic && (
            <button
              type="button"
              onClick={() => setActiveTab('public')}
              className="text-xs text-text-muted hover:text-primary transition-colors hidden md:flex items-center gap-1 cursor-pointer font-medium"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Public View</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. DEDICATED SUB-TAB STRIP */}
      {activeHub && activeTab !== 'public' && activeTab !== 'login' && (
        <div className="bg-bg border-b border-border/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-xs font-medium text-text-muted mr-1 hidden sm:inline">
              {activeHub.label}:
            </span>
            {activeHub.tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-surface text-primary font-semibold border border-primary/30 shadow-xs'
                      : 'text-text-muted hover:text-text hover:bg-surface/60'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
