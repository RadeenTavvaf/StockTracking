# StockTracking

StockTracking is a market research workspace for watchlists, price levels, technical signals, and notifications. The first milestone is called **Signal Desk**. It now includes a small Node backend proxy so live history and global symbol search do not require provider URLs to be exposed directly in the browser.

## Run the MVP

The app keeps stock subscriptions, alerts, and notification preferences in this browser's local storage. The backend is required for live quotes and history, symbol search, company profiles, service-worker notifications, and API caching:

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
- Functional `1D`, `7D`, `1M`, `3M`, and `1Y` chart views with intraday/daily provider intervals and offline range fallbacks.
- Technical setup tags covering trend, moving-average cross, overbought/oversold state, volume expansion, and resistance proximity.
- Selected-asset intelligence summary with ATR, Bollinger Bands, VWAP, volatility regime, and bull/risk scenarios.
- Company profile panel with business description, sector/industry, market cap, P/E, forward P/E, beta, dividend yield, employees, earnings date, and 52-week range when supplied by the provider.
- Price, percentage-move, RSI, volume, support-break, and resistance-break alert types.
- Price and percentage alerts prompt for their required threshold; RSI and support/resistance alerts use their built-in levels, and volume alerts default to 1.5× average volume when no multiplier is entered.
- Alert persistence with browser `localStorage`.
- Demo market data with a clearly marked provider adapter in `market-data.js`.
- Automatic quote checks for subscribed and alert symbols, starting immediately and repeating every five seconds while the page is open; quote timestamps, refresh counts, provider errors, and demo/last-value fallbacks are shown in the UI.
- Browser device notifications through a service worker, permission settings, alert-category preferences, and cooldowns. Device permission is needed for system notifications.
- Tracked-stock breadth summary calculated only from fresh provider quotes.
- Two-week Nasdaq earnings calendar for subscribed stocks, with event-time labels, consensus EPS estimates when available, source links, manual refresh, and 15-minute refresh while the page is visible. The app does not invent dates; Nasdaq may omit or revise estimates.

The current data is illustrative and delayed. It must not be used to make trading decisions.

### Backend routes

- `GET /api/history?symbol=AAPL&range=1mo&interval=1d` proxies and caches Yahoo chart history for one minute.
- `GET /api/quote?symbol=AAPL` returns the latest available Yahoo chart quote and caches it for five seconds.
- `GET /api/search?q=semiconductor` searches provider symbols for companies, ETFs, indexes, and international instruments.
- `GET /api/profile?symbol=AAPL` returns provider-backed company profile and valuation fields.
- `GET /api/calendar?symbols=AAPL,MSFT` returns Nasdaq-reported earnings events for tracked symbols over the next two weeks, up to 20 symbols.

The browser uses `1D` 15-minute intraday history, `7D` hourly history, and `1M`, `3M`, and `1Y` daily history. If the proxy or upstream provider is unavailable, the selected asset receives a distinct local range from its 90-bar fallback series.

### Device notifications

Use **Subscribe** on an asset to add it to the local watchlist, or create an alert to monitor it. Either action starts quote checks immediately. Open the diamond-shaped notification settings button in the header and choose **Allow device alerts** to receive operating-system notifications. The browser must grant permission, and the app must be served from `localhost` or HTTPS; notifications are usually blocked when opening the HTML file directly with `file://`. The service worker can display notifications, but periodic checks require the page to remain open. Reliable alerts while the page is closed require a server-side scheduler plus Web Push credentials, which is a later backend milestone.

The notification controls support price levels, percentage moves, RSI overbought/oversold, volume multiples, support/resistance breaks, alert categories, five-second checks, or polling off. Only tracked symbols and symbols with saved alerts are polled. A 30-minute per-alert cooldown prevents repeated device notifications for the same condition.

Five seconds is the app's best-effort quote-check cadence, not a promise that the market-data provider publishes a new price that often. Yahoo's public chart endpoint is unofficial, may return delayed quotes, and may throttle or change without notice. Failed symbols keep their last available/demo value and report the failure; each quote's provider timestamp distinguishes the quote time from the app's check time. Checks run only while this page is open. There is no dependable, trustworthy no-key provider contract for guaranteed five-second market updates; use a licensed provider and a server-side scheduler/Web Push for production alerts.

The earnings calendar reads Nasdaq's public earnings calendar for the next two weeks and filters it to subscribed stocks. Event dates and consensus EPS are provider-reported estimates and may change; source links are provided per event. The calendar refreshes on page load, on request, after subscription changes, and every 15 minutes while the page is visible. Macro events are not included.

### Local data

Stock subscriptions, alerts, and notification preferences are stored in this browser's local storage. They are not synced to another device; clearing browser storage removes the saved information.

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

- Evaluate a documented market-data provider to replace or supplement the unofficial Yahoo Finance adapter.
- Preserve source, timestamp, and delayed/real-time status for every provider response.
- Add market holidays, time zones, rate-limit handling, and provider fallbacks.

### Phase 2: Research depth

- SMA, EMA, MACD, Bollinger Bands, ATR, VWAP, OBV, and ADX.
- Ichimoku cloud, Fibonacci retracement, pivot points, relative strength, beta, and volatility regime.
- Company fundamentals, valuation history, peer comparison, and earnings estimates.
- SEC filings, earnings, dividends, insider activity, analyst changes, and macro events.
- Source-linked news summaries with cautious sentiment classification.

## Technical direction

The current app keeps the interface simple while the product shape is validated. The next backend should separate:

- Market-data ingestion.
- Indicator calculations.
- Alert evaluation and notification delivery.
- News and event ingestion.
- Browser-local settings.

### Current file responsibilities

- `app.js`: DOM rendering, chart drawing, dialogs, filters, and event wiring.
- `analysis.js`: SMA, EMA, RSI, ATR, Bollinger, VWAP, volatility, MACD, and RS/SS classification.
- `storage-service.js`: browser-local JSON persistence for watchlists, alerts, and notification preferences.
- `tracking-service.js`: tracked-symbol state.
- `notification-service.js`: browser permission, service-worker delivery, cooldowns, and polling.
- `market-data.js`: demo universe, normalized asset model, range loading, and provider fallback.
- `server.js`: static hosting, Yahoo proxy, caching, and global symbol search.
- `sw.js`: app-shell caching and operating-system notification display.

A relational database such as PostgreSQL is appropriate for assets, watchlists, alerts, and research notes if the app later needs shared storage. Historical price bars can use a time-series extension or a dedicated time-series store as volume grows.

Use provider adapters rather than coupling the UI to Yahoo Finance, TradingView, Moomoo, or another vendor. Confirm API terms, redistribution rights, rate limits, real-time access, and historical-data licensing before production use.

## Safety and trust

- This is a research and monitoring tool, not financial advice.
- “Best time to buy” should be expressed as a scenario with entry conditions, invalidation conditions, risk/reward, and uncertainty.
- Every news and fundamental claim should link to its source