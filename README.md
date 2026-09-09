# StockTracking

StockTracking is a browser-based market research workspace for watchlists, price levels, technical signals, and notifications. The first milestone is called **Signal Desk** and is deliberately dependency-free so it can be opened locally while the data architecture is developed.

## Run the MVP

No build step or package installation is required:

1. Open `index.html` directly in a browser, or serve the folder with any static server.
2. Select an asset in the watchlist to inspect its chart, support, resistance, RSI, and desk read.
3. Use **Create alert** to save a local browser alert.
4. Search and filter the watchlist to test the scanning workflow.

For a local server, one option is:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Current MVP

- Responsive research dashboard for desktop and mobile.
- Watchlist search and signal filtering.
- Deterministic 120-symbol demo universe with sector-aware search.
- Selected-asset detail panel with a canvas price chart.
- 90-bar OHLCV history with candlesticks, SMA 20, EMA 9, volume, support/resistance, RSI 14, and MACD context.
- Technical setup tags covering trend, moving-average cross, overbought/oversold state, volume expansion, and resistance proximity.
- Price, RSI, and volume alert types.
- Alert persistence with browser `localStorage`.
- Demo market data with a clearly marked provider adapter in `app.js`.
- Upcoming catalyst view and market-pulse summary placeholders.

The current data is illustrative and delayed. It must not be used to make trading decisions.

## Product direction

The application should answer four practical questions:

1. What is happening with this asset?
2. What evidence supports the current signal?
3. What would invalidate the setup?
4. What event or price level should be monitored next?

The original `RS3` and `SS2` terminology is not implemented yet because its exact meaning needs to be defined. A good future interpretation is named, reusable rules such as `Resistance Setup 3` and `Support Setup 2`, each composed from price, volume, RSI, moving averages, and market context.

## Roadmap

### Phase 1: Reliable market data

- Choose an initial market and provider.
- Replace the demo adapter in `market-data.js` with a server-side provider adapter.
- Display source, timestamp, and delayed/real-time status.
- Add market holidays, time zones, rate-limit handling, and provider fallbacks.

### Phase 2: Portfolio intelligence

- Holdings, transactions, cost basis, dividends, and realized/unrealized P&L.
- Allocation by sector, asset type, and currency.
- Benchmark comparison, volatility, beta, Sharpe ratio, and drawdown.
- Import from a brokerage export without storing brokerage passwords.

### Phase 3: Research depth

- SMA, EMA, MACD, Bollinger Bands, ATR, VWAP, OBV, and ADX.
- Ichimoku cloud, Fibonacci retracement, pivot points, relative strength, beta, and volatility regime.
- Company fundamentals, valuation history, peer comparison, and earnings estimates.
- SEC filings, earnings, dividends, insider activity, analyst changes, and macro events.
- Source-linked news summaries with cautious sentiment classification.

### Phase 4: Strategy evaluation

- Paper trading and trade journaling.
- Position sizing, stop-loss planning, slippage, commissions, and spread assumptions.
- Backtesting with protections against look-ahead and survivorship bias.
- Walk-forward evaluation and risk-first reporting.

Live order execution should come only after paper trading, explicit confirmations, audit logs, and a user-controlled kill switch.

## Technical direction

The current static app keeps the interface simple while the product shape is validated. The next backend should separate:

- Market-data ingestion.
- Indicator and portfolio calculations.
- Alert evaluation and notification delivery.
- News and event ingestion.
- User settings and authentication.

A relational database such as PostgreSQL is appropriate for users, assets, watchlists, transactions, alerts, and research notes. Historical price bars can use a time-series extension or a dedicated time-series store as volume grows.

Use provider adapters rather than coupling the UI to Yahoo Finance, TradingView, Moomoo, or another vendor. Confirm API terms, redistribution rights, rate limits, real-time access, and historical-data licensing before production use.

## Safety and trust

- This is a research and monitoring tool, not financial advice.
- “Best time to buy” should be expressed as a scenario with entry conditions, invalidation conditions, risk/reward, and uncertainty.
- Every news and fundamental claim should link to its source and timestamp.
- Never store brokerage passwords; use OAuth where integrations are supported.
- Require an explicit confirmation before any live order.
