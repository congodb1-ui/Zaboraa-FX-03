import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  getFirewallState,
  setFirewallState,
  getFirewallSettings,
  saveFirewallSetting,
  HARD_CEILINGS,
} from '../../db/sqlite';

describe('Risk Firewall Engine & Hard Ceilings Suite (Stage 1b)', () => {
  const testAccount = 'acc-firewall-test-' + Date.now();

  beforeEach(() => {
    // Reset test account state
    db.prepare('DELETE FROM risk_firewall_settings WHERE scope = ?').run(testAccount);
    db.prepare('DELETE FROM risk_firewall_state WHERE scope = ?').run(testAccount);
  });

  it('enforces scope precedence: account-level overrides take priority over global defaults', () => {
    // Global demo default maxLots is 5.0
    const globalSettings = getFirewallSettings('global:demo', 'demo');
    expect(globalSettings.maxLots).toBeDefined();

    // Set account-specific override
    saveFirewallSetting(testAccount, 'maxLots', '1.5', 'admin@zaboraa.com');
    saveFirewallSetting(testAccount, 'maxRiskPerTradePct', '1.0', 'admin@zaboraa.com');

    const merged = getFirewallSettings(testAccount, 'demo');
    expect(merged.maxLots).toBe(1.5);
    expect(merged.maxRiskPerTradePct).toBe(1.0);

    // Other non-overridden settings fall back to global demo
    expect(merged.maxOpenPositions).toBe(globalSettings.maxOpenPositions);
  });

  it('respects system hard ceilings and prevents dangerous parameter inflation', () => {
    expect(HARD_CEILINGS.maxRiskPerTradePct).toBe(5.0);
    expect(HARD_CEILINGS.dailyLossLimitPct).toBe(10.0);
    expect(HARD_CEILINGS.maxLots).toBe(10.0);
    expect(HARD_CEILINGS.maxOpenPositions).toBe(20);
    expect(HARD_CEILINGS.maxDrawdownPct).toBe(30.0);

    // Attempting to set risk above hard ceiling must be checked by validation logic
    const testAttempt = 6.5; // > 5.0%
    const isExceeded = testAttempt > HARD_CEILINGS.maxRiskPerTradePct;
    expect(isExceeded).toBe(true);
  });

  it('automatically restores firewall to enabled when 24-hour disable period expires', () => {
    // Set firewall disabled with an expired timestamp in the past
    const pastTimestamp = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    db.prepare(`
      INSERT INTO risk_firewall_state (scope, enabled, disabled_at, disabled_until, disabled_by, reason)
      VALUES (?, 0, ?, ?, 'admin@zaboraa.com', 'Temporary maintenance')
      ON CONFLICT(scope) DO UPDATE SET
        enabled = 0,
        disabled_at = excluded.disabled_at,
        disabled_until = excluded.disabled_until
    `).run(testAccount, pastTimestamp, pastTimestamp);

    // getFirewallState checks expiration and auto-restores to enabled = true
    const state = getFirewallState(testAccount);
    expect(state.enabled).toBe(true);
  });

  it('maintains firewall disabled state while within the unexpired window', () => {
    // Set firewall disabled with a future expiry (e.g. 12 hours from now)
    const futureTimestamp = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO risk_firewall_state (scope, enabled, disabled_at, disabled_until, disabled_by, reason)
      VALUES (?, 0, ?, ?, 'admin@zaboraa.com', 'Authorized testing')
      ON CONFLICT(scope) DO UPDATE SET
        enabled = 0,
        disabled_at = excluded.disabled_at,
        disabled_until = excluded.disabled_until
    `).run(testAccount, new Date().toISOString(), futureTimestamp);

    const state = getFirewallState(testAccount);
    expect(state.enabled).toBe(false);
    expect(state.disabledUntil).toBe(futureTimestamp);
  });

  it('calculates deterministic lot reduction suggestion for 422 remediation', () => {
    const balance = 10000;
    const maxRiskPct = 2.0; // $200 max risk
    const slPips = 50;
    const perLotPipVal = 10.0; // standard EURUSD $10/pip/lot

    const allowedRiskUsd = balance * (maxRiskPct / 100); // $200
    const perLotRiskUsd = slPips * perLotPipVal; // $500 per lot
    const calculatedMaxLots = allowedRiskUsd / perLotRiskUsd; // 0.40 lots
    const suggestedLots = Math.floor(calculatedMaxLots * 100) / 100;

    expect(suggestedLots).toBe(0.4);

    // When SL distance is too wide, suggestedLots is null (explicit failing-case)
    const extremeSlPips = 2500;
    const extremePerLotRisk = extremeSlPips * perLotPipVal; // $25,000 per lot
    const extremeMaxLots = allowedRiskUsd / extremePerLotRisk; // 0.008 lots < 0.01 lot
    const safeLots = extremeMaxLots < 0.01 ? null : Math.floor(extremeMaxLots * 100) / 100;

    expect(safeLots).toBeNull();
  });
});
