/*
 * Device notification and live polling service.
 * The UI supplies alert data; this module owns permission, cooldowns, and delivery.
 */
let pollingTimer;
let pollingInFlight = false;
let pollingRerunRequested = false;
const pollingIntervals = [15000, 30000, 60000];
const defaultNotificationSettings = { price: true, momentum: true, interval: 30000 };
let notificationChannelReady = false;
const capacitor = window.Capacitor;
const nativeNotifications = capacitor?.isNativePlatform?.() && capacitor.registerPlugin
  ? capacitor.registerPlugin('LocalNotifications')
  : null;
let notificationRegistrationPromise;

function loadNotificationSettings() {
  const saved = StockStorage.load('notification-settings', defaultNotificationSettings);
  const savedInterval = Number(saved.interval);
  return {
    ...defaultNotificationSettings,
    ...saved,
    interval: savedInterval === 0 ? 0 : pollingIntervals.includes(savedInterval) ? savedInterval : defaultNotificationSettings.interval
  };
}

let notificationSettings = loadNotificationSettings();

function saveNotificationSettings() {
  StockStorage.save('notification-settings', notificationSettings);
}

function registerNotifications() {
  if ('serviceWorker' in navigator) {
    notificationRegistrationPromise = navigator.serviceWorker.register('./sw.js')
      .catch((error) => {
        console.error('App offline support could not start', error);
        showToast('App offline support could not start');
        return null;
      });
  }
}

async function renderNotificationSettings() {
  let permission;
  if (nativeNotifications) {
    try {
      permission = (await nativeNotifications.checkPermissions()).display;
    } catch (error) {
      permission = 'unsupported';
      console.error('Could not check Android notification permission', error);
    }
  } else {
    permission = 'Notification' in window ? Notification.permission : 'unsupported';
  }
  const supported = nativeNotifications || 'Notification' in window;
  $('#permission-state').textContent = permission === 'granted' ? 'Device alerts enabled' : permission === 'denied' ? 'Device alerts blocked' : 'Permission not requested';
  $('#permission-detail').textContent = nativeNotifications
    ? `Android notification permission: ${permission}`
    : supported ? `Browser notification permission: ${permission}` : 'This browser does not support device alerts.';
  $('#request-notification-button').disabled = !supported || permission === 'granted';
  $('#request-notification-button').textContent = permission === 'granted' ? 'Enabled'
    : permission === 'denied' ? nativeNotifications ? 'Blocked in device settings' : 'Blocked in browser'
      : 'Allow device alerts';
  $('#test-notification-button').disabled = !supported || permission !== 'granted';
  $('#notify-price').checked = notificationSettings.price;
  $('#notify-momentum').checked = notificationSettings.momentum;
  $('#poll-interval').value = String(notificationSettings.interval);
}

async function requestDevicePermission() {
  try {
    let permission;
    if (nativeNotifications) {
      permission = (await nativeNotifications.requestPermissions()).display;
      if (permission === 'granted') {
        await ensureNotificationChannel();
      }
    } else if ('Notification' in window) {
      permission = await Notification.requestPermission();
    } else {
      showToast('This device does not support notifications');
      return;
    }
    await renderNotificationSettings();
    showToast(permission === 'granted' ? 'Device alerts enabled' : `Device alerts were not enabled (${permission})`);
  } catch (error) {
    console.error('Could not enable device notifications', error);
    showToast(`Could not enable notifications: ${error.message}`);
  }
}

async function sendDeviceNotification(title, body, tag) {
  try {
    if (nativeNotifications) {
      const { display } = await nativeNotifications.checkPermissions();
      if (display !== 'granted') throw new Error('Allow Android notifications in Signal Desk settings first');
      await ensureNotificationChannel();
      const id = (Math.abs([...tag].reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0, 0)) & 0x7fffffff) || 1;
      await nativeNotifications.schedule({
        notifications: [{
          id,
          title,
          body,
          channelId: 'stock-alerts',
          schedule: { at: new Date(Date.now() + 1000) },
          isExactNotification: false
        }]
      });
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    await notificationRegistrationPromise;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, { body, tag, icon: './icon.svg', badge: './icon.svg', data: { url: './' } });
    } else {
      new Notification(title, { body, tag });
    }
  } catch (error) {
    console.error('Device notification could not be delivered', error);
    showToast(`Notification could not be delivered: ${error.message}`);
  }
}

async function ensureNotificationChannel() {
  if (!nativeNotifications || notificationChannelReady) return;
  await nativeNotifications.createChannel({
    id: 'stock-alerts',
    name: 'Stock alerts',
    description: 'Price and technical-condition alerts',
    importance: 4,
    visibility: 1
  });
  notificationChannelReady = true;
}

async function sendTestNotification() {
  await sendDeviceNotification('Signal Desk test', 'Device notifications are working.', `stocktracking-test-${Date.now()}`);
  $('#notification-dialog').close();
}

function evaluateAlerts(refreshedSymbols) {
  const now = Date.now();
  let alertsChanged = false;
  alerts.forEach((alert) => {
    if (refreshedSymbols && !refreshedSymbols.includes(alert.symbol)) return;
    const asset = assets.find((item) => item.symbol === alert.symbol);
    if (!asset) return;
    if (!asset.quoteFresh || !['REGULAR', 'PRE', 'POST'].includes(asset.marketState)) return;
    const needsHistory = ['rsi-low', 'rsi-high', 'volume', 'breakout', 'breakdown'].includes(alert.condition);
    if (needsHistory && (!asset.historySource || asset.candles.length < 20)) return;
    const metrics = technicals(asset);
    const currentRsi = metrics.rsi.at(-1);
    const checks = {
      above: asset.price >= alert.value,
      below: asset.price <= alert.value,
      percent: Math.abs(asset.change) >= alert.value,
      'rsi-low': currentRsi <= 30,
      'rsi-high': currentRsi >= 70,
      volume: metrics.averageVolume > 0 && metrics.currentVolume > 0 && metrics.currentVolume >= metrics.averageVolume * Math.max(alert.value || 1.5, 1),
      breakout: asset.price >= asset.resistance,
      breakdown: asset.price <= asset.support
    };
    const category = ['above', 'below', 'percent', 'breakout', 'breakdown'].includes(alert.condition) ? 'price' : 'momentum';
    const conditionMet = Boolean(checks[alert.condition]);
    const wasMet = alert.conditionMet;
    if (wasMet !== conditionMet) {
      alert.conditionMet = conditionMet;
      alertsChanged = true;
    }
    if (!conditionMet || wasMet !== false || !notificationSettings[category]) return;
    if (alert.lastTriggered && now - alert.lastTriggered < 1800000) return;
    alert.lastTriggered = now;
    alertsChanged = true;
    void sendDeviceNotification(`${asset.symbol} alert`, `${alert.text}. Last price ${money(asset.price)}.`, `stocktracking-${asset.symbol}-${alert.id}`);
    showToast(`Alert triggered: ${asset.symbol}`);
  });
  if (alertsChanged) {
    saveAlerts();
    renderAlerts();
  }
}

function startPolling() {
  clearTimeout(pollingTimer);
  if (pollingInFlight) {
    pollingRerunRequested = true;
    return;
  }
  void pollQuotes();
}

async function pollQuotes() {
  if (pollingInFlight) return;
  const symbols = getMonitoredSymbols();
  if (!navigator.onLine) {
    window.StockData.providerState.mode = 'stale';
    window.StockData.providerState.name = 'Offline demo data';
    window.StockData.providerState.liveSymbols = 0;
    window.StockData.providerState.freshSymbols = 0;
    window.StockData.providerState.checkedSymbols = symbols.length;
    window.StockData.providerState.refreshedSymbols = [];
    window.StockData.providerState.message = 'Offline: provider quotes are unavailable. Illustrative values are hidden and last provider values remain timestamped.';
    symbols.forEach((symbol) => {
      const asset = assets.find((item) => item.symbol === symbol);
      if (asset) asset.quoteFresh = false;
    });
    renderProviderStatus();
    renderWatchlist();
    selectAsset(selectedSymbol);
    renderAlerts();
    return;
  }

  if (!symbols.length) {
    window.StockData.providerState.mode = 'demo';
    window.StockData.providerState.name = 'Deterministic demo feed';
    window.StockData.providerState.liveSymbols = 0;
    window.StockData.providerState.receivedSymbols = 0;
    window.StockData.providerState.freshSymbols = 0;
    window.StockData.providerState.checkedSymbols = 0;
    window.StockData.providerState.refreshedSymbols = [];
    window.StockData.providerState.message = 'Track a stock or create an alert to start live quote checks.';
    renderProviderStatus();
    return;
  }

  pollingInFlight = true;
  try {
    const refresh = window.StockData.getMarketData({ live: true, symbols });
    renderWatchlist();
    await refresh;
    renderProviderStatus();
    renderWatchlist();
    selectAsset(selectedSymbol);
    evaluateAlerts(window.StockData.providerState.refreshedSymbols);
    renderAlerts();
  } catch (error) {
    console.error('Stock quote polling failed', error);
    window.StockData.providerState.mode = 'error';
    window.StockData.providerState.liveSymbols = 0;
    window.StockData.providerState.receivedSymbols = 0;
    window.StockData.providerState.freshSymbols = 0;
    window.StockData.providerState.checkedSymbols = symbols.length;
    window.StockData.providerState.refreshedSymbols = [];
    window.StockData.providerState.name = 'Yahoo Finance and Nasdaq unavailable';
    window.StockData.providerState.updatedAt = new Date().toISOString();
    window.StockData.providerState.message = `Stock quote polling failed: ${error.message}`;
    renderProviderStatus();
    renderAlerts();
  } finally {
    pollingInFlight = false;
    if (pollingRerunRequested) {
      pollingRerunRequested = false;
      void pollQuotes();
      return;
    }
    if (notificationSettings.interval && getMonitoredSymbols().length) {
      pollingTimer = setTimeout(pollQuotes, notificationSettings.interval);
    }
  }
}

function getMonitoredSymbols() {
  return [...new Set([
    ...assets.slice(0, 5).map((asset) => asset.symbol),
    selectedSymbol,
    ...getTrackedSymbols(),
    ...alerts.map((alert) => alert.symbol)
  ])];
}

window.addEventListener('offline', () => {
  if (getMonitoredSymbols().length) void pollQuotes();
});
window.addEventListener('online', () => {
  if (getMonitoredSymbols().length) startPolling();
});
