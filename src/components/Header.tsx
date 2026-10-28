import React from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Code2,
  Compass,
  Database,
  Flame,
  Layers,
  Settings,
  ShieldAlert,
  Sliders,
  TrendingUp,
} from 'lucide-react';
import { BrokerState } from '../types/forex';

export type NavTab =
  | 'markets'
  | 'backtest'
  | 'strategies'
  | 'optimization'
  | 'pine'
  | 'data'
  | 'fundamentals'
  | 'technical'
  | 'bots'
  | 'settings';

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
  return (
    <header className="border-b border-slate-800 bg-[#0B101B]/95 backdrop-blur sticky top-0 z-40">
      {/* Top Banner / Status Strip */}
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

        {/* Broker Connection & Demo Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800">
            <div
              className={`w-2 h-2 rounded-full ${
                brokerState.connected
                  ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-slate-300">
              {brokerState.server}
            </span>
            <span className="text-slate-500">·</span>
            <span className="font-mono text-slate-400">
              #{brokerState.accountLogin}
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {brokerState.mode}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-slate-400 font-mono">
              UTC+{brokerState.utcOffsetHours}
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-[11px] text-blue-400 font-medium">
              Algo Trading Active
            </span>
          </div>

          {/* Emergency Kill Switch Button */}
          <button
            type="button"
            onClick={onOpenKillSwitch}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold tracking-wide transition-all shadow-md ${
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

      {/* Main Navigation Tabs */}
      <div className="flex items-center px-4 overflow-x-auto no-scrollbar gap-1">
        <NavButton
          active={activeTab === 'markets'}
          onClick={() => setActiveTab('markets')}
          icon={<Activity className="w-4 h-4" />}
          label="Markets & Trading"
        />
        <NavButton
          active={activeTab === 'backtest'}
          onClick={() => setActiveTab('backtest')}
          icon={<BarChart3 className="w-4 h-4" />}
          label="Backtesting Lab"
        />
        <NavButton
          active={activeTab === 'strategies'}
          onClick={() => setActiveTab('strategies')}
          icon={<Code2 className="w-4 h-4" />}
          label="Strategy Studio"
        />
        <NavButton
          active={activeTab === 'optimization'}
          onClick={() => setActiveTab('optimization')}
          icon={<Sliders className="w-4 h-4" />}
          label="Optimization & Heatmap"
        />
        <NavButton
          active={activeTab === 'pine'}
          onClick={() => setActiveTab('pine')}
          icon={<Layers className="w-4 h-4" />}
          label="Pine Script AI Converter"
        />
        <NavButton
          active={activeTab === 'data'}
          onClick={() => setActiveTab('data')}
          icon={<Database className="w-4 h-4" />}
          label="Data Manager"
        />
        <NavButton
          active={activeTab === 'fundamentals'}
          onClick={() => setActiveTab('fundamentals')}
          icon={<Compass className="w-4 h-4" />}
          label="Fundamentals & Sentiment"
        />
        <NavButton
          active={activeTab === 'technical'}
          onClick={() => setActiveTab('technical')}
          icon={<Flame className="w-4 h-4" />}
          label="Gold Technicals (Investing)"
        />
        <NavButton
          active={activeTab === 'bots'}
          onClick={() => setActiveTab('bots')}
          icon={<Bot className="w-4 h-4" />}
          label="Automated Bots"
        />
        <NavButton
          active={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          icon={<Settings className="w-4 h-4" />}
          label="Settings & Math Tests"
        />
      </div>
    </header>
  );
};

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
        active
          ? 'border-blue-500 text-blue-400 bg-blue-500/5'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
