import { describe, it, expect } from 'vitest';
import { scoreSmartMoneySignal } from '../smartMoney/scorer';
import { DEFAULT_SMART_MONEY_CONFIG, computeConfigHash, TICK_VOLUME_LABEL, COT_LABEL } from '../smartMoney/cotConfig';
import { Candle } from '../../types/forex';

const mockBar: Candle = {
  time: 1792454400,
  open: 2650.0,
  high: 2660.0,
  low: 2645.0,
  close: 2658.0,
  tickVolume: 1000,
  spread: 25.0,
};

describe('Smart Money Footprint Scorer & Minimum-Agreement Rule', () => {
  it('calculates score with default weights: 100 * (0.35*cCot + 0.40*cAct + 0.25*cTrend)', () => {
    // When cCot=1, cAct=1, cTrend=1 -> 100 * (0.35 + 0.40 + 0.25) = 100
    const cotRes = { cCot: 1.0, crowded: false, stale: false, label: COT_LABEL, netPctOi: 50, z156: 1.2, chg4: 5, chg4z: 2.0 };
    const actRes = { cAct: 1.0, eventType: 'DISPLACEMENT_UP' as const, volZ: 2.5, rangeInAtr: 1.8, closeLoc: 0.85, baselineFallback: false, atr14: 10.0, skipped: false, label: TICK_VOLUME_LABEL };
    const trendRes = { cTrend: 1.0, trendDirection: 'BULLISH' as const, emaFast: 2650, emaSlow: 2630, h4BarCount: 50 };

    const sig = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);
    expect(sig.score).toBe(100.0);
    expect(sig.direction).toBe('BUY');
    expect(sig.confidence).toBe(100);
    expect(sig.invalidation_price).toBe(2658.0 - 1.5 * 10.0); // 2643
  });

  it('enforces Minimum-Agreement rule: fails if fewer than 2 layers are non-zero', () => {
    // Only cAct=1, others are 0 -> score = 40 (below 50 anyway, but nonZeroCount=1)
    const cotRes = { cCot: 0.0, crowded: false, stale: false, label: COT_LABEL, netPctOi: 50, z156: 1.2, chg4: 5, chg4z: 2.0 };
    const actRes = { cAct: 1.0, eventType: 'DISPLACEMENT_UP' as const, volZ: 2.5, rangeInAtr: 1.8, closeLoc: 0.85, baselineFallback: false, atr14: 10.0, skipped: false, label: TICK_VOLUME_LABEL };
    const trendRes = { cTrend: 0.0, trendDirection: 'FLAT' as const, emaFast: null, emaSlow: null, h4BarCount: 10 };

    const sig = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);
    expect(sig.direction).toBe('NEUTRAL');
  });

  it('strictly blocks signal if any layer opposes the direction', () => {
    // cAct=1.0 (wAct=0.40), cTrend=1.0 (wTrend=0.25), cCot = -0.2 (wCot=0.35) -> raw score = 58 >= 50. BUT cCot is opposing (< 0)
    const cotRes = { cCot: -0.2, crowded: false, stale: false, label: COT_LABEL, netPctOi: 50, z156: 1.2, chg4: 5, chg4z: -0.4 };
    const actRes = { cAct: 1.0, eventType: 'DISPLACEMENT_UP' as const, volZ: 2.5, rangeInAtr: 1.8, closeLoc: 0.85, baselineFallback: false, atr14: 10.0, skipped: false, label: TICK_VOLUME_LABEL };
    const trendRes = { cTrend: 1.0, trendDirection: 'BULLISH' as const, emaFast: 2650, emaSlow: 2630, h4BarCount: 50 };

    const sig = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);
    expect(sig.direction).toBe('NEUTRAL');
    expect(sig.reason).toContain('Opposing layer');
  });

  it('deducts confidence penalties for crowded, baselineFallback, and stale flags', () => {
    const cotRes = { cCot: 1.0, crowded: true, stale: true, label: COT_LABEL, netPctOi: 50, z156: 2.2, chg4: 5, chg4z: 2.0 }; // -15 (crowded), -20 (stale)
    const actRes = { cAct: 1.0, eventType: 'DISPLACEMENT_UP' as const, volZ: 2.5, rangeInAtr: 1.8, closeLoc: 0.85, baselineFallback: true, atr14: 10.0, skipped: false, label: TICK_VOLUME_LABEL }; // -10 (fallback)
    const trendRes = { cTrend: 1.0, trendDirection: 'BULLISH' as const, emaFast: 2650, emaSlow: 2630, h4BarCount: 50 };

    const sig = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);
    // 100 - 15 - 10 - 20 = 55
    expect(sig.confidence).toBe(55);
  });

  it('guarantees deterministic output (run twice gives identical result)', () => {
    const cotRes = { cCot: 0.8, crowded: false, stale: false, label: COT_LABEL, netPctOi: 50, z156: 1.2, chg4: 5, chg4z: 1.6 };
    const actRes = { cAct: 1.0, eventType: 'DISPLACEMENT_UP' as const, volZ: 2.2, rangeInAtr: 1.6, closeLoc: 0.8, baselineFallback: false, atr14: 8.5, skipped: false, label: TICK_VOLUME_LABEL };
    const trendRes = { cTrend: 1.0, trendDirection: 'BULLISH' as const, emaFast: 2650, emaSlow: 2630, h4BarCount: 50 };

    const run1 = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);
    const run2 = scoreSmartMoneySignal('XAUUSD', mockBar, cotRes, actRes, trendRes);

    expect(run1.score).toBe(run2.score);
    expect(run1.confidence).toBe(run2.confidence);
    expect(run1.invalidation_price).toBe(run2.invalidation_price);
    expect(run1.config_hash).toBe(run2.config_hash);
  });

  it('changes config_hash when config weights or thresholds change', () => {
    const hash1 = computeConfigHash(DEFAULT_SMART_MONEY_CONFIG);
    const hash2 = computeConfigHash({ ...DEFAULT_SMART_MONEY_CONFIG, threshold: 60 });
    expect(hash1).not.toBe(hash2);
  });
});
