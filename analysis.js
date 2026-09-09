/*
 * Technical analysis calculations used by the watchlist and detail panel.
 * These are descriptive measurements, not trading recommendations.
 */
function sma(values, period) {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index - period + 1), index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

function ema(values, period) {
  const multiplier = 2 / (period + 1);
  return values.reduce((result, value, index) => {
    result.push(index === 0 ? value : (value - result[index - 1]) * multiplier + result[index - 1]);
    return result;
  }, []);
}

function rsiSeries(values, period = 14) {
  return values.map((_, index) => {
    const start = Math.max(1, index - period + 1);
    const changes = values.slice(start, index + 1).map((value, offset) => value - values[start - 1 + offset]);
    const gains = changes.filter((change) => change > 0).reduce((sum, change) => sum + change, 0);
    const losses = Math.abs(changes.filter((change) => change < 0).reduce((sum, change) => sum + change, 0));
    if (!losses) return 70;
    return 100 - (100 / (1 + gains / losses));
  });
}

function standardDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
}

function technicalMetrics(asset, closes) {
  const candles = asset.candles;
  const trueRanges = candles.map((candle, index) => {
    const previousClose = index ? candles[index - 1].close : candle.open;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
  });
  const atr = sma(trueRanges, 14).at(-1);
  const bandWindow = closes.slice(-20);
  const bandMiddle = bandWindow.reduce((sum, value) => sum + value, 0) / bandWindow.length;
  const bandWidth = standardDeviation(bandWindow) * 2;
  const current = closes.at(-1);
  const bollingerPosition = bandWidth ? (current - (bandMiddle - bandWidth)) / (bandWidth * 2) : .5;
  const totalVolume = candles.reduce((sum, candle) => sum + (candle.volume || 0), 0);
  const vwap = totalVolume ? candles.reduce((sum, candle) => sum + (((candle.high + candle.low + candle.close) / 3) * (candle.volume || 0)), 0) / totalVolume : current;
  const returns = closes.slice(1).map((value, index) => (value - closes[index]) / closes[index]);
  const volatility = standardDeviation(returns) * 100;
  return { atr, bandMiddle, bandUpper: bandMiddle + bandWidth, bandLower: bandMiddle - bandWidth, bollingerPosition, vwap, volatility };
}

function technicals(asset) {
  const closes = asset.candles.map((candle) => candle.close);
  const shortEma = ema(closes, 9);
  const longEma = ema(closes, 21);
  const average = sma(closes, 20);
  const rsi = rsiSeries(closes);
  const macd = shortEma.map((value, index) => value - longEma[index]);
  const macdSignal = ema(macd, 9);
  const averageVolume = asset.candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(20, asset.candles.length);
  return { closes, shortEma, longEma, average, rsi, macd, macdSignal, averageVolume, currentVolume: asset.candles.at(-1).volume, ...technicalMetrics(asset, closes) };
}

function signalTags(asset, metrics) {
  const tags = [];
  const trend = metrics.closes.at(-1) > metrics.average.at(-1) ? 'Above SMA 20' : 'Below SMA 20';
  tags.push({ label: trend, tone: trend.startsWith('Above') ? 'positive' : 'negative' });
  tags.push(metrics.shortEma.at(-1) > metrics.longEma.at(-1) ? { label: 'EMA 9 > EMA 21', tone: 'positive' } : { label: 'EMA bearish cross', tone: 'negative' });
  const currentRsi = metrics.rsi.at(-1);
  if (currentRsi >= 70) tags.push({ label: 'Overbought', tone: 'warning' });
  else if (currentRsi <= 30) tags.push({ label: 'Oversold', tone: 'positive' });
  else tags.push({ label: 'RSI balanced', tone: 'neutral' });
  if (metrics.currentVolume > metrics.averageVolume * 1.4) tags.push({ label: 'Volume expansion', tone: 'warning' });
  if (((asset.resistance - asset.price) / asset.price) * 100 < 2.5) tags.push({ label: 'Near resistance', tone: 'warning' });
  return tags;
}

function levelClassification(asset) {
  const supportDistance = Math.max(0, ((asset.price - asset.support) / asset.price) * 100);
  const resistanceDistance = Math.max(0, ((asset.resistance - asset.price) / asset.price) * 100);
  const supportTier = supportDistance <= 2 ? 3 : supportDistance <= 5 ? 2 : 1;
  const resistanceTier = resistanceDistance <= 2 ? 3 : resistanceDistance <= 5 ? 2 : 1;
  return {
    support: { code: `SS${supportTier}`, detail: supportTier === 3 ? 'Major demand / tight invalidation' : supportTier === 2 ? 'Tested demand zone' : 'Early support zone' },
    resistance: { code: `RS${resistanceTier}`, detail: resistanceTier === 3 ? 'Major supply / breakout test' : resistanceTier === 2 ? 'Tested supply zone' : 'Overhead supply zone' }
  };
}

function updateRangeLabels(range, count) {
  const labels = { '1D': ['Today', '12:00', '14:00', 'Now'], '5D': ['5 days ago', '4 days', '2 days', 'Now'], '7D': ['7 days ago', '5 days', '2 days', 'Now'], '10D': ['10 days ago', '7 days', '3 days', 'Now'], '1M': ['1 month ago', '3 weeks', '2 weeks', 'Now'], '3M': ['3 months ago', '2 months', '1 month', 'Now'], '1Y': ['1 year ago', '9 months', '6 months', 'Now'] }[range] || ['History', `${Math.round(count * .66)}`, `${Math.round(count * .33)}`, 'Now'];
  ['axis-start', 'axis-mid-a', 'axis-mid-b', 'axis-end'].forEach((id, index) => { $(`#${id}`).textContent = labels[index]; });
}
