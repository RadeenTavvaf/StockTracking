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
  const result = values.map(() => 50);
  if (values.length < 2) return result;
  const seedLength = Math.min(period, values.length - 1);
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= seedLength; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= seedLength;
  averageLoss /= seedLength;
  const calculate = () => averageLoss === 0 ? averageGain === 0 ? 50 : 100
    : 100 - (100 / (1 + averageGain / averageLoss));
  result[seedLength] = calculate();
  for (let index = seedLength + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = calculate();
  }
  return result;
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
  if (metrics.averageVolume > 0 && metrics.currentVolume > metrics.averageVolume * 1.4) tags.push({ label: 'Volume expansion', tone: 'warning' });
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

function updateRangeLabels(range, candles) {
  const axis = ['axis-start', 'axis-mid-a', 'axis-mid-b', 'axis-end'];
  if (!candles.length || candles.some((candle) => !Number.isFinite(Date.parse(candle.time)))) {
    axis.forEach((id) => { $(`#${id}`).textContent = '—'; });
    return;
  }
  const indices = [0, Math.floor((candles.length - 1) / 3), Math.floor((candles.length - 1) * 2 / 3), candles.length - 1];
  const options = range === '1D' || range === '7D'
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : range === '1Y' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' };
  const labels = indices.map((index) => new Date(candles[index].time).toLocaleString(undefined, options));
  axis.forEach((id, index) => { $(`#${id}`).textContent = labels[index]; });
}
