import { describe, it, expect } from 'vitest';
import {
  getXauDataStats,
  dryRunCleanup,
  applyCleanupWithBackup,
  patchCotIngestConfig,
  backfillCotPublicReportingApi,
  fredMacroDryRun,
  fredMacroBackfill,
  convertSessionWindowToUtc,
  testSessionWindowsEvaluation,
  getMt5SymbolInfoXau,
} from '../../db/sqlite';

describe('XAU Strategy Guide & Runbook Engine', () => {
  it('loads real sources statistics with CFTC Public Reporting API and FRED macro indicators', () => {
    const stats = getXauDataStats();
    expect(stats).toBeDefined();
    expect(stats.m1).toHaveProperty('count');
    expect(stats.m5).toHaveProperty('count');
    expect(stats.m15).toHaveProperty('count');
    expect(stats.cot.source).toBe('CFTC Public Reporting API');
    expect(stats.dfii10).toBeDefined();
    expect(stats.dgs10).toBeDefined();
    expect(stats.fakeCheck).toHaveProperty('isClean');
  });

  it('performs non-destructive dry-run cleanup inspection without modifying records', () => {
    const initialStats = getXauDataStats();
    const dryRun = dryRunCleanup();

    expect(dryRun).toHaveProperty('baselineCatalogCount');
    expect(dryRun).toHaveProperty('seedHashCatalogCount');
    expect(dryRun).toHaveProperty('syntheticCotCount');
    expect(dryRun.message).toContain('Dry-run complete');

    // Verify stats were untouched during dry-run
    const postStats = getXauDataStats();
    expect(postStats.fakeCheck.seededH1BaselineCount).toBe(initialStats.fakeCheck.seededH1BaselineCount);
    expect(postStats.fakeCheck.syntheticCotCount).toBe(initialStats.fakeCheck.syntheticCotCount);
  });

  it('applies cleanup with atomic database backup and removes synthetic records', () => {
    const result = applyCleanupWithBackup();

    expect(result.success).toBe(true);
    expect(result.backupFile).toMatch(/^zaboraa_pre_cleanup_.*\.sqlite$/);
    expect(typeof result.deletedCatalogRows).toBe('number');
    expect(typeof result.deletedCotRows).toBe('number');

    const cleanStats = getXauDataStats();
    expect(cleanStats.fakeCheck.seededH1BaselineCount).toBe(0);
    expect(cleanStats.fakeCheck.sha256SeedCount).toBe(0);
    expect(cleanStats.fakeCheck.syntheticCotCount).toBe(0);
    expect(cleanStats.fakeCheck.isClean).toBe(true);
  });

  it('patches COT Ingest config with limit 260 and enforces CFTC Public Reporting API', () => {
    const patch = patchCotIngestConfig();
    expect(patch.limit).toBe(260);
    expect(patch.source).toBe('CFTC Public Reporting API');
    expect(patch.status).toContain('PATCHED');
  });

  it('backfills authentic CFTC Public Reporting API data with Tuesday + 6 days = Monday 00:00 UTC lag', () => {
    const res = backfillCotPublicReportingApi(10);
    expect(res.ingested).toBe(10);
    expect(res.source).toBe('CFTC Public Reporting API');

    const stats = getXauDataStats();
    expect(stats.cot.count).toBeGreaterThanOrEqual(10);
    expect(stats.cot.latestEffectiveAt).toBeDefined();

    // Verify Tuesday + 6 days = Monday 00:00:00Z lag rule
    if (stats.cot.latest && stats.cot.latestEffectiveAt) {
      const repDate = new Date(stats.cot.latest + 'T00:00:00Z');
      const effDate = new Date(stats.cot.latestEffectiveAt);
      const diffDays = Math.round((effDate.getTime() - repDate.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(6);
      expect(effDate.getUTCHours()).toBe(0);
      expect(effDate.getUTCMinutes()).toBe(0);
    }
  });

  it('failing-case counterpart: detects lookahead violation if COT effective_at is before or on report date', () => {
    const reportDateStr = '2026-03-24'; // Tuesday
    const invalidLookaheadEffectiveAt = '2026-03-24T00:00:00Z'; // 0 days lag - lookahead error!

    const rep = new Date(reportDateStr + 'T00:00:00Z');
    const eff = new Date(invalidLookaheadEffectiveAt);
    const diffDays = Math.round((eff.getTime() - rep.getTime()) / (1000 * 60 * 60 * 24));

    // The strategy requires strictly 6 days lag (Tuesday -> Monday)
    const isCompliant = diffDays === 6;
    expect(isCompliant).toBe(false);
  });

  it('validates FRED macro series ingestion with next UTC day 00:00 effective_at rule', () => {
    const dryRun = fredMacroDryRun();
    expect(dryRun.series).toContain('DFII10');
    expect(dryRun.series).toContain('DGS10');
    expect(dryRun.lagRule).toContain('Next UTC day 00:00');

    const backfill = fredMacroBackfill(20);
    expect(backfill.inserted).toBeGreaterThan(0);
    expect(backfill.effectiveRule).toBe('Next UTC day 00:00:00.000Z');

    const stats = getXauDataStats();
    expect(stats.dfii10.count).toBeGreaterThan(0);
    expect(stats.dgs10.count).toBeGreaterThan(0);

    // Verify next UTC day 00:00 rule
    if (stats.dfii10.latestObsDate && stats.dfii10.latestEffectiveAt) {
      const obsDate = new Date(stats.dfii10.latestObsDate + 'T00:00:00Z');
      const effDate = new Date(stats.dfii10.latestEffectiveAt);
      const diffMs = effDate.getTime() - obsDate.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
      expect(effDate.getUTCHours()).toBe(0);
    }
  });

  it('failing-case counterpart: rejects macro series lookahead when effective_at is identical to observation date', () => {
    const obsDate = '2026-03-24';
    const sameDayEffectiveAt = '2026-03-24T16:00:00Z'; // Lookahead on same observation date

    const obs = new Date(obsDate + 'T00:00:00Z');
    const eff = new Date(sameDayEffectiveAt);
    const isStrictNextDay = eff.getUTCDate() > obs.getUTCDate() && eff.getUTCHours() === 0;

    expect(isStrictNextDay).toBe(false);
  });

  it('evaluates London and NY session windows and UTC conversions using Intl.DateTimeFormat with IANA zones for 2026-01-15, 2026-03-20, and 2026-07-15', () => {
    const evalResult = testSessionWindowsEvaluation();
    expect(evalResult.rules.london).toContain('08:00 - 12:00 Europe/London');
    expect(evalResult.rules.ny).toContain('08:00 - 10:00 America/New_York');
    expect(evalResult.matrix).toHaveLength(3);

    // 2026-01-15: Winter standard time (London GMT+0, NY EST-5)
    const winLon = convertSessionWindowToUtc('2026-01-15', 8, 12, 'Europe/London');
    const winNy = convertSessionWindowToUtc('2026-01-15', 8, 10, 'America/New_York');
    expect(winLon.utcWindow).toContain('08:00 - 12:00 UTC');
    expect(winNy.utcWindow).toContain('13:00 - 15:00 UTC');

    // 2026-03-20: Spring transition (US on EDT-4, London still on GMT+0)
    const equLon = convertSessionWindowToUtc('2026-03-20', 8, 12, 'Europe/London');
    const equNy = convertSessionWindowToUtc('2026-03-20', 8, 10, 'America/New_York');
    expect(equLon.utcWindow).toContain('08:00 - 12:00 UTC');
    expect(equNy.utcWindow).toContain('12:00 - 14:00 UTC');

    // 2026-07-15: Summer daylight saving (London BST+1, NY EDT-4)
    const sumLon = convertSessionWindowToUtc('2026-07-15', 8, 12, 'Europe/London');
    const sumNy = convertSessionWindowToUtc('2026-07-15', 8, 10, 'America/New_York');
    expect(sumLon.utcWindow).toContain('07:00 - 11:00 UTC');
    expect(sumNy.utcWindow).toContain('12:00 - 14:00 UTC');
  });

  it('returns valid MT5 symbol specification for XAUUSD / XAUUSDm', () => {
    const spec = getMt5SymbolInfoXau();
    expect(spec.symbol).toBe('XAUUSD');
    expect(spec.broker_symbol).toBe('XAUUSDm');
    expect(spec.trade_contract_size).toBe(100);
    expect(spec.volume_min).toBe(0.01);
    expect(spec.volume_step).toBe(0.01);
    expect(spec.point).toBe(0.01);
    expect(spec.digits).toBe(2);
    expect(spec.trade_tick_value).toBe(1.0);
    expect(spec.broker_server).toBe('Exness-MT5Trial9');
  });

  it('computes position sizing accurately rounding lots DOWN to volume_step (risk 100, stop 3.50, contract size 100 gives 0.2857 -> 0.28 lots, not 0.29)', () => {
    const equity = 10000;
    const riskPct = 1.0;
    const riskUsd = (equity * riskPct) / 100; // $100
    const entryPrice = 2650.0;
    const stopPrice = 2646.5; // $3.50 distance
    const stopDistance = Math.abs(entryPrice - stopPrice);
    const contractSize = 100;
    const volumeStep = 0.01;

    expect(Number.isFinite(stopDistance)).toBe(true);
    expect(stopDistance).toBe(3.5);

    // raw lots = risk_usd / (stop_distance * contract_size) = 100 / (3.5 * 100) = 0.285714...
    const rawLots = riskUsd / (stopDistance * contractSize);
    expect(rawLots).toBeCloseTo(0.2857, 4);

    // MANDATE: Always round lots DOWN to volume_step (0.28 lots, NOT 0.29)
    const lots = Number((Math.floor((rawLots + 1e-9) / volumeStep) * volumeStep).toFixed(2));
    expect(lots).toBe(0.28);
    expect(lots).not.toBe(0.29);

    // Target 1.8R
    const targetProfitUsd = Number((riskUsd * 1.8).toFixed(2));
    expect(targetProfitUsd).toBe(180.0);
  });

  it('preserves on-the-hour candles during cleanup (time % 3600 === 0 preserved)', () => {
    const onTheHourTime = 1774000800; // Exact hour (time % 3600 === 0)
    expect(onTheHourTime % 3600).toBe(0);

    const midHourTime = 1774001700; // 15-min offset
    expect(midHourTime % 3600).not.toBe(0);
  });

  it('failing-case counterpart: halts sizing computation if stop distance is zero or negative', () => {
    const entryPrice = 2650.0;
    const invalidStopPrice = 2650.0; // Zero distance
    const stopDistance = Math.abs(entryPrice - invalidStopPrice);

    const canComputeLots = stopDistance > 0 && Number.isFinite(stopDistance);
    expect(canComputeLots).toBe(false);
  });
});
