/* Account-scoped tracked-symbol state. Guest mode is intentionally read-only. */
let trackedSymbols = new Set(StockAuth.load('tracked-symbols', []));

function loadTrackedSymbols() {
  trackedSymbols = new Set(StockAuth.isGuest() ? [] : StockAuth.load('tracked-symbols', []));
}

function isTracked(symbol) {
  return trackedSymbols.has(symbol);
}

function toggleTracked(symbol) {
  if (StockAuth.isGuest()) return false;
  if (trackedSymbols.has(symbol)) trackedSymbols.delete(symbol);
  else trackedSymbols.add(symbol);
  StockAuth.save('tracked-symbols', [...trackedSymbols]);
  return true;
}

window.addEventListener('stockauthchange', loadTrackedSymbols);
