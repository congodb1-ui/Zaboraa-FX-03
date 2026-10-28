import { describe, it, expect } from 'vitest';
import { detectActivityEvent, calculateWilderAtr14 } from '../smartMoney/activityEvents';
import { Candle } from '../../types/forex';
import { TICK_VOLUME_LABEL } from '../smartMoney/cotConfig';

function createMockCandles(count: number, basePrice = 2000): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1700000000;
  for (let i = 0; i < count; i++) {
    candles.push({
      time: baseTime + i * 3600,
      open: basePrice,
      high: basePrice + 5,
      low: basePrice - 5,
      close: basePrice + 1,
      tickVolume: 500,
      spread: 1.2,
    });
  }
  return candles;
}

describe('Activity Events & Volume Anomalies (H1 Closed Bars)', () => {
  it('calculates Wilder ATR(14) accurately', () => {
    const candles = createMockCandles(30);
    const atr = calculateWilderAtr14(candles, 25, 14);
    expect(atr).toBeGreaterThan(0);
    expect(Number.isFinite(atr)).toBe(true);
  });

  it('detects Displacement Up event (volZ >= 2, range >= 1.5 ATR, closeLoc >= 0.75, close > open)', () => {
    const candles = createMockCandles(40, 2000);
    const atr = calculateWilderAtr14(candles, 35, 14)!;

    // Inject displacement up at index 35
    candles[35] = {
      time: candles[34].time + 3600,
      open: 2000,
      high: 2000 + atr * 2.0,
      low: 1999,
      close: 2000 + atr * 1.9, // close near high (closeLoc > 0.8)
      tickVolume: 2500, // Very high volume (volZ > 2.0)
      spread: 1.2,
    };

    const res = detectActivityEvent(candles, 35);
    expect(res.eventType).toBe('DISPLACEMENT_UP');
    expect(res.cAct).toBe(1.0);
    expect(res.label).toBe(TICK_VOLUME_LABEL);
  });

  it('detects Displacement Down event (volZ >= 2, range >= 1.5 ATR, closeLoc <= 0.25, close < open)', () => {
    const candles = createMockCandles(40, 2000);
    const atr = calculateWilderAtr14(candles, 35, 14)!;

    candles[35] = {
      time: candles[34].time + 3600,
      open: 2000,
      high: 2001,
      low: 2000 - atr * 2.0,
      close: 2000 - atr * 1.9, // close near low (closeLoc < 0.2)
      tickVolume: 2500,
      spread: 1.2,
    };

    const res = detectActivityEvent(candles, 35);
    expect(res.eventType).toBe('DISPLACEMENT_DOWN');
    expect(res.cAct).toBe(-1.0);
  });

  it('detects Absorption event with opposite sign magnitude 0.5', () => {
    const candles = createMockCandles(40, 2000);
    const atr = calculateWilderAtr14(candles, 35, 14)!;

    // Prior 3 bars push strongly upwards (> 1.5 ATR)
    candles[32].close = 2010;
    candles[33].close = 2020;
    candles[34].close = 2030;

    // Bar 35: Absorption (High volume, narrow range <= 0.8 ATR)
    candles[35] = {
      time: candles[34].time + 3600,
      open: 2030,
      high: 2030 + atr * 0.3,
      low: 2030 - atr * 0.3,
      close: 2030.5,
      tickVolume: 3000, // volZ >= 2
      spread: 1.2,
    };

    const res = detectActivityEvent(candles, 35);
    expect(res.eventType).toBe('ABSORPTION');
    // Prior move was UP (+30), so reversal absorption is BEARISH (-0.5)
    expect(res.cAct).toBe(-0.5);
  });

  it('skips bars following weekend or large gaps (>4h) and returns cAct=0', () => {
    const candles = createMockCandles(35, 2000);
    // Introduce weekend gap (e.g. 48 hours)
    candles[34].time = candles[33].time + 48 * 3600;

    const res = detectActivityEvent(candles, 34);
    expect(res.skipped).toBe(true);
    expect(res.cAct).toBe(0);
    expect(res.skipReason).toContain('gap');
  });

  it('falls back to rolling 50-bar baseline when same-hour samples are fewer than 10', () => {
    const candles = createMockCandles(25, 2000);
    const res = detectActivityEvent(candles, 24);
    expect(res.baselineFallback).toBe(true);
  });
});
