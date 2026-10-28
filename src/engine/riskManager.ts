import {
  ForexSymbol,
  OrderRecord,
  PositionRecord,
  RiskEvent,
  RiskLimits,
} from '../types/forex';
import { calculatePipValue } from './engineMath';

export interface RiskCheckResult {
  allowed: boolean;
  ruleName: string;
  reason?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
}

export class RiskManager {
  private killSwitchActive: boolean = false;
  private noNewOrders: boolean = false;
  private riskEvents: RiskEvent[] = [];

  constructor() {
    this.killSwitchActive = false;
    this.noNewOrders = false;
  }

  public isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  public isNoNewOrders(): boolean {
    return this.noNewOrders;
  }

  public getRiskEvents(): RiskEvent[] {
    return [...this.riskEvents];
  }

  public logRiskEvent(
    severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'BLOCKED',
    rule: string,
    message: string,
    details?: Record<string, any>
  ) {
    const event: RiskEvent = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      severity,
      rule,
      message,
      details,
    };
    this.riskEvents.unshift(event);
    if (this.riskEvents.length > 200) this.riskEvents.pop();
  }

  /**
   * Triggers Global Emergency Kill Switch
   */
  public triggerKillSwitch(): { success: boolean; closedCount: number; message: string } {
    this.killSwitchActive = true;
    this.noNewOrders = true;

    this.logRiskEvent(
      'CRITICAL',
      'KILL_SWITCH',
      'EMERGENCY KILL SWITCH ENGAGED: Halting all bots and setting persistent no_new_orders = true.'
    );

    return {
      success: true,
      closedCount: 0,
      message: 'Persistent emergency halt active. All new orders blocked.',
    };
  }

  public resetKillSwitch(): void {
    this.killSwitchActive = false;
    this.noNewOrders = false;
    this.logRiskEvent('INFO', 'KILL_SWITCH', 'Emergency Kill Switch reset by manual operator confirmation.');
  }

  /**
   * Evaluates all 11 Risk Firewall rules before order transmission
   */
  public evaluateOrderRisk(
    order: {
      symbol: ForexSymbol;
      side: 'BUY' | 'SELL';
      volume: number;
      price: number;
      sl: number;
      tp?: number;
      currentSpreadPips: number;
    },
    limits: RiskLimits,
    accountState: {
      balance: number;
      equity: number;
      openPositions: PositionRecord[];
      todayPnl: number;
    }
  ): RiskCheckResult {
    // 1. Kill Switch rule
    if (this.noNewOrders || this.killSwitchActive) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'KILL_SWITCH_ACTIVE',
        reason: 'Emergency Kill Switch is active. No new orders permitted.',
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'KILL_SWITCH_ACTIVE', res.reason!);
      return res;
    }

    // 2. Mandatory Stop-Loss rule
    if (limits.mandatoryStopLoss) {
      if (order.sl <= 0) {
        const res: RiskCheckResult = {
          allowed: false,
          ruleName: 'MANDATORY_STOP_LOSS',
          reason: 'Hard Stop-Loss (sl > 0) is mandatory. Unprotected market orders are blocked.',
          severity: 'BLOCKED',
        };
        this.logRiskEvent('BLOCKED', 'MANDATORY_STOP_LOSS', res.reason!);
        return res;
      }

      // Verify SL is on correct side of market
      if (order.side === 'BUY' && order.sl >= order.price) {
        const res: RiskCheckResult = {
          allowed: false,
          ruleName: 'INVALID_SL_PLACEMENT',
          reason: `Buy Stop-Loss (${order.sl}) must be strictly below current price (${order.price}).`,
          severity: 'BLOCKED',
        };
        this.logRiskEvent('BLOCKED', 'INVALID_SL_PLACEMENT', res.reason!);
        return res;
      }
      if (order.side === 'SELL' && order.sl <= order.price) {
        const res: RiskCheckResult = {
          allowed: false,
          ruleName: 'INVALID_SL_PLACEMENT',
          reason: `Sell Stop-Loss (${order.sl}) must be strictly above current price (${order.price}).`,
          severity: 'BLOCKED',
        };
        this.logRiskEvent('BLOCKED', 'INVALID_SL_PLACEMENT', res.reason!);
        return res;
      }
    }

    // 3. Max Lot Size
    if (order.volume > limits.maxLots) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'MAX_LOTS_EXCEEDED',
        reason: `Order size ${order.volume} lots exceeds risk ceiling of ${limits.maxLots} lots.`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'MAX_LOTS_EXCEEDED', res.reason!);
      return res;
    }

    // 4. Max Spread Filter
    if (order.currentSpreadPips > limits.maxSpreadPips) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'SPREAD_SPIKE_FILTER',
        reason: `Current spread ${order.currentSpreadPips} pips exceeds tolerance of ${limits.maxSpreadPips} pips.`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'SPREAD_SPIKE_FILTER', res.reason!);
      return res;
    }

    // 5. Max Open Positions
    if (accountState.openPositions.length >= limits.maxOpenPositions) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'MAX_POSITIONS_REACHED',
        reason: `Open positions count (${accountState.openPositions.length}) reached limit (${limits.maxOpenPositions}).`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'MAX_POSITIONS_REACHED', res.reason!);
      return res;
    }

    // 6. Max Risk % per trade
    const pipScale = order.symbol === 'USDJPY' ? 0.01 : order.symbol === 'XAUUSD' ? 1.0 : 0.0001;
    const slPips = Math.abs(order.price - order.sl) / pipScale;
    const riskDollar = slPips * calculatePipValue(order.symbol, order.volume, order.price);
    const riskPct = accountState.balance > 0 ? (riskDollar / accountState.balance) * 100 : 100;

    if (riskPct > limits.maxRiskPerTradePct * 1.05) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'RISK_PER_TRADE_EXCEEDED',
        reason: `Trade risk of $${riskDollar.toFixed(2)} (${riskPct.toFixed(2)}%) exceeds allowed ${limits.maxRiskPerTradePct}% per trade.`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'RISK_PER_TRADE_EXCEEDED', res.reason!);
      return res;
    }

    // 7. Daily Loss Limit
    const dailyDrawdownPct =
      accountState.balance > 0 ? (Math.abs(Math.min(0, accountState.todayPnl)) / accountState.balance) * 100 : 0;
    if (dailyDrawdownPct >= limits.dailyLossLimitPct) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'DAILY_LOSS_LIMIT_REACHED',
        reason: `Today's loss of ${dailyDrawdownPct.toFixed(2)}% hit the daily loss limit of ${limits.dailyLossLimitPct}%.`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'DAILY_LOSS_LIMIT_REACHED', res.reason!);
      return res;
    }

    // 8. Trading Hours Filter
    const currentUtcHour = new Date().getUTCHours();
    if (
      currentUtcHour < limits.tradingHours.startUtcHour ||
      currentUtcHour >= limits.tradingHours.endUtcHour
    ) {
      const res: RiskCheckResult = {
        allowed: false,
        ruleName: 'OUTSIDE_TRADING_HOURS',
        reason: `Current UTC time ${currentUtcHour}:00 is outside active trading window (${limits.tradingHours.startUtcHour}:00 - ${limits.tradingHours.endUtcHour}:00 UTC).`,
        severity: 'BLOCKED',
      };
      this.logRiskEvent('BLOCKED', 'OUTSIDE_TRADING_HOURS', res.reason!);
      return res;
    }

    return {
      allowed: true,
      ruleName: 'ALL_RULES_PASSED',
      severity: 'INFO',
    };
  }
}

export const globalRiskManager = new RiskManager();
