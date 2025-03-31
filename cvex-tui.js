#!/usr/bin/env node
// cvex-tui.js - Text-based User Interface for CVEX Trading API
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { loadConfig, saveConfig, getConfig } = require('./actions/config');
const { listContracts, getContractDetails, getMarketData } = require('./actions/markets');
const { estimateOrder, placeOrder } = require('./actions/trading');
const { getAccountInformation } = require('./actions/account');
const { formatNumber } = require('./actions/utils');

// Load configuration
try {
  loadConfig();
  console.log('Configuration loaded successfully');
} catch (error) {
  console.error('Error loading configuration:', error.message);
  // Continue even if configuration fails - will prompt user to configure later
}

console.log('Initializing CVEX Trading Terminal...');

// Create a screen object
const screen = blessed.screen({
  smartCSR: true,
  title: 'CVEX Trading Terminal',
  dockBorders: true,
  fullUnicode: true,
  debug: true,
  log: true
});

console.log('Screen created successfully');

// Global state
let state = {
  currentTab: 'dashboard',
  contracts: [],
  selectedContract: null,
  accountData: {
    portfolio: null,
    positions: [],
    orders: [],
    transactions: []
  },
  marketData: {
    orderBook: { asks: [], bids: [] },
    recentTrades: [],
    priceHistory: []
  },
  orderForm: {
    side: 'buy',
    type: 'limit',
    limitPrice: '',
    quantity: '',
    timeInForce: 'GTC',
    reduceOnly: false
  },
  estimationResult: null
};

// Create main layout grid
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Create menu
const menu = blessed.listbar({
  parent: screen,
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  mouse: true,
  keys: true,
  autoCommandKeys: true,
  border: 'line',
  style: {
    bg: 'blue',
    item: {
      bg: 'blue',
      fg: 'white',
      hover: {
        bg: 'cyan'
      }
    },
    selected: {
      bg: 'cyan',
      fg: 'black'
    }
  }
});

// Status bar
const statusBar = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  content: ' CVEX Trading Terminal | Press Esc to exit',
  style: {
    bg: 'blue',
    fg: 'white'
  }
});

// Content area
const content = blessed.box({
  parent: screen,
  top: 3,
  left: 0,
  right: 0,
  bottom: 1,
  style: {
    bg: 'black'
  }
});

// Dashboard components
const dashboardTab = blessed.box({
  parent: content,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  style: {
    bg: 'black'
  },
  hidden: true
});

const portfolioBox = grid.set(0, 0, 4, 6, contrib.table, {
  parent: dashboardTab,
  keys: true,
  fg: 'white',
  label: 'Portfolio',
  columnSpacing: 3,
  columnWidth: [15, 20]
});

const positionsTable = grid.set(4, 0, 4, 12, contrib.table, {
  parent: dashboardTab,
  keys: true,
  fg: 'white',
  label: 'Positions',
  columnSpacing: 3,
  interactive: true,
  columnWidth: [10, 20, 12, 12, 12, 14, 10]
});

const ordersTable = grid.set(8, 0, 4, 12, contrib.table, {
  parent: dashboardTab,
  keys: true,
  fg: 'white',
  label: 'Open Orders',
  columnSpacing: 3,
  interactive: true,
  columnWidth: [10, 10, 8, 12, 6, 10, 6, 20]
});

const statsBox = grid.set(0, 6, 4, 6, contrib.table, {
  parent: dashboardTab,
  keys: true,
  fg: 'white',
  label: 'Market Statistics',
  columnSpacing: 3,
  columnWidth: [20, 20]
});

// Markets tab components
const marketsTab = blessed.box({
  parent: content,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  style: {
    bg: 'black'
  },
  hidden: true
});

// Add information text
blessed.text({
  parent: marketsTab,
  top: 0,
  left: 'center',
  content: 'Select a contract below and press Enter to view details',
  style: {
    fg: 'yellow',
    bold: true
  }
});

const marketsTable = grid.set(1, 0, 11, 12, contrib.table, {
  parent: marketsTab,
  keys: true,
  vi: true,
  mouse: true,
  fg: 'white',
  label: 'Available Contracts',
  columnSpacing: 3,
  interactive: true,
  columnWidth: [6, 20, 15, 15, 15, 15]
});

const contractDetailsBox = grid.set(6, 0, 6, 6, contrib.table, {
  parent: marketsTab,
  keys: true,
  fg: 'white',
  label: 'Contract Details',
  columnSpacing: 3,
  columnWidth: [20, 25]
});

const priceChart = grid.set(6, 6, 6, 6, contrib.line, { 
  parent: marketsTab,
  style: { 
    line: 'yellow',
    text: 'green',
    baseline: 'black'
  },
  xLabelPadding: 3,
  xPadding: 5,
  label: 'Price History',
  showLegend: true,
  legend: {width: 12}
});

// Trading tab components
const tradingTab = blessed.box({
  parent: content,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  style: {
    bg: 'black'
  },
  hidden: true
});

const orderBookBox = grid.set(0, 0, 6, 5, contrib.table, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  interactive: true,
  label: 'Order Book',
  columnSpacing: 3,
  columnWidth: [15, 15, 15]
});

const tradesBox = grid.set(0, 5, 6, 7, contrib.table, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  interactive: true,
  label: 'Recent Trades',
  columnSpacing: 3,
  columnWidth: [20, 15, 15, 15, 10]
});

const orderFormBox = grid.set(6, 0, 6, 6, blessed.form, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  label: 'New Order',
  border: 'line'
});

const orderResultBox = grid.set(6, 6, 6, 6, contrib.table, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  interactive: true,
  label: 'Order Estimation',
  columnSpacing: 3,
  columnWidth: [25, 25]
});

// Config Tab
const configTab = blessed.box({
  parent: content,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  style: {
    bg: 'black'
  },
  hidden: true
});

const configForm = blessed.form({
  parent: configTab,
  top: 1,
  left: 'center',
  width: 60,
  height: 15,
  keys: true,
  border: 'line',
  style: {
    border: {
      fg: 'white'
    }
  }
});

blessed.text({
  parent: configForm,
  content: 'API URL:',
  top: 2,
  left: 2
});

const apiUrlInput = blessed.textbox({
  parent: configForm,
  name: 'apiUrl',
  top: 2,
  left: 15,
  right: 2,
  height: 1,
  inputOnFocus: true,
  border: 'line',
  style: {
    focus: {
      border: {
        fg: 'cyan'
      }
    }
  }
});

blessed.text({
  parent: configForm,
  content: 'API Key:',
  top: 5,
  left: 2
});

const apiKeyInput = blessed.textbox({
  parent: configForm,
  name: 'apiKey',
  top: 5,
  left: 15,
  right: 2,
  height: 1,
  inputOnFocus: true,
  border: 'line',
  style: {
    focus: {
      border: {
        fg: 'cyan'
      }
    }
  }
});

blessed.text({
  parent: configForm,
  content: 'Private Key Path:',
  top: 8,
  left: 2
});

const privateKeyPathInput = blessed.textbox({
  parent: configForm,
  name: 'privateKeyPath',
  top: 8,
  left: 15,
  right: 2,
  height: 1,
  inputOnFocus: true,
  border: 'line',
  style: {
    focus: {
      border: {
        fg: 'cyan'
      }
    }
  }
});

const saveButton = blessed.button({
  parent: configForm,
  name: 'save',
  content: 'Save',
  top: 11,
  left: 15,
  width: 10,
  height: 1,
  padding: {
    left: 1,
    right: 1
  },
  style: {
    bg: 'blue',
    fg: 'white',
    focus: {
      bg: 'cyan'
    },
    hover: {
      bg: 'cyan'
    }
  }
});

// Trading form components
const sideRadioSet = blessed.radioset({
  parent: orderFormBox,
  top: 2,
  left: 2
});

const buyRadio = blessed.radiobutton({
  parent: sideRadioSet,
  content: 'Buy',
  checked: true,
  style: {
    bg: 'black',
    fg: 'green'
  }
});

const sellRadio = blessed.radiobutton({
  parent: sideRadioSet,
  content: 'Sell',
  left: 15,
  style: {
    bg: 'black',
    fg: 'red'
  }
});

const typeRadioSet = blessed.radioset({
  parent: orderFormBox,
  top: 4,
  left: 2
});

const limitRadio = blessed.radiobutton({
  parent: typeRadioSet,
  content: 'Limit',
  checked: true
});

const marketRadio = blessed.radiobutton({
  parent: typeRadioSet,
  content: 'Market',
  left: 15
});

blessed.text({
  parent: orderFormBox,
  content: 'Price:',
  top: 6,
  left: 2
});

const priceInput = blessed.textbox({
  parent: orderFormBox,
  top: 6,
  left: 15,
  width: 20,
  height: 1,
  inputOnFocus: true,
  border: 'line',
  style: {
    focus: {
      border: {
        fg: 'cyan'
      }
    }
  }
});

blessed.text({
  parent: orderFormBox,
  content: 'Quantity:',
  top: 8,
  left: 2
});

const quantityInput = blessed.textbox({
  parent: orderFormBox,
  top: 8,
  left: 15,
  width: 20,
  height: 1,
  inputOnFocus: true,
  border: 'line',
  style: {
    focus: {
      border: {
        fg: 'cyan'
      }
    }
  }
});

blessed.text({
  parent: orderFormBox,
  content: 'Time-in-Force:',
  top: 10,
  left: 2
});

const tifSelect = blessed.list({
  parent: orderFormBox,
  top: 10,
  left: 15,
  width: 20,
  height: 4,
  border: 'line',
  mouse: true,
  keys: true,
  style: {
    bg: 'black',
    fg: 'white',
    focus: {
      border: {
        fg: 'cyan'
      }
    },
    selected: {
      bg: 'blue',
      fg: 'white'
    }
  },
  items: ['GTC', 'IOC', 'FOK', 'PO']
});

const reduceOnlyCheckbox = blessed.checkbox({
  parent: orderFormBox,
  content: 'Reduce Only',
  top: 14,
  left: 2,
  style: {
    fg: 'white'
  }
});

const estimateButton = blessed.button({
  parent: orderFormBox,
  content: 'Estimate',
  top: 16,
  left: 2,
  width: 10,
  height: 1,
  padding: {
    left: 1,
    right: 1
  },
  style: {
    bg: 'blue',
    fg: 'white',
    focus: {
      bg: 'cyan'
    },
    hover: {
      bg: 'cyan'
    }
  }
});

const placeOrderButton = blessed.button({
  parent: orderFormBox,
  content: 'Place Order',
  top: 16,
  left: 15,
  width: 12,
  height: 1,
  padding: {
    left: 1,
    right: 1
  },
  style: {
    bg: 'green',
    fg: 'white',
    focus: {
      bg: 'cyan'
    },
    hover: {
      bg: 'cyan'
    }
  }
});

// Menu setup
menu.setItems({
  'Markets': function() { showTab('markets'); },
  'Contract Detail': function() { 
    if (state.selectedContract) {
      showTab('trading'); 
    } else {
      statusBar.setContent(' Please select a contract first');
      screen.render();
    }
  },
  'Dashboard': function() { showTab('dashboard'); },
  'Config': function() { showTab('config'); },
  'Refresh': function() { refreshData(); },
  'Quit': function() { process.exit(0); }
});

// Set up event handlers

// Dashboard events
positionsTable.rows.on('select', function(item, index) {
  if (state.accountData.positions[index]) {
    const position = state.accountData.positions[index];
    // Could display more details here
  }
});

// Markets events
marketsTable.rows.on('select', function(item, index) {
  if (state.contracts[index]) {
    const contractId = state.contracts[index][0]; // ID is first column
    selectContract(contractId);
    
    // Automatically show contract details in trading tab after selection
    setTimeout(() => {
      showTab('trading');
      statusBar.setContent(` Selected ${state.contracts[index][1]} - Press Enter on chart or tables to interact`);
      screen.render();
    }, 500);
  }
});

// Form events
buyRadio.on('check', function() {
  state.orderForm.side = 'buy';
});

sellRadio.on('check', function() {
  state.orderForm.side = 'sell';
});

limitRadio.on('check', function() {
  state.orderForm.type = 'limit';
  priceInput.style.bg = 'black';
  priceInput.readOnly = false;
});

marketRadio.on('check', function() {
  state.orderForm.type = 'market';
  priceInput.style.bg = 'gray';
  priceInput.readOnly = true;
});

priceInput.on('submit', function(text) {
  state.orderForm.limitPrice = text;
});

quantityInput.on('submit', function(text) {
  state.orderForm.quantity = text;
});

tifSelect.on('select', function(item, index) {
  state.orderForm.timeInForce = item;
});

reduceOnlyCheckbox.on('check', function() {
  state.orderForm.reduceOnly = true;
});

reduceOnlyCheckbox.on('uncheck', function() {
  state.orderForm.reduceOnly = false;
});

estimateButton.on('press', function() {
  estimateCurrentOrder();
});

placeOrderButton.on('press', function() {
  placeCurrentOrder();
});

// Config form events
saveButton.on('press', function() {
  saveCurrentConfig();
});

// Key bindings
screen.key(['escape', 'q', 'C-c'], function() {
  return process.exit(0);
});

screen.key(['tab'], function() {
  screen.focusNext();
});

screen.key(['S-tab'], function() {
  screen.focusPrevious();
});

// Functions

function showTab(tabName) {
  console.log(`Switching to tab: ${tabName}`);
  
  try {
    // Hide all tabs
    dashboardTab.hide();
    marketsTab.hide();
    tradingTab.hide();
    configTab.hide();
    
    // Show the selected tab
    switch(tabName) {
      case 'dashboard':
        dashboardTab.show();
        setTimeout(() => refreshDashboard(), 100);
        break;
      case 'markets':
        marketsTab.show();
        setTimeout(() => refreshMarkets(), 100);
        break;
      case 'trading':
        tradingTab.show();
        setTimeout(() => refreshTrading(), 100);
        break;
      case 'config':
        configTab.show();
        setTimeout(() => loadConfigForm(), 100);
        break;
      default:
        console.log(`Unknown tab: ${tabName}`);
        configTab.show(); // Default to config
        setTimeout(() => loadConfigForm(), 100);
    }
    
    state.currentTab = tabName;
    screen.render();
    console.log(`Tab switch to ${tabName} complete`);
  } catch (error) {
    console.error(`Error showing tab ${tabName}:`, error);
    screen.render();
  }
}

async function refreshData() {
  switch(state.currentTab) {
    case 'dashboard':
      await refreshDashboard();
      break;
    case 'markets':
      await refreshMarkets();
      break;
    case 'trading':
      await refreshTrading();
      break;
  }
}

async function refreshDashboard() {
  statusBar.setContent(' Loading account data...');
  screen.render();

  try {
    // Get account information
    const portfolio = await apiRequest('GET', '/v1/portfolio/overview');
    const positions = await apiRequest('GET', '/v1/portfolio/positions');
    const orders = await apiRequest('GET', '/v1/portfolio/orders');
    const transactions = await apiRequest('GET', '/v1/portfolio/history/transactions?count=5');

    // Update state
    if (portfolio && portfolio.portfolio) {
      state.accountData.portfolio = portfolio.portfolio;
    }

    if (positions && positions.positions) {
      state.accountData.positions = positions.positions;
    }

    if (orders && orders.orders) {
      state.accountData.orders = orders.orders;
    }

    if (transactions && transactions.events) {
      state.accountData.transactions = transactions.events;
    }

    // Update portfolio box
    if (state.accountData.portfolio) {
      const p = state.accountData.portfolio;
      portfolioBox.setData({
        headers: ['Metric', 'Value'],
        data: [
          ['Portfolio ID', p.portfolio_id],
          ['Collateral', formatNumber(p.collateral_balance)],
          ['Unrealized P/L', formatNumber(p.unrealized_profit)],
          ['Equity', formatNumber(p.equity)],
          ['Available', formatNumber(p.available_to_withdraw)],
          ['Margin Used', `${formatNumber(p.margin_utilization * 100)}%`],
          ['Leverage', `${formatNumber(p.leverage)}x`],
          ['Liq. Risk', `${formatNumber(p.liquidation_risk_1d * 100)}%`]
        ]
      });
    }

    // Update positions table
    if (state.accountData.positions.length > 0) {
      const positionsData = state.accountData.positions.map(pos => [
        pos.contract,
        pos.contract_info.symbol,
        formatNumber(pos.size_contracts),
        formatNumber(pos.average_entry_price),
        formatNumber(pos.unrealized_profit),
        formatNumber(pos.liquidation_price),
        formatNumber(pos.leverage)
      ]);

      positionsTable.setData({
        headers: ['ID', 'Symbol', 'Size', 'Entry Price', 'Unrealized P/L', 'Liquidation', 'Leverage'],
        data: positionsData
      });
    } else {
      positionsTable.setData({
        headers: ['ID', 'Symbol', 'Size', 'Entry Price', 'Unrealized P/L', 'Liquidation', 'Leverage'],
        data: [['No open positions', '', '', '', '', '', '']]
      });
    }

    // Update orders table
    if (state.accountData.orders.length > 0) {
      const ordersData = state.accountData.orders.map(order => [
        order.order_id,
        order.contract_info.symbol,
        order.order_type,
        formatNumber(order.limit_price),
        order.side,
        formatNumber(order.opened_quantity_contracts),
        order.time_in_force,
        new Date(order.created_at).toLocaleString()
      ]);

      ordersTable.setData({
        headers: ['ID', 'Contract', 'Type', 'Price', 'Side', 'Quantity', 'TIF', 'Created At'],
        data: ordersData
      });
    } else {
      ordersTable.setData({
        headers: ['ID', 'Contract', 'Type', 'Price', 'Side', 'Quantity', 'TIF', 'Created At'],
        data: [['No open orders', '', '', '', '', '', '', '']]
      });
    }

    statusBar.setContent(' Dashboard updated');
  } catch (error) {
    statusBar.setContent(` Error: ${error.message}`);
  }

  screen.render();
}

async function refreshMarkets() {
  statusBar.setContent(' Loading markets data...');
  screen.render();

  try {
    // Check configuration first
    if (!getConfig().apiKey) {
      statusBar.setContent(' API configuration missing. Please set up your credentials in the Config tab.');
      screen.render();
      return;
    }
    
    // Fetch contracts list
    const result = await apiRequest('GET', '/v1/market/futures?active=true');

    if (result && result.contracts && result.contracts.length > 0) {
      state.contracts = result.contracts;

      // Create table data
      const tableData = result.contracts.map(contract => [
        contract.contract_id,
        contract.symbol,
        contract.index,
        formatNumber(contract.last_price || 0),
        formatNumber(contract.mark_price || 0),
        formatNumber(contract.volume_24h || 0)
      ]);

      // Set table data
      marketsTable.setData({
        headers: ['ID', 'Symbol', 'Index', 'Last Price', 'Mark Price', '24h Volume'],
        data: tableData
      });

      // Update market stats if we have a selected contract
      if (state.selectedContract) {
        await selectContract(state.selectedContract.contract_id);
      }
      
      // Focus on the markets table for easier navigation
      marketsTable.focus();
      
      statusBar.setContent(' Markets data loaded. Use arrow keys to navigate, Enter to select a contract');
    } else {
      statusBar.setContent(' No contracts available');
      marketsTable.setData({
        headers: ['ID', 'Symbol', 'Index', 'Last Price', 'Mark Price', '24h Volume'],
        data: [['No contracts available', '', '', '', '', '']]
      });
    }
  } catch (error) {
    console.error('Markets error:', error);
    statusBar.setContent(` Error: ${error.message || 'Unknown error fetching markets'}`);
    marketsTable.setData({
      headers: ['ID', 'Symbol', 'Index', 'Last Price', 'Mark Price', '24h Volume'],
      data: [['Error loading contracts', '', '', '', '', '']]
    });
  }

  screen.render();
}

async function selectContract(contractId) {
  try {
    // Fetch contract details
    const result = await apiRequest('GET', `/v1/market/futures/${contractId}`);
    
    if (result && result.details) {
      state.selectedContract = result.details;
      
      // Update contract details box
      const contract = result.details;
      contractDetailsBox.setData({
        headers: ['Property', 'Value'],
        data: [
          ['Contract ID', contract.contract_id],
          ['Symbol', contract.symbol],
          ['Index', contract.index],
          ['Last Price', formatNumber(contract.last_price)],
          ['Mark Price', formatNumber(contract.mark_price)],
          ['Index Price', formatNumber(contract.index_price)],
          ['24h Low/High', `${formatNumber(contract.low_24h)} / ${formatNumber(contract.high_24h)}`],
          ['24h Volume', formatNumber(contract.volume_24h)],
          ['Open Interest', formatNumber(contract.open_interest)],
          ['Min Order Size', `${formatNumber(contract.min_order_size_contracts)} contracts`],
          ['Price Tick', contract.price_tick],
          ['Status', contract.status]
        ]
      });
      
      // Update charts and market data
      await updateMarketData(contractId);
      
      statusBar.setContent(` Selected contract: ${contract.symbol}`);
    }
  } catch (error) {
    statusBar.setContent(` Error: ${error.message}`);
  }
  
  screen.render();
}

async function updateMarketData(contractId) {
  try {
    // Run API requests in parallel to speed up loading
    const [priceHistoryResponse, recentTradesResponse, orderBookResponse] = await Promise.all([
      apiRequest('GET', `/v1/market/futures/${contractId}/price?period=1h&count=24`),
      apiRequest('GET', `/v1/market/futures/${contractId}/latest-trades?count=10`),
      apiRequest('GET', `/v1/market/futures/${contractId}/order-book?price_step=1`)
    ]);
    
    // Process price history
    if (priceHistoryResponse && priceHistoryResponse.data) {
      state.marketData.priceHistory = priceHistoryResponse.data;
      
      // Update price chart
      const times = priceHistoryResponse.data.map(item => new Date(item.time_open).getHours() + ':00');
      const closePrices = priceHistoryResponse.data.map(item => parseFloat(item.price_close));
      
      priceChart.setData([{
        x: times,
        y: closePrices,
        style: { line: 'yellow' }
      }]);
    }
    
    // Process recent trades
    if (recentTradesResponse && recentTradesResponse.trades) {
      state.marketData.recentTrades = recentTradesResponse.trades;
      
      // Set trades table data with colored sides
      const tradesData = recentTradesResponse.trades.map(trade => [
        new Date(trade.time).toLocaleString(),
        formatNumber(trade.last_price),
        formatNumber(trade.quantity_contracts),
        formatNumber(trade.quantity_base),
        trade.taker_side.toUpperCase()
      ]);
      
      tradesBox.setData({
        headers: ['Time', 'Price', 'Quantity', 'Base Qty', 'Side'],
        data: tradesData
      });
    }
    
    // Process order book
    if (orderBookResponse && orderBookResponse.asks && orderBookResponse.bids) {
      state.marketData.orderBook = orderBookResponse;
      
      // Prepare order book data for visualization
      const asksData = orderBookResponse.asks.slice(0, 7).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      const bidsData = orderBookResponse.bids.slice(0, 7).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      // Combine and set order book data with clear separator
      const combinedData = [
        ['ASK PRICES', 'CONTRACTS', 'BASE'],
        ...asksData.reverse(),
        ['-----', '-----', '-----'],
        ...bidsData
      ];
      
      orderBookBox.setData({
        headers: ['Price', 'Quantity', 'Base'],
        data: combinedData
      });
    }
    
    // All data is loaded
    statusBar.setContent(` ${state.selectedContract.symbol} market data updated`);
  } catch (error) {
    statusBar.setContent(` Error loading market data: ${error.message}`);
  }
  
  screen.render();
}

async function refreshTrading() {
  if (!state.selectedContract) {
    // If no contract is selected, show markets first to select one
    statusBar.setContent(' Please select a contract from Markets tab first');
    showTab('markets');
    return;
  }
  
  statusBar.setContent(` Loading data for ${state.selectedContract.symbol}...`);
  screen.render();
  
  // Update order book and recent trades
  await updateMarketData(state.selectedContract.contract_id);
  
  // Update order form with current market price
  if (state.marketData.orderBook && state.marketData.orderBook.asks && state.marketData.orderBook.asks.length > 0) {
    const bestAsk = state.marketData.orderBook.asks[0].price;
    priceInput.setValue(bestAsk.toString());
    state.orderForm.limitPrice = bestAsk.toString();
  }
  
  // Set focus on the order book for easy navigation
  orderBookBox.focus();
  
  statusBar.setContent(` ${state.selectedContract.symbol} - Use Tab to navigate between panels`);
  screen.render();
}

async function estimateCurrentOrder() {
  if (!state.selectedContract) {
    statusBar.setContent(' Please select a contract first');
    return;
  }
  
  try {
    statusBar.setContent(' Estimating order...');
    screen.render();
    
    // Convert orderSide to quantity_steps format (positive for buy, negative for sell)
    const quantityValue = parseInt(state.orderForm.quantity) || 0;
    const formattedQuantitySteps = state.orderForm.side === 'buy' 
      ? quantityValue.toString() 
      : `-${quantityValue}`;
    
    // Create estimation payload
    const estimatePayload = {
      contract: state.selectedContract.contract_id.toString(),
      type: state.orderForm.type,
      limit_price: state.orderForm.limitPrice,
      time_in_force: state.orderForm.timeInForce,
      reduce_only: state.orderForm.reduceOnly,
      quantity_steps: formattedQuantitySteps,
      quantity_contracts: '',
      quantity_assets: ''
    };
    
    // Make the estimation request
    const estimationResult = await apiRequest('POST', '/v1/trading/estimate-order', estimatePayload);
    state.estimationResult = estimationResult;
    
    if (estimationResult) {
      if (estimationResult.error) {
        statusBar.setContent(` Error: ${estimationResult.error}`);
      } else {
        // Display estimation results
        orderResultBox.setData({
          headers: ['Parameter', 'Value'],
          data: [
            ['Order Type', `${state.orderForm.side.toUpperCase()} ${state.orderForm.type}`],
            ['Trading Fee', formatNumber(estimationResult.trading_fee)],
            ['Operational Fee', formatNumber(estimationResult.operational_fee)],
            ['Realized Profit', formatNumber(estimationResult.realized_profit)],
            ['Taker Base Amount', formatNumber(estimationResult.taker_base_amount)],
            ['Taker Tokens Amount', formatNumber(estimationResult.taker_tokens_amount)],
            ['Current Equity', formatNumber(estimationResult.current_equity)],
            ['New Equity', formatNumber(estimationResult.new_equity)],
            ['Current Leverage', formatNumber(estimationResult.current_leverage)],
            ['New Leverage', formatNumber(estimationResult.new_leverage)],
            ['Est. Liquidation Price', formatNumber(estimationResult.estimated_liquidation_price)]
          ]
        });
        
        statusBar.setContent(' Order estimated successfully');
      }
    }
  } catch (error) {
    statusBar.setContent(` Error estimating order: ${error.message}`);
  }
  
  screen.render();
}

async function placeCurrentOrder() {
  if (!state.estimationResult) {
    statusBar.setContent(' Please estimate the order first');
    screen.render();
    return;
  }
  
  try {
    statusBar.setContent(' Placing order...');
    screen.render();
    
    // Convert orderSide to quantity_steps format (positive for buy, negative for sell)
    const quantityValue = parseInt(state.orderForm.quantity) || 0;
    const formattedQuantitySteps = state.orderForm.side === 'buy' 
      ? quantityValue.toString() 
      : `-${quantityValue}`;
    
    // Create order parameters
    const orderParams = {
      customer_order_id: `tui-${Date.now()}`,
      contract: state.selectedContract.contract_id.toString(),
      type: state.orderForm.type,
      limit_price: state.orderForm.limitPrice,
      time_in_force: state.orderForm.timeInForce,
      reduce_only: state.orderForm.reduceOnly,
      quantity_steps: formattedQuantitySteps,
      quantity_contracts: "",
      quantity_assets: "",
      timestamp: Date.now(),
      recv_window: 30000
    };
    
    // Submit the order
    const result = await apiRequest('POST', '/v1/trading/order', orderParams, true);
    
    if (result) {
      if (result.status === 'success' || result.transaction_hash) {
        statusBar.setContent(` ${state.orderForm.side.toUpperCase()} order successfully submitted!`);
        await refreshDashboard(); // Refresh to show the new order
      } else {
        statusBar.setContent(` Order failed: ${result.message || 'Unknown error'}`);
      }
    }
  } catch (error) {
    statusBar.setContent(` Error placing order: ${error.message}`);
  }
  
  screen.render();
}

function loadConfigForm() {
  const config = getConfig();
  apiUrlInput.setValue(config.apiUrl || '');
  apiKeyInput.setValue(config.apiKey || '');
  privateKeyPathInput.setValue(config.privateKeyPath || '');
  screen.render();
}

function saveCurrentConfig() {
  const config = getConfig();
  
  config.apiUrl = apiUrlInput.value;
  config.apiKey = apiKeyInput.value;
  config.privateKeyPath = privateKeyPathInput.value;
  
  saveConfig();
  statusBar.setContent(' Configuration saved');
  screen.render();
}

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, needsSignature = false) {
  try {
    console.log(`Making ${method} request to ${endpoint}`);
    // Use the same API request function from utils.js
    const { apiRequest: utilsApiRequest } = require('./actions/utils');
    const result = await utilsApiRequest(method, endpoint, data, needsSignature);
    console.log(`Request to ${endpoint} completed successfully`);
    return result;
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error);
    statusBar.setContent(` API Error: ${error.message}`);
    screen.render();
    throw error;
  }
}

// Ensure the UI is fully rendered first
setTimeout(() => {
  try {
    console.log('Starting app initialization...');
    // Initialize with the config tab if no configuration exists
    if (!getConfig().apiKey || !getConfig().privateKeyPath) {
      statusBar.setContent(' No configuration found. Please configure your API credentials first.');
      showTab('config');
    } else {
      // Otherwise start with markets tab
      showTab('markets');
    }
    console.log('Initial tab setup complete');
  } catch (error) {
    console.error('Error during app initialization:', error);
    // Fallback to markets regardless of error
    showTab('markets');
  }
}, 500);

// Start the CLI
screen.render();
