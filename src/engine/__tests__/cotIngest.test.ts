import { describe, it, expect, beforeEach } from 'vitest';
import { generateHistoricalCotBaseline } from '../smartMoney/cotIngest';
import { upsertSmartMoneyCot, getSmartMoneyCotRows, logExternalFetch, getExternalFetchStatus } from '../../db/sqlite';
import { COT_MARKETS } from '../smartMoney/cotConfig';

describe('COT Ingestion & Normalization', () => {
  it('generates normalized CFTC rows with required columns and effective_at', () => {
    const baseline = generateHistoricalCotBaseline();
    expect(baseline.length).toBeGreaterThan(100);

    const first = baseline[0];
    expect(first).toHaveProperty('market');
    expect(first).toHaveProperty('report_date');
    expect(first).toHaveProperty('open_interest');
    expect(first).toHaveProperty('long');
    expect(first).toHaveProperty('short');
    expect(first).toHaveProperty('net');
    expect(first).toHaveProperty('net_pct_oi');
    expect(first).toHaveProperty('source');
    expect(first).toHaveProperty('effective_at');
  });

  it('upserts rows idempotently without creating duplicate dates', () => {
    const baseline = generateHistoricalCotBaseline().slice(0, 5);
    const count1 = upsertSmartMoneyCot(baseline);
    expect(count1).toBe(5);

    // Re-upserting same rows
    const count2 = upsertSmartMoneyCot(baseline);
    expect(count2).toBe(5);

    const stored = getSmartMoneyCotRows(baseline[0].market);
    const dates = stored.map((r) => r.report_date);
    const uniqueDates = new Set(dates);
    expect(dates.length).toBe(uniqueDates.size);
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
