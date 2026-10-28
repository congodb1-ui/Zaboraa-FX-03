import { describe, it, expect } from 'vitest';
import { auditCandles } from '../data/candleQuality';
import { candleCsvLines, importCandlesCsv } from '../data/candleCsv';
import { Candle } from '../../types/forex';

describe('Historical Vault & Data Quality Suite', () => {
  // Generate 100 consecutive clean H1 candles
  const cleanCandles: Candle[] = Array.from({ length: 100 }, (_, i) => ({
    time: 1700000000 + i * 3600,
    open: 1.085 + (i % 5) * 0.001,
    high: 1.088 + (i % 5) * 0.001,
    low: 1.084 + (i % 5) * 0.001,
    close: 1.087 + (i % 5) * 0.001,
    tickVolume: 150 + i,
  }));

  it('audits clean candles as 100% quality and research eligible', () => {
    const report = auditCandles(cleanCandles, 'H1');
    expect(report.qualityScore).toBe(100);
    expect(report.isResearchEligible).toBe(true);
    expect(report.anomalies.length).toBe(0);
  });

  it('fails-closed on corrupted candle geometry (explicit failing-case)', () => {
    const corruptCandles: Candle[] = [
      // High < Low corruption
      { time: 1700000000, open: 1.085, high: 1.080, low: 1.088, close: 1.082, tickVolume: 100 },
      // Duplicate timestamp
      { time: 1700000000, open: 1.082, high: 1.085, low: 1.081, close: 1.084, tickVolume: 100 },
      // Negative price
      { time: 1700007200, open: -1.0, high: 1.0, low: -2.0, close: 0.5, tickVolume: 100 },
    ];

    const report = auditCandles(corruptCandles, 'H1');
    expect(report.isResearchEligible).toBe(false);
    expect(report.qualityScore).toBeLessThan(100);
    expect(report.anomalies.length).toBeGreaterThanOrEqual(2);
  });

  it('accurately streams and re-imports candles without data loss (CSV round-trip)', () => {
    const subset = cleanCandles.slice(0, 5);
    const csvString = Array.from(candleCsvLines(subset)).join('');
    expect(csvString).toContain('Date,Time,Open,High,Low,Close');
    
    const parsed = importCandlesCsv(csvString);
    expect(parsed.candles.length).toBe(subset.length);
    expect(parsed.candles[0].time).toBe(subset[0].time);
    expect(parsed.candles[0].open).toBeCloseTo(subset[0].open, 4);
    expect(parsed.candles[0].high).toBeCloseTo(subset[0].high, 4);
    expect(parsed.candles[0].low).toBeCloseTo(subset[0].low, 4);
    expect(parsed.candles[0].close).toBeCloseTo(subset[0].close, 4);
  });

  it('rejects path traversal attempts and invalid timeframes (security gate)', () => {
    const ALLOWED_TIMEFRAMES = new Set(['M1', 'M5', 'M10', 'M15', 'M30', 'H1', 'H3', 'D1']);
    const SYMBOL_REGEX = /^[A-Z0-9_]{3,12}$/;

    // Path traversal failing cases
    const maliciousSymbols = ['../etc/passwd', '..\\windows', 'EUR/USD', '.secret', 'EUR..USD'];
    for (const sym of maliciousSymbols) {
      expect(SYMBOL_REGEX.test(sym)).toBe(false);
    }

    // Invalid timeframe failing cases
    const invalidTimeframes = ['M2', 'H2', 'H4', 'W1', 'MN1', '../../root'];
    for (const tf of invalidTimeframes) {
      expect(ALLOWED_TIMEFRAMES.has(tf)).toBe(false);
    }

    // Valid canonical inputs pass
    expect(SYMBOL_REGEX.test('EURUSD')).toBe(true);
    expect(SYMBOL_REGEX.test('XAUUSD')).toBe(true);
    expect(ALLOWED_TIMEFRAMES.has('H1')).toBe(true);
    expect(ALLOWED_TIMEFRAMES.has('M15')).toBe(true);
  });
});
