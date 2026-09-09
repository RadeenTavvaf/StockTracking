/*
 * Signal Desk UI and technical-analysis layer.
 *
 * The calculations are intentionally small and transparent. They provide
 * chart context, not a promise that any indicator predicts the market.
 */
const assets = window.StockData.assets;
const defaultAlerts = [
  { id: 1, symbol: 'AAPL', condition: 'above', value: 240, text: 'Price above $240.00', kind: 'Price level' },
  { id: 2, symbol: 'TSLA', condition: 'below', value: 340, text: 'Price below $340.00', kind: 'Price level' },
  { id: 3, symbol: 'NVDA', condition: 'rsi-high', value: 70, text: 'RSI enters overbought', kind: 'Momentum' }
];
let alerts = JSON.parse(localStorage.getItem('stocktracking-alerts') || 'null') || defaultAlerts;
alerts = alerts.map((alert) => ({ ...alert, condition: alert.condition || (alert.text.includes('below') ? 'below' : alert.text.includes('RSI') ? 'rsi-high' : 'above'), value: alert.value ?? Number(alert.text.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || 0) }));
let selectedSymbol = 'AAPL';
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `$${value.toFixed(2)}`;
const closesFor = (asset) => asset.candles.map((candle) => candle.close);
let selectedRange = '3M';

function renderProviderStatus() {
  const state = window.StockData.providerState;
  $('#market-source-label').textContent = `· ${state.name}`;
  $('#data-disclaimer').textContent = state.mode === 'live' ? `${state.message} Quotes may be delayed.` : state.message;
  $('#status-dot').style.background = state.mode === 'live' ? 'var(--lime)' : 'var(--orange)';
}

function refreshDerivedSignals() {
  assets.forEach((asset) => {
    const metrics = technicals(asset);
    asset.rsi = metrics.rsi.at(-1);
    asset.signal = asset.rsi > 58 && asset.change > 0 ? 'bullish' : asset.rsi < 43 || asset.change < -1.5 ? 'risk' : 'watch';
  });
}

function renderWatchlist() {
  refreshDerivedSignals();
  const query = $('#symbol-search').value.trim().toLowerCase();
  const filter = $('#watchlist-filter').value;
  const sector = $('#sector-filter').value;
  const rows = assets.filter((asset) => `${asset.symbol} ${asset.name} ${asset.sector}`.toLowerCase().includes(query) && (filter === 'all' || asset.signal === filter) && (sector === 'all' || asset.sector === sector));
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
  $('#detail-atr').textContent = money(metrics.atr);
  $('#detail-atr-note').textContent = `${((metrics.atr / asset.price) * 100).toFixed(1)}% of price per bar`;
  const bollingerLabel = metrics.bollingerPosition >= 1 ? 'Upper band' : metrics.bollingerPosition <= 0 ? 'Lower band' : metrics.bollingerPosition > .6 ? 'Upper half' : metrics.bollingerPosition < .4 ? 'Lower half' : 'Middle';
  $('#detail-bollinger').textContent = bollingerLabel;
  $('#detail-bollinger-note').textContent = `${money(metrics.bandLower)} - ${money(metrics.bandUpper)}`;
  $('#detail-vwap').textContent = money(metrics.vwap);
  $('#detail-vwap-note').textContent = asset.price >= metrics.vwap ? 'Price above VWAP' : 'Price below VWAP';
  const volatilityLabel = metrics.volatility > 3 ? 'High' : metrics.volatility > 1.5 ? 'Moderate' : 'Low';
  $('#detail-volatility').textContent = volatilityLabel;
  $('#detail-volatility-note').textContent = `${metrics.volatility.toFixed(2)}% bar dispersion`;
  const levels = levelClassification(asset);
  $('#support-code').textContent = `${levels.support.code} · Support`;
  $('#support-detail').textContent = levels.support.detail;
  $('#resistance-code').textContent = `${levels.resistance.code} · Resistance`;
  $('#resistance-detail').textContent = levels.resistance.detail;
  $('#bull-scenario').textContent = `${levels.support.code} holds and price confirms above VWAP toward ${levels.resistance.code}.`;
  $('#bear-scenario').textContent = `${levels.support.code} fails; momentum risk increases below ${money(asset.support)}.`;
  $('#detail-thesis').textContent = asset.thesis;
  $('#create-alert-button').textContent = `Create alert for ${asset.symbol}`;
  $('#tooltip-price').textContent = money(asset.price);
  $('#alert-symbol').value = symbol;
  $('#technique-tags').innerHTML = signalTags(asset, metrics).map((tag) => `<span class="technique-tag ${tag.tone}">${tag.label}</span>`).join('');
  drawChart(asset, metrics);
  updateRangeLabels(selectedRange, asset.candles.length);
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
  const levels = levelClassification(asset);
  level(asset.support, '#86b8ff', levels.support.code);
  level(asset.resistance, '#ff9b62', levels.resistance.code);
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
$('#sector-filter').innerHTML += [...new Set(assets.map((asset) => asset.sector))].sort().map((sector) => `<option value="${sector}">${sector}</option>`).join('');
$('#sector-filter').addEventListener('change', renderWatchlist);
$('#create-alert-button').addEventListener('click', openAlertDialog);
$('#notification-settings-button').addEventListener('click', () => { renderNotificationSettings(); $('#notification-dialog').showModal(); });
$('#request-notification-button').addEventListener('click', requestDevicePermission);
$('#add-symbol-button').addEventListener('click', () => { $('#global-symbol-search').value = ''; $('#symbol-results').innerHTML = '<p class="empty-state">Start typing to search.</p>'; $('#symbol-dialog').showModal(); });
let symbolSearchTimer;
$('#global-symbol-search').addEventListener('input', () => {
  clearTimeout(symbolSearchTimer);
  symbolSearchTimer = setTimeout(async () => {
    const query = $('#global-symbol-search').value;
    if (query.trim().length < 2) return;
    $('#symbol-results').innerHTML = '<p class="empty-state">Searching provider universe...</p>';
    const results = await window.StockData.searchSymbols(query);
    $('#symbol-results').innerHTML = results.length ? results.map((quote) => `<button type="button" class="symbol-result" data-symbol="${quote.symbol}"><strong>${quote.symbol}</strong><span>${quote.shortname || quote.longname || 'Market asset'} · ${quote.exchange || quote.quoteType || ''}</span></button>`).join('') : '<p class="empty-state">No provider results. Try a ticker or company name.</p>';
    $$('.symbol-result').forEach((button) => button.addEventListener('click', async () => {
      const quote = results.find((item) => item.symbol === button.dataset.symbol);
      button.disabled = true;
      button.querySelector('span').textContent = 'Loading history...';
      const asset = await window.StockData.addSymbol(quote);
      if (!asset) return showToast('History could not be loaded for that symbol');
      $('#symbol-dialog').close();
      populateSectors();
      renderWatchlist();
      selectAsset(asset.symbol);
      showToast(`${asset.symbol} added to your universe`);
    }));
  }, 300);
});
$('#view-calendar-button').addEventListener('click', () => showToast('Calendar integration is queued for the next milestone.'));
$('#close-detail').addEventListener('click', () => showToast('Keep one asset selected to compare signals quickly.'));
$('#refresh-button').addEventListener('click', async () => { await window.StockData.getMarketData(); renderWatchlist(); selectAsset(selectedSymbol); showToast('Market snapshot refreshed'); });
$('#live-refresh-button').addEventListener('click', async () => {
  const button = $('#live-refresh-button');
  button.disabled = true;
  button.textContent = 'Refreshing...';
  showToast('Trying the public market-data endpoint for the first 20 symbols');
  await window.StockData.getMarketData({ live: true, symbols: assets.slice(0, 20) });
  renderProviderStatus();
  renderWatchlist();
  selectAsset(selectedSymbol);
  evaluateAlerts();
  button.disabled = false;
  button.textContent = 'Live refresh';
  showToast(window.StockData.providerState.message);
});
$('#alert-form').addEventListener('submit', (event) => { event.preventDefault(); const symbol = $('#alert-symbol').value; const condition = $('#alert-condition').value; const value = Number($('#alert-value').value); const labels = { above: `Price above ${money(value)}`, below: `Price below ${money(value)}`, percent: `Daily move exceeds ${value}%`, 'rsi-low': 'RSI enters oversold', 'rsi-high': 'RSI enters overbought', volume: `Volume exceeds ${value || 1.5}x average`, breakout: 'Price breaks resistance', breakdown: 'Price breaks support' }; const kind = ['above', 'below', 'percent', 'breakout', 'breakdown'].includes(condition) ? 'Price level' : 'Momentum'; alerts.unshift({ id: Date.now(), symbol, condition, value, text: labels[condition], kind }); saveAlerts(); renderAlerts(); $('#alert-dialog').close(); showToast(`${symbol} alert created`); });
$('#notification-form').addEventListener('submit', (event) => { event.preventDefault(); notificationSettings = { price: $('#notify-price').checked, momentum: $('#notify-momentum').checked, catalyst: $('#notify-catalyst').checked, interval: Number($('#poll-interval').value) }; saveNotificationSettings(); startPolling(); $('#notification-dialog').close(); showToast('Notification settings saved'); });
$$('.time-tabs button').forEach((button) => button.addEventListener('click', async () => {
  $$('.time-tabs button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  selectedRange = button.dataset.range;
  button.disabled = true;
  await window.StockData.getHistory(selectedSymbol, selectedRange);
  button.disabled = false;
  selectAsset(selectedSymbol);
  showToast(`${selectedRange} history loaded`);
}));
window.addEventListener('resize', () => { const asset = assets.find((item) => item.symbol === selectedSymbol); if (asset) drawChart(asset); });

function populateSectors() {
  const selected = $('#sector-filter').value;
  $('#sector-filter').innerHTML = '<option value="all">All sectors</option>' + [...new Set(assets.map((asset) => asset.sector))].sort().map((sector) => `<option value="${sector}">${sector}</option>`).join('');
  $('#sector-filter').value = [...$('#sector-filter').options].some((option) => option.value === selected) ? selected : 'all';
}

populateSectors();
registerNotifications();
renderAlerts();
renderProviderStatus();
renderNotificationSettings();
startPolling();
selectAsset(selectedSymbol);
