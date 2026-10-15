/*
 * Lightweight portfolio ledger for the local prototype.
 * Transactions are stored locally and calculations use weighted-average cost.
 * Production portfolio calculations should move to a server/database with tax-lot support.
 */
let portfolioTransactions = StockStorage.load('transactions', []);

function loadPortfolio() {
  portfolioTransactions = StockStorage.load('transactions', []);
}

function savePortfolio() {
  return StockStorage.save('transactions', portfolioTransactions);
}

function portfolioPositions() {
  const positions = new Map();
  let realizedPnl = 0;
  // The UI stores newest transactions first; portfolio calculations replay history oldest-first.
  const orderedTransactions = [...portfolioTransactions].sort((left, right) => left.id - right.id);
  orderedTransactions.forEach((transaction) => {
    const existing = positions.get(transaction.symbol) || { symbol: transaction.symbol, quantity: 0, costBasis: 0, realizedPnl: 0 };
    if (transaction.side === 'buy') {
      existing.costBasis += transaction.quantity * transaction.price;
      existing.quantity += transaction.quantity;
    } else {
      const averageCost = existing.quantity ? existing.costBasis / existing.quantity : 0;
      const proceeds = transaction.quantity * transaction.price;
      const realized = proceeds - (transaction.quantity * averageCost);
      existing.realizedPnl += realized;
      realizedPnl += realized;
      existing.costBasis -= transaction.quantity * averageCost;
      existing.quantity -= transaction.quantity;
    }
    positions.set(transaction.symbol, existing);
  });
  const holdings = [...positions.values()].filter((position) => position.quantity > 0).map((position) => {
    const asset = window.StockData.assets.find((item) => item.symbol === position.symbol);
    const price = asset?.price || position.costBasis / position.quantity;
    const marketValue = position.quantity * price;
    const unrealizedPnl = marketValue - position.costBasis;
    return { ...position, asset, price, marketValue, unrealizedPnl, returnPct: position.costBasis ? (unrealizedPnl / position.costBasis) * 100 : 0 };
  });
  return { holdings, realizedPnl, marketValue: holdings.reduce((sum, holding) => sum + holding.marketValue, 0), costBasis: holdings.reduce((sum, holding) => sum + holding.costBasis, 0) };
}

function addPortfolioTransaction(transaction) {
  if (!transaction.symbol || transaction.quantity <= 0 || transaction.price <= 0) throw new Error('Enter a valid symbol, quantity, and price.');
  const current = portfolioPositions().holdings.find((holding) => holding.symbol === transaction.symbol);
  if (transaction.side === 'sell' && (!current || current.quantity < transaction.quantity)) throw new Error('Sell quantity exceeds the current position.');
  portfolioTransactions.unshift({ ...transaction, id: Date.now(), createdAt: new Date().toISOString() });
  savePortfolio();
}
