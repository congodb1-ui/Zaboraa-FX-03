import { Candle } from '../../types/forex';
import {
  DEFAULT_SMART_MONEY_CONFIG,
  DISCLAIMER_TEXT,
  SMART_MONEY_VERSION,
  SmartMoneyScorerConfig,
  computeConfigHash,
} from './cotConfig';
import { ActivityEventResult } from './activityEvents';
import { CotFeaturesResult } from './cotFeatures';
import { TrendContextResult } from './trendContext';

export interface SmartMoneySignalRecord {
  id: string;
  symbol: string;
  bar_time: number;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  score: number;
  confidence: number;
  c_cot: number;
  c_act: number;
  c_trend: number;
  event_type: string;
  vol_z: number;
  range_atr: number;
  close_loc: number;
  is_crowded: boolean;
  is_stale: boolean;
  is_baseline_fallback: boolean;
  invalidation_price: number;
  expires_at: number;
  config_hash: string;
  strategy_version: string;
  created_at: string;
  disclaimer: string;
  reason?: string;
}

/**
 * Pure scoring function that synthesizes COT, Activity Events, and Trend components.
 * Enforces the strict Minimum-Agreement rule and deterministic confidence scoring.
 */
export function scoreSmartMoneySignal(
  symbol: string,
  bar: Candle,
  cotRes: CotFeaturesResult,
  actRes: ActivityEventResult,
  trendRes: TrendContextResult,
  config: SmartMoneyScorerConfig = DEFAULT_SMART_MONEY_CONFIG
): SmartMoneySignalRecord {
  const { wCot, wAct, wTrend, threshold } = config;
  const rawScore = 100 * (wCot * cotRes.cCot + wAct * actRes.cAct + wTrend * trendRes.cTrend);
  const roundedScore = Number(rawScore.toFixed(1));

  // Minimum-Agreement Rule:
  // 1. At least TWO components must be non-zero
  // 2. NO component may point the opposite way of candidate direction
  // 3. |score| >= threshold
  let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let reason: string | undefined;

  const candidateDirection = roundedScore >= threshold ? 'BUY' : roundedScore <= -threshold ? 'SELL' : 'NEUTRAL';

  if (candidateDirection !== 'NEUTRAL') {
    const components = [cotRes.cCot, actRes.cAct, trendRes.cTrend];
    const nonZeroCount = components.filter((c) => Math.abs(c) > 0.001).length;

    const hasOpposingComponent =
      candidateDirection === 'BUY'
        ? components.some((c) => c < -0.001)
        : components.some((c) => c > 0.001);

    if (nonZeroCount < 2) {
      direction = 'NEUTRAL';
      reason = `Minimum-agreement failed: only ${nonZeroCount} of 3 layers non-zero (required >= 2)`;
    } else if (hasOpposingComponent) {
      direction = 'NEUTRAL';
      reason = 'Opposing layer detected: conflicting multi-timeframe directional evidence';
    } else {
      direction = candidateDirection;
    }
  } else {
    reason = `Score |${roundedScore}| below activation threshold (${threshold})`;
  }

  // Confidence calculation (0 to 100)
  let confidence = Math.abs(roundedScore);
  if (cotRes.crowded) confidence -= 15;
  if (actRes.baselineFallback) confidence -= 10;
  if (cotRes.stale || actRes.skipped) confidence -= 20;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  // Invalidation level: bar.close - 1.5 * ATR14 for BUY, bar.close + 1.5 * ATR14 for SELL
  const atr = actRes.atr14 || (bar.high - bar.low);
  const invalidationPrice =
    direction === 'BUY'
      ? Number((bar.close - 1.5 * atr).toFixed(5))
      : direction === 'SELL'
      ? Number((bar.close + 1.5 * atr).toFixed(5))
      : bar.close;

  const expiresAt = bar.time + 24 * 3600;
  const configHash = computeConfigHash(config);
  const signalId = `sm-${symbol.toLowerCase()}-${bar.time}-${SMART_MONEY_VERSION}`;

  return {
    id: signalId,
    symbol,
    bar_time: bar.time,
    direction,
    score: roundedScore,
    confidence,
    c_cot: cotRes.cCot,
    c_act: actRes.cAct,
    c_trend: trendRes.cTrend,
    event_type: actRes.eventType,
    vol_z: actRes.volZ,
    range_atr: actRes.rangeInAtr,
    close_loc: actRes.closeLoc,
    is_crowded: cotRes.crowded,
    is_stale: cotRes.stale,
    is_baseline_fallback: actRes.baselineFallback,
    invalidation_price: invalidationPrice,
    expires_at: expiresAt,
    config_hash: configHash,
    strategy_version: SMART_MONEY_VERSION,
    created_at: new Date().toISOString(),
    disclaimer: DISCLAIMER_TEXT,
    reason,
  };
}
