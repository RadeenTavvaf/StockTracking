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
let alerts = [];
let selectedSymbol = 'AAPL';
let toastTimer;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `$${value.toFixed(2)}`;
const closesFor = (asset) => asset.candles.map((candle) => candle.close);
let selectedRange = '3M';

function loadAlerts() {
  const saved = StockAuth.isGuest() ? [] : StockAuth.load('alerts', defaultAlerts);
  alerts = saved.map((alert) => ({ ...alert, condition: alert.condition || (alert.text.includes('below') ? 'below' : alert.text.includes('RSI') ? 'rsi-high' : 'above'), value: alert.value ?? Number(alert.text.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || 0) }));
}

function renderAccountState() {
  const account = StockAuth.current();
  const button = $('#account-button');
  button.textContent = account.mode === 'guest' ? 'Guest mode' : account.label;
  button.title = account.mode === 'guest' ? 'Guest research mode: tracking is disabled' : `Tracking as ${account.label}`;
  $('#auth-title').textContent = account.mode === 'guest' ? 'Track your research' : `Account: ${account.label}`;
  $('#auth-copy').textContent = account.mode === 'guest' ? 'Guest mode lets you browse live research without saving alerts or tracking stocks on this device.' : 'Your alerts and notification preferences are scoped to this local prototype account.';
  $('#guest-mode-button').hidden = account.mode !== 'guest';
  $('#logout-button').hidden = account.mode === 'guest';
  $('#auth-submit').hidden = account.mode !== 'guest';
  $('#auth-username').hidden = account.mode !== 'guest';
  $('#auth-password').hidden = account.mode !== 'guest';
  $('.auth-tabs').hidden = account.mode !== 'guest';
  if (account.mode !== 'guest') $('#auth-message').textContent = 'You are tracking stocks with this local account.';
}

function renderTrackingState() {
  const button = $('#track-symbol-button');
  const tracked = isTracked(selectedSymbol);
  button.textContent = StockAuth.isGuest() ? 'Log in to track' : tracked ? `Untrack ${selectedSymbol}` : `Track ${selectedSymbol}`;
  button.title = StockAuth.isGuest() ? 'Sign in to save this symbol' : tracked ? 'Remove this symbol from your tracked list' : 'Save this symbol to your account';
}

function renderPortfolio() {
  const portfolio = portfolioPositions();
  const unrealized = portfolio.holdings.reduce((sum, holding) => sum + holding.unrealizedPnl, 0);
  $('#portfolio-market-value').textContent = formatLargeNumber(portfolio.marketValue) || '$0.00';
  $('#portfolio-cost-basis').textContent = formatLargeNumber(portfolio.costBasis) || '$0.00';
  $('#portfolio-unrealized').textContent = formatLargeNumber(unrealized) || '$0.00';
  $('#portfolio-realized').textContent = formatLargeNumber(portfolio.realizedPnl) || '$0.00';
  $('#portfolio-unrealized').className = unrealized >= 0 ? 'metric-positive' : 'risk';
  $('#portfolio-realized').className = portfolio.realizedPnl >= 0 ? 'metric-positive' : 'risk';
  $('#portfolio-body').innerHTML = portfolio.holdings.map((holding) => `<tr><td><strong>${holding.symbol}</strong><span class="portfolio-name">${holding.asset?.name || 'Market asset'}</span></td><td>${holding.quantity.toFixed(4)}</td><td>${money(holding.costBasis / holding.quantity)}</td><td>${money(holding.price)}</td><td>${formatLargeNumber(holding.marketValue)}</td><td class="${holding.returnPct >= 0 ? 'metric-positive' : 'risk'}">${holding.returnPct >= 0 ? '+' : ''}${holding.returnPct.toFixed(2)}%</td></tr>`).join('');
  $('#portfolio-empty').hidden = portfolio.holdings.length > 0;
  if (!StockAuth.isGuest() && portfolio.holdings.length === 0) $('#portfolio-empty').textContent = 'No positions yet. Add a buy transaction to begin tracking.';
}

function openTransactionDialog() {
  if (StockAuth.isGuest()) return openAccountDialog();
  $('#transaction-symbol').innerHTML = assets.map((asset) => `<option value="${asset.symbol}">${asset.symbol} · ${asset.name}</option>`).join('');
  $('#transaction-symbol').value = selectedSymbol;
  $('#transaction-price').value = (assets.find((asset) => asset.symbol === selectedSymbol)?.price || 0).toFixed(2);
  $('#transaction-dialog').showModal();
}

function openAccountDialog() {
  renderAccountState();
  $('#auth-dialog').showModal();
}

function renderProviderStatus() {
  const state = window.StockData.providerState;
  $('#market-source-label').textContent = `· ${state.name}`;
  $('#data-disclaimer').textContent = state.mode === 'live' ? `${state.message} Quotes may be delayed.` : state.message;
  $('#status-dot').style.background = state.mode === 'live' ? 'var(--lime)' : 'var(--orange)';
}

function renderMarketClock() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(now);
  const timeParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now);
  const weekday = timeParts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(timeParts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(timeParts.find((part) => part.type === 'minute')?.value || 0);
  const open = !['Sat', 'Sun'].includes(weekday) && (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;
  $('#today-label').textContent = dateLabel;
  $('#market-status-label').textContent = open ? 'US market open' : 'US market closed';
}

function formatLargeNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return money(value);
}

function formatRatio(value) { return Number.isFinite(value) ? value.toFixed(2) : '—'; }

async function loadCompanyProfile(symbol) {
  $('#profile-status').textContent = 'Loading profile';
  const profile = await window.StockData.getCompanyProfile(symbol);
  if (!profile) return;
  $('#company-profile-name').textContent = profile.name || symbol;
  $('#company-description').textContent = profile.description || 'No business description was supplied by the provider.';
  $('#company-market-cap').textContent = formatLargeNumber(profile.marketCap);
  $('#company-pe').textContent = formatRatio(profile.pe);
  $('#company-forward-pe').textContent = formatRatio(profile.forwardPe);
  $('#company-beta').textContent = formatRatio(profile.beta);
  $('#company-dividend').textContent = Number.isFinite(profile.dividendYield) ? `${(profile.dividendYield * 100).toFixed(2)}%` : '—';
  $('#company-range').textContent = Number.isFinite(profile.fiftyTwoWeekLow) && Number.isFinite(profile.fiftyTwoWeekHigh) ? `${money(profile.fiftyTwoWeekLow)} - ${money(profile.fiftyTwoWeekHigh)}` : '—';
  $('#company-footnote').textContent = [profile.industry, profile.employees ? `${profile.employees.toLocaleString()} employees` : '', profile.earningsDate ? `Earnings ${profile.earningsDate}` : ''].filter(Boolean).join(' · ') || 'Fundamentals are informational and may be delayed.';
  $('#profile-status').textContent = profile.description?.includes('unavailable') ? 'Fallback profile' : 'Provider profile';
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
  renderTrackingState();
  $('#tooltip-price').textContent = money(asset.price);
  $('#alert-symbol').value = symbol;
  $('#technique-tags').innerHTML = signalTags(asset, metrics).map((tag) => `<span class="technique-tag ${tag.tone}">${tag.label}</span>`).join('');
  drawChart(asset, metrics);
  updateRangeLabels(selectedRange, asset.candles.length);
  renderWatchlist();
  loadCompanyProfile(symbol);
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

function saveAlerts() { StockAuth.save('alerts', alerts); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }
function openAlertDialog() { $('#alert-symbol').innerHTML = assets.map((asset) => `<option value="${asset.symbol}">${asset.symbol} · ${asset.name}</option>`).join(''); $('#alert-symbol').value = selectedSymbol; const current = assets.find((asset) => asset.symbol === selectedSymbol); $('#alert-value').value = current.price.toFixed(2); $('#alert-dialog').showModal(); }

$('#symbol-search').addEventListener('input', renderWatchlist);
$('#watchlist-filter').addEventListener('change', renderWatchlist);
$('#sector-filter').innerHTML += [...new Set(assets.map((asset) => asset.sector))].sort().map((sector) => `<option value="${sector}">${sector}</option>`).join('');
$('#sector-filter').addEventListener('change', renderWatchlist);
$('#create-alert-button').addEventListener('click', () => { if (!StockAuth.canTrack()) return showToast('Log in or sign up to track alerts'); openAlertDialog(); });
$('#track-symbol-button').addEventListener('click', () => { if (StockAuth.isGuest()) return openAccountDialog(); toggleTracked(selectedSymbol); renderTrackingState(); showToast(isTracked(selectedSymbol) ? `${selectedSymbol} added to tracking` : `${selectedSymbol} removed from tracking`); });
$('#add-transaction-button').addEventListener('click', openTransactionDialog);
$('#account-button').addEventListener('click', openAccountDialog);
let authMode = 'login';
$$('.auth-tabs button').forEach((button) => button.addEventListener('click', () => { authMode = button.dataset.authMode; $$('.auth-tabs button').forEach((item) => item.classList.toggle('active', item === button)); $('#auth-submit').textContent = authMode === 'login' ? 'Log in' : 'Create account'; $('#auth-password').autocomplete = authMode === 'login' ? 'current-password' : 'new-password'; $('#auth-message').textContent = ''; }));
$('#auth-form').addEventListener('submit', async (event) => { event.preventDefault(); try { if (authMode === 'login') await StockAuth.login($('#auth-username').value, $('#auth-password').value); else await StockAuth.signUp($('#auth-username').value, $('#auth-password').value); $('#auth-dialog').close(); showToast('Account ready: stock tracking enabled'); } catch (error) { $('#auth-message').textContent = error.message; } });
$('#guest-mode-button').addEventListener('click', () => { StockAuth.continueAsGuest(); $('#auth-dialog').close(); showToast('Guest research mode enabled; tracking is off'); });
$('#logout-button').addEventListener('click', () => { StockAuth.logout(); $('#auth-dialog').close(); showToast('Logged out; guest mode enabled'); });
$('#transaction-form').addEventListener('submit', (event) => { event.preventDefault(); try { addPortfolioTransaction({ symbol: $('#transaction-symbol').value, side: $('#transaction-side').value, quantity: Number($('#transaction-quantity').value), price: Number($('#transaction-price').value) }); renderPortfolio(); $('#transaction-dialog').close(); showToast('Portfolio transaction saved'); } catch (error) { showToast(error.message); } });
$('#notification-settings-button').addEventListener('click', () => { renderNotificationSettings(); $('#notification-dialog').showModal(); });
$('#request-notification-button').addEventListener('click', requestDevicePermission);
$('#add-symbol-button').addEventListener('click', () => { if (!StockAuth.canTrack()) return showToast('Log in or sign up to track additional stocks'); $('#global-symbol-search').value = ''; $('#symbol-results').innerHTML = '<p class="empty-state">Start typing to search.</p>'; $('#symbol-dialog').showModal(); });
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
$('#notification-form').addEventListener('submit', (event) => { event.preventDefault(); if (!StockAuth.canTrack()) return showToast('Log in or sign up before saving notification settings'); notificationSettings = { price: $('#notify-price').checked, momentum: $('#notify-momentum').checked, catalyst: $('#notify-catalyst').checked, interval: Number($('#poll-interval').value) }; saveNotificationSettings(); startPolling(); $('#notification-dialog').close(); showToast('Notification settings saved'); });
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
loadAlerts();
renderAccountState();
renderMarketClock();
registerNotifications();
renderAlerts();
renderProviderStatus();
renderNotificationSettings();
startPolling();
renderPortfolio();
selectAsset(selectedSymbol);

window.addEventListener('stockauthchange', () => { loadAlerts(); loadTrackedSymbols(); loadPortfolio(); renderAccountState(); renderTrackingState(); renderAlerts(); renderPortfolio(); renderNotificationSettings(); });
