import { describe, it, expect } from 'vitest';
import { runSmartMoneyEventStudy } from '../smartMoney/eventStudy';
import { Candle } from '../../types/forex';
import { SmartMoneyCotRow } from '../../db/sqlite';
import { computeEffectiveAt } from '../smartMoney/cotFeatures';

function createContiguousCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1700000000;
  for (let i = 0; i < count; i++) {
    candles.push({
      time: baseTime + i * 3600,
      open: 2600.0 + (i % 20) * 0.5,
      high: 2605.0 + (i % 20) * 0.5,
      low: 2595.0 + (i % 20) * 0.5,
      close: 2602.0 + (i % 20) * 0.5,
      tickVolume: 500 + (i % 5) * 50,
      spread: 25.0,
    });
  }
  return candles;
}

function generateTestCotRows(): SmartMoneyCotRow[] {
  const rows: SmartMoneyCotRow[] = [];
  const baseDate = new Date('2024-01-02T00:00:00Z');
  for (let i = 0; i < 120; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(baseDate.getUTCDate() + i * 7);
    const dateStr = d.toISOString().split('T')[0];
    rows.push({
      market: 'COMEX Gold',
      report_date: dateStr,
      open_interest: 480000 + (i % 10) * 2000,
      long: 210000 + (i % 10) * 1500,
      short: 50000 - (i % 10) * 500,
      net: 160000 + (i % 10) * 2000,
      net_pct_oi: 33.3,
      source: 'CFTC Public Reporting API',
      fetched_at: new Date().toISOString(),
      effective_at: computeEffectiveAt(dateStr),
    });
  }
  return rows;
}

describe('Smart Money Event Study Engine', () => {
  const cotRows = generateTestCotRows();
  const mockCandles = createContiguousCandles(350);

  it('generates identical results with fixed seed (determinism)', () => {
    const report1 = runSmartMoneyEventStudy('XAUUSD', mockCandles, cotRows, { seed: 20261028 });
    const report2 = runSmartMoneyEventStudy('XAUUSD', mockCandles, cotRows, { seed: 20261028 });

    expect(report1.horizons.length).toBe(3);
    expect(report1.horizons[0].baselineMeanPips).toBe(report2.horizons[0].baselineMeanPips);
    expect(report1.horizons[1].baselineMeanPips).toBe(report2.horizons[1].baselineMeanPips);
  });

  it('applies spread and transaction costs', () => {
    const report = runSmartMoneyEventStudy('XAUUSD', mockCandles, cotRows, {
      spreadPips: 25.0,
      slippagePips: 0.2,
      seed: 20261028,
    });

    expect(report.horizons[0].baselineMeanPips).toBeLessThanOrEqual(0); // Random baseline with cost has negative expectation
  });

  it('marks INSUFFICIENT SAMPLE when events count is below 30', () => {
    // With small candle slice, generated events will be < 30
    const report = runSmartMoneyEventStudy('XAUUSD', mockCandles.slice(0, 100), cotRows, { seed: 20261028 });

    for (const h of report.horizons) {
      if (h.n < 30) {
        expect(h.label).toBe('INSUFFICIENT SAMPLE');
      }
    }
  });

  it('runs on non-held-out 80% partition when confirmHeldOut is false', () => {
    const report = runSmartMoneyEventStudy('XAUUSD', mockCandles, cotRows, { confirmHeldOut: false });
    expect(report.isHeldOut).toBe(false);
    expect(report.evaluatedBars).toBe(Math.floor(mockCandles.length * 0.8));
  });

  it('runs on final 20% held-out partition when confirmHeldOut is true', () => {
    const report = runSmartMoneyEventStudy('XAUUSD', mockCandles, cotRows, { confirmHeldOut: true });
    expect(report.isHeldOut).toBe(true);
    expect(report.evaluatedBars).toBe(mockCandles.length - Math.floor(mockCandles.length * 0.8));
  });
});
