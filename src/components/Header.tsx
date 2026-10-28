import React, { useRef, useEffect } from 'react';
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
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
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
      { id: 'technical', label: 'Technical & SMC (ICT)', icon: <Flame className="w-3.5 h-3.5 text-amber-400" />, badge: 'XAU' },
      { id: 'fundamentals', label: 'Fundamental & Macro', icon: <Compass className="w-3.5 h-3.5 text-emerald-400" />, badge: 'FRED' },
      { id: 'smartmoney', label: 'Smart Money & COT', icon: <Footprints className="w-3.5 h-3.5 text-teal-400" />, badge: 'CFTC' },
      { id: 'ai-analyst', label: 'AI Quant Advisor', icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400" />, badge: 'AI' },
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
    icon: <Activity className="w-4 h-4 text-blue-400" />,
    defaultTab: 'markets',
    tabIds: ['markets', 'bots'],
    tabs: [
      { id: 'markets', label: 'Live / Demo Markets', icon: <Activity className="w-3.5 h-3.5 text-blue-400" /> },
      { id: 'bots', label: 'Automated Bot Fleet', icon: <Bot className="w-3.5 h-3.5 text-teal-400" /> },
    ],
  },
  {
    id: 'admin',
    label: 'Admin & Data',
    icon: <Database className="w-4 h-4 text-blue-400" />,
    defaultTab: 'data',
    tabIds: ['data', 'accounts', 'settings'],
    tabs: [
      { id: 'data', label: 'Historical Data Vault', icon: <Database className="w-3.5 h-3.5 text-blue-400" />, badge: 'SQLite' },
      { id: 'accounts', label: 'Multi-User & Accounts', icon: <Users className="w-3.5 h-3.5 text-indigo-400" />, badge: 'RBAC' },
      { id: 'settings', label: 'Settings & Math Tests', icon: <Settings className="w-3.5 h-3.5 text-slate-400" /> },
    ],
  },
];

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  brokerState: BrokerState;
  onOpenKillSwitch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  brokerState,
  onOpenKillSwitch,
}) => {
  // Find currently active hub based on activeTab
  const activeHub = NAV_HUBS.find((h) => h.tabIds.includes(activeTab)) || NAV_HUBS[0];

  const handleSelectHub = (hub: HubDef) => {
    if (hub.tabIds.includes(activeTab)) {
      // Already in this hub, keep tab
      return;
    }
    setActiveTab(hub.defaultTab);
  };

  return (
    <header className="border-b border-slate-800 bg-[#0B101B]/95 backdrop-blur sticky top-0 z-40 select-none shadow-xl">
      {/* 1. TOP BRAND & BROKER STATUS BAR */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-slate-800/80 text-xs">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm shadow-blue-500/20">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-sm">Zaboraa FX</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                v4.3
              </span>
              <span className="text-slate-400 font-normal hidden sm:inline">
                Automated Forex & Gold Engine
              </span>
            </div>
          </div>
        </div>

        {/* Global Authoritative Broker State */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                brokerState.connected
                  ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-slate-300">{brokerState.server}</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-400">#{brokerState.accountLogin}</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {brokerState.mode}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono">UTC+{brokerState.utcOffsetHours}</span>
            <span className="text-slate-500">·</span>
            <span className="text-[11px] text-blue-400 font-medium">Algo Trading Active</span>
          </div>

          {/* Emergency Kill Switch */}
          <button
            type="button"
            onClick={onOpenKillSwitch}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold tracking-wide transition-all shadow-md cursor-pointer ${
              brokerState.killSwitchActive
                ? 'bg-red-600 text-white animate-pulse ring-2 ring-red-400 ring-offset-2 ring-offset-slate-950'
                : 'bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-600 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{brokerState.killSwitchActive ? 'HALT ENGAGED' : 'KILL SWITCH'}</span>
          </button>
        </div>
      </div>

      {/* 2. PRIMARY 4-HUB SELECTION BAR (Research, Strategy Lab, Trading Desk, Admin & Data) */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-1.5 border-b border-slate-800/60 bg-slate-950/40">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {NAV_HUBS.map((hub) => {
            const isSelectedHub = activeHub.id === hub.id;
            return (
              <button
                key={hub.id}
                type="button"
                onClick={() => handleSelectHub(hub)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isSelectedHub
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent hover:border-slate-800'
                }`}
              >
                {hub.icon}
                <span>{hub.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. DEDICATED SUB-TAB PILL BAR FOR ACTIVE HUB */}
      <div className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 bg-[#090D16] overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mr-1 hidden sm:inline">
          {activeHub.label}:
        </span>
        {activeHub.tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[9px] font-mono px-1 py-0.1 rounded bg-slate-800 text-slate-300 font-bold border border-slate-700">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
