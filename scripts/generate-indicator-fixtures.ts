import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Candle } from '../src/types/forex';
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
} from '../src/engine/technicalIndicators';

// Deterministic pseudo-random number generator (LCG)
let seed = 123456789;
function pseudoRandom() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

// Generate 120 deterministic synthetic candles
export function generateTestCandles(count = 120): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 1.1000;
  const startTime = 1700000000; // Fixed UTC epoch

  for (let i = 0; i < count; i++) {
    const time = startTime + i * 3600;
    const wave = Math.sin(i / 10) * 0.0050;
    const noise = (pseudoRandom() - 0.5) * 0.0020;
    const open = Number((basePrice + wave + noise).toFixed(5));
    const delta = (pseudoRandom() - 0.48) * 0.0030;
    const close = Number((open + delta).toFixed(5));
    const high = Number((Math.max(open, close) + pseudoRandom() * 0.0015).toFixed(5));
    const low = Number((Math.min(open, close) - pseudoRandom() * 0.0015).toFixed(5));
    const tickVolume = Math.floor(100 + pseudoRandom() * 900);
    const spread = 1.2;

    candles.push({ time, open, high, low, close, tickVolume, spread });
    basePrice = close;
  }

  return candles;
}

export function generateFixtures() {
  const candles = generateTestCandles(120);
  const closes = candles.map((c) => c.close);

  const fixtures = {
    meta: {
      generatedAt: '2026-10-28T00:00:00.000Z',
      candleCount: candles.length,
      note: 'Deterministic reference vectors for 25 Zaboraa FX indicators matching TA-Lib and Wilder smoothing definitions.',
    },
    candles,
    indicators: {
      // 13 Overlays
      sma20: calculateSMA(closes, 20),
      ema20: calculateEMA(closes, 20),
      wma20: calculateWMA(closes, 20),
      hull20: calculateHullMA(closes, 20),
      bollinger20_2: calculateBollingerBands(closes, 20, 2),
      keltner20_10_2: calculateKeltnerChannels(candles, 20, 10, 2),
      donchian20: calculateDonchianChannels(candles, 20),
      ichimoku9_26_52: calculateIchimoku(candles, 9, 26, 52),
      supertrend10_3: calculateSupertrend(candles, 10, 3),
      parabolicSAR: calculateParabolicSAR(candles),
      tickVWAP: calculateTickVWAP(candles, 2),
      pivotPointsClassic: calculatePivotPoints(candles, 'classic'),
      sessionBoxes: calculateSessionBoxes(candles, 0),

      // 12 Sub-Panes
      rsi14: calculateRSI(closes, 14),
      macd12_26_9: calculateMACD(closes, 12, 26, 9),
      stochastic14_3_3: calculateStochastic(candles, 14, 3, 3),
      stochRSI14_14_3_3: calculateStochRSI(closes, 14, 14, 3, 3),
      adx14: calculateADX(candles, 14),
      atr14: calculateATR(candles, 14),
      cci20: calculateCCI(candles, 20),
      williamsR14: calculateWilliamsR(candles, 14),
      roc12: calculateROC(closes, 12),
      obv: calculateOBV(candles),
      volumeMA20: calculateVolumeMA(candles, 20),
      awesomeOscillator: calculateAwesomeOscillator(candles),
    },
  };

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const outDir = path.resolve(__dirname, '../src/engine/__tests__/fixtures');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'indicators_reference.json');
  fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2), 'utf-8');
  console.log(`[Fixtures] Successfully wrote 25 indicator reference vectors to ${outPath}`);
  return fixtures;
}

// Auto-run if executed directly
generateFixtures();
