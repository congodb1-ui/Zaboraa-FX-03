# Automated Bot Inspection Panel with Interactive Strategy PriceChart & Live Trades

Interactive inspection panel and high-performance strategy chart for Zaboraa FX Automated Bot Fleet, allowing quantitative traders to click any automated trading bot and immediately inspect live trades, historical orders, strategy indicator overlays, and execution diagnostics.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed during the interactive interview:
> - **Inspection Layout**: Dedicated detail panel positioned below the bot cards grid with tabbed navigation (`Live Strategy Chart`, `Active Positions & Orders`, `Strategy Rules & Execution Log`).
> - **Chart Engine**: High-performance Canvas `<PriceChart>` featuring the bot's symbol/timeframe candles, strategy overlays (Donchian bands, Moving Averages, Supertrend), and real-time trade execution markers (buy/sell triangles, entry dashed lines, stop-loss / take-profit barriers).
> - **Trade & Order Scope**: Filtered directly by the selected bot's `botId` and `magicNumber`, showing active open positions, closed orders, and execution audit events.

- **Confirmed Decision 1**: Dedicated detail panel below the bot cards with tabbed chart and orders.
- **Confirmed Decision 2**: High-performance PriceChart with strategy indicator overlays and trade markers.
- **Confirmed Decision 3**: Active open positions, historical closed orders, and execution logs.

---

## 1. Overview & Core Concept

### What It Does
When a trader clicks on any bot card within the **Automated Bot Fleet** (`BotsView`), the card highlights with an active accent outline, and a dedicated **Bot Inspection & Live Execution Panel** smoothly expands below the bot fleet grid. 

The inspection panel provides three focused tabs:
1. **Live Strategy Chart**: Renders the Canvas `<PriceChart>` for the bot's configured symbol (e.g. `EURUSD`, `XAUUSD`) and timeframe (e.g. `H1`, `M15`). Automatically plots the strategy's specific indicators (e.g., Donchian Channels for Turtle Bot, EMA/SMA + Supertrend for Trend Pullback, VWAP for Momentum) and overlays live trade markers with entry price, direction, volume, SL, TP, and current floating P&L.
2. **Orders & Positions**: Shows all active open positions and historical orders belonging to that bot (matched by `botId` or `magicNumber`), with live P&L, lot size, ticket number, open time, and emergency position close capability.
3. **Strategy Specification & Logs**: Displays the bot's complete algorithmic rules, input parameters (e.g. lookback period, ATR multiplier, risk percentage), risk ceilings, and real-time execution log events.

### Target Audience / Persona
Quantitative forex & gold traders managing automated algorithmic bots who need visual confirmation that their strategies are executing according to their mathematical rules on live Exness MT5 demo/live feeds.

### Key Value
Eliminates "black box" automated trading uncertainty by visually bridging the gap between algorithmic strategy rules and actual market execution directly on the price chart.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Selection Flow**:
   - The user navigates to **Automated Trading** (`BotsView`).
   - Clicking any bot card (e.g., `Turtle Donchian EURUSD` or `Gold Momentum`) selects it as the active inspection subject.
   - The selected card displays a subtle indigo highlight ring (`ring-1 ring-primary border-primary/50`) and an "Inspecting" status badge.
2. **Interactive Chart Exploration**:
   - The panel immediately loads the bot's historical candles from SQLite/local datasets.
   - The Canvas `<PriceChart>` displays the candles, zoom/pan controls, crosshair, and indicator overlays corresponding to the bot's strategy.
   - Real-time trade markers appear at the exact candle bar where positions were opened, with dashed green/red lines extending to current price, stop-loss, and take-profit levels.
3. **Order & Position Management**:
   - The user clicks the **Positions & Orders** tab to view open tickets for this bot.
   - Includes real-time floating P&L in tabular monospace (`font-mono tabular-nums`), open price, and an action button to manually close an open position if risk conditions change.
4. **Closing or Switching**:
   - Clicking another bot card smoothly switches the chart and orders to the newly selected bot without page reload.
   - Clicking the "✕ Close Inspector" button dismisses the panel and returns to the clean bot grid.

### Visual Identity & Theme
- **Design Tokens**: Strictly leverages semantic tokens (`--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--primary`, `--success`, `--danger`, `--warning`, `--info`) with zero hardcoded hex or `slate-*` classes, adhering to Stage 3 universal design system standards.
- **Typography**: Display titles in `Plus Jakarta Sans`, data metrics, prices, and tickets in `JetBrains Mono` with `tabular-nums`.
- **Layout Math**: Outer container padding 24px (`p-6`), inner card gaps 16px (`gap-4`), tab height 40px with clean segmented pill-free tabs.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Use Canvas `<PriceChart>` over SVG `<CandlestickChart>`**:
  - *Chosen Approach*: Leverage the high-performance HTML5 Canvas `<PriceChart>` implemented and verified in Stage 2.
  - *Why*: Canvas maintains 60 FPS smooth rendering across thousands of candles, supports multi-indicator overlays (Donchian, Supertrend, Moving Averages), and handles zoom/pan without DOM overhead.
  - *Trade-Off*: Canvas requires programmatic drawing of trade marker overlays, which we implement cleanly using the existing `trades` and `visualLines`/`visualMarkers` props.
- **Decision 2: Pass Global `positions`, `orders`, `strategies`, and `datasets` to `BotsView`**:
  - *Chosen Approach*: Wire `positions`, `orders`, `strategies`, and `datasets` from `App.tsx` into `BotsViewProps`.
  - *Why*: All bot trades, open positions, and historical candle datasets already reside in `App.tsx` state and are synchronized with the backend SQLite database. No redundant network roundtrips needed.
- **Decision 3: Fallback Candle Loading**:
  - *Chosen Approach*: If the selected bot's symbol/timeframe candle dataset is not yet in memory, fetch it on-demand from `/api/data/load?symbol=${bot.symbol}&timeframe=${bot.timeframe}`.
  - *Why*: Ensures the chart always displays rich price history even if the user hasn't visited the Data Manager first.

---

## 4. Technical Architecture & Data Strategy

### System & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                                App.tsx                                 │
│  - bots: BotRecord[]                                                   │
│  - positions: PositionRecord[]                                         │
│  - orders: OrderRecord[]                                               │
│  - strategies: StrategyDefinition[]                                    │
│  - datasets: DatasetRecord[]                                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Props
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        src/components/BotsView.tsx                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Bot Cards Grid (onClick -> setSelectedBot(bot))                 │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ selectedBot !== null             │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Bot Detail & Inspection Panel                                    │  │
│  │  - Header: Bot Title, Symbol/Timeframe, Live P&L, Status, Close  │  │
│  │  - Tab Navigation: [Live Strategy Chart] [Positions & Orders]    │  │
│  │                    [Strategy Logic & Rules] [Audit Events]       │  │
│  │                                                                  │  │
│  │  Tab 1: <PriceChart>                                             │  │
│  │    - candles: botCandles (from datasets / /api/data/load)        │  │
│  │    - symbol: selectedBot.symbol                                  │  │
│  │    - timeframe: selectedBot.timeframe                            │  │
│  │    - trades: mapped botTrades (entry, SL, TP, P&L markers)       │  │
│  │    - visualLines: strategy indicators (Donchian, Supertrend, MA) │  │
│  │                                                                  │  │
│  │  Tab 2: Orders & Positions Table                                 │  │
│  │    - Filtered by botId & magicNumber                             │  │
│  │    - Ticket, Symbol, Side, Lots, Entry Price, SL, TP, P&L, Close │  │
│  │                                                                  │  │
│  │  Tab 3: Strategy Rules & Parameter Card                          │  │
│  │    - Strategy definition details, code logic, risk limits        │  │
│  │                                                                  │  │
│  │  Tab 4: Execution & Risk Events Log                              │  │
│  │    - Filtered audit trail for this bot's magic number            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Mapping Strategy: Converting Bot Positions to Chart Trades
To ensure `<PriceChart>` accurately renders the trades on the price canvas, bot open positions and closed orders are converted to `TradeRecord[]`:
```typescript
const botTrades: TradeRecord[] = botPositions.map((pos) => ({
  id: `trade-${pos.ticket}`,
  ticket: pos.ticket,
  symbol: pos.symbol,
  side: pos.side,
  volume: pos.volume,
  entryTime: pos.openTime,
  entryPrice: pos.openPrice,
  sl: pos.sl,
  tp: pos.tp,
  pnl: pos.pnl,
  comment: pos.comment,
  magicNumber: pos.magicNumber,
}));
```

### Strategy Visual Overlays for Bot Chart
Based on the bot's `strategyId`:
- **Turtle Donchian**: Automatically enables Donchian Channels (`showDonchian={true}`) on the chart so the trader sees the 20-period breakout high/low lines the bot trades against.
- **Gold Momentum / Trend Pullback**: Automatically enables EMA 50, SMA 20, and Supertrend (`showSupertrend={true}`) so the pullback entries align with trend indicators.
- **Visual Markers**: Draws `BUY ↑` / `SELL ↓` arrow badges at candle bars corresponding to bot trade executions.

---

## 5. Verification & Testing Strategy

1. **Gate 1**: `npx tsc --noEmit` verifies strict TypeScript types across `BotsViewProps`, `PriceChart`, and `App.tsx`.
2. **Gate 2**: Vitest test suite (`npm test -- --run`) verifies:
   - All 26 existing test suites continue to pass.
   - `designTokens.test.ts` passes with 0 violations (no hex or slate classes introduced).
   - Companion unit test in `src/engine/__tests__/botInspection.test.ts` asserting:
     - Bot selection filters positions and orders correctly by `botId` and `magicNumber`.
     - Trade mapping accurately converts open positions to `TradeRecord` geometry.
     - Candle resolution falls back gracefully when dataset is loading.
3. **Gate 3**: `npm run build` verifies full production bundle compiles cleanly.
