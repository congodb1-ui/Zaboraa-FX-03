import { describe, it, expect } from 'vitest';
import { computeTechnicalReport } from '../technicalIndicators';

describe('Technical Indicators Timeframe Engine', () => {
  it('dynamically computes distinct indicator sets across different timeframes', () => {
    const report5M = computeTechnicalReport('XAUUSD', 'M5');
    const report1H = computeTechnicalReport('XAUUSD', 'H1');
    const report1D = computeTechnicalReport('XAUUSD', 'D1');

    // Values should adapt to the timeframe
    expect(report5M.timeframe).toBe('M5');
    expect(report1H.timeframe).toBe('H1');
    expect(report1D.timeframe).toBe('D1');

    // Check indicator count
    expect(report1H.indicators.length).toBe(12);
    expect(report1H.movingAverages.length).toBe(6);
    expect(report1H.pivotPoints.length).toBe(5);

    // Dynamic indicators check: RSI differs across timeframes
    const rsi5M = report5M.indicators.find((i) => i.name === 'RSI(14)')?.value;
    const rsi1H = report1H.indicators.find((i) => i.name === 'RSI(14)')?.value;
    const rsi1D = report1D.indicators.find((i) => i.name === 'RSI(14)')?.value;

    expect(rsi5M).toBeDefined();
    expect(rsi1H).toBeDefined();
    expect(rsi1D).toBeDefined();
    expect(rsi5M).not.toBe(rsi1D);
  });

  it('correctly handles all supported forex and gold symbols', () => {
    const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'];
    for (const sym of symbols) {
      const rep = computeTechnicalReport(sym, 'H1');
      expect(rep.canonicalSymbol).toBe(sym);
      expect(rep.price).toBeGreaterThan(0);
      expect(rep.summaryBuyCount + rep.summarySellCount).toBeGreaterThan(0);
    }
  });
});
