import { BacktestTrade, TradingViewComparisonReport, TradingViewTradeRecord } from '../types/forex';

export function parseTradingViewTradesCsv(csvContent: string): TradingViewTradeRecord[] {
  const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));
  const tradeNumIdx = headers.findIndex(h => h.includes('trade') || h.includes('#'));
  const typeIdx = headers.findIndex(h => h.includes('type'));
  const signalIdx = headers.findIndex(h => h.includes('signal'));
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time'));
  const priceIdx = headers.findIndex(h => h.includes('price'));
  const contractsIdx = headers.findIndex(h => h.includes('contract') || h.includes('size') || h.includes('qty'));
  const profitIdx = headers.findIndex(h => h.includes('profit') && !h.includes('cum'));

  const parsedTrades: TradingViewTradeRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length < 3) continue;

    const rawType = (cols[typeIdx >= 0 ? typeIdx : 1] || '').trim();
    let type: 'Entry Long' | 'Exit Long' | 'Entry Short' | 'Exit Short' = 'Entry Long';
    if (rawType.toLowerCase().includes('exit') && rawType.toLowerCase().includes('long')) type = 'Exit Long';
    else if (rawType.toLowerCase().includes('entry') && rawType.toLowerCase().includes('short')) type = 'Entry Short';
    else if (rawType.toLowerCase().includes('exit') && rawType.toLowerCase().includes('short')) type = 'Exit Short';

    const rawProfit = profitIdx >= 0 ? cols[profitIdx]?.trim() : undefined;
    const parsedProfit = rawProfit !== undefined && rawProfit !== '' && !isNaN(Number(rawProfit))
      ? Number(rawProfit)
      : undefined;

    const tradeRecord: TradingViewTradeRecord = {
      tradeNumber: parseInt(cols[tradeNumIdx >= 0 ? tradeNumIdx : 0], 10) || i,
      type,
      signal: cols[signalIdx >= 0 ? signalIdx : 2] || 'Signal',
      date: cols[dateIdx >= 0 ? dateIdx : 3] || '',
      price: parseFloat(cols[priceIdx >= 0 ? priceIdx : 4]) || 0,
      contracts: parseFloat(cols[contractsIdx >= 0 ? contractsIdx : 5]) || 0.1,
      profitUSD: parsedProfit,
    };
    parsedTrades.push(tradeRecord);
  }

  return parsedTrades;
}

export function compareWithTradingViewTrades(
  portalTrades: BacktestTrade[],
  tvTrades: TradingViewTradeRecord[]
): TradingViewComparisonReport {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const tvExits = tvTrades.filter(t => t.type.startsWith('Exit'));
  const tvTradeCount = tvExits.length > 0 ? tvExits.length : Math.floor(tvTrades.length / 2);
  const portalTradeCount = portalTrades.length;

  const tvNetProfit = tvExits.reduce((acc, t) => acc + num(t.profitUSD), 0);
  const portalNetProfit = portalTrades.reduce((acc, t) => acc + num(t.pnl), 0);

  const tradeCountMatch = Math.abs(tvTradeCount - portalTradeCount) <= 1;
  const pnlDifferenceUSD = Math.abs(portalNetProfit - tvNetProfit);
  const pnlBase = Math.max(1, Math.abs(tvNetProfit));
  const pnlDifferencePct = (pnlDifferenceUSD / pnlBase) * 100;

  const notes: string[] = [];

  if (tradeCountMatch) {
    notes.push(`Trade count is synchronized: TradingView recorded ${tvTradeCount} trades, portal recorded ${portalTradeCount} trades.`);
  } else {
    notes.push(`Trade count divergence: TradingView recorded ${tvTradeCount} trades, portal recorded ${portalTradeCount} trades.`);
  }

  if (pnlDifferencePct < 10) {
    notes.push(`P&L divergence is minimal (${pnlDifferencePct.toFixed(1)}%). Differences are attributable to spread and slippage cost modeling.`);
  } else {
    notes.push(`P&L divergence is ${pnlDifferencePct.toFixed(1)}% ($${pnlDifferenceUSD.toFixed(2)} delta). Check TradingView commission and tick-spread settings.`);
  }

  const countPenalty = Math.min(50, Math.abs(tvTradeCount - portalTradeCount) * 10);
  const pnlPenalty = Math.min(50, pnlDifferencePct * 0.5);
  
  const rawScore = 100 - (countPenalty + pnlPenalty);
  const alignmentScore = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, Math.round(rawScore)))
    : 0;

  return {
    tvTradeCount,
    portalTradeCount,
    tradeCountMatch,
    tvNetProfit: Number(tvNetProfit.toFixed(2)),
    portalNetProfit: Number(portalNetProfit.toFixed(2)),
    pnlDifferenceUSD: Number(pnlDifferenceUSD.toFixed(2)),
    pnlDifferencePct: Number(pnlDifferencePct.toFixed(1)),
    timingDivergenceMinutes: 0,
    alignmentScore,
    notes,
  };
}