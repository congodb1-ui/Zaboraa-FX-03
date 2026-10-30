import { describe, it, expect } from 'vitest';
import {
  upsertSmartMoneyCot,
  getSmartMoneyCotRows,
  logExternalFetch,
  getExternalFetchStatus,
  backfillCotPublicReportingApi,
} from '../../db/sqlite';

describe('COT Ingestion & Normalization', () => {
  it('generates normalized CFTC rows with required columns and effective_at', () => {
    backfillCotPublicReportingApi(110);
    const rows = getSmartMoneyCotRows('COMEX Gold');
    expect(rows.length).toBeGreaterThanOrEqual(100);

    const first = rows[0];
    expect(first).toHaveProperty('market');
    expect(first).toHaveProperty('report_date');
    expect(first).toHaveProperty('open_interest');
    expect(first).toHaveProperty('long');
    expect(first).toHaveProperty('short');
    expect(first).toHaveProperty('net');
    expect(first).toHaveProperty('net_pct_oi');
    expect(first.source).toBe('CFTC Public Reporting API');
    expect(first).toHaveProperty('effective_at');
  });

  it('upserts rows idempotently without creating duplicate dates', () => {
    const rows = getSmartMoneyCotRows('COMEX Gold').slice(0, 5);
    const count1 = upsertSmartMoneyCot(rows);
    expect(count1).toBe(5);

    // Re-upserting same rows
    const count2 = upsertSmartMoneyCot(rows);
    expect(count2).toBe(5);

    const stored = getSmartMoneyCotRows(rows[0].market);
    const dates = stored.map((r) => r.report_date);
    const uniqueDates = new Set(dates);
    expect(dates.length).toBe(uniqueDates.size);
  });

  it('rejects synthetic baselines with source CFTC Disaggregated or CFTC TFF', () => {
    const fakeRows = [
      {
        market: 'COMEX Gold',
        report_date: '2020-01-07',
        open_interest: 500000,
        long: 200000,
        short: 50000,
        net: 150000,
        net_pct_oi: 30,
        source: 'CFTC Disaggregated',
        fetched_at: new Date().toISOString(),
        effective_at: '2020-01-13T00:00:00.000Z',
      },
      {
        market: 'COMEX Gold',
        report_date: '2020-01-14',
        open_interest: 500000,
        long: 200000,
        short: 50000,
        net: 150000,
        net_pct_oi: 30,
        source: 'CFTC TFF',
        fetched_at: new Date().toISOString(),
        effective_at: '2020-01-20T00:00:00.000Z',
      },
    ];

    const inserted = upsertSmartMoneyCot(fakeRows);
    expect(inserted).toBe(0);
  });

  it('logs external fetch errors into external_fetch_log', () => {
    const testId = `fetch-test-${Date.now()}`;
    logExternalFetch({
      id: testId,
      source: 'TEST_CFTC',
      started_at: new Date().toISOString(),
      ok: false,
      rows_ingested: 0,
      error: 'Simulated 503 Service Unavailable',
    });

    const status = getExternalFetchStatus('TEST_CFTC');
    expect(status).toBeDefined();
    expect(status.ok).toBe(0);
    expect(status.error).toContain('Simulated 503');
  });
});
