import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8000);
const cache = new Map();
const CACHE_MS = 60_000;
const QUOTE_CACHE_MS = 5_000;
const CALENDAR_SYMBOL_LIMIT = 20;
const CALENDAR_LOOKAHEAD_DAYS = 14;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function cached(key, maxAge = CACHE_MS) {
  const entry = cache.get(key);
  return entry && Date.now() - entry.createdAt < maxAge ? entry.value : null;
}

async function yahoo(path, cacheMs = CACHE_MS) {
  const cachedValue = cached(path, cacheMs);
  if (cachedValue) return cachedValue;
  const response = await fetch(`https://query1.finance.yahoo.com${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json', 'User-Agent': 'StockTracking research app' }
  });
  if (!response.ok) throw new Error(`Yahoo responded with ${response.status}`);
  const value = await response.json();
  cache.set(path, { createdAt: Date.now(), value });
  return value;
}

function marketDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function nasdaqEarnings(date) {
  const path = `/api/calendar/earnings?date=${date}`;
  const cacheKey = `nasdaq:${path}`;
  const cachedValue = cached(cacheKey, 15 * 60_000);
  if (cachedValue) return cachedValue;
  const response = await fetch(`https://api.nasdaq.com${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'https://www.nasdaq.com',
      Referer: 'https://www.nasdaq.com/',
      'User-Agent': 'Mozilla/5.0 StockTracking research app'
    }
  });
  if (!response.ok) throw new Error(`Nasdaq responded with ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data?.rows)) throw new Error('Nasdaq returned an invalid earnings calendar');
  cache.set(cacheKey, { createdAt: Date.now(), value: payload.data.rows });
  return payload.data.rows;
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  response.end(JSON.stringify(body));
}

async function handleApi(url, response) {
  if (url.pathname === '/api/history') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9.^=-]/g, '');
    const range = url.searchParams.get('range') || '1mo';
    const interval = url.searchParams.get('interval') || '1d';
    if (!symbol) return sendJson(response, 400, { error: 'symbol is required' });
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&events=history`;
    return sendJson(response, 200, await yahoo(path));
  }
  if (url.pathname === '/api/quote') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9.^=-]/g, '');
    if (!symbol) return sendJson(response, 400, { error: 'symbol is required' });
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true&events=history`;
    const payload = await yahoo(path, QUOTE_CACHE_MS);
    const result = payload.chart?.result?.[0];
    const meta = result?.meta;
    const quote = result?.indicators?.quote?.[0];
    const closes = quote?.close?.filter(Number.isFinite) || [];
    const marketState = meta?.marketState || 'UNKNOWN';
    const extendedPrice = marketState === 'POST'
      ? meta?.postMarketPrice
      : marketState === 'PRE' ? meta?.preMarketPrice : null;
    const extendedTime = marketState === 'POST'
      ? meta?.postMarketTime
      : marketState === 'PRE' ? meta?.preMarketTime : null;
    const hasExtendedPrice = Number.isFinite(extendedPrice) && Number.isFinite(extendedTime);
    const price = hasExtendedPrice ? extendedPrice : Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1);
    const previousClose = Number.isFinite(meta?.chartPreviousClose) ? meta.chartPreviousClose : meta?.previousClose ?? closes.at(-2);
    if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose <= 0) {
      return sendJson(response, 502, { error: 'Provider did not return a usable quote' });
    }
    const quoteTimestamp = hasExtendedPrice ? extendedTime : meta?.regularMarketTime;
    const chartTimestamp = (result.timestamp || []).at(-1);
    const timestampSeconds = Number.isFinite(quoteTimestamp) ? quoteTimestamp : chartTimestamp;
    if (!Number.isFinite(timestampSeconds)) {
      return sendJson(response, 502, { error: 'Provider did not return a quote timestamp' });
    }
    const timestamp = new Date(timestampSeconds * 1000).toISOString();
    const ageSeconds = Math.max(0, Math.floor((Date.now() - timestampSeconds * 1000) / 1000));
    const maxAgeSeconds = marketState === 'REGULAR' ? 15 * 60
      : ['PRE', 'POST'].includes(marketState) ? 60 * 60 : 24 * 60 * 60;
    return sendJson(response, 200, {
      symbol,
      price,
      previousClose,
      changePercent: ((price - previousClose) / previousClose) * 100,
      volume: meta?.regularMarketVolume ?? quote?.volume?.filter(Number.isFinite).at(-1) ?? null,
      timestamp,
      marketState,
      priceType: hasExtendedPrice ? marketState === 'POST' ? 'post-market' : 'pre-market' : 'regular',
      ageSeconds,
      isStale: ageSeconds > maxAgeSeconds,
      source: 'Yahoo Finance chart API'
    });
  }
  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim();
    if (!query) return sendJson(response, 200, { quotes: [] });
    const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
    return sendJson(response, 200, await yahoo(path));
  }
  if (url.pathname === '/api/calendar') {
    const requestedSymbols = [...new Set((url.searchParams.get('symbols') || '')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean))];
    if (!requestedSymbols.length) return sendJson(response, 400, { error: 'At least one symbol is required' });
    const invalidSymbols = requestedSymbols.filter((symbol) => !/^[A-Z0-9.^=-]{1,20}$/.test(symbol));
    if (invalidSymbols.length) return sendJson(response, 400, { error: `Invalid symbols: ${invalidSymbols.join(', ')}` });
    const symbols = requestedSymbols.slice(0, CALENDAR_SYMBOL_LIMIT);
    const trackedSymbols = new Set(symbols);
    const events = [];
    const errors = [];
    const firstDate = new Date(`${marketDate(new Date())}T00:00:00.000Z`);
    const dates = Array.from({ length: CALENDAR_LOOKAHEAD_DAYS }, (_, index) => {
      const date = new Date(firstDate);
      date.setUTCDate(date.getUTCDate() + index);
      return date;
    }).filter((date) => date.getUTCDay() > 0 && date.getUTCDay() < 6);

    for (let index = 0; index < dates.length; index += 5) {
      const batch = dates.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(async (date) => ({
        date,
        rows: await nasdaqEarnings(date.toISOString().slice(0, 10))
      })));
      results.forEach((result, batchIndex) => {
        const date = batch[batchIndex].toISOString().slice(0, 10);
        if (result.status === 'rejected') {
          errors.push({ date, reason: result.reason.message });
          return;
        }
        result.value.rows.forEach((row) => {
          const symbol = row.symbol?.toUpperCase();
          if (!trackedSymbols.has(symbol)) return;
          events.push({
            symbol,
            name: row.name || symbol,
            date: `${result.value.date.toISOString().slice(0, 10)}T12:00:00.000Z`,
            time: row.time === 'time-pre-market' ? 'Before market open' : row.time === 'time-after-hours' ? 'After market close' : 'Time not specified',
            epsForecast: row.epsForecast || null,
            fiscalQuarterEnding: row.fiscalQuarterEnding || null,
            sourceUrl: `https://www.nasdaq.com/market-activity/earnings?date=${date}`
          });
        });
      });
    }

    if (errors.length === dates.length) {
      return sendJson(response, 502, { error: 'Earnings calendar provider requests failed', errors, checkedDates: dates.length });
    }
    return sendJson(response, 200, {
      events: events.sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.symbol.localeCompare(right.symbol)),
      errors,
      checkedSymbols: symbols.length,
      checkedDates: dates.length - errors.length,
      omittedSymbols: requestedSymbols.length - symbols.length,
      updatedAt: new Date().toISOString(),
      source: 'Nasdaq earnings calendar',
      lookaheadDays: CALENDAR_LOOKAHEAD_DAYS
    });
  }
  if (url.pathname === '/api/profile') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9.^=-]/g, '');
    if (!symbol) return sendJson(response, 400, { error: 'symbol is required' });
    const path = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,assetProfile,calendarEvents`;
    const payload = await yahoo(path);
    const result = payload.quoteSummary?.result?.[0] || {};
    const value = (section, key) => result[section]?.[key]?.raw ?? null;
    return sendJson(response, 200, {
      symbol,
      name: result.price?.longName || result.price?.shortName || symbol,
      sector: result.assetProfile?.sector || 'Market asset',
      industry: result.assetProfile?.industry || 'Not classified',
      description: result.assetProfile?.longBusinessSummary || 'No business description was supplied by the provider.',
      marketCap: value('price', 'marketCap'),
      beta: value('defaultKeyStatistics', 'beta') ?? value('summaryDetail', 'beta'),
      pe: value('summaryDetail', 'trailingPE') ?? value('defaultKeyStatistics', 'trailingPE'),
      forwardPe: value('summaryDetail', 'forwardPE'),
      dividendYield: value('summaryDetail', 'dividendYield'),
      fiftyTwoWeekHigh: value('summaryDetail', 'fiftyTwoWeekHigh'),
      fiftyTwoWeekLow: value('summaryDetail', 'fiftyTwoWeekLow'),
      employees: result.assetProfile?.fullTimeEmployees || null,
      website: result.assetProfile?.website || null,
      earningsDate: result.calendarEvents?.earnings?.earningsDate?.[0]?.fmt || null
    });
  }
  return sendJson(response, 404, { error: 'API route not found' });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(url, response);
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(root, requested));
    if (!filePath.startsWith(root)) return response.writeHead(403).end('Forbidden');
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(content);
  } catch (error) {
    if (!response.headersSent) sendJson(response, 502, { error: 'Upstream or file request failed', detail: error.message });
  }
});

server.listen(port, () => console.log(`StockTracking server listening at http://localhost:${port}`));
