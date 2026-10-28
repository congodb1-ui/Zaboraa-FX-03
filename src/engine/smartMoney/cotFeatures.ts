import { SmartMoneyCotRow } from '../../db/sqlite';
import { CotMode, COT_LABEL } from './cotConfig';

export interface CotFeaturesResult {
  netPctOi: number | null;
  z156: number | null;
  chg4: number | null;
  chg4z: number | null;
  cCot: number;
  crowded: boolean;
  stale: boolean;
  reason?: string;
  latestReportDate?: string;
  effectiveAt?: string;
  label: string;
}

/**
 * Calculates conservative Monday 00:00 UTC effective time for a given Tuesday report_date.
 * report_date (Tuesday) + 6 days = Monday 00:00 UTC.
 */
export function computeEffectiveAt(reportDateStr: string): string {
  const d = new Date(reportDateStr + 'T00:00:00Z');
  // Add 6 days to get the following Monday 00:00:00Z
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString();
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function calcMeanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Computes point-in-time COT features strictly using rows where effective_at <= asOfTimeUtc.
 */
export function computeCotFeatures(
  allRows: SmartMoneyCotRow[],
  asOfTimeUtc: string | number,
  cotMode: CotMode = 'follow_change',
  inverted = false
): CotFeaturesResult {
  const asOfIso = typeof asOfTimeUtc === 'number' ? new Date(asOfTimeUtc * 1000).toISOString() : asOfTimeUtc;
  const asOfSeconds = typeof asOfTimeUtc === 'number' ? asOfTimeUtc : Math.floor(new Date(asOfTimeUtc).getTime() / 1000);

  // 1. Point-in-time filter: effective_at <= asOfTimeUtc
  const visibleRows = allRows
    .filter((r) => r.effective_at <= asOfIso)
    .sort((a, b) => a.report_date.localeCompare(b.report_date));

  if (visibleRows.length === 0) {
    return {
      netPctOi: null,
      z156: null,
      chg4: null,
      chg4z: null,
      cCot: 0,
      crowded: false,
      stale: true,
      reason: 'No point-in-time COT rows visible prior to effective date',
      label: COT_LABEL,
    };
  }

  const latest = visibleRows[visibleRows.length - 1];
  const latestEffSeconds = Math.floor(new Date(latest.effective_at).getTime() / 1000);
  const ageDays = (asOfSeconds - latestEffSeconds) / 86400;
  const stale = ageDays > 12;

  // Compute net_pct_oi history
  const sign = inverted ? -1 : 1;
  const netPctHistory = visibleRows.map((r) => {
    const val = r.open_interest > 0 ? (r.net / r.open_interest) * 100 : r.net_pct_oi || 0;
    return val * sign;
  });

  const latestNetPctOi = netPctHistory[netPctHistory.length - 1];

  // Lookback window: up to 156 rows (approx 3 years). Require at least 52 rows.
  const windowRows = netPctHistory.slice(-156);
  if (windowRows.length < 52) {
    return {
      netPctOi: Number(latestNetPctOi.toFixed(2)),
      z156: null,
      chg4: null,
      chg4z: null,
      cCot: 0,
      crowded: false,
      stale,
      reason: `Insufficient COT history (${windowRows.length} < 52 weeks)`,
      latestReportDate: latest.report_date,
      effectiveAt: latest.effective_at,
      label: COT_LABEL,
    };
  }

  // Calculate z-score of netPctOi over window
  const { mean, std } = calcMeanAndStd(windowRows);
  const z156 = std > 0.0001 ? (latestNetPctOi - mean) / std : 0;
  const crowded = Math.abs(z156) >= 2.0;

  // 4-week change calculation
  let chg4: number | null = null;
  let chg4z: number | null = null;

  if (netPctHistory.length >= 5) {
    const prev4 = netPctHistory[netPctHistory.length - 5];
    chg4 = latestNetPctOi - prev4;

    // Calculate rolling 4-week changes across the window for chg4z
    const changes: number[] = [];
    const startIndex = Math.max(0, netPctHistory.length - 156);
    for (let i = startIndex + 4; i < netPctHistory.length; i++) {
      changes.push(netPctHistory[i] - netPctHistory[i - 4]);
    }

    if (changes.length >= 48) {
      const chgStats = calcMeanAndStd(changes);
      chg4z = chgStats.std > 0.0001 ? (chg4 - chgStats.mean) / chgStats.std : 0;
    }
  }

  // Calculate component cCot
  let cCot = 0;
  let reason: string | undefined;

  if (stale) {
    cCot = 0;
    reason = `COT data is stale (${Math.round(ageDays)} days old > 12 days)`;
  } else if (cotMode === 'follow_change') {
    if (chg4z !== null) {
      cCot = clamp(chg4z / 2, -1, 1);
    } else {
      cCot = 0;
      reason = '4-week COT change z-score unavailable';
    }
  } else {
    // contrarian_extreme
    cCot = -clamp(z156 / 2, -1, 1);
  }

  return {
    netPctOi: Number(latestNetPctOi.toFixed(2)),
    z156: Number(z156.toFixed(3)),
    chg4: chg4 !== null ? Number(chg4.toFixed(2)) : null,
    chg4z: chg4z !== null ? Number(chg4z.toFixed(3)) : null,
    cCot: Number(cCot.toFixed(3)),
    crowded,
    stale,
    reason,
    latestReportDate: latest.report_date,
    effectiveAt: latest.effective_at,
    label: COT_LABEL,
  };
}
