import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  db,
  recordFirewallAudit,
  recordBlockedOrder,
} from '../../db/sqlite';

describe('Append-Only SQLite Triggers & Cryptographic Hash Chain Suite (Stage 1b)', () => {
  it('strictly blocks UPDATE operations on risk_firewall_audit (explicit failing-case)', () => {
    const auditId = recordFirewallAudit({
      actor: 'operator@zaboraa.com',
      role: 'Master Admin',
      scope: 'global:demo',
      key: 'maxLots',
      old_value: '5.0',
      new_value: '4.0',
      reason: 'Routine risk review',
    });

    // Attempt to tamper with audit record via SQL UPDATE
    expect(() => {
      db.prepare('UPDATE risk_firewall_audit SET new_value = ? WHERE id = ?').run('10.0', auditId);
    }).toThrow(/append-only: UPDATE forbidden/i);
  });

  it('strictly blocks DELETE operations on risk_firewall_audit (explicit failing-case)', () => {
    const auditId = recordFirewallAudit({
      actor: 'operator@zaboraa.com',
      role: 'Master Admin',
      scope: 'global:demo',
      key: 'maxOpenPositions',
      old_value: '10',
      new_value: '8',
      reason: 'Volatility reduction',
    });

    // Attempt to delete audit record via SQL DELETE
    expect(() => {
      db.prepare('DELETE FROM risk_firewall_audit WHERE id = ?').run(auditId);
    }).toThrow(/append-only: DELETE forbidden/i);
  });

  it('strictly blocks UPDATE operations on blocked_orders_log (explicit failing-case)', () => {
    const logId = recordBlockedOrder({
      userId: 'usr-audit-test',
      accountId: '50192834',
      symbol: 'EURUSD',
      attemptedLots: 8.0,
      attemptedRiskUsd: 800.0,
      ruleViolated: 'maxLots',
      suggestedLots: 5.0,
      errorMessage: 'Order size exceeds max lots',
    });

    // Attempt to tamper with blocked order record
    expect(() => {
      db.prepare('UPDATE blocked_orders_log SET attempted_lots = 1.0 WHERE id = ?').run(logId);
    }).toThrow(/append-only: UPDATE forbidden/i);
  });

  it('strictly blocks DELETE operations on blocked_orders_log (explicit failing-case)', () => {
    const logId = recordBlockedOrder({
      userId: 'usr-audit-test',
      accountId: '50192834',
      symbol: 'GBPUSD',
      attemptedLots: 12.0,
      attemptedRiskUsd: 1200.0,
      ruleViolated: 'maxLots',
      suggestedLots: 5.0,
      errorMessage: 'Order size exceeds ceiling',
    });

    // Attempt to delete blocked order record
    expect(() => {
      db.prepare('DELETE FROM blocked_orders_log WHERE id = ?').run(logId);
    }).toThrow(/append-only: DELETE forbidden/i);
  });

  it('maintains verifiable SHA-256 cryptographic hash chain across sequential audit records', () => {
    const id1 = recordFirewallAudit({
      actor: 'trader1@zaboraa.com',
      role: 'Admin',
      scope: 'acc-chain-test',
      key: 'maxRiskPerTradePct',
      old_value: '2.0',
      new_value: '1.5',
      reason: 'Risk contraction entry 1',
    });

    const row1 = db.prepare('SELECT * FROM risk_firewall_audit WHERE id = ?').get(id1) as any;
    expect(row1).toBeDefined();
    expect(row1.hash).toHaveLength(64);

    const id2 = recordFirewallAudit({
      actor: 'trader2@zaboraa.com',
      role: 'Master Admin',
      scope: 'acc-chain-test',
      key: 'maxRiskPerTradePct',
      old_value: '1.5',
      new_value: '1.0',
      reason: 'Risk contraction entry 2',
    });

    const row2 = db.prepare('SELECT * FROM risk_firewall_audit WHERE id = ?').get(id2) as any;
    expect(row2).toBeDefined();
    expect(row2.hash).toHaveLength(64);

    // Cryptographic hash chain link: row2.prev_hash MUST match row1.hash
    expect(row2.prev_hash).toBe(row1.hash);

    // Recompute and independently verify row2's SHA-256 hash
    const expectedContent = `${row1.hash}|${id2}|${row2.timestamp}|${row2.actor}|${row2.role}|${row2.scope}|${row2.key}|${row2.old_value}|${row2.new_value}|${row2.reason}`;
    const calculatedHash = crypto.createHash('sha256').update(expectedContent).digest('hex');

    expect(row2.hash).toBe(calculatedHash);
  });
});
