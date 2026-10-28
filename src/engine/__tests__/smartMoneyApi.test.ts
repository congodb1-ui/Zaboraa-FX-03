import { describe, it, expect } from 'vitest';
import { isSmartMoneySymbol } from '../smartMoney/cotConfig';
import { saveSmartMoneySignal, getSmartMoneySignals, saveSmartMoneyOutcome, getSmartMoneyOutcomes } from '../../db/sqlite';

describe('Smart Money API & Persistence Integrity', () => {
  it('strictly validates supported symbols (only XAUUSD and EURUSD permitted)', () => {
    expect(isSmartMoneySymbol('XAUUSD')).toBe(true);
    expect(isSmartMoneySymbol('EURUSD')).toBe(true);
    expect(isSmartMoneySymbol('GBPUSD')).toBe(false);
    expect(isSmartMoneySymbol('USDJPY')).toBe(false);
    expect(isSmartMoneySymbol('../etc/passwd')).toBe(false);
    expect(isSmartMoneySymbol('.')).toBe(false);
  });

  it('is idempotent: saving the same signal twice never creates duplicates', () => {
    const testBarTime = 1800000000;
    const sigId = `sm-xauusd-${testBarTime}-smart_money_footprint_v1`;

    const sig = {
      id: sigId,
      symbol: 'XAUUSD',
      bar_time: testBarTime,
      direction: 'BUY' as const,
      score: 85.0,
      confidence: 80,
      c_cot: 1.0,
      c_act: 1.0,
      c_trend: 1.0,
      event_type: 'DISPLACEMENT_UP',
      vol_z: 2.5,
      range_atr: 1.8,
      close_loc: 0.85,
      is_crowded: 0,
      is_stale: 0,
      is_baseline_fallback: 0,
      invalidation_price: 2635.0,
      expires_at: testBarTime + 86400,
      config_hash: 'cfg-abc',
      strategy_version: 'smart_money_footprint_v1',
      created_at: new Date().toISOString(),
      disclaimer: 'Research only',
    };

    saveSmartMoneySignal(sig);
    saveSmartMoneySignal(sig);

    const retrieved = getSmartMoneySignals({ symbol: 'XAUUSD', from: testBarTime, to: testBarTime });
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].id).toBe(sigId);
  });

  it('outcomes table is separate and never mutates original signal row', () => {
    const testBarTime = 1800001000;
    const sigId = `sm-eurusd-${testBarTime}-smart_money_footprint_v1`;

    const sig = {
      id: sigId,
      symbol: 'EURUSD',
      bar_time: testBarTime,
      direction: 'BUY' as const,
      score: 75.0,
      confidence: 70,
      c_cot: 0.8,
      c_act: 1.0,
      c_trend: 1.0,
      event_type: 'DISPLACEMENT_UP',
      vol_z: 2.1,
      range_atr: 1.6,
      close_loc: 0.82,
      is_crowded: 0,
      is_stale: 0,
      is_baseline_fallback: 0,
      invalidation_price: 1.0750,
      expires_at: testBarTime + 86400,
      config_hash: 'cfg-abc',
      strategy_version: 'smart_money_footprint_v1',
      created_at: new Date().toISOString(),
      disclaimer: 'Research only',
    };

    saveSmartMoneySignal(sig);

    // Save outcome in separate table
    saveSmartMoneyOutcome({
      id: `out-${sigId}-24h`,
      signal_id: sigId,
      horizon_hours: 24,
      entry_price: 1.0820,
      exit_price: 1.0865,
      return_pips_or_points: 43.5,
      return_atr: 0.45,
      cost_applied: 1.6,
      computed_at: new Date().toISOString(),
    });

    const outcomes = getSmartMoneyOutcomes([sigId]);
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].return_pips_or_points).toBe(43.5);

    // Verify signal row itself remains pristine and unmutated
    const originalSignal = getSmartMoneySignals({ symbol: 'EURUSD', from: testBarTime, to: testBarTime })[0];
    expect(originalSignal.id).toBe(sigId);
    expect(originalSignal.score).toBe(75.0);
  });
});
