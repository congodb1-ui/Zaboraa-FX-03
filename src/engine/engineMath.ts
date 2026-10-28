import { ForexSymbol, OverfittingReport } from '../types/forex';

/**
 * Calculates Pip Value in USD for given symbol, lot size, and current market price.
 */
export function calculatePipValue(symbol: ForexSymbol, lots: number, currentPrice: number = 1.0): number {
  if (lots <= 0) return 0;

  switch (symbol) {
    case 'EURUSD':
    case 'GBPUSD':
      // 1 pip = 0.0001; Contract = 100,000 units of base currency; Quote currency is USD.
      // 1 lot * 0.0001 = $10.00 per pip
      return lots * 10.0;

    case 'USDJPY':
      // 1 pip = 0.01; Contract = 100,000 USD; Quote currency is JPY.
      // 1 pip in JPY = 100,000 * 0.01 = 1,000 JPY
      // Converted to USD = 1,000 / currentPrice
      // e.g. at 150.000 -> 1,000 / 150.0 = $6.6667 per pip (for 10 pips: $66.67)
      const safePrice = currentPrice > 0 ? currentPrice : 150.0;
      return (lots * 1000.0) / safePrice;

    case 'XAUUSD':
      // Gold: 1 lot = 100 oz. 1 pip (100 points / $1.00 move per oz) = 100 * $1.00 = $100.00.
      // In Forex standard conventions, 1 pip in Gold is usually $0.10 (0.10 * 100 = $10)
      // or $1.00 move = 100 points ($100).
      // Known-answer requirement explicitly defines: 1.0 lot, $1.00 move (100 pt) = Exactly $100.00.
      return lots * 100.0;

    default:
      return lots * 10.0;
  }
}

/**
 * Calculates profit/loss in USD for an executed trade.
 */
export function calculatePnl(
  symbol: ForexSymbol,
  side: 'BUY' | 'SELL',
  openPrice: number,
  closePrice: number,
  lots: number
): number {
  if (lots <= 0) return 0;

  if (symbol === 'EURUSD' || symbol === 'GBPUSD') {
    const diff = side === 'BUY' ? closePrice - openPrice : openPrice - closePrice;
    const pips = diff / 0.0001;
    return Number((pips * calculatePipValue(symbol, lots)).toFixed(2));
  } else if (symbol === 'USDJPY') {
    const diff = side === 'BUY' ? closePrice - openPrice : openPrice - closePrice;
    const pips = diff / 0.01;
    return Number((pips * calculatePipValue(symbol, lots, closePrice)).toFixed(2));
  } else if (symbol === 'XAUUSD') {
    const diff = side === 'BUY' ? closePrice - openPrice : openPrice - closePrice;
    // 100 oz * dollar difference
    return Number((diff * 100 * lots).toFixed(2));
  }
  return 0;
}

/**
 * Calculates total friction costs for a trade: spread, commission, and swap rollover.
 */
export function calculateFrictionCosts(
  symbol: ForexSymbol,
  lots: number,
  spreadPips: number,
  daysHeld: number,
  crossedWednesday: boolean = false
): { spreadCost: number; commission: number; swapCost: number; totalFriction: number } {
  // Spread cost: spread in pips * pip value
  const spreadCost = Number((spreadPips * calculatePipValue(symbol, lots)).toFixed(2));

  // Commission: Standard Exness Raw/Zero spread commission ($7.00 per standard lot round-turn)
  const commission = Number((lots * 7.0).toFixed(2));

  // Swap calculation: base daily swap rate per lot
  // EURUSD benchmark long swap is -3.20 $/lot per night
  let baseDailySwapPerLot = -3.2;
  if (symbol === 'XAUUSD') baseDailySwapPerLot = -8.5;
  if (symbol === 'USDJPY') baseDailySwapPerLot = 4.2; // positive carry

  // Wednesday triple-swap rule: overnight Wednesday counts 3 days
  const effectiveDays = daysHeld + (crossedWednesday ? 2 : 0);
  const swapCost = Number((effectiveDays * lots * baseDailySwapPerLot).toFixed(2));

  const totalFriction = Number((spreadCost + commission + Math.abs(swapCost < 0 ? swapCost : 0)).toFixed(2));

  return {
    spreadCost,
    commission,
    swapCost,
    totalFriction,
  };
}

/**
 * Intrabar Worst-Case SL/TP conflict resolution.
 * If in the same bar both TP and SL price levels are touched, conservative execution assumes SL executed first!
 */
export function evaluateIntrabarExit(
  side: 'BUY' | 'SELL',
  barHigh: number,
  barLow: number,
  sl: number,
  tp?: number
): { triggered: boolean; exitType: 'SL' | 'TP'; exitPrice: number; conflictDetected: boolean } | null {
  if (side === 'BUY') {
    const hitSl = barLow <= sl;
    const hitTp = tp !== undefined && tp > 0 && barHigh >= tp;

    if (hitSl && hitTp) {
      // Intrabar conflict: Worst-case rule triggers SL!
      return { triggered: true, exitType: 'SL', exitPrice: sl, conflictDetected: true };
    }
    if (hitSl) {
      return { triggered: true, exitType: 'SL', exitPrice: sl, conflictDetected: false };
    }
    if (hitTp && tp) {
      return { triggered: true, exitType: 'TP', exitPrice: tp, conflictDetected: false };
    }
  } else {
    // SELL trade
    const hitSl = barHigh >= sl;
    const hitTp = tp !== undefined && tp > 0 && barLow <= tp;

    if (hitSl && hitTp) {
      // Intrabar conflict: Worst-case rule triggers SL!
      return { triggered: true, exitType: 'SL', exitPrice: sl, conflictDetected: true };
    }
    if (hitSl) {
      return { triggered: true, exitType: 'SL', exitPrice: sl, conflictDetected: false };
    }
    if (hitTp && tp) {
      return { triggered: true, exitType: 'TP', exitPrice: tp, conflictDetected: false };
    }
  }

  return null;
}

/**
 * Calculates Max Drawdown ($ and %) on any equity series.
 */
export function calculateDrawdown(equityCurve: number[]): {
  maxDrawdown: number;
  maxDrawdownPct: number;
  peak: number;
  trough: number;
} {
  if (equityCurve.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPct: 0, peak: 0, trough: 0 };
  }

  let peak = equityCurve[0];
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let peakAtMaxDd = peak;
  let troughAtMaxDd = peak;

  for (const eq of equityCurve) {
    if (eq > peak) {
      peak = eq;
    }
    const dd = peak - eq;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;

    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = ddPct;
      peakAtMaxDd = peak;
      troughAtMaxDd = eq;
    }
  }

  return {
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
    peak: peakAtMaxDd,
    trough: troughAtMaxDd,
  };
}

/**
 * Seeded Mulberry32 PRNG for deterministic Monte Carlo simulation.
 */
export function createMulberry32(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reshuffling (without replacement) & Bootstrapping (with replacement) Monte Carlo engine.
 */
export function runMonteCarloAnalysis(
  pnlSeries: number[],
  initialBalance: number = 10000,
  seed: number = 42,
  iterations: number = 1000
): {
  reshuffledWorstDrawdown: number;
  bootstrapDrawdown95CI: [number, number];
  bootstrapSharpe95CI: [number, number];
  simulationsCount: number;
} {
  if (pnlSeries.length === 0) {
    return {
      reshuffledWorstDrawdown: 0,
      bootstrapDrawdown95CI: [0, 0],
      bootstrapSharpe95CI: [0, 0],
      simulationsCount: 0,
    };
  }

  const rng = createMulberry32(seed);

  // 1. Reshuffle (without replacement) 100 times to test sequence risk
  let worstReshuffledDd = 0;
  for (let iter = 0; iter < 100; iter++) {
    const shuffled = [...pnlSeries];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let equity = initialBalance;
    const curve = [equity];
    for (const pnl of shuffled) {
      equity += pnl;
      curve.push(equity);
    }
    const { maxDrawdownPct } = calculateDrawdown(curve);
    if (maxDrawdownPct > worstReshuffledDd) {
      worstReshuffledDd = maxDrawdownPct;
    }
  }

  // 2. Bootstrap (with replacement) 1000 times
  const bootstrapDrawdowns: number[] = [];
  const bootstrapSharpes: number[] = [];
  const n = pnlSeries.length;

  for (let iter = 0; iter < iterations; iter++) {
    const sample: number[] = [];
    let equity = initialBalance;
    const curve = [equity];

    for (let k = 0; k < n; k++) {
      const pick = pnlSeries[Math.floor(rng() * n)];
      sample.push(pick);
      equity += pick;
      curve.push(equity);
    }

    const { maxDrawdownPct } = calculateDrawdown(curve);
    bootstrapDrawdowns.push(maxDrawdownPct);

    // Compute sample Sharpe
    const mean = sample.reduce((a, b) => a + b, 0) / n;
    const variance = sample.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    bootstrapSharpes.push(sharpe);
  }

  bootstrapDrawdowns.sort((a, b) => a - b);
  bootstrapSharpes.sort((a, b) => a - b);

  const p025Index = Math.floor(iterations * 0.025);
  const p975Index = Math.floor(iterations * 0.975);

  return {
    reshuffledWorstDrawdown: Number(worstReshuffledDd.toFixed(2)),
    bootstrapDrawdown95CI: [
      Number((bootstrapDrawdowns[p025Index] ?? 0).toFixed(2)),
      Number((bootstrapDrawdowns[p975Index] ?? 0).toFixed(2)),
    ],
    bootstrapSharpe95CI: [
      Number((bootstrapSharpes[p025Index] ?? 0).toFixed(2)),
      Number((bootstrapSharpes[p975Index] ?? 0).toFixed(2)),
    ],
    simulationsCount: iterations,
  };
}

/**
 * Quantitative Heuristic Overfitting Warning Score (0 to 100).
 * Implements the 5 weighted penalty terms with each term explicitly capped at 100:
 * w1=0.35 (OOS Degradation), w2=0.25 (Param Sensitivity), w3=0.20 (Trades/Param),
 * w4=0.10 (Trial Count), w5=0.10 (Sample Size).
 */
export function calculateOverfittingScore(params: {
  sharpeInSample: number;
  sharpeOutOfSample: number;
  paramSharpeNeighbors: number[];
  tradesInSample: number;
  paramCount: number;
  trialsCount: number;
}): OverfittingReport {
  const {
    sharpeInSample,
    sharpeOutOfSample,
    paramSharpeNeighbors,
    tradesInSample,
    paramCount,
    trialsCount,
  } = params;

  // Term 1: Out-of-Sample Degradation (w1 = 0.35)
  // T_OOS = min(100, max(0, ((Sharpe_IS - Sharpe_OOS) / max(0.01, Sharpe_IS)) * 100))
  let tOos = 0;
  if (sharpeInSample > 0) {
    const diff = sharpeInSample - sharpeOutOfSample;
    tOos = Math.min(100, Math.max(0, (diff / Math.max(0.01, sharpeInSample)) * 100));
  } else if (sharpeOutOfSample < sharpeInSample) {
    tOos = 50;
  }

  // Term 2: Parameter Sensitivity (w2 = 0.25)
  // Coefficient of variation among adjacent parameter neighbors
  let tSens = 0;
  if (paramSharpeNeighbors.length > 1) {
    const mean = paramSharpeNeighbors.reduce((a, b) => a + b, 0) / paramSharpeNeighbors.length;
    const variance =
      paramSharpeNeighbors.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      paramSharpeNeighbors.length;
    const std = Math.sqrt(variance);
    tSens = Math.min(100, (std / Math.max(0.1, Math.abs(mean))) * 100);
  } else {
    tSens = 15; // default moderate assumption
  }

  // Term 3: Trades-per-Parameter Penalty (w3 = 0.20)
  // T_TPP = min(100, max(0, 100 * (1 - (N_trades_IS / max(1, N_params)) / 30)))
  const safeParamCount = Math.max(1, paramCount);
  const tradesPerParam = tradesInSample / safeParamCount;
  const tTpp = Math.min(100, Math.max(0, 100 * (1 - tradesPerParam / 30)));

  // Term 4: Trial-Count Penalty (w4 = 0.10)
  // T_trials = min(100, max(0, (log10(max(1, N_trials)) / log10(1000)) * 100))
  const safeTrials = Math.max(1, trialsCount);
  const tTrials = Math.min(100, Math.max(0, (Math.log10(safeTrials) / Math.log10(1000)) * 100));

  // Term 5: Sample Size Penalty (w5 = 0.10)
  // T_sample = min(100, max(0, 100 * (1 - N_trades_IS / 150)))
  const tSample = Math.min(100, Math.max(0, 100 * (1 - tradesInSample / 150)));

  // Weighted sum: 0.35 + 0.25 + 0.20 + 0.10 + 0.10 = 1.00
  const compositeScore = Math.min(
    100,
    0.35 * tOos + 0.25 * tSens + 0.2 * tTpp + 0.1 * tTrials + 0.1 * tSample
  );

  const roundedScore = Number(compositeScore.toFixed(1));

  let label: 'Lower Estimated Overfitting Risk' | 'Moderate Empirical Divergence' | 'Elevated Overfitting Indication';
  let plainExplanation = '';

  if (roundedScore < 25) {
    label = 'Lower Estimated Overfitting Risk';
    plainExplanation =
      'Stable parameter neighborhood with robust out-of-sample persistence. High trade count per parameter reduces curve-fitting hazard.';
  } else if (roundedScore <= 50) {
    label = 'Moderate Empirical Divergence';
    plainExplanation =
      'Noticeable divergence between In-Sample and Out-of-Sample metrics or sensitivity in adjacent parameters. Proceed with conservative position sizing.';
  } else {
    label = 'Elevated Overfitting Indication';
    plainExplanation =
      'Substantial performance decay out-of-sample or fragile parameter island detected. Strategy likely memorized noise rather than structural edge.';
  }

  return {
    score: roundedScore,
    label,
    terms: {
      oosDegradation: Number(tOos.toFixed(1)),
      paramSensitivity: Number(tSens.toFixed(1)),
      tradesPerParam: Number(tTpp.toFixed(1)),
      trialCount: Number(tTrials.toFixed(1)),
      sampleSize: Number(tSample.toFixed(1)),
    },
    plainExplanation,
  };
}
