// account.js - Account related actions
const { apiRequest, formatNumber, displayTable } = require('./utils');

// 8. Accessing Account Details Information
async function getAccountInformation() {
  try {
    console.log('\nFetching account information...');
    
    // Get portfolio overview
    console.log('Getting portfolio overview...');
    const portfolio = await apiRequest('GET', '/v1/portfolio/overview');
    
    if (portfolio && portfolio.portfolio) {
      const p = portfolio.portfolio;
      console.log('\nPortfolio Overview:');
      console.log('-'.repeat(50));
      console.log(`Portfolio ID:              ${p.portfolio_id}`);
      console.log(`Collateral Balance:        ${formatNumber(p.collateral_balance)}`);
      console.log(`Unrealized Profit:         ${formatNumber(p.unrealized_profit)}`);
      console.log(`Equity:                    ${formatNumber(p.equity)}`);
      console.log(`Available to Withdraw:     ${formatNumber(p.available_to_withdraw)}`);
      console.log(`Margin Utilization:        ${formatNumber(p.margin_utilization * 100)}%`);
      console.log(`Leverage:                  ${formatNumber(p.leverage)}x`);
      console.log(`Liquidation Risk (1d):     ${formatNumber(p.liquidation_risk_1d * 100)}%`);
      if (p.warning) console.log(`Warning: ${p.warning}`);
      console.log('-'.repeat(50));
    }
    
    // Get positions
    console.log('\nFetching positions...');
    const positions = await apiRequest('GET', '/v1/portfolio/positions');
    
    if (positions && positions.positions && positions.positions.length > 0) {
      console.log('\nOpen Positions:');
      
      const positionsData = positions.positions.map(pos => [
        pos.contract,
        formatNumber(pos.size_contracts),
        formatNumber(pos.size_assets),
        formatNumber(pos.average_entry_price),
        formatNumber(pos.unrealized_profit),
        formatNumber(pos.liquidation_price),
        formatNumber(pos.leverage)
      ]);
      
      displayTable(
        ['Contract', 'Size (Contracts)', 'Size (Assets)', 'Entry Price', 'Unrealized P/L', 'Liquidation Price', 'Leverage'],
        positionsData
      );
    } else {
      console.log('No open positions.');
    }
    
    // Get open orders
    console.log('\nFetching open orders...');
    const orders = await apiRequest('GET', '/v1/portfolio/orders');
    
    if (orders && orders.orders && orders.orders.length > 0) {
      console.log('\nOpen Orders:');
      
      const ordersData = orders.orders.map(order => [
        order.order_id,
        order.contract_info.symbol,
        order.order_type,
        formatNumber(order.limit_price),
        order.side,
        formatNumber(order.opened_quantity_contracts),
        order.time_in_force,
        new Date(order.created_at).toLocaleString()
      ]);
      
      displayTable(
        ['ID', 'Contract', 'Type', 'Price', 'Side', 'Quantity', 'TIF', 'Created At'],
        ordersData
      );
    } else {
      console.log('No open orders.');
    }
    
    // Get recent transactions
    console.log('\nFetching recent transactions...');
    const transactions = await apiRequest('GET', '/v1/portfolio/history/transactions?count=5');
    
    if (transactions && transactions.events && transactions.events.length > 0) {
      console.log('\nRecent Transactions:');
      
      const txData = transactions.events.map(tx => [
        tx.type,
        formatNumber(tx.amount),
        new Date(tx.created_at).toLocaleString(),
        tx.tx_info ? tx.tx_info.transaction_hash.substring(0, 10) + '...' : 'N/A'
      ]);
      
      displayTable(
        ['Type', 'Amount', 'Time', 'Tx Hash'],
        txData
      );
    } else {
      console.log('No recent transactions.');
    }
  } catch (error) {
    console.error('Error fetching account information:', error.message);
  }
}

// Get user positions
async function getPositions() {
  try {
    console.log('Fetching positions...');
    const positions = await apiRequest('GET', '/v1/trading/positions');
    return positions;
  } catch (error) {
    console.error('Error fetching positions:', error.message);
    return [];
  }
}

// Get portfolio details
async function getPortfolio() {
  try {
    console.log('Getting portfolio overview...');
    const portfolio = await apiRequest('GET', '/v1/trading/portfolio');
    return portfolio;
  } catch (error) {
    console.error('Error fetching portfolio:', error.message);
    return null;
  }
}

// Export all functions
module.exports = {
  getAccountInformation,
  getPositions,
  getPortfolio
};