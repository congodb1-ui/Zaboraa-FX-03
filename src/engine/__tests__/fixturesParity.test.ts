import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures/indicators_reference.json');

describe('Stage 2: Indicators Reference Fixture Integrity & Parity', () => {
  it('confirms reference fixture file exists and is valid JSON', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.meta).toBeDefined();
    expect(data.candles).toBeDefined();
    expect(Array.isArray(data.candles)).toBe(true);
    expect(data.candles.length).toBe(120);
    expect(data.indicators).toBeDefined();
  });

  it('confirms all 25 indicator reference vectors are present in the fixture', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const data = JSON.parse(raw);
    const ind = data.indicators;

    // 13 Overlays
    expect(ind.sma20).toBeDefined();
    expect(ind.ema20).toBeDefined();
    expect(ind.wma20).toBeDefined();
    expect(ind.hull20).toBeDefined();
    expect(ind.bollinger20_2).toBeDefined();
    expect(ind.keltner20_10_2).toBeDefined();
    expect(ind.donchian20).toBeDefined();
    expect(ind.ichimoku9_26_52).toBeDefined();
    expect(ind.supertrend10_3).toBeDefined();
    expect(ind.parabolicSAR).toBeDefined();
    expect(ind.tickVWAP).toBeDefined();
    expect(ind.pivotPointsClassic).toBeDefined();
    expect(ind.sessionBoxes).toBeDefined();

    // 12 Sub-Panes
    expect(ind.rsi14).toBeDefined();
    expect(ind.macd12_26_9).toBeDefined();
    expect(ind.stochastic14_3_3).toBeDefined();
    expect(ind.stochRSI14_14_3_3).toBeDefined();
    expect(ind.adx14).toBeDefined();
    expect(ind.atr14).toBeDefined();
    expect(ind.cci20).toBeDefined();
    expect(ind.williamsR14).toBeDefined();
    expect(ind.roc12).toBeDefined();
    expect(ind.obv).toBeDefined();
    expect(ind.volumeMA20).toBeDefined();
    expect(ind.awesomeOscillator).toBeDefined();
  });

  it('validates vector length matches candle length for all array indicators', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const data = JSON.parse(raw);
    const count = data.candles.length;
    const ind = data.indicators;

    expect(ind.sma20.length).toBe(count);
    expect(ind.ema20.length).toBe(count);
    expect(ind.wma20.length).toBe(count);
    expect(ind.hull20.length).toBe(count);
    expect(ind.bollinger20_2.middle.length).toBe(count);
    expect(ind.keltner20_10_2.middle.length).toBe(count);
    expect(ind.donchian20.middle.length).toBe(count);
    expect(ind.ichimoku9_26_52.tenkan.length).toBe(count);
    expect(ind.supertrend10_3.supertrend.length).toBe(count);
    expect(ind.parabolicSAR.length).toBe(count);
    expect(ind.tickVWAP.length).toBe(count);
    expect(ind.pivotPointsClassic.pivot.length).toBe(count);

    expect(ind.rsi14.length).toBe(count);
    expect(ind.macd12_26_9.macd.length).toBe(count);
    expect(ind.stochastic14_3_3.k.length).toBe(count);
    expect(ind.stochRSI14_14_3_3.k.length).toBe(count);
    expect(ind.adx14.adx.length).toBe(count);
    expect(ind.atr14.length).toBe(count);
    expect(ind.cci20.length).toBe(count);
    expect(ind.williamsR14.length).toBe(count);
    expect(ind.roc12.length).toBe(count);
    expect(ind.obv.length).toBe(count);
    expect(ind.volumeMA20.volume.length).toBe(count);
    expect(ind.awesomeOscillator.length).toBe(count);
  });
});
