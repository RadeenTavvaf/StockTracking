# StockTracking

StockTracking is a market research workspace for watchlists, price levels, technical signals, and notifications. The first milestone is called **Signal Desk**. It now includes a small Node backend proxy so live history and global symbol search do not require provider URLs to be exposed directly in the browser.

## Use Signal Desk on the web or install it

Signal Desk works as a website and can be installed from a supported browser as a standalone Progressive Web App (PWA). No app-store download, separate companion app, or client-side package installation is required. The installed app and website use the same local browser storage on that device.

Open the hosted website in a supported browser and choose **Install app**. If the browser does not offer a direct install prompt, use its menu and select **Install app** or **Add to Home Screen**. On iPhone or iPad, open the site in Safari, tap **Share**, then **Add to Home Screen**. The first visit needs an internet connection to load the website and cache its app shell.

## Android APK

A debug Android APK is available at `app/Signal-Desk.apk`. Copy it to an Android device and enable installation from unknown sources for the browser or file manager used to open it.

The Android app requests quotes and daily chart history from Yahoo Finance through Capacitor's native HTTP support, and uses Nasdaq as a fallback for daily historical prices. Nasdaq company profile, summary, available annualized financial statements, and earnings-calendar data are also loaded directly in the APK; internet access is required. Provider values are attributed in the app. A Nasdaq daily close is explicitly labeled as a last close and is never treated as a live quote or used to trigger price alerts. Both providers can delay, throttle, or change their public endpoints; unavailable values remain blank rather than being estimated.

To rebuild the APK after changing the web app:

```bash
npm run build:android
```

For self-hosting or development, Node.js 18 or newer is required. Start the bundled server with:

```bash
npm start
```

Then open `http://localhost:8000`. The bundled server provides the live-data proxy; without it the page remains usable with demo data, but live quote, company, calendar, and symbol-search requests are unavailable.

The cached app shell can open offline after the first successful load, but quotes and provider history require internet access. Alerts are evaluated only while the app is open; Android system notifications require permission in the app. Closed-app monitoring requires a server-side scheduler and push service.

For a frontend-only demo, one option is:

```bash
python3 -m http.server 8000
```

This fallback serves the site and cached demo experience; it does not provide the bundled `/api` live-data routes.

## Current MVP

- Responsive research dashboard for desktop and mobile.
- Watchlist search and signal filtering.
- Deterministic 400+ symbol demo universe with sector-aware search.
- Selected-asset detail panel with a canvas price chart.
- Provider OHLCV history with candlesticks, SMA 20, EMA 9, volume, support/resistance, RSI 14, and MACD context when sufficient provider candles are available.
- `1D`, `7D`, `1M`, `3M`, and `1Y` chart views with intraday/daily provider intervals and timestamps taken from the returned candles.
- Technical setup tags covering trend, moving-average cross, overbought/oversold state, volume expansion, and resistance proximity.
- Selected-asset intelligence summary with ATR, Bollinger Bands, range VWAP, volatility regime, and bull/risk scenarios.
- Company profile panel with business description, sector/industry, market cap, P/E, forward P/E, beta, dividend yield, employees, earnings date, and 52-week range when supplied by the provider.
- Price, percentage-move, RSI, volume, support-break, and resistance-break alert types.
- Price and percentage alerts prompt for their required threshold; RSI and support/resistance alerts use their built-in levels, and volume alerts default to 1.5× average volume when no multiplier is entered.
- Alert persistence with browser `localStorage`.
- Demo market data with a clearly marked provider adapter in `market-data.js`.
- Automatic quote checks for the selected, subscribed, and alert symbols, repeating every 30 seconds by default while the app is open; provider timestamps and stale values are identified.
- Browser notifications through a service worker and Android notifications through the Capacitor local-notification plugin, with permission checks, a test-notification action, and per-alert cooldowns.
- Installable standalone PWA with a browser install prompt, platform instructions, and an app-shell cache for offline access to the demo experience.
- Tracked-stock breadth summary calculated only from fresh provider quotes.
- Two-week Nasdaq earnings calendar for subscribed stocks, with event-time labels, consensus EPS estimates when available, source links, manual refresh, and 15-minute refresh while the page is visible. The app does not invent dates; Nasdaq may omit or revise estimates.

Yahoo Finance's public chart endpoint and Nasdaq's public endpoints may delay, throttle, or change their responses. Quotes and history are timestamped and sourced; Nasdaq daily history is not real-time. Company profile and earnings data identify Nasdaq as their source when available. When providers fail, the app hides illustrative prices and technical indicators instead of presenting them as market data. The app is for research only and not for trading decisions.

### Backend routes

- `GET /api/history?symbol=AAPL&range=1mo&interval=1d` returns Yahoo chart history, with Nasdaq daily history as a fallback when Yahoo is unavailable.
- `GET /api/quote?symbol=AAPL` returns the latest usable Yahoo chart quote, falling back to a timestamped Nasdaq last close when necessary.
- `GET /api/search?q=semiconductor` searches provider symbols for companies, ETFs, indexes, and international instruments.
- `GET /api/profile?symbol=AAPL` prefers Nasdaq company profile, summary, and available financial statements; Yahoo Finance profile data is used as a fallback.
- `GET /api/calendar?symbols=AAPL,MSFT` returns Nasdaq-reported earnings events for tracked symbols over the next two weeks, up to 20 symbols.

The app uses `1D` 15-minute intraday history, `7D` hourly history, and `1M`, `3M`, and `1Y` daily history. Chart axis labels are derived from provider candle timestamps. If the provider is unavailable, existing provider history is retained; illustrative candles are not drawn as if they were real.

### Device notifications

Use **Subscribe** on an asset or create an alert to monitor it; the selected asset is also checked. Open notification settings and choose **Allow device alerts**, then use **Send test notification** to verify device delivery. Android uses its system notification permission and local-notification channel; browsers use service-worker notifications and require `localhost` or HTTPS. Price checks and alerts run only while the app is open. Reliable checks while closed require a server-side scheduler and push service.

The notification controls support price levels, percentage moves, RSI overbought/oversold, volume multiples, support/resistance breaks, 15-, 30-, or 60-second checks, or polling off. Technical alerts are evaluated only when provider history is available, and alerts are not evaluated using stale quotes or when the market is closed. A 30-minute per-alert cooldown prevents repeated device notifications for the same condition.

The selected quote-check interval is a best-effort polling cadence, not a promise that the market-data provider publishes a new price that often. Yahoo's public chart endpoint is unofficial, may return delayed quotes, and may throttle or change without notice. Failed symbols keep their last available provider value marked by its timestamp; the app does not replace it with a demo price. Checks run only while this page is open. There is no dependable, trustworthy no-key provider contract for guaranteed real-time market updates; use a licensed provider and a server-side scheduler/Web Push for production alerts.

The earnings calendar reads Nasdaq's public earnings calendar for the next two weeks and filters it to subscribed stocks, both in the web app and standalone Android APK. Event dates and consensus EPS are provider-reported estimates and may change; source links are provided per event. The calendar refreshes on page load, on request, after subscription changes, and every 15 minutes while the page is visible. Macro events are not included.

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
- `server.js`: static hosting, Yahoo and Nasdaq data adapters, caching, and global symbol search.
- `sw.js`: app-shell caching and operating-system notification display.

A relational database such as PostgreSQL is appropriate for assets, watchlists, alerts, and research notes if the app later needs shared storage. Historical price bars can use a time-series extension or a dedicated time-series store as volume grows.

Use provider adapters rather than coupling the UI to Yahoo Finance, TradingView, Moomoo, or another vendor. Confirm API terms, redistribution rights, rate limits, real-time access, and historical-data licensing before production use.

## Safety and trust

- This is a research and monitoring tool, not financial advice.
- “Best time to buy” should be expressed as a scenario with entry conditions, invalidation conditions, risk/reward, and uncertainty.
- Every news and fundamental claim should link to its source