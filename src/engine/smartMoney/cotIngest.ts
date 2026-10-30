import { SmartMoneyCotRow, upsertSmartMoneyCot, logExternalFetch } from '../../db/sqlite';
import { COT_MARKETS } from './cotConfig';
import { computeEffectiveAt } from './cotFeatures';

/**
 * Refreshes COT data from CFTC Public Reporting API using a paged loop (offset 0, 110, 220...)
 * strictly filtered to market = 'GOLD - COMMODITY EXCHANGE INC.'
 * Enforces source = 'CFTC Public Reporting API' only and rejects synthetic/disaggregated baselines.
 */
export async function refreshCotData(): Promise<{ success: boolean; rowsIngested: number; error?: string }> {
  const startedAt = new Date().toISOString();
  const fetchId = `fetch-cot-${Date.now()}`;
  let ingested = 0;

  try {
    let offset = 0;
    const limit = 110;
    let hasMore = true;

    while (hasMore) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        // Public Socrata CFTC Public Reporting API with where clause and pagination
        const encodedWhere = encodeURIComponent("market_and_exchange_names like '%GOLD - COMMODITY EXCHANGE INC.%'");
        const url = `https://publicreporting.cftc.gov/resource/72hh-3qpy.json?$limit=${limit}&$offset=${offset}&$order=report_date_as_yyyy_mm_dd%20DESC&$where=${encodedWhere}`;

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          hasMore = false;
          break;
        }

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          hasMore = false;
          break;
        }

        const rows: SmartMoneyCotRow[] = [];
        for (const item of data) {
          const reportDateStr = (item.report_date_as_yyyy_mm_dd || item.report_date || '').split('T')[0];
          if (!reportDateStr) continue;

          // Parse values strictly without fallbacks
          const oi = parseFloat(item.open_interest_all);
          const long = parseFloat(item.m_money_positions_long_all);
          const short = parseFloat(item.m_money_positions_short_all);

          if (isNaN(oi) || isNaN(long) || isNaN(short) || oi <= 0) {
            continue;
          }

          const net = long - short;

          // Enforce source = 'CFTC Public Reporting API' only
          rows.push({
            market: COT_MARKETS.XAUUSD.market,
            report_date: reportDateStr,
            open_interest: oi,
            long,
            short,
            net,
            net_pct_oi: Number(((net / oi) * 100).toFixed(2)),
            source: 'CFTC Public Reporting API',
            fetched_at: new Date().toISOString(),
            effective_at: computeEffectiveAt(reportDateStr),
          });
        }

        if (rows.length > 0) {
          ingested += upsertSmartMoneyCot(rows);
        }

        offset += limit;
        if (data.length < limit || offset >= 330) {
          hasMore = false;
        }
      } catch {
        hasMore = false;
        break;
      }
    }

    logExternalFetch({
      id: fetchId,
      source: 'CFTC_COT',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ok: true,
      rows_ingested: ingested,
    });

    return {
      success: true,
      rowsIngested: ingested,
    };
  } catch (err: any) {
    logExternalFetch({
      id: fetchId,
      source: 'CFTC_COT',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      ok: false,
      rows_ingested: 0,
      error: err.message,
    });

    return {
      success: false,
      rowsIngested: 0,
      error: err.message,
    };
  }
}
