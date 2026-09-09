/*
 * Demo market data module.
 *
 * The generator gives the UI a realistic 120-symbol universe without a network
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
  const sectors = ['Technology', 'Financials', 'Healthcare', 'Consumer Cyclical', 'Industrials', 'Energy', 'Real Estate'];
  const names = { GOOGL: 'Alphabet Inc.', META: 'Meta Platforms', AVGO: 'Broadcom Inc.', AMD: 'Advanced Micro Devices', NFLX: 'Netflix Inc.', CRM: 'Salesforce Inc.', ORCL: 'Oracle Corp.', INTC: 'Intel Corp.', QCOM: 'Qualcomm Inc.', PLTR: 'Palantir Technologies', UBER: 'Uber Technologies', SHOP: 'Shopify Inc.', JPM: 'JPMorgan Chase', V: 'Visa Inc.', MA: 'Mastercard Inc.', DIS: 'Walt Disney Co.', COST: 'Costco Wholesale', WMT: 'Walmart Inc.', XOM: 'Exxon Mobil', LLY: 'Eli Lilly', COIN: 'Coinbase Global' };

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
    const candles = asset.history.map((close, index) => ({ open: index ? asset.history[index - 1] : close, high: Math.max(close, index ? asset.history[index - 1] : close) * 1.01, low: Math.min(close, index ? asset.history[index - 1] : close) * .99, close, volume: 4000000 + index * 250000 }));
    const minimum = Math.min(...asset.history) * .99;
    const maximum = Math.max(...asset.history) * 1.01;
    return { ...asset, candles, volumeHistory: candles.map((candle) => candle.volume), thesis: 'Trend, momentum, and volume are shown as a research setup. Confirm the signal against your risk plan and upcoming catalysts.' };
  }

  const assets = featured.map(enrich);
  universe.forEach((symbol, index) => {
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

  global.StockData = {
    assets,
    async getMarketData() { return assets; },
    source: 'Deterministic demo feed'
  };
})(window);
