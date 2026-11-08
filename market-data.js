/*
 * Demo market data module.
 *
 * The generator gives the UI a broad stock universe without a network
 * dependency. In production, replace StockData.getMarketData with a server-side
 * adapter that normalizes provider data into this same asset shape.
 */
(function createMarketData(global) {
  const featured = [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', price: 237.48, change: 1.84, volume: '42.8M', signal: 'bullish', support: 231.10, resistance: 241.80, rsi: 64.2, history: [228, 230, 229, 232, 231, 234, 233, 237, 235, 237.48] },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', price: 142.61, change: 3.72, volume: '119.4M', signal: 'bullish', support: 136.40, resistance: 146.20, rsi: 68.7, history: [128, 130, 129, 133, 135, 132, 137, 139, 138, 142.61] },
    { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', price: 511.32, change: 0.48, volume: '18.2M', signal: 'watch', support: 503.80, resistance: 518.00, rsi: 55.1, history: [503, 505, 508, 507, 510, 509, 512, 510, 511, 511.32] },
    { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical', price: 347.92, change: -2.16, volume: '88.7M', signal: 'risk', support: 338.50, resistance: 363.00, rsi: 41.8, history: [360, 364, 358, 362, 355, 351, 354, 350, 352, 347.92] },
    { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', price: 232.15, change: 1.12, volume: '31.6M', signal: 'bullish', support: 224.90, resistance: 237.60, rsi: 61.3, history: [221, 224, 223, 226, 228, 227, 230, 229, 231, 232.15] }
  ];
  const universe = 'GOOGL META AVGO AMD NFLX CRM ORCL INTC QCOM MU PLTR UBER SHOP PANW CRWD NOW ADBE TSM ASML ARM JPM BAC GS V MA PYPL COF WFC C JPM C FIS BLK SCHW VTI SPY QQQ DIA IWM XLE XLF XLK XLV XLY XLP XLI XLB XLU XLC SMCI MRVL SNOW DDOG NET MDB ROKU SQ COIN HOOD MSTR DIS CMCSA WBD PARA NFLX NKE SBUX MCD KO PEP COST WMT TGT HD LOW CAT DE BA GE HON LMT RTX UNH JNJ PFE LLY ABBV MRK TMO ISRG CVS XOM CVX COP OXY SLB EOG LIN PLD AMT EQIX CCI IBM ACN TXN AMAT ADI LRCX KLAC UPS FDX CSCO HPQ ORLY AZO'.split(' ');
  const moreUniverse = 'SAP SONY BABA BIDU JD PDD NIO LI XPEV RIO VALE BHP TTE SHEL BP RELX INFY HDB IBN MELI SE GRAB TM JD WIT NOK ERIC STM ZM DOCU OKTA VEEV TWLO GDDY TEAM WDAY INTU PAYX ADP TROW ICE CME CBOE MSCI SPGI MCO AON PGR TRV CB MMC AJG RSG WM DUK SO NEE EXC SRE AEP O ROK PINS ETSY W YUM CMG DPZ TGT TJX ROST LULU DECK ULTA ELF RH WSM MAR HLT ABNB BKNG DAL AAL LUV F TROW GM RIVN LCID CVNA ORLY AZO FISV HPQ DELL NTAP WDC STX KEYS MCHP NXPI ON CFLT PATH ARM HIMS TEM RXRX BEAM MRNA REGN BIIB GILD AMGN ZTS ELAN BMY GSK AZN NVS SNY PBR EOG MPC VLO PSX KMI WMB DVN HAL DVN' .split(' ');
  const additionalUniverse = 'BRK-B AXP ARES KKR BX APO AMP TFC USB PNC CHTR TMUS VZ T FSLR ENPH CEG VST ETN PH CMI EMR ITW NOC GD TDG FICO VRTX MDT BSX ABT DHR SYK ZBH CI HUM MCK COR MO PM CL MDLZ KHC GIS HSY MNST KDP KR DG DLTR CAG PSA WELL VICI EQR AVB VTR CSGP CBRE JLL IAU GLD TLT HYG LQD EFA EEM VXUS VOO VUG VTV ARKK SOXX SMH XBI IYR XLRE IBIT RDDT DUOL APP CAVA RBLX SPOT TTD IOT GEV CORZ TER SWKS QRVO ALNY BMRN INCY EXAS PCVX CRH CARR TT INSM NBIX CYTK CPNG TOST AFRM ZS S FTNT ZBRA IR PWR VRT ARE INVH OHI NDAQ VRSK URI WAB CHWY BROS LANC COKE FI ADT DOCN ACLS COHR MTSI ONTO ENTG LSCC PODD RVTY WAT RMD HOLX AEE ES EIX FE PPL DTE ED WEC CNP CMS EVRG AES PFG RF CFG KEY HBAN FITB ALLY SYF DFS RKT CINF ERIE GL ACGL WRB EG AIZ CBOE DHI LEN PHM NVR TOL BLDR MLM VMC EXP GWW FAST ROP RSG CTAS' .split(' ');
  const fullUniverse = [...new Set([...universe, ...moreUniverse, ...additionalUniverse])];
  const sectors = ['Technology', 'Financials', 'Healthcare', 'Consumer Cyclical', 'Industrials', 'Energy', 'Real Estate'];
  const names = { GOOGL: 'Alphabet Inc.', META: 'Meta Platforms', AVGO: 'Broadcom Inc.', AMD: 'Advanced Micro Devices', NFLX: 'Netflix Inc.', CRM: 'Salesforce Inc.', ORCL: 'Oracle Corp.', INTC: 'Intel Corp.', QCOM: 'Qualcomm Inc.', PLTR: 'Palantir Technologies', UBER: 'Uber Technologies', SHOP: 'Shopify Inc.', JPM: 'JPMorgan Chase', V: 'Visa Inc.', MA: 'Mastercard Inc.', DIS: 'Walt Disney Co.', COST: 'Costco Wholesale', WMT: 'Walmart Inc.', XOM: 'Exxon Mobil', LLY: 'Eli Lilly', COIN: 'Coinbase Global', 'BRK-B': 'Berkshire Hathaway', AXP: 'American Express', ARES: 'Ares Management', KKR: 'KKR & Co.', BX: 'Blackstone', APO: 'Apollo Global Management', CEG: 'Constellation Energy', VST: 'Vistra Corp.', ETN: 'Eaton Corp.', FICO: 'Fair Isaac Corp.', VRTX: 'Vertex Pharmaceuticals', MDT: 'Medtronic', BSX: 'Boston Scientific', ABT: 'Abbott Laboratories', DHR: 'Danaher Corp.', SYK: 'Stryker Corp.', ZBH: 'Zimmer Biomet', HUM: 'Humana Inc.', MCK: 'McKesson Corp.', COR: 'Cencora Inc.', MDLZ: 'Mondelez International', MNST: 'Monster Beverage', CSGP: 'CoStar Group', CBRE: 'CBRE Group', RDDT: 'Reddit Inc.', DUOL: 'Duolingo Inc.', APP: 'AppLovin Corp.', CAVA: 'Cava Group', RBLX: 'Roblox Corp.', SPOT: 'Spotify Technology', TTD: 'The Trade Desk', GEV: 'GE Vernova', CORZ: 'Core Scientific', TOST: 'Toast Inc.', AFRM: 'Affirm Holdings', FTNT: 'Fortinet Inc.', ZBRA: 'Zebra Technologies', VRT: 'Vertiv Holdings', CHWY: 'Chewy Inc.', COKE: 'Coca-Cola Consolidated', FI: 'Fiserv Inc.', CTAS: 'Cintas Corp.' };

  // Deterministic pseudo-randomness keeps screenshots and tests stable across reloads.
  function seeded(seed) {
    let value = 0;
    for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) % 2147483647;
    return () => { value = (value * 48271) % 2147483647; return value / 2147483647; };
  }

  function formatVolume(value) { return `${(value / 1000000).toFixed(1)}M`; }
  function makeHistory(symbol, base, bias) {
    const random = seeded(symbol);
    const candles = [];
    let close = base * (1 - bias * 0.16);
    for (let index = 0; index < 90; index += 1) {
      const drift = bias * 0.006 + (random() - 0.47) * 0.034;
      const open = close;
      close = Math.max(base * 0.55, close * (1 + drift));
      const high = Math.max(open, close) * (1 + random() * 0.012);
      const low = Math.min(open, close) * (1 - random() * 0.012);
      candles.push({ open, high, low, close, volume: 500000 + random() * 6500000 });
    }
    return candles;
  }

  function enrich(asset) {
    const history = [...asset.history];
    while (history.length < 90) history.unshift(history[0] * (1 - (90 - history.length) * .001));
    const candles = history.map((close, index) => ({ open: index ? history[index - 1] : close, high: Math.max(close, index ? history[index - 1] : close) * 1.01, low: Math.min(close, index ? history[index - 1] : close) * .99, close, volume: 4000000 + index * 250000 }));
    return { ...asset, candles, volumeHistory: candles.map((candle) => candle.volume), thesis: 'Trend, momentum, and volume are shown as a research setup. Confirm the signal against your risk plan and upcoming catalysts.' };
  }

  const assets = featured.map(enrich);
  fullUniverse.forEach((symbol, index) => {
    const bias = ((index * 17) % 31 - 15) / 100;
    const base = 18 + ((index * 83) % 480) + (index % 4) * 0.37;
    const candles = makeHistory(symbol, base, bias);
    const price = candles.at(-1).close;
    const previous = candles.at(-2).close;
    const change = ((price - previous) / previous) * 100;
    const closes = candles.slice(-30).map((candle) => candle.close);
    const support = Math.min(...closes) * 0.995;
    const resistance = Math.max(...closes) * 1.005;
    const rsi = Math.max(22, Math.min(78, 50 + bias * 100 + change * 2));
    const signal = rsi > 58 && change > 0 ? 'bullish' : rsi < 43 || change < -1.5 ? 'risk' : 'watch';
    assets.push({ symbol, name: names[symbol] || `${symbol} Holdings`, sector: sectors[index % sectors.length], price, change, volume: formatVolume(candles.at(-1).volume), signal, support, resistance, rsi, candles, volumeHistory: candles.map((candle) => candle.volume), thesis: `${sectors[index % sectors.length]} setup with ${signal} momentum. Compare trend, relative strength, volume confirmation, and catalyst risk before acting.` });
  });

  assets.forEach((asset) => { asset.baseCandles = asset.candles.map((candle) => ({ ...candle })); });

  const providerState = {
    name: 'Deterministic demo feed',
    mode: 'demo',
    updatedAt: new Date().toISOString(),
    liveSymbols: 0,
    receivedSymbols: 0,
    freshSymbols: 0,
    checkedSymbols: 0,
    refreshedSymbols: [],
    staleSymbols: [],
    failedSymbols: [],
    message: 'Track a stock to start live quote checks.'
  };

  function normalizedAsset(asset, chart) {
    const result = chart?.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    const timestamps = result?.timestamp || [];
    if (!result || !quote || timestamps.length < 2) return null;
    const candles = timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toISOString(),
      open: quote.open?.[index], high: quote.high?.[index], low: quote.low?.[index], close: quote.close?.[index], volume: quote.volume?.[index]
    })).filter((candle) => Number.isFinite(candle.close) && Number.isFinite(candle.open));
    if (candles.length < 2) return null;
    const latest = candles.at(-1).close;
    const previous = candles.at(-2).close;
    const recentCloses = candles.slice(-30).map((candle) => candle.close);
    return Object.assign(asset, {
      price: latest,
      change: ((latest - previous) / previous) * 100,
      volume: `${(candles.at(-1).volume / 1000000).toFixed(1)}M`,
      support: Math.min(...recentCloses) * .995,
      resistance: Math.max(...recentCloses) * 1.005,
      candles,
      volumeHistory: candles.map((candle) => candle.volume),
      dataSource: 'Yahoo Finance chart API',
      dataTimestamp: candles.at(-1).time
    });
  }

  const ranges = {
    '1D': { range: '1d', interval: '15m' },
    '7D': { range: '1mo', interval: '1h', bars: 42 },
    '1M': { range: '1mo', interval: '1d' },
    '3M': { range: '3mo', interval: '1d' },
    '1Y': { range: '1y', interval: '1d' }
  };

  function providerUrl(symbol, range, interval) {
    const query = `symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
    return global.location?.protocol === 'http:' || global.location?.protocol === 'https:'
      ? `/api/history?${query}`
      : `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&events=history`;
  }

  async function fetchChart(symbol, range = '6mo', interval = '1d') {
    const endpoint = providerUrl(symbol, range, interval);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchLiveQuote(asset) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(asset.symbol)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      const quote = await response.json();
      if (!response.ok) throw new Error(quote.error || quote.detail || `Provider returned HTTP ${response.status}`);
      if (!Number.isFinite(quote.price) || !Number.isFinite(quote.changePercent)) {
        throw new Error('Provider returned an unusable quote');
      }
      asset.price = quote.price;
      asset.change = quote.changePercent;
      if (Number.isFinite(quote.volume)) asset.volume = formatVolume(quote.volume);
      asset.dataSource = quote.source;
      asset.dataTimestamp = quote.timestamp;
      asset.quoteTimestamp = quote.timestamp;
      asset.marketState = quote.marketState;
      asset.priceType = quote.priceType;
      asset.quoteAgeSeconds = quote.ageSeconds;
      asset.quoteFresh = !quote.isStale;
      return asset;
    } catch (error) {
      throw new Error(error.name === 'AbortError' ? 'Quote request timed out' : error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getHistory(symbol, key = '1M') {
    const asset = assets.find((item) => item.symbol === symbol);
    if (!asset) return null;
    const spec = ranges[key] || ranges['1M'];
    try {
      const chart = await fetchChart(symbol, spec.range, spec.interval);
      // Changing chart history must not replace a newer quote with an older close.
      const currentQuote = asset.quoteTimestamp ? {
        price: asset.price,
        change: asset.change,
        volume: asset.volume,
        dataSource: asset.dataSource,
        dataTimestamp: asset.dataTimestamp,
        quoteTimestamp: asset.quoteTimestamp,
        marketState: asset.marketState,
        priceType: asset.priceType,
        quoteAgeSeconds: asset.quoteAgeSeconds,
        quoteFresh: asset.quoteFresh
      } : null;
      normalizedAsset(asset, chart);
      if (spec.bars) asset.candles = asset.candles.slice(-spec.bars);
      asset.volumeHistory = asset.candles.map((candle) => candle.volume);
      asset.displayRange = key;
      if (currentQuote) Object.assign(asset, currentQuote);
    } catch (error) {
      // A local range is still rendered when the backend or provider is unavailable.
      const source = asset.baseCandles || asset.candles;
      const sizes = { '1D': 12, '7D': 42, '1M': 45, '3M': 75, '1Y': source.length };
      asset.candles = source.slice(-Math.min(sizes[key] || source.length, source.length));
      asset.displayRange = key;
    }
    return asset;
  }

  async function searchSymbols(query) {
    if (!query.trim()) return [];
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      if (!response.ok) throw new Error('Search unavailable');
      return (await response.json()).quotes || [];
    } catch (error) {
      return [];
    }
  }

  async function getCompanyProfile(symbol) {
    try {
      const response = await fetch(`/api/profile?symbol=${encodeURIComponent(symbol)}`);
      if (!response.ok) throw new Error('Profile unavailable');
      return await response.json();
    } catch (error) {
      const asset = assets.find((item) => item.symbol === symbol);
      return asset ? { symbol, name: asset.name, sector: asset.sector, description: `${asset.name} is represented by the local research universe. Live business profile data was unavailable for this request.` } : null;
    }
  }

  async function addSymbol(quote) {
    const symbol = quote.symbol?.toUpperCase();
    if (!symbol || assets.some((asset) => asset.symbol === symbol)) return assets.find((asset) => asset.symbol === symbol);
    const asset = { symbol, name: quote.shortname || quote.longname || symbol, sector: quote.quoteType || 'Market asset', price: 0, change: 0, volume: '0', signal: 'watch', support: 0, resistance: 0, rsi: 50, candles: [], volumeHistory: [], thesis: 'Live provider data is loading for this asset.' };
    try {
      const normalized = normalizedAsset(asset, await fetchChart(symbol, '3mo', '1d'));
      if (!normalized) return null;
    } catch (error) {
      return null;
    }
    assets.push(asset);
    return asset;
  }

  let liveRefreshPromise;

  async function refreshLiveData(symbols = assets.slice(0, 20)) {
    if (liveRefreshPromise) {
      await liveRefreshPromise;
      return refreshLiveData(symbols);
    }
    liveRefreshPromise = performLiveRefresh(symbols);
    try {
      return await liveRefreshPromise;
    } finally {
      liveRefreshPromise = null;
    }
  }

  async function performLiveRefresh(symbols) {
    const refreshedSymbols = [];
    const receivedSymbols = [];
    const staleSymbols = [];
    const failedSymbols = [];
    const quoteAssets = symbols.map((item) => ({
      asset: typeof item === 'string' ? assets.find((asset) => asset.symbol === item) : item,
      symbol: typeof item === 'string' ? item : item?.symbol
    }));
    quoteAssets.filter((item) => !item.asset).forEach((item) => {
      failedSymbols.push({ symbol: item.symbol || 'Unknown symbol', reason: 'Symbol is not available in the local market universe' });
    });
    const validAssets = quoteAssets.filter((item) => item.asset);

    for (let index = 0; index < validAssets.length; index += 5) {
      const batch = validAssets.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map((item) => fetchLiveQuote(item.asset)));
      results.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          receivedSymbols.push(result.value.symbol);
          if (result.value.quoteFresh) refreshedSymbols.push(result.value.symbol);
          else staleSymbols.push(result.value.symbol);
        } else failedSymbols.push({ symbol: batch[batchIndex].symbol, reason: result.reason.message });
      });
    }

    const freshSymbols = refreshedSymbols.length;
    providerState.liveSymbols = freshSymbols;
    providerState.receivedSymbols = receivedSymbols.length;
    providerState.freshSymbols = freshSymbols;
    providerState.checkedSymbols = symbols.length;
    providerState.refreshedSymbols = refreshedSymbols;
    providerState.staleSymbols = staleSymbols;
    providerState.failedSymbols = failedSymbols;
    providerState.mode = freshSymbols ? 'live' : receivedSymbols.length ? 'stale' : 'error';
    providerState.name = receivedSymbols.length ? 'Yahoo Finance quotes' : 'Yahoo Finance unavailable';
    providerState.updatedAt = new Date().toISOString();
    const failureDetails = failedSymbols.slice(0, 2).map(({ symbol, reason }) => `${symbol}: ${reason}`).join('; ');
    const remainingFailures = failedSymbols.length > 2 ? `; and ${failedSymbols.length - 2} more` : '';
    const staleMessage = staleSymbols.length ? ` Stale: ${staleSymbols.slice(0, 3).join(', ')}${staleSymbols.length > 3 ? ` and ${staleSymbols.length - 3} more` : ''}.` : '';
    const failureMessage = failureDetails ? ` Failed: ${failureDetails}${remainingFailures}.` : '';
    providerState.message = freshSymbols
      ? `${freshSymbols} of ${symbols.length} requested quotes are fresh; ${receivedSymbols.length} received.${staleMessage}${failureMessage} Provider timestamps are shown per stock.`
      : receivedSymbols.length
        ? `Yahoo Finance returned ${receivedSymbols.length} quote${receivedSymbols.length === 1 ? '' : 's'}, but all are stale.${failureMessage}`
        : `No provider quotes were received; showing demo or last available values.${failureMessage}`;
    return assets;
  }

  global.StockData = {
    assets,
    providerState,
    async getMarketData(options = {}) { return options.live ? refreshLiveData(options.symbols) : assets; },
    refreshLiveData,
    getHistory,
    searchSymbols,
    getCompanyProfile,
    addSymbol,
    ranges,
    source: providerState.name
  };
})(window);
