import React, { useState, useRef, useEffect } from 'react';
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
} from 'lucide-react';
import { BrokerState } from '../types/forex';

export type NavTab =
  | 'markets'
  | 'smartmoney'
  | 'ai-analyst'
  | 'backtest'
  | 'strategies'
  | 'optimization'
  | 'pine'
  | 'data'
  | 'fundamentals'
  | 'technical'
  | 'bots'
  | 'accounts'
  | 'settings';

export type NavHubId = 'research' | 'strategylab' | 'trading' | 'admin';

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
    icon: <Compass className="w-4 h-4 text-emerald-400" />,
    defaultTab: 'technical',
    tabIds: ['technical', 'fundamentals', 'smartmoney', 'ai-analyst'],
    tabs: [
      { id: 'technical', label: 'Technical Analysis', icon: <Flame className="w-3.5 h-3.5 text-amber-400" /> },
      { id: 'fundamentals', label: 'Fundamental & Macro', icon: <Compass className="w-3.5 h-3.5 text-emerald-400" /> },
      { id: 'smartmoney', label: 'Smart Money & COT', icon: <Footprints className="w-3.5 h-3.5 text-teal-400" /> },
      { id: 'ai-analyst', label: 'AI Quant Advisor', icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> },
    ],
  },
  {
    id: 'strategylab',
    label: 'Strategy Lab',
    icon: <BarChart3 className="w-4 h-4 text-violet-400" />,
    defaultTab: 'strategies',
    tabIds: ['strategies', 'backtest', 'optimization', 'pine'],
    tabs: [
      { id: 'strategies', label: 'Strategy Studio', icon: <Code2 className="w-3.5 h-3.5 text-cyan-400" /> },
      { id: 'backtest', label: 'Backtest & Batch Lab', icon: <BarChart3 className="w-3.5 h-3.5 text-violet-400" /> },
      { id: 'optimization', label: 'Optimization & Heatmap', icon: <Sliders className="w-3.5 h-3.5 text-amber-400" /> },
      { id: 'pine', label: 'Pine Script Converter', icon: <Layers className="w-3.5 h-3.5 text-purple-400" /> },
    ],
  },
  {
    id: 'trading',
    label: 'Trading Desk',
    icon: <Activity className="w-4 h-4 text-indigo-400" />,
    defaultTab: 'markets',
    tabIds: ['markets', 'bots'],
    tabs: [
      { id: 'markets', label: 'Order Execution Desk', icon: <Activity className="w-3.5 h-3.5 text-indigo-400" /> },
      { id: 'bots', label: 'Automated Bot Fleet', icon: <Bot className="w-3.5 h-3.5 text-teal-400" /> },
    ],
  },
  {
    id: 'admin',
    label: 'Admin & Data',
    icon: <Database className="w-4 h-4 text-slate-400" />,
    defaultTab: 'accounts',
    tabIds: ['accounts', 'data', 'settings'],
    tabs: [
      { id: 'accounts', label: 'Multi-User & Accounts', icon: <Users className="w-3.5 h-3.5 text-indigo-400" /> },
      { id: 'data', label: 'Historical Data Vault', icon: <Database className="w-3.5 h-3.5 text-blue-400" /> },
      { id: 'settings', label: 'Settings & Math Tests', icon: <Settings className="w-3.5 h-3.5 text-slate-400" /> },
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
  const activeHub = NAV_HUBS.find((h) => h.tabIds.includes(activeTab)) || NAV_HUBS[0];

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

  const hasConnectedAccount = brokerState.connected && Boolean(brokerState.accountLogin);

  return (
    <header className="border-b border-slate-200 dark:border-[#223049] bg-white dark:bg-[#0B1020]/95 backdrop-blur sticky top-0 z-40 select-none shadow-md transition-colors">
      {/* 1. TOP BRAND & ACCOUNT STATUS BAR (Max width aligned with content) */}
      <div className="border-b border-slate-200 dark:border-[#223049]/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Brand Wordmark & Global Environment Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-500/25">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 dark:text-[#E6ECF5] tracking-tight">
                  Zaboraa FX
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Sample Data
                </span>
                <span className="text-slate-500 dark:text-[#9FB0C8] text-xs hidden md:inline">
                  Algorithmic Forex Portal
                </span>
              </div>
            </div>
          </div>

          {/* Account Status, Theme Switcher & Hold-to-Confirm Kill Switch */}
          <div className="flex items-center gap-3">
            {/* Account Status Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] text-xs">
              <div
                className={`w-2 h-2 rounded-full ${
                  hasConnectedAccount
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`}
              />
              {hasConnectedAccount ? (
                <>
                  <span className="text-slate-700 dark:text-[#E6ECF5] font-medium">{brokerState.server}</span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono text-slate-600 dark:text-[#9FB0C8]">#{brokerState.accountLogin}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {brokerState.mode}
                  </span>
                </>
              ) : (
                <span className="text-slate-500 dark:text-[#9FB0C8]">No broker connected</span>
              )}
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className={brokerState.allowTrading ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                {brokerState.allowTrading ? 'Trading: On' : 'Trading: Off (Simulated)'}
              </span>
            </div>

            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-slate-100 dark:bg-[#111A2E] border border-slate-200 dark:border-[#223049] text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>

            {/* Hold-to-Confirm Emergency Kill Switch */}
            <button
              type="button"
              onMouseDown={startHoldKill}
              onMouseUp={cancelHoldKill}
              onMouseLeave={cancelHoldKill}
              onTouchStart={startHoldKill}
              onTouchEnd={cancelHoldKill}
              onClick={() => {
                // If clicked directly without hold, open confirmation modal
                onOpenKillSwitch();
              }}
              className={`relative overflow-hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-sm cursor-pointer select-none ${
                brokerState.killSwitchActive
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-600 hover:text-white'
              }`}
              title="Click for review modal, or press and hold for 1.5s to engage emergency halt"
            >
              {isHoldingKill && (
                <span
                  className="absolute inset-0 bg-rose-600/40 pointer-events-none transition-all"
                  style={{ width: `${holdProgress}%` }}
                />
              )}
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span className="relative z-10">
                {brokerState.killSwitchActive
                  ? 'HALT ENGAGED'
                  : isHoldingKill
                  ? `HOLD (${holdProgress}%)`
                  : 'Kill switch'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. PRIMARY 4-HUB SELECTION BAR (Max width aligned with content) */}
      <div className="border-b border-slate-200 dark:border-[#223049]/50 bg-slate-50 dark:bg-[#0E1524]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {NAV_HUBS.map((hub) => {
              const isSelectedHub = activeHub.id === hub.id;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => handleSelectHub(hub)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    isSelectedHub
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                      : 'text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#111A2E]'
                  }`}
                >
                  {hub.icon}
                  <span>{hub.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* 3. DEDICATED SUB-TAB STRIP */}
      <div className="bg-slate-100 dark:bg-[#090D16] border-b border-slate-200 dark:border-[#223049]/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">
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
                    ? 'bg-white dark:bg-[#111A2E] text-indigo-600 dark:text-white font-semibold border border-indigo-200 dark:border-indigo-500/30 shadow-sm'
                    : 'text-slate-600 dark:text-[#9FB0C8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#111A2E]/60'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
