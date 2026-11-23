/*
 * Signal Desk UI and technical-analysis layer.
 *
 * The calculations are intentionally small and transparent. They provide
 * chart context, not a promise that any indicator predicts the market.
 */
const assets = window.StockData.assets;
let alerts = [];
let selectedSymbol = 'AAPL';
let toastTimer;
let calendarRequestId = 0;
let calendarRequestController;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `$${value.toFixed(2)}`;
const closesFor = (asset) => asset.candles.map((candle) => candle.close);
let selectedRange = '3M';
let installPromptEvent;

function isAppInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showInstallDialog() {
  $('#install-dialog').showModal();
}

async function installApp() {
  if (!installPromptEvent) {
    showInstallDialog();
    return;
  }

  installPromptEvent.prompt();
  const { outcome } = await installPromptEvent.userChoice;
  installPromptEvent = null;
  if (outcome === 'accepted') showToast('Signal Desk is being installed');
}

$('#install-button').addEventListener('click', installApp);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPromptEvent = event;
});
window.addEventListener('appinstalled', () => {
  installPromptEvent = null;
  $('#install-button').hidden = true;
  showToast('Signal Desk is installed');
});
$('#install-button').hidden = isAppInstalled();

function loadAlerts() {
  const saved = StockStorage.load('alerts', []);
  alerts = saved.map((alert) => ({
    ...alert,
    condition: alert.condition || (alert.text.includes('below') ? 'below' : alert.text.includes('RSI') ? 'rsi-high' : 'above'),
    value: alert.value ?? Number(alert.text.match(/[0-9]+(?:\.[0-9]+)?/)?.[0] || 0),
    conditionMet: alert.conditionMet ?? false
  }));
}

function renderTrackingState() {
  const button = $('#track-symbol-button');
  const tracked = isTracked(selectedSymbol);
  button.textContent = tracked ? `Unsubscribe ${selectedSymbol}` : `Subscribe ${selectedSymbol}`;
  button.title = tracked ? 'Remove this symbol from your watchlist' : 'Add this symbol to your watchlist';
}

function renderProviderStatus() {
  const state = window.StockData.providerState;
  $('#market-source-label').textContent = `· ${state.name}`;
  const selectedMarketState = assets.find((asset) => asset.symbol === selectedSymbol)?.marketState;
  const marketLabels = { REGULAR: 'US market open', PRE: 'US pre-market', POST: 'US after-hours', CLOSED: 'US market closed' };
  if (marketLabels[selectedMarketState]) $('#market-status-label').textContent = marketLabels[selectedMarketState];
  else if (selectedMarketState) $('#market-status-label').textContent = 'US market status unavailable';
  const checkedAt = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : '';
  $('#data-disclaimer').textContent = checkedAt ? `${state.message} Last check ${checkedAt}.` : state.message;
  $('#status-dot').style.background = state.mode === 'live' ? 'var(--lime)' : 'var(--orange)';
  $('#live-quote-count').textContent = String(state.freshSymbols);
  $('#live-quote-note').textContent = state.checkedSymbols
    ? `${state.freshSymbols} of ${state.checkedSymbols} quotes are fresh`
    : 'Waiting for a stock subscription';
  renderMarketPulse();
}

function renderMarketPulse() {
  const tracked = getTrackedSymbols();
  const freshQuotes = tracked
    .map((symbol) => assets.find((asset) => asset.symbol === symbol))
    .filter((asset) => asset?.quoteFresh === true && Number.isFinite(asset.change));
  const bars = $('#pulse-bars');
  bars.replaceChildren();

  if (!freshQuotes.length) {
    $('#pulse-value').textContent = 'Awaiting quotes';
    $('#pulse-change').textContent = tracked.length
      ? 'Tracked quotes are stale or unavailable'
      : 'Subscribe to stocks to see live breadth';
    bars.setAttribute('aria-label', 'No fresh tracked quote data');
    for (let index = 0; index < 7; index += 1) {
      const bar = document.createElement('i');
      bar.dataset.direction = 'none';
      bar.style.height = `${6 + index * 2}px`;
      bars.append(bar);
    }
    return;
  }

  const advancing = freshQuotes.filter((asset) => asset.change > 0).length;
  const declining = freshQuotes.filter((asset) => asset.change < 0).length;
  const unchanged = freshQuotes.length - advancing - declining;
  const breadth = Math.round((advancing / freshQuotes.length) * 100);
  $('#pulse-value').textContent = `${breadth}% advancing`;
  $('#pulse-change').textContent = `${advancing} up · ${declining} down${unchanged ? ` · ${unchanged} unchanged` : ''} · ${freshQuotes.length} fresh`;

  const sample = freshQuotes.slice(0, 7);
  sample.forEach((asset) => {
    const bar = document.createElement('i');
    const direction = asset.change > 0 ? 'up' : asset.change < 0 ? 'down' : 'flat';
    bar.dataset.direction = direction;
    bar.style.height = `${Math.max(4, Math.min(22, 4 + Math.abs(asset.change) * 2))}px`;
    bar.title = `${asset.symbol}: ${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%`;
    bars.append(bar);
  });
  bars.setAttribute('aria-label', `${advancing} advancing, ${declining} declining, and ${unchanged} unchanged tracked stocks`);
}

function renderEarningsCalendar(events, note) {
  const list = $('#catalyst-list');
  list.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = note;
    list.append(empty);
    return;
  }

  events.forEach((event) => {
    const date = new Date(event.date);
    const item = document.createElement('div');
    item.className = 'catalyst-item';

    const dateBlock = document.createElement('span');
    dateBlock.className = 'date-block';
    const day = document.createElement('strong');
    day.textContent = new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', day: 'numeric' }).format(date);
    const month = document.createElement('small');
    month.textContent = new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', month: 'short' }).format(date).toUpperCase();
    dateBlock.append(day, month);

    const description = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${event.symbol} · ${event.name}`;
    const details = document.createElement('p');
    const startText = new Intl.DateTimeFormat(undefined, { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    details.textContent = `${event.time || 'Earnings'} · ${startText}${event.fiscalQuarterEnding ? ` · quarter ending ${event.fiscalQuarterEnding}` : ''}${event.epsForecast ? ` · EPS est. ${event.epsForecast}` : ''}`;
    description.append(title, details);

    const source = document.createElement('a');
    source.className = 'calendar-source';
    source.href = event.sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Source';
    source.setAttribute('aria-label', `${event.symbol} calendar source on Nasdaq`);
    item.append(dateBlock, description, source);
    list.append(item);
  });
}

async function refreshEarningsCalendar() {
  const requestId = ++calendarRequestId;
  calendarRequestController?.abort();
  calendarRequestController = new AbortController();
  const button = $('#refresh-calendar-button');
  button.disabled = true;
  button.textContent = 'Loading...';

  const trackedSymbols = getTrackedSymbols();
  const requestedSymbols = trackedSymbols.length
    ? [...new Set([selectedSymbol, ...trackedSymbols])]
    : [...new Set([selectedSymbol, ...assets.slice(0, 5).map((asset) => asset.symbol)])];
  const symbols = requestedSymbols.slice(0, 20);

  renderEarningsCalendar([], trackedSymbols.length
    ? 'Loading estimated earnings dates...'
    : 'Loading upcoming earnings for the selected and featured stocks...');
  try {
    const result = await window.StockData.getEarningsCalendar(symbols, calendarRequestController.signal);
    if (!Array.isArray(result.events)) throw new Error('Calendar provider returned an invalid response');
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const errorDetails = errors.slice(0, 2).map((item) => `${item.symbol || item.date}: ${item.reason}`).join('; ');
    if (requestId !== calendarRequestId) return;
    const subject = trackedSymbols.length ? 'these tracked stocks' : 'the selected and featured stocks';
    renderEarningsCalendar(result.events, `No upcoming earnings dates were returned for ${subject} in the next two weeks.`);
    const errorCount = errors.length;
    const omittedCount = Math.max(0, requestedSymbols.length - symbols.length);
    const omitted = omittedCount ? ` · ${omittedCount} additional stocks not checked` : '';
    const failures = errorCount ? ` · ${errorCount} calendar dates unavailable (${errorDetails}${errorCount > 2 ? '; more' : ''})` : '';
    const updated = new Date(result.updatedAt).toLocaleTimeString();
    $('#calendar-note').textContent = `${result.source} · next ${result.lookaheadDays} days · updated ${updated}${failures}${omitted} · dates and EPS estimates may change`;
  } catch (error) {
    if (error.name === 'AbortError' || requestId !== calendarRequestId) return;
    renderEarningsCalendar([], `Calendar unavailable: ${error.message}`);
    $('#calendar-note').textContent = 'Could not load current earnings estimates.';
  } finally {
    if (requestId === calendarRequestId) {
      button.disabled = false;
      button.textContent = 'Refresh';
    }
  }
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
  $('#market-status-label').textContent = open ? 'US session hours (estimated)' : 'Outside US session hours (estimated)';
}

function refreshDerivedSignals() {
  assets.forEach((asset) => {
    if (!asset.historySource) {
      asset.signal = 'watch';
      return;
    }
    if (asset.candles.length < 20) {
      asset.signal = 'watch';
      return;
    }
    const metrics = technicals(asset);
    asset.rsi = metrics.rsi.at(-1);
    asset.signal = asset.rsi > 58 && asset.change > 0 ? 'bullish' : asset.rsi < 43 || asset.change < -1.5 ? 'risk' : 'watch';
  });
}

function toggleSymbolTracking(symbol) {
  toggleTracked(symbol);
  if (symbol === selectedSymbol) renderTrackingState();
  populateSectors();
  renderWatchlist();
  renderMarketPulse();
  void refreshEarningsCalendar();
  startPolling();
  showToast(isTracked(symbol) ? `${symbol} added to subscriptions` : `${symbol} removed from subscriptions`);
}

function renderWatchlist() {
  refreshDerivedSignals();
  const query = $('#symbol-search').value.trim().toLowerCase();
  const filter = $('#watchlist-filter').value;
  const sector = $('#sector-filter').value;
  const rows = assets.filter((asset) => `${asset.symbol} ${asset.name} ${asset.sector}`.toLowerCase().includes(query) && (filter === 'all' || asset.signal === filter) && (sector === 'all' || asset.sector === sector));
  $('#watchlist-body').innerHTML = rows.map((asset) => {
    const metrics = technicals(asset);
    const hasQuote = Boolean(asset.quoteTimestamp);
    const hasHistory = Boolean(asset.historySource);
    const hasIndicators = hasHistory && asset.candles.length >= 20;
    return `<tr class="${asset.symbol === selectedSymbol ? 'selected' : ''}" data-symbol="${asset.symbol}">
      <td><div class="asset-cell"><span class="asset-logo">${asset.symbol.slice(0, 2)}</span><span class="asset-name"><strong>${asset.symbol}</strong><span>${asset.name}</span></span></div></td>
      <td><strong>${hasQuote || hasHistory ? money(asset.price) : '—'}</strong><small class="quote-state ${asset.priceType === 'last close' || asset.quoteFresh === false ? 'stale' : hasQuote ? 'fresh' : 'demo'}" title="${asset.quoteTimestamp ? `${asset.dataSource || 'Provider'} · ${new Date(asset.quoteTimestamp).toLocaleString()}` : hasHistory ? `Historical provider data through ${new Date(asset.dataTimestamp).toLocaleString()}` : asset.quoteLoading ? 'Loading provider quote…' : 'Live quote unavailable; illustrative values are hidden'}">${asset.priceType === 'last close' ? 'Last close' : asset.quoteFresh === false ? 'Stale' : hasQuote ? 'Live quote' : asset.quoteLoading ? 'Loading…' : hasHistory ? 'Historical' : 'Unavailable'}</small></td>
      <td class="${hasQuote ? asset.change >= 0 ? 'metric-positive' : 'risk' : 'muted'}">${hasQuote ? `${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%` : '—'}</td>
      <td>${hasIndicators ? `<span class="signal-badge ${asset.signal}">${asset.signal[0].toUpperCase() + asset.signal.slice(1)}</span>` : '—'}</td>
      <td class="rsi-cell">${hasIndicators ? metrics.rsi.at(-1).toFixed(0) : '—'}</td><td class="volume">${hasIndicators ? asset.volume : '—'}</td><td><button type="button" class="row-track-button ${isTracked(asset.symbol) ? 'tracked' : ''}" data-track-symbol="${asset.symbol}" aria-label="${isTracked(asset.symbol) ? 'Unsubscribe from' : 'Subscribe to'} ${asset.symbol}">${isTracked(asset.symbol) ? 'Tracked' : 'Track'}</button></td>
    </tr>`;
  }).join('');
  $('#empty-watchlist').hidden = rows.length > 0;
  $$('#watchlist-body tr').forEach((row) => row.addEventListener('click', () => selectAsset(row.dataset.symbol)));
  $$('.row-track-button').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSymbolTracking(button.dataset.trackSymbol);
  }));
}

function selectAsset(symbol) {
  const asset = assets.find((item) => item.symbol === symbol);
  if (!asset) return;
  const symbolChanged = selectedSymbol !== symbol;
  selectedSymbol = symbol;
  $('#detail-panel').hidden = false;
  $('.workspace-grid').classList.remove('detail-dismissed');
  if (!asset.historySource && !asset.historyLoading
    && (!asset.historyLastAttemptAt || Date.now() - asset.historyLastAttemptAt >= 60 * 1000)) {
    asset.historyLoading = true;
    asset.historyLastAttemptAt = Date.now();
    void window.StockData.getHistory(symbol, selectedRange).then(() => {
      asset.historyLoading = false;
      if (selectedSymbol === symbol) selectAsset(symbol);
    });
  }
  const metrics = technicals(asset);
  const hasHistory = Boolean(asset.historySource);
  const hasIndicators = hasHistory && asset.candles.length >= 20;
  const hasQuote = Boolean(asset.quoteTimestamp);
  $('#detail-symbol').textContent = asset.symbol;
  $('#detail-name').textContent = `${asset.name} · ${asset.sector}`;
  $('#detail-price').textContent = hasQuote || hasHistory ? money(asset.price) : '—';
  $('#quote-timestamp').textContent = asset.quoteTimestamp
    ? `${asset.dataSource || 'Provider'} · ${asset.priceType || 'regular'} price at ${new Date(asset.quoteTimestamp).toLocaleString()}${asset.priceType === 'last close' ? ' · NOT LIVE' : asset.quoteFresh ? '' : ' · STALE'}`
    : asset.dataTimestamp
      ? `Historical provider data through ${new Date(asset.dataTimestamp).toLocaleString()} · no current quote`
      : 'Live quote unavailable · illustrative data hidden';
  $('#quote-timestamp').classList.toggle('stale', asset.quoteFresh === false);
  $('#detail-change').textContent = hasQuote ? `${asset.change >= 0 ? '+' : ''}${asset.change.toFixed(2)}%` : '—';
  $('#detail-change').className = hasQuote ? asset.change >= 0 ? 'metric-positive' : 'risk' : 'muted';
  $('#detail-signal').textContent = hasIndicators ? asset.signal[0].toUpperCase() + asset.signal.slice(1) : 'Unavailable';
  $('#detail-signal').className = `signal-badge ${hasIndicators ? asset.signal : 'watch'}`;
  $('#detail-support').textContent = hasHistory ? money(asset.support) : '—';
  $('#detail-resistance').textContent = hasHistory ? money(asset.resistance) : '—';
  $('#detail-rsi').textContent = hasIndicators ? metrics.rsi.at(-1).toFixed(1) : '—';
  $('#detail-atr').textContent = hasIndicators ? money(metrics.atr) : '—';
  $('#detail-atr-note').textContent = hasIndicators ? `${((metrics.atr / asset.price) * 100).toFixed(1)}% of price per bar` : 'At least 20 provider candles are required';
  const bollingerLabel = metrics.bollingerPosition >= 1 ? 'Upper band' : metrics.bollingerPosition <= 0 ? 'Lower band' : metrics.bollingerPosition > .6 ? 'Upper half' : metrics.bollingerPosition < .4 ? 'Lower half' : 'Middle';
  $('#detail-bollinger').textContent = hasIndicators ? bollingerLabel : '—';
  $('#detail-bollinger-note').textContent = hasIndicators ? `${money(metrics.bandLower)} - ${money(metrics.bandUpper)}` : 'At least 20 provider candles are required';
  $('#detail-vwap').textContent = hasIndicators ? money(metrics.vwap) : '—';
  $('#detail-vwap-note').textContent = hasIndicators ? asset.price >= metrics.vwap ? 'Price above range VWAP' : 'Price below range VWAP' : 'At least 20 provider candles are required';
  const volatilityLabel = metrics.volatility > 3 ? 'High' : metrics.volatility > 1.5 ? 'Moderate' : 'Low';
  $('#detail-volatility').textContent = hasIndicators ? volatilityLabel : '—';
  $('#detail-volatility-note').textContent = hasIndicators ? `${metrics.volatility.toFixed(2)}% bar dispersion` : 'At least 20 provider candles are required';
  const levels = levelClassification(asset);
  $('#support-code').textContent = hasHistory ? `${levels.support.code} · Support` : '—';
  $('#support-detail').textContent = hasHistory ? levels.support.detail : 'Provider history unavailable';
  $('#resistance-code').textContent = hasHistory ? `${levels.resistance.code} · Resistance` : '—';
  $('#resistance-detail').textContent = hasHistory ? levels.resistance.detail : 'Provider history unavailable';
  $('#bull-scenario').textContent = hasHistory ? `${levels.support.code} holds and price confirms above range VWAP toward ${levels.resistance.code}.` : 'Scenarios are unavailable until provider history loads.';
  $('#bear-scenario').textContent = hasHistory ? `${levels.support.code} fails; momentum risk increases below ${money(asset.support)}.` : 'Scenarios are unavailable until provider history loads.';
  $('#detail-thesis').textContent = hasHistory ? asset.thesis : 'Illustrative data is hidden. Connect to the provider to load real price history and technical indicators.';
  $('#create-alert-button').textContent = `Create alert for ${asset.symbol}`;
  renderTrackingState();
  $('#tooltip-price').textContent = hasQuote || hasHistory ? money(asset.price) : '—';
  $('#alert-symbol').value = symbol;
  $('#technique-tags').innerHTML = hasIndicators
    ? signalTags(asset, metrics).map((tag) => `<span class="technique-tag ${tag.tone}">${tag.label}</span>`).join('')
    : '<span class="technique-tag neutral">Provider history unavailable</span>';
  $('.chart-legend').hidden = !hasHistory;
  drawChart(asset, metrics);
  updateRangeLabels(selectedRange, asset.candles);
  renderWatchlist();
  if (symbolChanged) {
    void refreshEarningsCalendar();
    startPolling();
  }
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
  if (!asset.historySource) {
    context.fillStyle = '#9aa5aa';
    context.font = '12px Trebuchet MS';
    context.fillText('Provider history unavailable', 12, 24);
    return;
  }
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
  context.strokeStyle = '#303d46';
  context.lineWidth = 1;
  context.setLineDash([2, 5]);
  for (let index = 1; index < 10; index += 1) {
    const gridY = (chartHeight * index) / 10;
    context.beginPath();
    context.moveTo(0, gridY);
    context.lineTo(width, gridY);
    context.stroke();
  }
  [0.25, 0.5, 0.75].forEach((fraction) => {
    const gridX = width * fraction;
    context.beginPath();
    context.moveTo(gridX, 0);
    context.lineTo(gridX, height * .60);
    context.stroke();
  });
  context.setLineDash([]);
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
  context.strokeStyle = '#303d46';
  context.setLineDash([2, 4]);
  context.beginPath(); context.moveTo(0, rsiY(70)); context.lineTo(width, rsiY(70)); context.moveTo(0, rsiY(30)); context.lineTo(width, rsiY(30)); context.stroke();
  context.setLineDash([]);
  line(metrics.rsi, '#d3f36b', 1.4, rsiY);
  context.fillStyle = '#616c73';
  context.fillText('RSI 14', 6, lowerTop + 11);
  const macdMax = Math.max(...metrics.macd.map((value, index) => Math.abs(value - metrics.macdSignal[index])), .001);
  metrics.macd.forEach((value, index) => { const difference = value - metrics.macdSignal[index]; const bar = (difference / macdMax) * (height * .04); context.fillStyle = difference >= 0 ? 'rgba(134,184,255,.65)' : 'rgba(255,155,98,.65)'; context.fillRect(x(index) - 1.5, lowerTop + height * .19 - Math.max(0, bar), 3, Math.abs(bar)); });
  context.fillText('MACD', 6, height - 5);
}

function renderAlerts() {
  $('#alert-count').textContent = `${alerts.length} active`;
  $('#active-alerts-count').textContent = String(alerts.length);
  $('#alerts-list').innerHTML = alerts.length ? alerts.map((alert) => {
    const asset = assets.find((item) => item.symbol === alert.symbol);
    const needsHistory = ['rsi-low', 'rsi-high', 'volume', 'breakout', 'breakdown'].includes(alert.condition);
    const status = !notificationSettings.interval ? 'Automatic checks are off'
      : !asset?.quoteFresh ? 'Waiting for a fresh provider quote'
        : !['REGULAR', 'PRE', 'POST'].includes(asset.marketState) ? 'Waiting for market hours'
          : needsHistory && (!asset.historySource || asset.candles.length < 20) ? 'Waiting for provider history'
            : 'Monitoring while the app is open';
    return `<div class="alert-item"><span class="alert-icon">⌁</span><div><strong>${alert.symbol} · ${alert.text}</strong><p>${alert.kind} · ${status}</p></div><button class="alert-action" data-alert-id="${alert.id}" title="Delete alert" aria-label="Delete ${alert.symbol} alert">×</button></div>`;
  }).join('') : '<p class="empty-state">No active alerts. Add one from an asset detail view.</p>';
  $$('.alert-action').forEach((button) => button.addEventListener('click', () => { alerts = alerts.filter((alert) => alert.id !== Number(button.dataset.alertId)); saveAlerts(); renderAlerts(); startPolling(); showToast('Alert removed'); }));
}

function saveAlerts() { StockStorage.save('alerts', alerts); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600); }

const alertValueOptions = {
  above: { label: 'Price threshold', hint: 'Required. Alert when the price crosses above this amount.', required: true, min: '0.01', step: '0.01' },
  below: { label: 'Price threshold', hint: 'Required. Alert when the price crosses below this amount.', required: true, min: '0.01', step: '0.01' },
  percent: { label: 'Daily move (%)', hint: 'Required. Alert when the absolute daily move crosses this percentage.', required: true, min: '0.01', step: '0.1' },
  volume: { label: 'Volume multiple', hint: 'Optional. Defaults to 1.5× average volume.', required: false, min: '0.1', step: '0.1' }
};
let previousAlertCondition = 'above';

function updateAlertValueField() {
  const condition = $('#alert-condition').value;
  const options = alertValueOptions[condition];
  const field = $('#alert-value-field');
  const input = $('#alert-value');
  if (condition !== previousAlertCondition) {
    const currentPrice = assets.find((asset) => asset.symbol === $('#alert-symbol').value)?.price;
    input.value = condition === 'above' || condition === 'below'
      ? Number.isFinite(currentPrice) ? currentPrice.toFixed(2) : ''
      : condition === 'percent' ? '1' : '';
    previousAlertCondition = condition;
  }
  field.hidden = !options;
  input.required = Boolean(options?.required);
  input.disabled = !options;
  input.min = options?.min || '';
  input.step = options?.step || '0.01';
  input.placeholder = condition === 'volume' ? '1.5' : '';
  input.setCustomValidity('');
  $('#alert-value-label').textContent = options?.label || 'Trigger value';
  $('#alert-value-hint').textContent = options?.hint || '';
  if (!options) input.value = '';
}

function openAlertDialog() {
  $('#alert-symbol').innerHTML = assets.map((asset) => `<option value="${asset.symbol}">${asset.symbol} · ${asset.name}</option>`).join('');
  $('#alert-symbol').value = selectedSymbol;
  $('#alert-condition').value = 'above';
  previousAlertCondition = 'above';
  const current = assets.find((asset) => asset.symbol === selectedSymbol);
  $('#alert-value').value = current.quoteFresh && ['REGULAR', 'PRE', 'POST'].includes(current.marketState)
    ? current.price.toFixed(2)
    : '';
  updateAlertValueField();
  $('#alert-dialog').showModal();
}

$('#symbol-search').addEventListener('input', renderWatchlist);
$('#watchlist-filter').addEventListener('change', renderWatchlist);
$('#sector-filter').innerHTML += [...new Set(assets.map((asset) => asset.sector))].sort().map((sector) => `<option value="${sector}">${sector}</option>`).join('');
$('#sector-filter').addEventListener('change', renderWatchlist);
$('#create-alert-button').addEventListener('click', openAlertDialog);
$('#alert-condition').addEventListener('change', updateAlertValueField);
$('#alert-value').addEventListener('input', () => $('#alert-value').setCustomValidity(''));
$('#track-symbol-button').addEventListener('click', () => toggleSymbolTracking(selectedSymbol));
$('#notification-settings-button').addEventListener('click', () => { renderNotificationSettings(); $('#notification-dialog').showModal(); });
$('#request-notification-button').addEventListener('click', requestDevicePermission);
$('#test-notification-button').addEventListener('click', sendTestNotification);
$$('.dialog-close').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  button.closest('dialog')?.close('cancel');
}));
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
$('#close-detail').addEventListener('click', () => {
  $('#detail-panel').hidden = true;
  $('.workspace-grid').classList.add('detail-dismissed');
});
let manualRefreshInFlight = false;
async function refreshTrackedQuotes() {
  if (manualRefreshInFlight) return;
  manualRefreshInFlight = true;
  const liveButton = $('#live-refresh-button');
  const refreshButton = $('#refresh-button');
  const monitoredSymbols = getMonitoredSymbols();
  const symbols = [...new Set([...monitoredSymbols, selectedSymbol])];
  const liveButtonText = liveButton.textContent;
  const refreshButtonTitle = refreshButton.title;
  liveButton.disabled = true;
  refreshButton.disabled = true;
  liveButton.textContent = 'Refreshing...';
  refreshButton.title = 'Refreshing quotes...';
  refreshButton.setAttribute('aria-busy', 'true');
  try {
    await window.StockData.getMarketData({ live: true, symbols });
    renderProviderStatus();
    renderWatchlist();
    selectAsset(selectedSymbol);
    evaluateAlerts(window.StockData.providerState.refreshedSymbols);
    showToast(window.StockData.providerState.message);
  } catch (error) {
    console.error('Manual stock quote refresh failed', error);
    window.StockData.providerState.mode = 'error';
    window.StockData.providerState.name = 'Yahoo Finance and Nasdaq unavailable';
    window.StockData.providerState.liveSymbols = 0;
    window.StockData.providerState.receivedSymbols = 0;
    window.StockData.providerState.freshSymbols = 0;
    window.StockData.providerState.checkedSymbols = symbols.length;
    window.StockData.providerState.refreshedSymbols = [];
    window.StockData.providerState.updatedAt = new Date().toISOString();
    window.StockData.providerState.message = `Live refresh failed: ${error.message}`;
    renderProviderStatus();
    showToast(window.StockData.providerState.message);
  } finally {
    liveButton.disabled = false;
    refreshButton.disabled = false;
    liveButton.textContent = liveButtonText;
    refreshButton.title = refreshButtonTitle;
    refreshButton.removeAttribute('aria-busy');
    manualRefreshInFlight = false;
  }
}

$('#refresh-button').addEventListener('click', refreshTrackedQuotes);
$('#live-refresh-button').addEventListener('click', refreshTrackedQuotes);
$('#refresh-calendar-button').addEventListener('click', refreshEarningsCalendar);
$('#alert-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const symbol = $('#alert-symbol').value;
  const condition = $('#alert-condition').value;
  const rawValue = $('#alert-value').value.trim();
  const valueOptions = alertValueOptions[condition];
  const value = condition === 'volume' ? Number(rawValue || 1.5) : valueOptions ? Number(rawValue) : null;
  if (valueOptions?.required && (!Number.isFinite(value) || value <= 0)) {
    $('#alert-value').setCustomValidity('Enter a value greater than zero.');
    $('#alert-value').reportValidity();
    return;
  }
  let text;
  switch (condition) {
    case 'above': text = `Price above ${money(value)}`; break;
    case 'below': text = `Price below ${money(value)}`; break;
    case 'percent': text = `Daily move exceeds ${value}%`; break;
    case 'rsi-low': text = 'RSI enters oversold'; break;
    case 'rsi-high': text = 'RSI enters overbought'; break;
    case 'volume': text = `Volume exceeds ${value}x average`; break;
    case 'breakout': text = 'Breaks resistance'; break;
    case 'breakdown': text = 'Breaks support'; break;
    default: throw new Error(`Unsupported alert condition: ${condition}`);
  }
  const kind = ['above', 'below', 'percent', 'breakout', 'breakdown'].includes(condition) ? 'Price level' : 'Momentum';
  alerts.unshift({ id: Date.now(), symbol, condition, value, text, kind, conditionMet: false });
  saveAlerts();
  renderAlerts();
  startPolling();
  $('#alert-dialog').close();
  showToast(`${symbol} alert created`);
});
$('#notification-form').addEventListener('submit', (event) => { event.preventDefault(); notificationSettings = { price: $('#notify-price').checked, momentum: $('#notify-momentum').checked, interval: Number($('#poll-interval').value) }; saveNotificationSettings(); startPolling(); $('#notification-dialog').close(); showToast('Notification settings saved'); });
$$('.time-tabs button').forEach((button) => button.addEventListener('click', async () => {
  $$('.time-tabs button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  $$('.time-tabs button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  selectedRange = button.dataset.range;
  button.disabled = true;
  try {
    await window.StockData.getHistory(selectedSymbol, selectedRange);
    selectAsset(selectedSymbol);
    showToast(`${selectedRange} history loaded`);
  } catch (error) {
    showToast(`Could not load ${selectedRange} history: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}));
window.addEventListener('resize', () => { const asset = assets.find((item) => item.symbol === selectedSymbol); if (asset) drawChart(asset); });

function populateSectors() {
  const selected = $('#sector-filter').value;
  $('#universe-count').textContent = assets.length.toLocaleString();
  $('#tracked-count').textContent = getTrackedSymbols().length.toLocaleString();
  $('#sector-filter').innerHTML = '<option value="all">All sectors</option>' + [...new Set(assets.map((asset) => asset.sector))].sort().map((sector) => `<option value="${sector}">${sector}</option>`).join('');
  $('#sector-filter').value = [...$('#sector-filter').options].some((option) => option.value === selected) ? selected : 'all';
}

populateSectors();
loadAlerts();
renderMarketClock();
registerNotifications();
renderAlerts();
renderProviderStatus();
renderWatchlist();
renderNotificationSettings();
void refreshEarningsCalendar();
window.setInterval(() => {
  if (!document.hidden) void refreshEarningsCalendar();
}, 15 * 60 * 1000);
selectAsset(selectedSymbol);
startPolling();
