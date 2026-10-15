/* Browser-local tracked-symbol state. */
let trackedSymbols = new Set(StockStorage.load('tracked-symbols', []));

function loadTrackedSymbols() {
  trackedSymbols = new Set(StockStorage.load('tracked-symbols', []));
}

function isTracked(symbol) {
  return trackedSymbols.has(symbol);
}

function getTrackedSymbols() {
  return [...trackedSymbols];
}

function toggleTracked(symbol) {
  if (trackedSymbols.has(symbol)) trackedSymbols.delete(symbol);
  else trackedSymbols.add(symbol);
  StockStorage.save('tracked-symbols', [...trackedSymbols]);
  return true;
}
