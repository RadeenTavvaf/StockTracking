/*
 * Device notification and live polling service.
 * The UI supplies alert data; this module owns permission, cooldowns, and delivery.
 */
let pollingTimer;
const defaultNotificationSettings = { price: true, momentum: true, catalyst: false, interval: 300000 };
let notificationSettings = StockAuth.load('notification-settings', defaultNotificationSettings);

function saveNotificationSettings() {
  StockAuth.save('notification-settings', notificationSettings);
}

window.addEventListener('stockauthchange', () => {
  notificationSettings = StockAuth.load('notification-settings', defaultNotificationSettings);
  startPolling();
});

function registerNotifications() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => showToast('Device notification worker could not start'));
}

function renderNotificationSettings() {
  const supported = 'Notification' in window;
  const permission = supported ? Notification.permission : 'unsupported';
  $('#permission-state').textContent = permission === 'granted' ? 'Device alerts enabled' : permission === 'denied' ? 'Device alerts blocked' : 'Permission not requested';
  $('#permission-detail').textContent = supported ? `Browser status: ${permission}` : 'This browser does not support device alerts.';
  $('#request-notification-button').disabled = !supported || permission === 'granted';
  $('#request-notification-button').textContent = permission === 'granted' ? 'Enabled' : permission === 'denied' ? 'Blocked in browser' : 'Allow device alerts';
  $('#notify-price').checked = notificationSettings.price;
  $('#notify-momentum').checked = notificationSettings.momentum;
  $('#notify-catalyst').checked = notificationSettings.catalyst;
  $('#poll-interval').value = String(notificationSettings.interval);
}

async function requestDevicePermission() {
  if (!('Notification' in window)) return showToast('This browser does not support device alerts');
  const permission = await Notification.requestPermission();
  renderNotificationSettings();
  showToast(permission === 'granted' ? 'Device alerts enabled' : 'Device alerts were not enabled');
}

async function sendDeviceNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SHOW_STOCK_NOTIFICATION', title, body, tag });
  } else {
    new Notification(title, { body, tag });
  }
}

function evaluateAlerts() {
  const now = Date.now();
  alerts.forEach((alert) => {
    const asset = assets.find((item) => item.symbol === alert.symbol);
    if (!asset || (alert.lastTriggered && now - alert.lastTriggered < 1800000)) return;
    const metrics = technicals(asset);
    const currentRsi = metrics.rsi.at(-1);
    const checks = {
      above: asset.price >= alert.value,
      below: asset.price <= alert.value,
      percent: Math.abs(asset.change) >= alert.value,
      'rsi-low': currentRsi <= 30,
      'rsi-high': currentRsi >= 70,
      volume: metrics.currentVolume >= metrics.averageVolume * Math.max(alert.value || 1.5, 1),
      breakout: asset.price >= asset.resistance,
      breakdown: asset.price <= asset.support
    };
    const category = ['above', 'below', 'percent', 'breakout', 'breakdown'].includes(alert.condition) ? 'price' : 'momentum';
    if (!checks[alert.condition] || !notificationSettings[category]) return;
    alert.lastTriggered = now;
    sendDeviceNotification(`${asset.symbol} alert`, `${alert.text}. Last price ${money(asset.price)}.`, `stocktracking-${asset.symbol}-${alert.id}`);
    showToast(`Alert triggered: ${asset.symbol}`);
  });
  saveAlerts();
  renderAlerts();
}

function startPolling() {
  clearInterval(pollingTimer);
  if (!notificationSettings.interval) return;
  pollingTimer = setInterval(async () => {
    await window.StockData.getMarketData({ live: true, symbols: assets.slice(0, 20) });
    renderProviderStatus();
    renderWatchlist();
    selectAsset(selectedSymbol);
    evaluateAlerts();
  }, notificationSettings.interval);
}
