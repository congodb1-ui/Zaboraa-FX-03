import { describe, it, expect } from 'vitest';
import { computeTrendContext } from '../smartMoney/trendContext';
import { aggregateH4Buckets } from '../trendPullbackPro';
import { Candle } from '../../types/forex';

describe('Trend Context & UTC-Aligned H4 Aggregation', () => {
  it('aggregates H1 candles into UTC-aligned 4-hour buckets (00, 04, 08, 12, 16, 20 UTC)', () => {
    const candles: Candle[] = [];
    // Start at 2026-10-20 00:00:00 UTC
    const baseTime = 1792454400;

    for (let i = 0; i < 24; i++) {
      candles.push({
        time: baseTime + i * 3600,
        open: 1.0800 + i * 0.0002,
        high: 1.0810 + i * 0.0002,
        low: 1.0790 + i * 0.0002,
        close: 1.0805 + i * 0.0002,
        tickVolume: 100,
        spread: 1.2,
      });
    }

    const h4Bars = aggregateH4Buckets(candles);
    // 24 H1 bars should produce exactly 6 completed H4 bars
    expect(h4Bars.length).toBe(6);

    for (const b of h4Bars) {
      const d = new Date(b.bucketTime * 1000);
      expect(d.getUTCHours() % 4).toBe(0); // 0, 4, 8, 12, 16, 20
    }
  });

  it('computes bullish trend (+1) when fast EMA > slow EMA and sloping upwards', () => {
    const candles: Candle[] = [];
    const baseTime = 1700000000;
    // Generate 300 ascending candles
    for (let i = 0; i < 300; i++) {
      const p = 1.05 + i * 0.0005;
      candles.push({
        time: baseTime + i * 3600,
        open: p,
        high: p + 0.001,
        low: p - 0.0005,
        close: p + 0.0004,
        tickVolume: 500,
        spread: 1.2,
      });
    }

    const res = computeTrendContext(candles, 290, 20, 50);
    expect(res.cTrend).toBe(1.0);
    expect(res.trendDirection).toBe('BULLISH');
  });

  it('computes bearish trend (-1) when fast EMA < slow EMA and sloping downwards', () => {
    const candles: Candle[] = [];
    const baseTime = 1700000000;
    // Generate 300 descending candles
    for (let i = 0; i < 300; i++) {
      const p = 1.20 - i * 0.0005;
      candles.push({
        time: baseTime + i * 3600,
        open: p,
        high: p + 0.0005,
        low: p - 0.001,
        close: p - 0.0004,
        tickVolume: 500,
        spread: 1.2,
      });
    }

    const res = computeTrendContext(candles, 290, 20, 50);
    expect(res.cTrend).toBe(-1.0);
    expect(res.trendDirection).toBe('BEARISH');
  });
});
