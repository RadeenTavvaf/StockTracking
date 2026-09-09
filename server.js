import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8000);
const cache = new Map();
const CACHE_MS = 60_000;
const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function cached(key) {
  const entry = cache.get(key);
  return entry && Date.now() - entry.createdAt < CACHE_MS ? entry.value : null;
}

async function yahoo(path) {
  const cachedValue = cached(path);
  if (cachedValue) return cachedValue;
  const response = await fetch(`https://query1.finance.yahoo.com${path}`, { headers: { Accept: 'application/json', 'User-Agent': 'StockTracking research app' } });
  if (!response.ok) throw new Error(`Yahoo responded with ${response.status}`);
  const value = await response.json();
  cache.set(path, { createdAt: Date.now(), value });
  return value;
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
  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim();
    if (!query) return sendJson(response, 200, { quotes: [] });
    const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0`;
    return sendJson(response, 200, await yahoo(path));
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
