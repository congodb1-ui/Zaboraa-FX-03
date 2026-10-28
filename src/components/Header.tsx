import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Compass,
  Database,
  Flame,
  Footprints,
  Layers,
  MoreHorizontal,
  Settings,
  ShieldAlert,
  Sliders,
  Sparkles,
  TrendingUp,
  Check,
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
  | 'settings';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  brokerState: BrokerState;
  onOpenKillSwitch: () => void;
}

interface NavItemDef {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  category: 'core' | 'analysis' | 'system';
  description?: string;
  badge?: string;
}

const NAV_ITEMS: NavItemDef[] = [
  {
    id: 'markets',
    label: 'Markets & Trading',
    icon: <Activity className="w-4 h-4 text-blue-400" />,
    category: 'core',
    description: 'Real-time quotes, execution tickets, and chart monitor',
  },
  {
    id: 'smartmoney',
    label: 'Smart Money Footprint',
    icon: <Footprints className="w-4 h-4 text-emerald-400" />,
    category: 'core',
    badge: 'v2',
    description: 'Institutional sweeps, FVG mitigation, and footprint matrix',
  },
  {
    id: 'ai-analyst',
    label: 'AI Analysis & Advisor',
    icon: <Sparkles className="w-4 h-4 text-indigo-400" />,
    category: 'core',
    badge: 'AI',
    description: 'Multi-timeframe market insights & trade thesis generator',
  },
  {
    id: 'backtest',
    label: 'Backtesting Lab',
    icon: <BarChart3 className="w-4 h-4 text-violet-400" />,
    category: 'core',
    description: 'Realistic tick/bar backtesting engine with commission & slippage',
  },
  {
    id: 'strategies',
    label: 'Strategy Studio',
    icon: <Code2 className="w-4 h-4 text-cyan-400" />,
    category: 'core',
    description: 'Code, edit, clone, and test algorithmic rule configurations',
  },
  {
    id: 'optimization',
    label: 'Optimization & Heatmap',
    icon: <Sliders className="w-4 h-4 text-amber-400" />,
    category: 'core',
    description: 'Multi-parameter grid search and robust parameter heatmaps',
  },
  {
    id: 'technical',
    label: 'Gold Technicals (ICT/SMC)',
    icon: <Flame className="w-4 h-4 text-amber-500" />,
    category: 'analysis',
    badge: 'XAU',
    description: 'London/NY killzones, fair value gaps, liquidity pools',
  },
  {
    id: 'fundamentals',
    label: 'Fundamentals & Sentiment',
    icon: <Compass className="w-4 h-4 text-emerald-500" />,
    category: 'analysis',
    description: 'FRED macro rates, central bank calendar, Cot sentiment',
  },
  {
    id: 'pine',
    label: 'Pine Script AI Converter',
    icon: <Layers className="w-4 h-4 text-purple-400" />,
    category: 'analysis',
    description: 'Translate TradingView Pine Script to Zaboraa TypeScript sandboxes',
  },
  {
    id: 'data',
    label: 'Data Manager',
    icon: <Database className="w-4 h-4 text-blue-500" />,
    category: 'system',
    description: 'Local SQLite candle datasets, Exness broker sync, CSV imports',
  },
  {
    id: 'bots',
    label: 'Automated Bots',
    icon: <Bot className="w-4 h-4 text-teal-400" />,
    category: 'system',
    description: 'Paper & demo runner instances with kill switch protection',
  },
  {
    id: 'settings',
    label: 'Settings & Math Tests',
    icon: <Settings className="w-4 h-4 text-slate-400" />,
    category: 'system',
    description: 'Known-answer mathematical validation and bridge configuration',
  },
];

// Secondary / Overflow items available in the "More Tools" dropdown
const MORE_ITEMS = NAV_ITEMS.filter((item) => item.category === 'analysis' || item.category === 'system');

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  brokerState,
  onOpenKillSwitch,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Check scroll position to determine edge gradient fades and scroll arrow visibility
  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    updateScrollState();

    const handleResize = () => updateScrollState();
    window.addEventListener('resize', handleResize);
    el.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  // Smoothly scroll active tab into view when activeTab changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const activeBtn = el.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
    // Re-check scroll buttons after scroll settles
    const timer = setTimeout(updateScrollState, 350);
    return () => clearTimeout(timer);
  }, [activeTab, updateScrollState]);

  // Close "More" dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreOpen(false);
      }
    };
    if (isMoreOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = direction === 'left' ? -260 : 260;
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(updateScrollState, 350);
  };

  const isMoreTabActive = MORE_ITEMS.some((item) => item.id === activeTab);
  const activeMoreItem = MORE_ITEMS.find((item) => item.id === activeTab);

  return (
    <header className="border-b border-slate-800 bg-[#0B101B]/95 backdrop-blur sticky top-0 z-40 select-none">
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

      {/* Main Navigation Bar with Smooth Horizontal Scrolling, Fade Gradients, and "More" Menu */}
      <div className="relative flex items-center px-2 sm:px-4">
        {/* Left Scroll Chevron Button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="absolute left-1 z-30 flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 shadow-md transition-all cursor-pointer backdrop-blur-sm"
            aria-label="Scroll navigation left"
            title="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Left Gradient Fade Mask */}
        <div
          className={`pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0B101B] via-[#0B101B]/80 to-transparent z-20 transition-opacity duration-200 ${
            canScrollLeft ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Horizontally Scrollable Tabs Row */}
        <div
          ref={scrollContainerRef}
          className="flex items-center overflow-x-auto scroll-smooth no-scrollbar scrollbar-none gap-1 py-1 px-1 flex-1 min-w-0"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              tabId={item.id}
              active={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
              icon={item.icon}
              label={item.label}
              badge={item.badge}
            />
          ))}
        </div>

        {/* Right Gradient Fade Mask */}
        <div
          className={`pointer-events-none absolute right-24 sm:right-28 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0B101B] via-[#0B101B]/80 to-transparent z-20 transition-opacity duration-200 ${
            canScrollRight ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Right Scroll Chevron Button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="absolute right-28 sm:right-32 z-30 flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 shadow-md transition-all cursor-pointer backdrop-blur-sm"
            aria-label="Scroll navigation right"
            title="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Responsive "More Tools" Dropdown Menu */}
        <div className="relative flex-shrink-0 ml-1.5 pl-2 border-l border-slate-800/80" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setIsMoreOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
              isMoreTabActive
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 shadow-sm'
                : isMoreOpen
                ? 'bg-slate-800 border-slate-700 text-slate-100'
                : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            aria-expanded={isMoreOpen}
            aria-haspopup="true"
            title="Categorized Navigation & Tools"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">
              {isMoreTabActive && activeMoreItem ? activeMoreItem.label.split(' ')[0] : 'More'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isMoreOpen ? 'rotate-180 text-blue-400' : 'text-slate-500'
              }`}
            />
          </button>

          {/* Dropdown Menu Modal / Popover */}
          {isMoreOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl bg-[#0D1424] border border-slate-700/80 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
              <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Quick Navigation Hub
                </span>
                <span className="text-[10px] text-slate-500">12 Sections</span>
              </div>

              <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-800/60 p-1.5">
                {/* Analytics & Gold Section */}
                <div className="py-1">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Analytics & Research</span>
                  </div>
                  {NAV_ITEMS.filter((i) => i.category === 'analysis').map((item) => (
                    <DropdownItem
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMoreOpen(false);
                      }}
                    />
                  ))}
                </div>

                {/* System & Execution Section */}
                <div className="py-1">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>System & Execution</span>
                  </div>
                  {NAV_ITEMS.filter((i) => i.category === 'system').map((item) => (
                    <DropdownItem
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMoreOpen(false);
                      }}
                    />
                  ))}
                </div>

                {/* Core Modules Quick Links */}
                <div className="py-1">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Core Trading Modules</span>
                  </div>
                  {NAV_ITEMS.filter((i) => i.category === 'core').map((item) => (
                    <DropdownItem
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setIsMoreOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

interface NavButtonProps {
  tabId: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}

const NavButton: React.FC<NavButtonProps> = ({ tabId, active, onClick, icon, label, badge }) => {
  return (
    <button
      type="button"
      data-tab-id={tabId}
      onClick={onClick}
      className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex-shrink-0 transition-all rounded-t-sm cursor-pointer ${
        active
          ? 'border-blue-500 text-blue-400 bg-blue-500/10 font-semibold shadow-inner'
          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
      }`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="tracking-tight whitespace-nowrap">{label}</span>
      {badge && (
        <span
          className={`px-1 py-0.2 text-[9px] font-mono font-bold rounded flex-shrink-0 ${
            active
              ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
              : 'bg-slate-800 text-slate-400 border border-slate-700/60'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

interface DropdownItemProps {
  item: NavItemDef;
  active: boolean;
  onClick: () => void;
}

const DropdownItem: React.FC<DropdownItemProps> = ({ item, active, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
        active
          ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
      }`}
    >
      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-100 truncate">{item.label}</span>
          {item.badge && (
            <span className="px-1 py-0.2 text-[9px] font-mono rounded bg-blue-500/20 text-blue-300 font-semibold">
              {item.badge}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-[11px] text-slate-400 leading-tight mt-0.5 line-clamp-1">
            {item.description}
          </p>
        )}
      </div>
      {active && <Check className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}
    </button>
  );
};

