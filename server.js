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
const NASDAQ_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
  'User-Agent': 'Mozilla/5.0 StockTracking research app'
};
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
    headers: NASDAQ_HEADERS
  });
  if (!response.ok) throw new Error(`Nasdaq responded with ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data?.rows)) throw new Error('Nasdaq returned an invalid earnings calendar');
  cache.set(cacheKey, { createdAt: Date.now(), value: payload.data.rows });
  return payload.data.rows;
}

async function nasdaqJson(path, cacheMs = CACHE_MS) {
  const cacheKey = `nasdaq:${path}`;
  const cachedValue = cached(cacheKey, cacheMs);
  if (cachedValue) return cachedValue;
  const response = await fetch(`https://api.nasdaq.com${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: NASDAQ_HEADERS
  });
  if (!response.ok) throw new Error(`Nasdaq responded with ${response.status}`);
  const payload = await response.json();
  if (payload.status?.rCode !== 200 || payload.data == null) {
    throw new Error(payload.status?.bCodeMessage?.[0]?.errorMessage || 'Nasdaq returned no data');
  }
  cache.set(cacheKey, { createdAt: Date.now(), value: payload.data });
  return payload.data;
}

function nasdaqNumber(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function nasdaqFinancialValue(table, label) {
  const row = table?.rows?.find((item) => item.value1?.toLowerCase() === label.toLowerCase());
  return nasdaqNumber(row?.value2);
}

async function nasdaqProfile(symbol) {
  const encoded = encodeURIComponent(symbol);
  const [profile, summary, financials] = await Promise.all([
    nasdaqJson(`/api/company/${encoded}/company-profile`),
    nasdaqJson(`/api/quote/${encoded}/summary?assetclass=stocks`).catch((error) => {
      console.warn(`Nasdaq quote summary unavailable for ${symbol}: ${error.message}`);
      return null;
    }),
    nasdaqJson(`/api/company/${encoded}/financials?limit=1`).catch((error) => {
      console.warn(`Nasdaq financials unavailable for ${symbol}: ${error.message}`);
      return null;
    })
  ]);
  const profileFields = profile.CompanyProfile || profile;
  const summaryData = summary?.summaryData || {};
  const range = summaryData.FiftTwoWeekHighLow?.value?.split('/') || [];
  const dividendYield = nasdaqNumber(summaryData.Yield?.value);
  const financialPeriod = financials?.incomeStatementTable?.headers?.value2 || null;
  return {
    symbol,
    name: profileFields.CompanyName?.value || symbol,
    sector: profileFields.Sector?.value || summaryData.Sector?.value || 'Not classified',
    industry: profileFields.Industry?.value || summaryData.Industry?.value || 'Not classified',
    description: profileFields.CompanyDescription?.value || 'No company description was supplied by Nasdaq.',
    marketCap: nasdaqNumber(summaryData.MarketCap?.value),
    beta: null,
    pe: null,
    forwardPe: null,
    dividendYield: dividendYield === null ? null : dividendYield / 100,
    annualDividend: nasdaqNumber(summaryData.AnnualizedDividend?.value),
    fiftyTwoWeekHigh: nasdaqNumber(range[0]),
    fiftyTwoWeekLow: nasdaqNumber(range[1]),
    website: profileFields.CompanyUrl?.value || null,
    exchange: summaryData.Exchange?.value || null,
    revenue: nasdaqFinancialValue(financials?.incomeStatementTable, 'Total Revenue'),
    netIncome: nasdaqFinancialValue(financials?.incomeStatementTable, 'Net Income'),
    fiscalPeriod: financialPeriod,
    source: 'Nasdaq company data',
    sourceUrl: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}`
  };
}

function nasdaqHistoryPath(symbol, fromDate, toDate, limit) {
  return `/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${fromDate}&todate=${toDate}&limit=${limit}`;
}

function parseNasdaqHistoricalRow(row) {
  const date = new Date(`${row.date} UTC`);
  const open = nasdaqNumber(row.open);
  const high = nasdaqNumber(row.high);
  const low = nasdaqNumber(row.low);
  const close = nasdaqNumber(row.close);
  const volume = nasdaqNumber(row.volume);
  if (!Number.isFinite(date.getTime()) || ![open, high, low, close].every(Number.isFinite) || close <= 0) return null;
  return { date, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

async function nasdaqHistorical(symbol, days = 7, limit = 10) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  const path = nasdaqHistoryPath(
    symbol,
    start.toISOString().slice(0, 10),
    end.toISOString().slice(0, 10),
    limit
  );
  const data = await nasdaqJson(path, QUOTE_CACHE_MS);
  const rows = data.tradesTable?.rows?.map(parseNasdaqHistoricalRow).filter(Boolean) || [];
  if (!rows.length) throw new Error('Nasdaq returned no valid historical prices');
  return rows.sort((left, right) => left.date - right.date);
}

function nasdaqQuote(symbol, rows) {
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  if (!latest || !previous || previous.close <= 0) throw new Error('Nasdaq returned insufficient history to calculate a quote');
  const timestamp = latest.date.toISOString();
  const ageSeconds = Math.max(0, Math.floor((Date.now() - latest.date.getTime()) / 1000));
  return {
    symbol,
    price: latest.close,
    previousClose: previous.close,
    changePercent: ((latest.close - previous.close) / previous.close) * 100,
    volume: latest.volume,
    timestamp,
    marketState: 'CLOSED',
    priceType: 'last close',
    ageSeconds,
    isStale: ageSeconds > 4 * 24 * 60 * 60,
    source: 'Nasdaq historical daily data'
  };
}

function nasdaqChart(symbol, rows) {
  const candles = [...rows].reverse();
  return {
    chart: {
      result: [{
        meta: { symbol, currency: 'USD', exchangeName: 'Nasdaq', dataGranularity: '1d' },
        timestamp: candles.map((candle) => Math.floor(candle.date.getTime() / 1000)),
        indicators: {
          quote: [{
            open: candles.map((candle) => candle.open),
            high: candles.map((candle) => candle.high),
            low: candles.map((candle) => candle.low),
            close: candles.map((candle) => candle.close),
            volume: candles.map((candle) => candle.volume)
          }]
        }
      }],
      error: null
    }
  };
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
    try {
      const payload = await yahoo(path);
      if (payload.chart?.result?.[0]?.timestamp?.length) return sendJson(response, 200, payload);
      throw new Error(payload.chart?.error?.description || 'Yahoo returned no historical rows');
    } catch (error) {
      if (interval !== '1d') throw error;
      console.warn(`Yahoo history unavailable for ${symbol}; trying Nasdaq: ${error.message}`);
      const days = range === '1y' ? 370 : range === '3mo' ? 100 : 40;
      return sendJson(response, 200, nasdaqChart(symbol, await nasdaqHistorical(symbol, days, 260)));
    }
  }
  if (url.pathname === '/api/quote') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9.^=-]/g, '');
    if (!symbol) return sendJson(response, 400, { error: 'symbol is required' });
    const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m&includePrePost=true&events=history`;
    let payload;
    try {
      payload = await yahoo(path, QUOTE_CACHE_MS);
    } catch (error) {
      console.warn(`Yahoo quote unavailable for ${symbol}; trying Nasdaq: ${error.message}`);
      return sendJson(response, 200, nasdaqQuote(symbol, await nasdaqHistorical(symbol, 7, 10)));
    }
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
      console.warn(`Yahoo quote unusable for ${symbol}; trying Nasdaq historical data`);
      return sendJson(response, 200, nasdaqQuote(symbol, await nasdaqHistorical(symbol, 7, 10)));
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
      : ['PRE', 'POST'].includes(marketState) ? 60 * 60
        : marketState === 'CLOSED' ? 24 * 60 * 60 : 15 * 60;
    return sendJson(response, 200, {
      symbol,
      price,
      previousClose,
      changePercent: ((price - previousClose) / previousClose) * 100,
      volume: meta?.regularMarketVolume ?? quote?.volume?.filter(Number.isFinite).at(-1) ?? null,
      timestamp,
      marketState,
      priceType: hasExtendedPrice ? marketState === 'POST' ? 'post-market' : 'pre-market'
        : marketState === 'CLOSED' ? 'last close' : 'regular',
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
    try {
      return sendJson(response, 200, await nasdaqProfile(symbol));
    } catch (nasdaqError) {
      const path = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,assetProfile,calendarEvents`;
      try {
        const payload = await yahoo(path);
        const result = payload.quoteSummary?.result?.[0] || {};
        const value = (section, key) => result[section]?.[key]?.raw ?? null;
        console.warn(`Nasdaq profile unavailable for ${symbol}; using Yahoo profile: ${nasdaqError.message}`);
        return sendJson(response, 200, {
          symbol,
          name: result.price?.longName || result.price?.shortName || symbol,
          sector: result.assetProfile?.sector || 'Not classified',
          industry: result.assetProfile?.industry || 'Not classified',
          description: result.assetProfile?.longBusinessSummary || 'No company description was supplied by Yahoo Finance.',
          marketCap: value('price', 'marketCap'),
          beta: value('defaultKeyStatistics', 'beta') ?? value('summaryDetail', 'beta'),
          pe: value('summaryDetail', 'trailingPE') ?? value('defaultKeyStatistics', 'trailingPE'),
          forwardPe: value('summaryDetail', 'forwardPE'),
          dividendYield: value('summaryDetail', 'dividendYield'),
          annualDividend: value('summaryDetail', 'dividendRate'),
          fiftyTwoWeekHigh: value('summaryDetail', 'fiftyTwoWeekHigh'),
          fiftyTwoWeekLow: value('summaryDetail', 'fiftyTwoWeekLow'),
          employees: result.assetProfile?.fullTimeEmployees || null,
          website: result.assetProfile?.website || null,
          earningsDate: result.calendarEvents?.earnings?.earningsDate?.[0]?.fmt || null,
          source: 'Yahoo Finance profile',
          sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`
        });
      } catch (yahooError) {
        throw new Error(`Company profile providers failed. Nasdaq: ${nasdaqError.message}; Yahoo Finance: ${yahooError.message}`);
      }
    }
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
