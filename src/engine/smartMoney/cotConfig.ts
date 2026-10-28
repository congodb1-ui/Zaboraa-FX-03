/**
 * Smart Money Footprint Configuration & Constants
 * Reference: Zaboraa FX Smart Money Footprint Spec v2
 */

export const SMART_MONEY_NAME = 'Smart Money Footprint';
export const SMART_MONEY_VERSION = 'smart_money_footprint_v1';

// Hard Rules exact label strings
export const TICK_VOLUME_LABEL = 'TICK VOLUME: activity proxy, not traded volume';
export const COT_LABEL = 'COT: reported futures positioning, weekly, as of Tuesday';
export const DISCLAIMER_TEXT = 'Research and advisory tool, not financial advice. A signal is not an order.';

export const SUPPORTED_SYMBOLS = ['XAUUSD', 'EURUSD'] as const;
export type SmartMoneySymbol = (typeof SUPPORTED_SYMBOLS)[number];

export function isSmartMoneySymbol(sym: string): sym is SmartMoneySymbol {
  return SUPPORTED_SYMBOLS.includes(sym.toUpperCase() as SmartMoneySymbol);
}

export interface CotMarketConfig {
  market: string;
  reportFamily: 'Disaggregated' | 'TFF';
  groupName: string;
  pair: SmartMoneySymbol;
  inverted: boolean;
}

export const COT_MARKETS: Record<SmartMoneySymbol, CotMarketConfig> = {
  XAUUSD: {
    market: 'GOLD - COMMODITY EXCHANGE INC.',
    reportFamily: 'Disaggregated',
    groupName: 'Managed Money',
    pair: 'XAUUSD',
    inverted: false,
  },
  EURUSD: {
    market: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
    reportFamily: 'TFF',
    groupName: 'Leveraged Funds',
    pair: 'EURUSD',
    inverted: false,
  },
};

export type CotMode = 'follow_change' | 'contrarian_extreme';

export interface SmartMoneyScorerConfig {
  wCot: number; // 0.35
  wAct: number; // 0.40
  wTrend: number; // 0.25
  threshold: number; // 50
  cotMode: CotMode; // 'follow_change' | 'contrarian_extreme'
  displacementVolZ: number; // 2.0
  displacementRangeAtr: number; // 1.5
  displacementCloseLocUp: number; // 0.75
  displacementCloseLocDown: number; // 0.25
  absorptionVolZ: number; // 2.0
  absorptionRangeAtr: number; // 0.8
  absorptionPriorMoveAtr: number; // 1.5
  horizons: readonly [4, 24, 72];
}

export const DEFAULT_SMART_MONEY_CONFIG: SmartMoneyScorerConfig = {
  wCot: 0.35,
  wAct: 0.40,
  wTrend: 0.25,
  threshold: 50,
  cotMode: 'follow_change',
  displacementVolZ: 2.0,
  displacementRangeAtr: 1.5,
  displacementCloseLocUp: 0.75,
  displacementCloseLocDown: 0.25,
  absorptionVolZ: 2.0,
  absorptionRangeAtr: 0.8,
  absorptionPriorMoveAtr: 1.5,
  horizons: [4, 24, 72] as const,
};

export function computeConfigHash(config: SmartMoneyScorerConfig = DEFAULT_SMART_MONEY_CONFIG): string {
  const str = JSON.stringify({
    wCot: config.wCot,
    wAct: config.wAct,
    wTrend: config.wTrend,
    threshold: config.threshold,
    cotMode: config.cotMode,
    displacementVolZ: config.displacementVolZ,
    displacementRangeAtr: config.displacementRangeAtr,
    absorptionVolZ: config.absorptionVolZ,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `cfg-${Math.abs(hash).toString(16)}`;
}
