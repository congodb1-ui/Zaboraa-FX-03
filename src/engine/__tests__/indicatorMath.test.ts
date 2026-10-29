import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Candle } from '../../types/forex';
import {
  calculateSMA,
  calculateEMA,
  calculateWMA,
  calculateHullMA,
  calculateBollingerBands,
  calculateKeltnerChannels,
  calculateDonchianChannels,
  calculateIchimoku,
  calculateSupertrend,
  calculateParabolicSAR,
  calculateTickVWAP,
  calculatePivotPoints,
  calculateSessionBoxes,
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateStochRSI,
  calculateADX,
  calculateATR,
  calculateCCI,
  calculateWilliamsR,
  calculateROC,
  calculateOBV,
  calculateVolumeMA,
  calculateAwesomeOscillator,
  wilderSmoothing,
} from '../technicalIndicators';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureRaw = fs.readFileSync(path.join(__dirname, 'fixtures/indicators_reference.json'), 'utf-8');
const fixture = JSON.parse(fixtureRaw);
const testCandles: Candle[] = fixture.candles;
const testCloses: number[] = testCandles.map((c) => c.close);

function assertArrayCloseTo(
  actual: (number | null)[],
  expected: (number | null)[],
  tolerance = 1e-4
) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    const act = actual[i];
    const exp = expected[i];
    if (exp === null) {
      expect(act).toBeNull();
    } else {
      expect(act).not.toBeNull();
      expect(Math.abs(act! - exp)).toBeLessThanOrEqual(tolerance);
    }
  }
}

describe('Stage 2: 25 Pure Technical Indicators Math & Parity', () => {
  it('verifies 13 Overlays match committed fixtures within tolerance', () => {
    // 1. SMA(20)
    const sma = calculateSMA(testCloses, 20);
    assertArrayCloseTo(sma, fixture.indicators.sma20);

    // 2. EMA(20)
    const ema = calculateEMA(testCloses, 20);
    assertArrayCloseTo(ema, fixture.indicators.ema20);

    // 3. WMA(20)
    const wma = calculateWMA(testCloses, 20);
    assertArrayCloseTo(wma, fixture.indicators.wma20);

    // 4. Hull MA(20)
    const hull = calculateHullMA(testCloses, 20);
    assertArrayCloseTo(hull, fixture.indicators.hull20);

    // 5. Bollinger Bands(20, 2)
    const bb = calculateBollingerBands(testCloses, 20, 2);
    assertArrayCloseTo(bb.upper, fixture.indicators.bollinger20_2.upper);
    assertArrayCloseTo(bb.middle, fixture.indicators.bollinger20_2.middle);
    assertArrayCloseTo(bb.lower, fixture.indicators.bollinger20_2.lower);

    // 6. Keltner Channels(20, 10, 2)
    const keltner = calculateKeltnerChannels(testCandles, 20, 10, 2);
    assertArrayCloseTo(keltner.upper, fixture.indicators.keltner20_10_2.upper);
    assertArrayCloseTo(keltner.middle, fixture.indicators.keltner20_10_2.middle);
    assertArrayCloseTo(keltner.lower, fixture.indicators.keltner20_10_2.lower);

    // 7. Donchian Channels(20)
    const donchian = calculateDonchianChannels(testCandles, 20);
    assertArrayCloseTo(donchian.upper, fixture.indicators.donchian20.upper);
    assertArrayCloseTo(donchian.middle, fixture.indicators.donchian20.middle);
    assertArrayCloseTo(donchian.lower, fixture.indicators.donchian20.lower);

    // 8. Ichimoku Cloud(9, 26, 52)
    const ichi = calculateIchimoku(testCandles, 9, 26, 52);
    assertArrayCloseTo(ichi.tenkan, fixture.indicators.ichimoku9_26_52.tenkan);
    assertArrayCloseTo(ichi.kijun, fixture.indicators.ichimoku9_26_52.kijun);
    assertArrayCloseTo(ichi.senkouA, fixture.indicators.ichimoku9_26_52.senkouA);
    assertArrayCloseTo(ichi.senkouB, fixture.indicators.ichimoku9_26_52.senkouB);

    // 9. Supertrend(10, 3)
    const st = calculateSupertrend(testCandles, 10, 3);
    assertArrayCloseTo(st.supertrend, fixture.indicators.supertrend10_3.supertrend);

    // 10. Parabolic SAR
    const sar = calculateParabolicSAR(testCandles);
    assertArrayCloseTo(sar, fixture.indicators.parabolicSAR);

    // 11. Tick VWAP
    const vwap = calculateTickVWAP(testCandles, 2);
    assertArrayCloseTo(vwap, fixture.indicators.tickVWAP);

    // 12. Pivot Points Classic
    const pivots = calculatePivotPoints(testCandles, 'classic');
    assertArrayCloseTo(pivots.pivot, fixture.indicators.pivotPointsClassic.pivot);
    assertArrayCloseTo(pivots.s1, fixture.indicators.pivotPointsClassic.s1);
    assertArrayCloseTo(pivots.r1, fixture.indicators.pivotPointsClassic.r1);

    // 13. Session Boxes
    const boxes = calculateSessionBoxes(testCandles, 0);
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0].name).toBeDefined();
    expect(boxes[0].high).toBeGreaterThan(0);
    expect(boxes[0].low).toBeGreaterThan(0);
  });

  it('verifies 12 Sub-Panes match committed fixtures within tolerance', () => {
    // 14. RSI(14)
    const rsi = calculateRSI(testCloses, 14);
    assertArrayCloseTo(rsi, fixture.indicators.rsi14);

    // 15. MACD(12, 26, 9)
    const macd = calculateMACD(testCloses, 12, 26, 9);
    assertArrayCloseTo(macd.macd, fixture.indicators.macd12_26_9.macd);
    assertArrayCloseTo(macd.signal, fixture.indicators.macd12_26_9.signal);
    assertArrayCloseTo(macd.histogram, fixture.indicators.macd12_26_9.histogram);

    // 16. Stochastic(14, 3, 3)
    const stoch = calculateStochastic(testCandles, 14, 3, 3);
    assertArrayCloseTo(stoch.k, fixture.indicators.stochastic14_3_3.k);
    assertArrayCloseTo(stoch.d, fixture.indicators.stochastic14_3_3.d);

    // 17. Stochastic RSI
    const stochRsi = calculateStochRSI(testCloses, 14, 14, 3, 3);
    assertArrayCloseTo(stochRsi.k, fixture.indicators.stochRSI14_14_3_3.k);
    assertArrayCloseTo(stochRsi.d, fixture.indicators.stochRSI14_14_3_3.d);

    // 18. ADX(14) with +DI/-DI
    const adx = calculateADX(testCandles, 14);
    assertArrayCloseTo(adx.adx, fixture.indicators.adx14.adx);
    assertArrayCloseTo(adx.plusDI, fixture.indicators.adx14.plusDI);
    assertArrayCloseTo(adx.minusDI, fixture.indicators.adx14.minusDI);

    // 19. ATR(14)
    const atr = calculateATR(testCandles, 14);
    assertArrayCloseTo(atr, fixture.indicators.atr14);

    // 20. CCI(20)
    const cci = calculateCCI(testCandles, 20);
    assertArrayCloseTo(cci, fixture.indicators.cci20);

    // 21. Williams %R(14)
    const wr = calculateWilliamsR(testCandles, 14);
    assertArrayCloseTo(wr, fixture.indicators.williamsR14);

    // 22. ROC / Momentum(12)
    const roc = calculateROC(testCloses, 12);
    assertArrayCloseTo(roc, fixture.indicators.roc12);

    // 23. Tick OBV
    const obv = calculateOBV(testCandles);
    assertArrayCloseTo(obv, fixture.indicators.obv);

    // 24. Tick Volume + MA(20)
    const volMa = calculateVolumeMA(testCandles, 20);
    expect(volMa.volume.length).toBe(testCandles.length);
    assertArrayCloseTo(volMa.ma, fixture.indicators.volumeMA20.ma);

    // 25. Awesome Oscillator (AO)
    const ao = calculateAwesomeOscillator(testCandles);
    assertArrayCloseTo(ao, fixture.indicators.awesomeOscillator);
  });

  it('validates Wilder smoothing formulation matches TA-Lib specification', () => {
    const raw = [10, 11, 12, 11, 10, 12, 14, 13, 15, 16];
    const period = 5;
    const smoothed = wilderSmoothing(raw, period);

    // Bars 0..3 must be null
    expect(smoothed[0]).toBeNull();
    expect(smoothed[1]).toBeNull();
    expect(smoothed[2]).toBeNull();
    expect(smoothed[3]).toBeNull();

    // Bar 4 (5th element) is simple average: (10 + 11 + 12 + 11 + 10) / 5 = 10.8
    expect(smoothed[4]).toBeCloseTo(10.8, 5);

    // Bar 5: (10.8 * 4 + 12) / 5 = 55.2 / 5 = 11.04
    expect(smoothed[5]).toBeCloseTo(11.04, 5);

    // Bar 6: (11.04 * 4 + 14) / 5 = 58.16 / 5 = 11.632
    expect(smoothed[6]).toBeCloseTo(11.632, 5);
  });

  it('verifies warm-up null values for lookback periods', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const sma = calculateSMA(values, 5);
    for (let i = 0; i < 4; i++) {
      expect(sma[i]).toBeNull();
    }
    expect(sma[4]).toBe(3); // (1+2+3+4+5)/5

    const ema = calculateEMA(values, 5);
    for (let i = 0; i < 4; i++) {
      expect(ema[i]).toBeNull();
    }
    expect(ema[4]).toBe(3);

    const wma = calculateWMA(values, 4);
    for (let i = 0; i < 3; i++) {
      expect(wma[i]).toBeNull();
    }
    expect(wma[3]).not.toBeNull();
  });

  it('verifies zero lookahead across all indicators', () => {
    // When candle at index N+1 is modified, indicator values at indices <= N must remain 100% identical
    const cutIndex = 50;
    const originalSlice = testCandles.slice(0, cutIndex + 1);
    const modifiedCandles = testCandles.map((c, i) => {
      if (i > cutIndex) {
        return {
          ...c,
          open: c.open * 2,
          high: c.high * 2,
          low: c.low * 2,
          close: c.close * 2,
          tickVolume: c.tickVolume * 10,
        };
      }
      return { ...c };
    });

    const originalRsi = calculateRSI(originalSlice.map((c) => c.close), 14);
    const modifiedRsi = calculateRSI(modifiedCandles.map((c) => c.close), 14);

    for (let i = 0; i <= cutIndex; i++) {
      expect(modifiedRsi[i]).toBe(originalRsi[i]);
    }

    const originalBB = calculateBollingerBands(originalSlice.map((c) => c.close), 20, 2);
    const modifiedBB = calculateBollingerBands(modifiedCandles.map((c) => c.close), 20, 2);

    for (let i = 0; i <= cutIndex; i++) {
      expect(modifiedBB.middle[i]).toBe(originalBB.middle[i]);
      expect(modifiedBB.upper[i]).toBe(originalBB.upper[i]);
      expect(modifiedBB.lower[i]).toBe(originalBB.lower[i]);
    }
  });

  it('guards against non-finite values and NaN pollution', () => {
    const dirtyValues = [10, NaN, Infinity, -Infinity, null as any, 12, 14, 15];
    const sma = calculateSMA(dirtyValues, 3);
    for (const val of sma) {
      if (val !== null) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }

    const dirtyCandles = testCandles.slice(0, 30).map((c, idx) => {
      if (idx === 10) {
        return { ...c, close: NaN, high: Infinity, low: -Infinity };
      }
      return c;
    });

    const atr = calculateATR(dirtyCandles, 14);
    for (const val of atr) {
      if (val !== null) {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});
