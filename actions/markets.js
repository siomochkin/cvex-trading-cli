// markets.js - Market related actions
const { apiRequest, formatNumber, displayTable } = require('./utils');

// 1. Get list of markets/contracts
async function listContracts() {
  try {
    console.log('Fetching available contracts...');
    const result = await apiRequest('GET', '/v1/market/futures?active=true');
    
    if (result.contracts && result.contracts.length > 0) {
      const tableData = result.contracts.map(contract => [
        contract.contract_id,
        contract.symbol,
        contract.index,
        formatNumber(contract.last_price),
        formatNumber(contract.mark_price),
        formatNumber(contract.volume_24h)
      ]);
      
      console.log('\nAvailable Contracts:');
      displayTable(
        ['ID', 'Symbol', 'Index', 'Last Price', 'Mark Price', '24h Volume'],
        tableData
      );
    } else {
      console.log('No contracts available.');
    }
    
    return result.contracts || [];
  } catch (error) {
    console.error('Error fetching contracts:', error.message);
    return [];
  }
}

// 2. Get Market Data for the contract
async function getMarketData(contractId) {
  try {
    // Contract price history
    console.log(`\nFetching price history for contract ${contractId}...`);
    const priceHistory = await apiRequest('GET', `/v1/market/futures/${contractId}/price?period=1h&count=5`);
    
    if (priceHistory.data && priceHistory.data.length > 0) {
      const priceData = priceHistory.data.map(item => [
        new Date(item.time_open).toLocaleString(),
        formatNumber(item.price_open),
        formatNumber(item.price_high),
        formatNumber(item.price_low),
        formatNumber(item.price_close),
        formatNumber(item.volume_contracts)
      ]);
      
      console.log('\nRecent Price History (1h candles):');
      displayTable(
        ['Time', 'Open', 'High', 'Low', 'Close', 'Volume'],
        priceData
      );
    }
    
    // Recent trades
    console.log(`\nFetching recent trades for contract ${contractId}...`);
    const recentTrades = await apiRequest('GET', `/v1/market/futures/${contractId}/latest-trades?count=5`);
    
    if (recentTrades.trades && recentTrades.trades.length > 0) {
      const tradesData = recentTrades.trades.map(trade => [
        new Date(trade.time).toLocaleString(),
        formatNumber(trade.last_price),
        formatNumber(trade.quantity_contracts),
        formatNumber(trade.quantity_base),
        trade.taker_side
      ]);
      
      console.log('\nRecent Trades:');
      displayTable(
        ['Time', 'Price', 'Quantity (Contracts)', 'Quantity (Base)', 'Taker Side'],
        tradesData
      );
    }
    
    // Order book
    console.log(`\nFetching order book for contract ${contractId}...`);
    // Here we need price step, but we'll use a reasonable default for simplicity
    const orderBook = await apiRequest('GET', `/v1/market/futures/${contractId}/order-book?price_step=1`);
    
    if (orderBook.asks && orderBook.asks.length > 0) {
      const asksData = orderBook.asks.slice(0, 5).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      console.log('\nTop 5 Asks:');
      displayTable(
        ['Price', 'Quantity (Contracts)', 'Quantity (Base)'],
        asksData
      );
    }
    
    if (orderBook.bids && orderBook.bids.length > 0) {
      const bidsData = orderBook.bids.slice(0, 5).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      console.log('\nTop 5 Bids:');
      displayTable(
        ['Price', 'Quantity (Contracts)', 'Quantity (Base)'],
        bidsData
      );
    }
  } catch (error) {
    console.error('Error fetching market data:', error.message);
  }
}

// 3. Getting Contract Details
async function getContractDetails(contractId) {
  try {
    console.log(`\nFetching details for contract ${contractId}...`);
    const result = await apiRequest('GET', `/v1/market/futures/${contractId}`);
    
    if (result.details) {
      const contract = result.details;
      
      console.log('\nContract Details:');
      console.log('-'.repeat(50));
      console.log(`Contract ID:              ${contract.contract_id}`);
      console.log(`Symbol:                   ${contract.symbol}`);
      console.log(`Index:                    ${contract.index} (ID: ${contract.index_id})`);
      console.log(`Status:                   ${contract.status}`);
      console.log(`Last Price:               ${formatNumber(contract.last_price)}`);
      console.log(`Mark Price:               ${formatNumber(contract.mark_price)}`);
      console.log(`Index Price:              ${formatNumber(contract.index_price)}`);
      console.log(`24h Low/High:             ${formatNumber(contract.low_24h)} / ${formatNumber(contract.high_24h)}`);
      console.log(`24h Volume:               ${formatNumber(contract.volume_24h)}`);
      console.log(`Open Interest:            ${formatNumber(contract.open_interest)} (${formatNumber(contract.open_interest_contracts)} contracts)`);
      console.log(`Min Order Size:           ${formatNumber(contract.min_order_size_contracts)} contracts (${formatNumber(contract.min_order_size_assets)} assets)`);
      console.log(`Price Tick:               ${contract.price_tick}`);
      console.log(`Start Time:               ${new Date(contract.start_time).toLocaleString()}`);
      console.log(`Settlement Time:          ${new Date(contract.settlement_time).toLocaleString()}`);
      console.log('-'.repeat(50));
      
      return contract;
    } else {
      console.log('Contract details not available.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching contract details:', error.message);
    return null;
  }
}

module.exports = {
  listContracts,
  getContractDetails,
  getMarketData
};