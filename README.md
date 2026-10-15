# StockTracking

StockTracking is a market research workspace for watchlists, price levels, technical signals, and notifications. The first milestone is called **Signal Desk**. It now includes a small Node backend proxy so live history and global symbol search do not require provider URLs to be exposed directly in the browser.

## Run the MVP

The app keeps tracking, alerts, notification preferences, and paper transactions in this browser's local storage. The backend is required for live history, symbol search, company profiles, service-worker notifications, and API caching:

1. Install Node.js 18 or newer.
2. Run `npm start`.
3. Open `http://localhost:8000`.
4. Select an asset in the watchlist to inspect its chart, support, resistance, RSI, and desk read.
5. Use **Create alert** to save a local browser alert.
6. Search and filter the watchlist to test the scanning workflow.

For a frontend-only fallback, one option is:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Current MVP

- Responsive research dashboard for desktop and mobile.
- Watchlist search and signal filtering.
- Deterministic 400+ symbol demo universe with sector-aware search.
- Selected-asset detail panel with a canvas price chart.
- 90-bar OHLCV history with candlesticks, SMA 20, EMA 9, volume, support/resistance, RSI 14, and MACD context.
- Functional `1D`, `5D`, `7D`, `10D`, `1M`, `3M`, and `1Y` chart views with intraday/daily provider intervals and offline range fallbacks.
- Technical setup tags covering trend, moving-average cross, overbought/oversold state, volume expansion, and resistance proximity.
- Selected-asset intelligence summary with ATR, Bollinger Bands, VWAP, volatility regime, and bull/risk scenarios.
- Company profile panel with business description, sector/industry, market cap, P/E, forward P/E, beta, dividend yield, employees, earnings date, and 52-week range when supplied by the provider.
- Browser-local portfolio ledger with buy/sell transactions, weighted-average cost basis, market value, realized P&amp;L, unrealized P&amp;L, and position returns.
- Price, percentage-move, RSI, volume, support-break, and resistance-break alert types.
- Alert persistence with browser `localStorage`.
- Demo market data with a clearly marked provider adapter in `market-data.js`.
- Optional live quote refresh through the public Yahoo Finance chart endpoint, with five-second server caching, source labels, and demo fallback.
- Browser device notifications through a service worker, permission settings, alert-category preferences, cooldowns, and five-second polling of tracked and alert symbols while the page is open.
- Upcoming catalyst view and market-pulse summary are currently product placeholders, not live event data.

The current data is illustrative and delayed. It must not be used to make trading decisions.

### Backend routes

- `GET /api/history?symbol=AAPL&range=1mo&interval=1d` proxies and caches Yahoo chart history for one minute.
- `GET /api/quote?symbol=AAPL` returns the latest available Yahoo chart quote and caches it for five seconds.
- `GET /api/search?q=semiconductor` searches provider symbols for companies, ETFs, indexes, and international instruments.
- `GET /api/profile?symbol=AAPL` returns provider-backed company profile and valuation fields.

The browser uses `1D` 15-minute intraday history, `5D`, `7D`, and `10D` hourly history, and `1M`, `3M`, and `1Y` daily history. If the proxy or upstream provider is unavailable, the selected asset receives a distinct local range from its 90-bar fallback series.

### Device notifications

Open the diamond-shaped notification settings button in the header and choose **Allow device alerts**. The browser must grant permission, and the app must be served from `localhost` or HTTPS; notifications are usually blocked when opening the HTML file directly with `file://`. The service worker can display an operating-system notification, but periodic checks require the page to remain open. Reliable alerts while the page is closed require a server-side scheduler plus Web Push credentials, which is a later backend milestone.

The notification controls support price levels, percentage moves, RSI overbought/oversold, volume multiples, support/resistance breaks, alert categories, five-second checks, or polling off. Only tracked symbols and symbols with saved alerts are polled. A 30-minute per-alert cooldown prevents repeated device notifications for the same condition.

Five seconds is the app's quote-check cadence, not a promise that the market-data provider publishes a new price that often. Yahoo's public chart endpoint is unofficial, may return delayed quotes, and may throttle or change without notice. Checks run only while this page is open; use a licensed provider and a server-side scheduler/Web Push for dependable production alerts.

### Local data

Tracking, alerts, notification preferences, and paper transactions are stored in this browser's local storage. They are not synced to another device; clearing browser storage removes the saved information.

## Free data tools and provider plan

The app has an optional no-key live adapter for the Yahoo Finance chart endpoint. It polls only browser-tracked symbols and symbols with saved alerts, in batches of five, and retains demo data for symbols that fail. This is useful for development, but it is an unofficial endpoint and should not be treated as a production data contract. A server-side proxy is recommended before deployment so credentials, caching, retries, and provider terms stay off the client.

Recommended free or low-cost sources to evaluate next:

- [Alpha Vantage](https://www.alphavantage.co/): quotes, technical indicators, fundamentals, and news sentiment with a free API key and strict request limits.
- [Finnhub](https://finnhub.io/): quotes, company profiles, earnings, fundamentals, and news with a free API key and development limits.
- [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs): fundamentals, statements, ratios, and calendars with a free tier subject to current plan limits.
- [SEC EDGAR APIs](https://www.sec.gov/edgar/sec-api-documentation): primary filings and company facts; production use needs a descriptive `User-Agent` and server-side request handling.
- [FRED](https://fred.stlouisfed.org/docs/api/fred/): macroeconomic series such as rates, inflation, employment, and credit conditions with a free API key.
- [Stooq](https://stooq.com/q/d/): downloadable historical market data for research, subject to its current terms and redistribution rules.

Do not place provider API keys in `index.html` or client-side JavaScript. Add a backend adapter with caching and normalized responses before enabling Alpha Vantage, Finnhub, FMP, SEC, or FRED in production. Always display the provider, timestamp, delayed/real-time state, and source link beside externally sourced data.

## Product direction

The application should answer four practical questions:

1. What is happening with this asset?
2. What evidence supports the current signal?
3. What would invalidate the setup?
4. What event or price level should be monitored next?

Support and resistance now have three transparent proximity tiers: `SS1–SS3` for support/demand and `RS1–RS3` for resistance/supply. Tier 3 is the closest or most consequential level, tier 2 is a tested zone, and tier 1 is a wider early zone. These labels are descriptive technical-analysis classifications, not trade recommendations.

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
- Import transaction history from a brokerage export.

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
- Browser-local settings.

### Current file responsibilities

- `app.js`: DOM rendering, chart drawing, dialogs, filters, and event wiring.
- `analysis.js`: SMA, EMA, RSI, ATR, Bollinger, VWAP, volatility, MACD, and RS/SS classification.
- `storage-service.js`: browser-local persistence and migration from the active legacy profile.
- `tracking-service.js`: tracked-symbol state.
- `portfolio-service.js`: transactions, weighted-average positions, cost basis, and P&amp;L calculations.
- `notification-service.js`: browser permission, service-worker delivery, cooldowns, and polling.
- `market-data.js`: demo universe, normalized asset model, range loading, and provider fallback.
- `server.js`: static hosting, Yahoo proxy, caching, and global symbol search.
- `sw.js`: app-shell caching and operating-system notification display.

A relational database such as PostgreSQL is appropriate for assets, watchlists, transactions, alerts, and research notes if the app later needs shared storage. Historical price bars can use a time-series extension or a dedicated time-series store as volume grows.

Use provider adapters rather than coupling the UI to Yahoo Finance, TradingView, Moomoo, or another vendor. Confirm API terms, redistribution rights, rate limits, real-time access, and historical-data licensing before production use.

## Safety and trust

- This is a research and monitoring tool, not financial advice.
- “Best time to buy” should be expressed as a scenario with entry conditions, invalidation conditions, risk/reward, and uncertainty.
- Every news and fundamental claim should link to its source and timestamp.
- Only add brokerage integrations from providers with documented security and user-controlled access.
- Require an explicit confirmation before any live order.
