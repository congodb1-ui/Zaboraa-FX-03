import { describe, it, expect } from 'vitest';
import { computeCotFeatures, computeEffectiveAt } from '../smartMoney/cotFeatures';
import { SmartMoneyCotRow } from '../../db/sqlite';
import { COT_LABEL } from '../smartMoney/cotConfig';

describe('COT Features & Point-in-time Rules', () => {
  it('computes effective_at as report_date + 6 days at 00:00 UTC', () => {
    // 2026-10-20 is Tuesday -> +6 days is Monday 2026-10-26 00:00:00Z
    expect(computeEffectiveAt('2026-10-20')).toBe('2026-10-26T00:00:00.000Z');
    // 2026-01-06 is Tuesday -> +6 days is Monday 2026-01-12 00:00:00Z
    expect(computeEffectiveAt('2026-01-06')).toBe('2026-01-12T00:00:00.000Z');
  });

  it('strictly hides COT reports whose effective_at is after T (no lookahead)', () => {
    const rows: SmartMoneyCotRow[] = [
      {
        market: 'GOLD',
        report_date: '2026-10-13',
        open_interest: 500000,
        long: 250000,
        short: 50000,
        net: 200000,
        net_pct_oi: 40.0,
        source: 'CFTC',
        fetched_at: '2026-10-16T20:00:00Z',
        effective_at: '2026-10-19T00:00:00.000Z',
      },
      {
        market: 'GOLD',
        report_date: '2026-10-20',
        open_interest: 500000,
        long: 300000,
        short: 50000,
        net: 250000,
        net_pct_oi: 50.0,
        source: 'CFTC',
        fetched_at: '2026-10-23T20:00:00Z',
        effective_at: '2026-10-26T00:00:00.000Z', // Not effective until Oct 26
      },
    ];

    // As of Oct 22 (before Oct 26 effective_at):
    const res = computeCotFeatures(rows, '2026-10-22T12:00:00.000Z');
    // Must only see the first row
    expect(res.latestReportDate).toBe('2026-10-13');
    expect(res.netPctOi).toBe(40.0);

    // As of Oct 27 (after Oct 26 effective_at):
    const resAfter = computeCotFeatures(rows, '2026-10-27T12:00:00.000Z');
    expect(resAfter.latestReportDate).toBe('2026-10-20');
    expect(resAfter.netPctOi).toBe(50.0);
  });

  it('returns null z156 and cCot=0 when history has fewer than 52 rows', () => {
    const rows: SmartMoneyCotRow[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2025, 0, 7 + i * 7));
      const rep = d.toISOString().split('T')[0];
      rows.push({
        market: 'GOLD',
        report_date: rep,
        open_interest: 500000,
        long: 200000 + i * 1000,
        short: 50000,
        net: 150000 + i * 1000,
        net_pct_oi: (150000 + i * 1000) / 5000,
        source: 'CFTC',
        fetched_at: new Date().toISOString(),
        effective_at: computeEffectiveAt(rep),
      });
    }

    const res = computeCotFeatures(rows, '2026-10-28T00:00:00.000Z');
    expect(res.z156).toBeNull();
    expect(res.cCot).toBe(0);
    expect(res.reason).toContain('Insufficient COT history');
  });

  it('flags stale data when latest report is older than 12 days', () => {
    const rows: SmartMoneyCotRow[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.UTC(2024, 0, 7 + i * 7));
      const rep = d.toISOString().split('T')[0];
      rows.push({
        market: 'GOLD',
        report_date: rep,
        open_interest: 500000,
        long: 200000,
        short: 50000,
        net: 150000,
        net_pct_oi: 30.0,
        source: 'CFTC',
        fetched_at: new Date().toISOString(),
        effective_at: computeEffectiveAt(rep),
      });
    }

    // Evaluating 2 months after last report
    const res = computeCotFeatures(rows, '2026-01-01T00:00:00.000Z');
    expect(res.stale).toBe(true);
    expect(res.cCot).toBe(0);
    expect(res.reason).toContain('stale');
  });

  it('inverts net_pct_oi correctly when inverted flag is true', () => {
    const rows: SmartMoneyCotRow[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date(Date.UTC(2025, 0, 7 + i * 7));
      const rep = d.toISOString().split('T')[0];
      rows.push({
        market: 'TEST',
        report_date: rep,
        open_interest: 100000,
        long: 60000,
        short: 40000,
        net: 20000,
        net_pct_oi: 20.0, // Long > Short (+20%)
        source: 'CFTC',
        fetched_at: new Date().toISOString(),
        effective_at: computeEffectiveAt(rep),
      });
    }

    const lastEffective = rows[rows.length - 1].effective_at;
    const resNormal = computeCotFeatures(rows, lastEffective, 'follow_change', false);
    const resInverted = computeCotFeatures(rows, lastEffective, 'follow_change', true);

    expect(resNormal.netPctOi).toBe(20.0);
    expect(resInverted.netPctOi).toBe(-20.0);
  });
});
