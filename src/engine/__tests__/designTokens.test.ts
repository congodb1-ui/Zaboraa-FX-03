import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Stage 3: Universal Design System Token Linter
 * Scans src/** and index.html (excluding src/index.css and test files) for:
 * 1. Hex color literals: #rgb, #rgba, #rrggbb, #rrggbbaa
 * 2. rgb(), rgba(), hsl(), hsla() literals
 * 3. Legacy slate-* Tailwind utility classes (e.g., bg-slate-800, text-slate-400)
 *
 * Enforces zero hardcoded colors in UI components in favor of semantic CSS tokens:
 * --bg, --surface, --border, --text, --text-muted, --primary, --success, --danger, --warning, --info
 */

// Regex definitions
const HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_HSL_REGEX = /\b(?:rgb|rgba|hsl|hsla)\([^)]+\)/g;
const SLATE_REGEX = /\b(?:[a-z0-9_-]+:)*(?:bg|text|border|ring|divide|from|to|via|outline|accent|shadow)-slate-[0-9]+\b/g;

// Documented, justified exceptions
// Each exception must carry a precise technical rationale.
interface JustifiedException {
  filePattern: RegExp;
  reason: string;
}

const JUSTIFIED_EXCEPTIONS: JustifiedException[] = [
  {
    // HTML5 Canvas fallback colors in jsdom/headless testing environments where
    // window.getComputedStyle() returns empty strings for custom CSS variables,
    // plus dedicated multi-indicator palette assignments (SMA, EMA, Supertrend, etc.)
    filePattern: /src\/components\/PriceChart\.tsx$/,
    reason: 'HTML5 Canvas jsdom CSS variable fallback & multi-indicator overlay strokes',
  },
  {
    // SVG presentation attributes (wick strokes, candle fills, TP/SL target geometry)
    // rendered directly in pure SVG tags where Tailwind CSS variables are unsupported
    filePattern: /src\/components\/CandlestickChart\.tsx$/,
    reason: 'SVG canvas candle wick strokes, entry badges, and TP/SL target geometries',
  },
  {
    // D3.js timeline visualization using D3 color gradients, SVG axes, and equity curves
    filePattern: /src\/components\/D3SimulationTimeline\.tsx$/,
    reason: 'D3.js SVG simulation timeline gradients, equity paths, and crosshair coordinates',
  },
  {
    // Algorithmic calculation engines & Pine script compiler models that emit
    // visual marker metadata structures (e.g. { color: "#10b981", shape: "triangle_up" })
    filePattern: /src\/engine\/(?:backtester|pineConverter|trendPullbackPro|workerSandbox|technicalIndicators)\.ts$/,
    reason: 'Algorithmic strategy marker metadata & session box definitions (not DOM markup)',
  },
];

function isJustified(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return JUSTIFIED_EXCEPTIONS.some((exc) => exc.filePattern.test(normalized));
}

function collectScannableFiles(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const normalized = fullPath.replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === '__tests__' ||
        entry.name === 'fixtures'
      ) {
        continue;
      }
      collectScannableFiles(fullPath, fileList);
    } else if (entry.isFile()) {
      if (
        normalized.endsWith('.test.ts') ||
        normalized.endsWith('.test.tsx') ||
        normalized.endsWith('.spec.ts') ||
        normalized.endsWith('.d.ts') ||
        normalized === 'src/index.css'
      ) {
        continue;
      }
      if (/\.(tsx?|jsx?|html)$/.test(entry.name)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

export function scanDesignTokens(): {
  totalViolations: number;
  perFileViolations: Record<string, { total: number; hex: number; rgb: number; slate: number }>;
} {
  const root = process.cwd();
  const scannable = collectScannableFiles(path.join(root, 'src'));
  const indexHtml = path.join(root, 'index.html');
  if (fs.existsSync(indexHtml)) {
    scannable.push(indexHtml);
  }

  const perFileViolations: Record<string, { total: number; hex: number; rgb: number; slate: number }> = {};
  let totalViolations = 0;

  for (const file of scannable) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    if (isJustified(relative)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');
    const hexMatches = content.match(HEX_REGEX) || [];
    const rgbMatches = content.match(RGB_HSL_REGEX) || [];
    const slateMatches = content.match(SLATE_REGEX) || [];
    const count = hexMatches.length + rgbMatches.length + slateMatches.length;

    if (count > 0) {
      perFileViolations[relative] = {
        total: count,
        hex: hexMatches.length,
        rgb: rgbMatches.length,
        slate: slateMatches.length,
      };
      totalViolations += count;
    }
  }

  return { totalViolations, perFileViolations };
}

describe('Stage 3: Universal Design System Compliance Meter', () => {
  it('enforces zero hardcoded hex, rgb/hsl, and slate-* classes outside documented exceptions', () => {
    const { totalViolations, perFileViolations } = scanDesignTokens();

    if (totalViolations > 0) {
      console.log('\n=== Design Token Violations by File ===');
      for (const [file, info] of Object.entries(perFileViolations)) {
        console.log(`- ${file}: ${info.total} violations (hex: ${info.hex}, rgb: ${info.rgb}, slate: ${info.slate})`);
      }
      console.log(`Total Unjustified Violations: ${totalViolations}\n`);
    }

    expect(totalViolations).toBe(0);
  });
});
