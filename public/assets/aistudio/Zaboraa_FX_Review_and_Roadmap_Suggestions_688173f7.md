# Zaboraa FX: Review and Roadmap Suggestions

Oct 28, 2026 · @congo two

## Duplicated features

Six features overlap, and merging them would cut the 12-tab menu and the risk of numbers disagreeing. This review is from the code in the zip; I could not run the app.

| Duplicate | Where it appears | Suggestion |
| --- | --- | --- |
| Technical analysis | Gold Technicals tab and AI Analysis tab both build the same technical, COT, macro and sentiment bundle | One Market Research hub with tabs for Technical, Fundamental, COT and AI |
| COT data | Fundamentals tab and Smart Money tab | One COT module that both views read |
| Charts | CandlestickChart (SVG), D3SimulationTimeline and the Backtest chart each draw price and trades | One shared chart component, for example TradingView Lightweight Charts |
| Bridge and account status | Header, Settings and Markets each fetch and show it | One global state, shown in one place |
| Strategy and report storage | localStorage and SQLite both hold strategies and reports, so they can disagree | SQLite as the only store |
| Data creation | Seed-historical, CSV import, bridge download and generated data all coexist | Keep bridge and CSV; label generated data as demo only |

The 12-tab top menu is also crowded. Group it into Research, Strategy Lab, Trading and Admin.

## Design and feature faults

The biggest fault is that demo content looks like live data, which could mislead someone into trading on it.

- Many views show hard-coded numbers as if live: COT, macro, news, the technical report, retail sentiment and the gold price. There is no "last updated" or "sample data" badge.
- Seeded positions, bots and the account balance appear on first load, so a new user cannot tell real data from demo data.
- Backtest results show on screen only, with no side-by-side comparison of two runs.
- Optimization appears to feed Monte Carlo from sample P&L (`samplePnl`) rather than the actual backtest trades. This should be checked.
- Several view files run to 800 to 985 lines, which is hard to maintain and likely heavy on small screens.
- A browser `alert()` confirms strategy saves.
- There is no login, no roles and no audit trail of who changed what.
- Symbols are fixed to four pairs in the type definition, so adding more needs code changes.
- Loading, empty and error states are missing in several places, and I saw no accessibility or mobile work.
- The order desk and kill switch in the UI do not call the broker, which the status documents list as already fixed.

## Backtesting upgrades

The lab already has an equity curve, trade markers, a heatmap and Monte Carlo; these eight additions turn it into a research tool for your goal.

1. **Multi-strategy and multi-symbol runs.** Select N strategies by M symbols and run them as a batch with a progress bar. Show the results in one comparison table.
2. **Portfolio view.** Combine runs into one equity curve, with a correlation matrix between strategies and a drawdown overlay.
3. **Walk-forward testing.** Optimize on an in-sample window, test on the next out-of-sample window, and roll forward. Show in-sample against out-of-sample per window.
4. **More charts.** Monthly returns heatmap, underwater (drawdown) chart, return distribution histogram, trade P&L against hold time, MAE/MFE chart (how far trades went against or for you), rolling Sharpe, win rate by hour and weekday, and a Monte Carlo fan chart.
5. **Fundamental context.** Overlay COT, rates and calendar events on the price chart. Add filters such as "only trade when COT bias agrees" or "avoid 30 minutes around high-impact news", then compare results with and without each filter.
6. **Realism controls.** Per-symbol spread and commission profiles, variable spread by session, slippage settings, and a broker-time and swap model. Flag a result as not research-grade if the data has gaps.
7. **Report export.** PDF and CSV of the trade list and metrics, with parameters and data hash included so any run can be reproduced.
8. **Promotion gate.** A strategy moves from backtest to demo to live only after it passes thresholds you set: minimum trades, maximum drawdown, out-of-sample result and Monte Carlo risk.

## Robot for multiple strategies and symbols

The robot should be built around a deployment, so one strategy can trade several symbols and several strategies can share an account.

- A **deployment** links one strategy, one or more symbols, one account and its risk limits.
- A **portfolio risk layer** works across all bots on an account: total exposure, per-currency exposure (long EURUSD and short USD both count against USD), a cap on open trades, and a daily loss limit that pauses every bot.
- A **unique magic number** per bot and strategy maps each broker position back to its source.
- **Kill switches** at three levels: per bot, per account and a master switch. Execution of the kill belongs on the server and bridge, with a re-read of positions afterwards to verify the account is flat.
- **Live monitoring** shows positions, P&L per bot, last signal, last error and a heartbeat for when each bot last ran.

## Multi-user, multi-account admin console

This is a bigger architectural change than a settings page, because the current design runs one local MT5 terminal on one laptop.

- **Roles:** Master admin, Admin, Trader and Viewer. The master admin creates users, assigns accounts and sets permissions.
- **Accounts:** a table per user with broker, server, login, type (demo or live), status and last connection. Credentials are stored encrypted on the server, never in the browser, and never shown again after entry.
- **Execution options:** several MT5 terminals (one per account) managed by a bridge service; a cloud provider such as MetaApi that handles many MT5 accounts through an API; or a copy-trading model from one master account to followers.
- **Per-user and per-account settings:** allowed symbols, allowed strategies, maximum lot size, risk per trade, daily loss limit, trading hours, and "demo only" or "live allowed".
- **Admin settings:** global switches (trading on/off, live on/off, maintenance mode); symbol list and broker suffix mapping; default risk and cost profiles; data sources and API keys; AI model selection; notification channels such as Telegram or email; backup, restore and data retention; and an audit log of every admin action.
- **Live safeguards:** a live account needs a typed confirmation, a passed demo period and your explicit approval.
- **Compliance:** if you give demos to other people, add a risk disclaimer they must accept. If you ever manage other people's live money, check local regulations on licensing, since that can require registration.

## Suggested build order

Fix the base first, because every later stage depends on a working server and a safe sandbox.

1. Fix the base: a complete project, real server routes, secrets handling and a safe strategy sandbox.
2. Backtesting upgrades: batch runs, portfolio view, walk-forward testing and the new charts.
3. Real research data feeds and the shared Market Research hub.
4. Authentication, roles and the account model.
5. Multi-account execution with per-account risk limits and kill switches.
6. Demo soak testing, then the live approval flow.
