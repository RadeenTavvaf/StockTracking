/*
 * Signal Desk UI and technical-analysis layer.
 *
 * The calculations are intentionally small and transparent. They provide
 * chart context, not a promise that any indicator predicts the market.
 */
const assets = window.StockData.assets;
const defaultAlerts = [
  { id: 1, symbol: 'AAPL', text: 'Price above $240.00', kind: 'Price level' },
  { id: 2, symbol: 'TSLA', text: 'Price below $340.00', kind: 'Price level' },
  { id: 3, symbol: 'NVDA', text: 'RSI enters overbought', kind: 'Momentum' }
];
let alerts = JSON.parse(localStorage.getItem('stocktracking-alerts') || 'null') || defaultAlerts;
let selectedSymbol = 'AAPL';
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `$${value.toFixed(2)}`;
const closesFor = (asset) => asset.candles.map((candle) => candle.close);

// Rolling averages power both the chart overlays and the setup labels.
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

function technicals(asset) {
  const closes = closesFor(asset);
  const shortEma = ema(closes, 9);
  const longEma = ema(closes, 21);
  const average = sma(closes, 20);
  const rsi = rsiSeries(closes);
  const macd = shortEma.map((value, index) => value - longEma[index]);
  const macdSignal = ema(macd, 9);
  const averageVolume = asset.candles.slice(-20).reduce((sum, candle) => sum + candle.volume, 0) / Math.min(20, asset.candles.length);
  return { closes, shortEma, longEma, average, rsi, macd, macdSignal, averageVolume, currentVolume: asset.candles.at(-1).volume };
}

function signalTags(asset, metrics) {
  const tags = [];
  const trend = metrics.closes.at(-1) > metrics.average.at(-1) ? 'Above SMA 20' : 'Below SMA 20';
  tags.push({ label: trend, tone: trend.startsWith('Above') ? 'positive' : 'negative' });
  tags.push(metrics.shortEma.at(-1) > metrics.longEma.at(-1) ? { label: 'EMA 9 > EMA 21', tone: 'positive' } : { label: 'EMA bearish cross', tone: 'negative' });
  if (asset.rsi >= 70) tags.push({ label: 'Overbought', tone: 'warning' });
  else if (asset.rsi <= 30) tags.push({ label: 'Oversold', tone: 'positive' });
  else tags.push({ label: 'RSI balanced', tone: 'neutral' });
  if (metrics.currentVolume > metrics.averageVolume * 1.4) tags.push({ label: 'Volume expansion', tone: 'warning' });
  if (((asset.resistance - asset.price) / asset.price) * 100 < 2.5) tags.push({ label: 'Near resistance', tone: 'warning' });
  return tags;
}

function renderWatchlist() {
  const query = $('#symbol-search').value.trim().toLowerCase();
  const filter = $('#watchlist-filter').value;
  const rows = assets.filter((asset) => `${asset.symbol} ${asset.name} ${asset.sector}`.toLowerCase().includes(query) && (filter === 'all' || asset.signal === filter));
  $('#watchlist-body').innerHTML = rows.map((asset) => {
    const metrics = technicals(asset);
    return `<tr class="${asset.symbol === selectedSymbol ? 'selected' : ''}" data-symbol="${asset.symbol}">
      <td><div class="asset-cell"><span class="asset-logo">${asset.symbol.slice(0, 2)}</span><span class="asset-name"><strong>${asset.symbol}</strong><span>${asset.name}</span></span></div></td>
      <td><strong>${money(asset.price)}</strong></td>
      <td class="${asset.change >= 0 ? 'metric-positive' : 'risk'}">${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%</td>
      <td><span class="signal-badge ${asset.signal}">${asset.signal[0].toUpperCase() + asset.signal.slice(1)}</span></td>
      <td class="rsi-cell">${metrics.rsi.at(-1).toFixed(0)}</td><td class="volume">${asset.volume}</td><td class="row-menu">···</td>
    </tr>`;
  }).join('');
  $('#empty-watchlist').hidden = rows.length > 0;
  $$('#watchlist-body tr').forEach((row) => row.addEventListener('click', () => selectAsset(row.dataset.symbol)));
}

function selectAsset(symbol) {
  const asset = assets.find((item) => item.symbol === symbol);
  if (!asset) return;
  selectedSymbol = symbol;
  const metrics = technicals(asset);
  $('#detail-symbol').textContent = asset.symbol;
  $('#detail-name').textContent = `${asset.name} · ${asset.sector}`;
  $('#detail-price').textContent = money(asset.price);
  $('#detail-change').textContent = `${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%`;
  $('#detail-change').className = asset.change >= 0 ? 'metric-positive' : 'risk';
  $('#detail-signal').textContent = asset.signal[0].toUpperCase() + asset.signal.slice(1);
  $('#detail-signal').className = `signal-badge ${asset.signal}`;
  $('#detail-support').textContent = money(asset.support);
  $('#detail-resistance').textContent = money(asset.resistance);
  $('#detail-rsi').textContent = metrics.rsi.at(-1).toFixed(1);
  $('#detail-thesis').textContent = asset.thesis;
  $('#create-alert-button').textContent = `Create alert for ${asset.symbol}`;
  $('#tooltip-price').textContent = money(asset.price);
  $('#alert-symbol').value = symbol;
  $('#technique-tags').innerHTML = signalTags(asset, metrics).map((tag) => `<span class="technique-tag ${tag.tone}">${tag.label}</span>`).join('');
  drawChart(asset, metrics);
  renderWatchlist();
}

function drawChart(asset, metrics = technicals(asset)) {
  const canvas = $('#price-chart');
  const context = canvas.getContext('2d');
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth, 280);
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const candles = asset.candles;
  const chartHeight = height * .61;
  const volumeTop = height * .64;
  const lowerTop = height * .80;
  const min = Math.min(...candles.map((candle) => candle.low), asset.support) * .985;
  const max = Math.max(...candles.map((candle) => candle.high), asset.resistance) * 1.015;
  const x = (index) => (index / Math.max(candles.length - 1, 1)) * width;
  const y = (value) => chartHeight - ((value - min) / (max - min)) * (chartHeight - 15) - 8;
  const line = (values, color, lineWidth = 1.5, mapper = y) => { context.beginPath(); values.forEach((value, index) => index ? context.lineTo(x(index), mapper(value)) : context.moveTo(x(index), mapper(value))); context.strokeStyle = color; context.lineWidth = lineWidth; context.stroke(); };
  context.font = '10px Trebuchet MS';
  context.strokeStyle = '#26323a';
  context.lineWidth = 1;
  [0.2, 0.4, 0.6, 0.8].forEach((fraction) => { const gridY = chartHeight * fraction; context.beginPath(); context.moveTo(0, gridY); context.lineTo(width, gridY); context.stroke(); });
  candles.forEach((candle, index) => {
    const candleWidth = Math.max(2, width / candles.length * .52);
    const rising = candle.close >= candle.open;
    context.strokeStyle = rising ? '#d3f36b' : '#ff7774';
    context.fillStyle = rising ? '#d3f36b' : '#ff7774';
    context.beginPath(); context.moveTo(x(index), y(candle.high)); context.lineTo(x(index), y(candle.low)); context.stroke();
    context.fillRect(x(index) - candleWidth / 2, y(Math.max(candle.open, candle.close)), candleWidth, Math.max(1, Math.abs(y(candle.open) - y(candle.close))));
  });
  line(metrics.average, '#86b8ff', 1.4);
  line(metrics.shortEma, '#ff9b62', 1.4);
  const level = (value, color, label) => { const levelY = y(value); context.setLineDash([5, 5]); context.strokeStyle = color; context.beginPath(); context.moveTo(0, levelY); context.lineTo(width, levelY); context.stroke(); context.setLineDash([]); context.fillStyle = color; context.fillText(label, 6, levelY - 4); };
  level(asset.support, '#86b8ff', 'S');
  level(asset.resistance, '#ff9b62', 'R');
  const maxVolume = Math.max(...candles.map((candle) => candle.volume));
  candles.forEach((candle, index) => { const barHeight = (candle.volume / maxVolume) * (height * .12); context.fillStyle = candle.close >= candle.open ? 'rgba(211,243,107,.45)' : 'rgba(255,119,116,.45)'; context.fillRect(x(index) - 1.5, volumeTop + height * .12 - barHeight, 3, barHeight); });
  context.fillStyle = '#616c73';
  context.fillText('VOL', 6, volumeTop + 12);
  const rsiY = (value) => lowerTop + (1 - value / 100) * (height * .16);
  context.strokeStyle = '#26323a';
  context.beginPath(); context.moveTo(0, rsiY(70)); context.lineTo(width, rsiY(70)); context.moveTo(0, rsiY(30)); context.lineTo(width, rsiY(30)); context.stroke();
  line(metrics.rsi, '#d3f36b', 1.4, rsiY);
  context.fillStyle = '#616c73';
  context.fillText('RSI 14', 6, lowerTop + 11);
  const macdMax = Math.max(...metrics.macd.map((value, index) => Math.abs(value - metrics.macdSignal[index])), .001);
  metrics.macd.forEach((value, index) => { const difference = value - metrics.macdSignal[index]; const bar = (difference / macdMax) * (height * .04); context.fillStyle = difference >= 0 ? 'rgba(134,184,255,.65)' : 'rgba(255,155,98,.65)'; context.fillRect(x(index) - 1.5, lowerTop + height * .19 - Math.max(0, bar), 3, Math.abs(bar)); });
  context.fillText('MACD', 6, height - 5);
}

function renderAlerts() {
  $('#alert-count').textContent = `${alerts.length} active`;
  $('#alerts-list').innerHTML = alerts.length ? alerts.map((alert) => `<div class="alert-item"><span class="alert-icon">⌁</span><div><strong>${alert.symbol} · ${alert.text}</strong><p>${alert.kind} · monitoring now</p></div><button class="alert-action" data-alert-id="${alert.id}" title="Delete alert" aria-label="Delete ${alert.symbol} alert">×</button></div>`).join('') : '<p class="empty-state">No active alerts. Add one from an asset detail view.</p>';
  $$('.alert-action').forEach((button) => button.addEventListener('click', () => { alerts = alerts.filter((alert) => alert.id !== Number(button.dataset.alertId)); saveAlerts(); renderAlerts(); showToast('Alert removed'); }));
}

function saveAlerts() { localStorage.setItem('stocktracking-alerts', JSON.stringify(alerts)); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function openAlertDialog() { $('#alert-symbol').innerHTML = assets.map((asset) => `<option value="${asset.symbol}">${asset.symbol} · ${asset.name}</option>`).join(''); $('#alert-symbol').value = selectedSymbol; const current = assets.find((asset) => asset.symbol === selectedSymbol); $('#alert-value').value = current.price.toFixed(2); $('#alert-dialog').showModal(); }

$('#symbol-search').addEventListener('input', renderWatchlist);
$('#watchlist-filter').addEventListener('change', renderWatchlist);
$('#create-alert-button').addEventListener('click', openAlertDialog);
$('#add-symbol-button').addEventListener('click', () => showToast(`${assets.length} symbols loaded in the demo universe`));
$('#view-calendar-button').addEventListener('click', () => showToast('Calendar integration is queued for the next milestone.'));
$('#close-detail').addEventListener('click', () => showToast('Keep one asset selected to compare signals quickly.'));
$('#refresh-button').addEventListener('click', async () => { await window.StockData.getMarketData(); renderWatchlist(); selectAsset(selectedSymbol); showToast('Market snapshot refreshed'); });
$('#alert-form').addEventListener('submit', (event) => { event.preventDefault(); const symbol = $('#alert-symbol').value; const condition = $('#alert-condition').value; const value = Number($('#alert-value').value); const labels = { above: `Price above ${money(value)}`, below: `Price below ${money(value)}`, rsi: 'RSI enters oversold', volume: 'Volume exceeds average' }; alerts.unshift({ id: Date.now(), symbol, text: labels[condition], kind: condition === 'rsi' ? 'Momentum' : 'Price level' }); saveAlerts(); renderAlerts(); $('#alert-dialog').close(); showToast(`${symbol} alert created`); });
$$('.time-tabs button').forEach((button) => button.addEventListener('click', () => { $$('.time-tabs button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); showToast(`${button.dataset.range} view selected`); }));
window.addEventListener('resize', () => { const asset = assets.find((item) => item.symbol === selectedSymbol); if (asset) drawChart(asset); });

renderAlerts();
selectAsset(selectedSymbol);
