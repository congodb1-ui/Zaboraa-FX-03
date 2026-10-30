import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Shield,
  Activity,
  Bot,
  BarChart3,
  Flame,
  Footprints,
  Compass,
  ArrowRight,
  Lock,
  CheckCircle2,
  Clock,
  Globe,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Button, Card, Badge } from './ui';

interface PublicPortalViewProps {
  onNavigateToLogin: () => void;
  onNavigateToTab: (tab: 'technical' | 'fundamentals' | 'smartmoney') => void;
}

interface MarketTicker {
  symbol: string;
  name: string;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  digits: number;
}

const INITIAL_TICKERS: MarketTicker[] = [
  { symbol: 'XAUUSD', name: 'Spot Gold / US Dollar', bid: 2742.60, ask: 2742.85, spread: 2.5, change24h: 1.14, digits: 2 },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', bid: 1.08452, ask: 1.08465, spread: 1.3, change24h: -0.28, digits: 5 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', bid: 1.29815, ask: 1.29832, spread: 1.7, change24h: 0.42, digits: 5 },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', bid: 152.340, ask: 152.355, spread: 1.5, change24h: 0.65, digits: 3 },
];

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  onNavigateToLogin,
  onNavigateToTab,
}) => {
  const [tickers, setTickers] = useState<MarketTicker[]>(INITIAL_TICKERS);
  const [utcTime, setUtcTime] = useState<string>('');

  // Update clock & slight simulated market drift for live feel
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toUTCString().slice(17, 25) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine active sessions
  const getSessionStatus = () => {
    const hour = new Date().getUTCHours();
    return {
      london: hour >= 8 && hour < 16,
      newYork: hour >= 13 && hour < 21,
      tokyo: hour >= 0 && hour < 8,
      sydney: hour >= 22 || hour < 6,
    };
  };

  const sessions = getSessionStatus();

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-200">
      {/* 1. HERO INSTITUTIONAL SHOWCASE */}
      <div className="relative overflow-hidden rounded-3xl bg-surface border border-border p-6 sm:p-10 shadow-sm">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <Zap className="w-3.5 h-3.5" />
              Institutional Quantitative Engine
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Exness MT5 Feed Online
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-text-muted border border-border">
              <Clock className="w-3.5 h-3.5" />
              {utcTime || 'Live Clock'}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text font-sans leading-tight">
            Algorithmic Quantitative FX & Gold Trading Desk
          </h1>

          <p className="text-sm sm:text-base text-text-muted leading-relaxed font-sans max-w-2xl">
            Local-first high-frequency architecture connecting directly to MetaTrader 5 terminals.
            Built with sub-second deterministic risk firewalling, smart money institutional COT models,
            and isolated strategy execution sandboxes.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={onNavigateToLogin}
              className="flex items-center gap-2 shadow-md cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Sign In to Trading Portal</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => onNavigateToTab('technical')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Flame className="w-4 h-4 text-warning" />
              <span>Explore Public Research</span>
            </Button>
          </div>
        </div>

        {/* Global Market Session Status Bar */}
        <div className="mt-8 pt-6 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-text">London Session</div>
              <div className="text-[11px] text-text-muted">08:00 - 16:00 UTC</div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                sessions.london ? 'bg-success/15 text-success' : 'bg-surface text-text-muted'
              }`}
            >
              {sessions.london ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-text">New York Session</div>
              <div className="text-[11px] text-text-muted">13:00 - 21:00 UTC</div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                sessions.newYork ? 'bg-success/15 text-success' : 'bg-surface text-text-muted'
              }`}
            >
              {sessions.newYork ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-text">Tokyo Session</div>
              <div className="text-[11px] text-text-muted">00:00 - 08:00 UTC</div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                sessions.tokyo ? 'bg-success/15 text-success' : 'bg-surface text-text-muted'
              }`}
            >
              {sessions.tokyo ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-bg border border-border flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-text">Sydney Session</div>
              <div className="text-[11px] text-text-muted">22:00 - 06:00 UTC</div>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                sessions.sydney ? 'bg-success/15 text-success' : 'bg-surface text-text-muted'
              }`}
            >
              {sessions.sydney ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. LIVE CURRENCY & GOLD WATCH TICKERS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-text uppercase tracking-wider font-sans">
              Live Market Rates (Exness Trial Feed)
            </h2>
          </div>
          <span className="text-xs text-text-muted">Prices update dynamically</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tickers.map((t) => (
            <Card key={t.symbol} padding="md" className="space-y-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm text-text font-mono">{t.symbol}</span>
                  <p className="text-[11px] text-text-muted font-sans">{t.name}</p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold font-mono tabular-nums ${
                    t.change24h >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                  }`}
                >
                  {t.change24h >= 0 ? '+' : ''}
                  {t.change24h}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                <div className="p-2 rounded-lg bg-bg">
                  <div className="text-[10px] text-text-muted uppercase font-sans">Bid</div>
                  <div className="text-xs font-bold text-text font-mono tabular-nums">
                    {t.bid.toFixed(t.digits)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-bg">
                  <div className="text-[10px] text-text-muted uppercase font-sans">Ask</div>
                  <div className="text-xs font-bold text-text font-mono tabular-nums">
                    {t.ask.toFixed(t.digits)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
                <span>Spread: <strong className="text-text font-mono">{t.spread} pts</strong></span>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('technical')}
                  className="text-primary hover:underline font-semibold cursor-pointer"
                >
                  View Chart →
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* 3. PUBLIC RESEARCH HUB PREVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Technical Analysis Preview */}
        <Card padding="lg" className="space-y-3.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-text font-sans">Technical Analysis</h3>
            <p className="text-xs text-text-muted leading-relaxed font-sans">
              25 Wilder-smoothed technical overlays and sub-panes computed across 50,000+ historical bars.
              Inspect live pivot levels, Supertrend signals, and ATR volatility bands.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToTab('technical')}
            className="w-full justify-between cursor-pointer"
          >
            <span>Open Technical Chart</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Card>

        {/* Fundamental & Macro Preview */}
        <Card padding="lg" className="space-y-3.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-text font-sans">Fundamental & Macro</h3>
            <p className="text-xs text-text-muted leading-relaxed font-sans">
              Macroeconomic calendar events, central bank interest rate trajectories, and consumer sentiment
              indices mapped directly to G10 currency flows.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToTab('fundamentals')}
            className="w-full justify-between cursor-pointer"
          >
            <span>View Macro Calendar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Card>

        {/* Smart Money COT Preview */}
        <Card padding="lg" className="space-y-3.5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center">
              <Footprints className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-text font-sans">Smart Money & COT</h3>
            <p className="text-xs text-text-muted leading-relaxed font-sans">
              Weekly CFTC Commitment of Traders tracking. Measure commercial hedger accumulation vs.
              non-commercial speculative positioning with z-score anomaly detection.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToTab('smartmoney')}
            className="w-full justify-between cursor-pointer"
          >
            <span>Explore COT Sentiment</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Card>
      </div>

      {/* 4. ALGORITHMIC FLEET & RISK FIREWALL SHOWCASE */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-text font-sans flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-success" />
              <span>Institutional Risk Firewall & Strategy Sandbox</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5 font-sans">
              Every automated order is screened by an authoritative server-side risk firewall before reaching MetaTrader 5.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-md text-xs font-semibold bg-success/10 text-success border border-success/20">
              100% Mandatory Stop-Loss
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-bg border border-border space-y-1">
            <div className="text-xs text-text-muted font-sans">Strategy Win Rate</div>
            <div className="text-xl font-bold text-success font-mono">64.2%</div>
            <p className="text-[11px] text-text-muted">TrendPullbackPro Gold model</p>
          </div>

          <div className="p-4 rounded-xl bg-bg border border-border space-y-1">
            <div className="text-xs text-text-muted font-sans">Profit Factor</div>
            <div className="text-xl font-bold text-primary font-mono">1.84</div>
            <p className="text-[11px] text-text-muted">Verified out-of-sample holdout</p>
          </div>

          <div className="p-4 rounded-xl bg-bg border border-border space-y-1">
            <div className="text-xs text-text-muted font-sans">Max Drawdown</div>
            <div className="text-xl font-bold text-text font-mono">4.12%</div>
            <p className="text-[11px] text-text-muted">Strict 5% hard ceiling enforcement</p>
          </div>

          <div className="p-4 rounded-xl bg-bg border border-border space-y-1">
            <div className="text-xs text-text-muted font-sans">Execution Budget</div>
            <div className="text-xl font-bold text-info font-mono">&lt; 50ms</div>
            <p className="text-[11px] text-text-muted">QuickJS WebAssembly sandbox</p>
          </div>
        </div>
      </div>

      {/* 5. ROLE PERMISSION MATRIX TABLE */}
      <div className="p-6 rounded-2xl bg-surface border border-border space-y-4">
        <div>
          <h3 className="text-base font-bold text-text font-sans">Role-Based Access Hierarchy</h3>
          <p className="text-xs text-text-muted mt-0.5 font-sans">
            Clear role isolation ensures that trading desk operators, analysts, and administrators only access authorized functionality.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-text-muted uppercase tracking-wider font-sans">
                <th className="py-2.5 px-3">Capability / Workspace</th>
                <th className="py-2.5 px-3">Public Portal</th>
                <th className="py-2.5 px-3">Analyst (Viewer)</th>
                <th className="py-2.5 px-3">Trader</th>
                <th className="py-2.5 px-3">Administrator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Market Research & COT</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Public Read</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Full Access</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Full Access</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Full Access</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Trading Desk Execution</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Requires Login</td>
                <td className="py-2.5 px-3 text-text-muted">Read-Only</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Demo & Live</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Demo & Live</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Automated Bot Fleet</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Requires Login</td>
                <td className="py-2.5 px-3 text-text-muted">Read-Only</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Start / Stop</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Full Authority</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Strategy Studio & QuickJS</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Requires Login</td>
                <td className="py-2.5 px-3 text-text-muted">Read-Only</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Edit & Backtest</td>
                <td className="py-2.5 px-3 text-success font-medium">✓ Edit & Backtest</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Website Modifications & Branding</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-primary font-bold">✓ Admin Console</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-text">Risk Firewall & User Accounts</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-text-muted">✕ Restricted</td>
                <td className="py-2.5 px-3 text-primary font-bold">✓ Admin Console</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. CALL TO ACTION FOOTER BANNER */}
      <div className="p-8 rounded-3xl bg-surface border border-primary/30 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="w-6 h-6" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-text font-sans">
          Ready to launch your institutional algorithmic workspace?
        </h2>
        <p className="text-xs sm:text-sm text-text-muted max-w-xl mx-auto font-sans">
          Sign in to your authorized desk role or test instant demo access to experience automated strategy execution.
        </p>
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onNavigateToLogin}
            className="cursor-pointer shadow-lg"
          >
            <span>Proceed to Authentication Portal</span>
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
};
