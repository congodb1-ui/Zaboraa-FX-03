import { describe, it, expect } from 'vitest';
import { runSmartMoneyEventStudy } from '../smartMoney/eventStudy';
import { generateHistoricalCotBaseline } from '../smartMoney/cotIngest';
import { Candle } from '../../types/forex';

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

describe('Smart Money Event Study Engine', () => {
  const cotRows = generateHistoricalCotBaseline();
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
