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
loadConfig();

// Create a screen object
const screen = blessed.screen({
  smartCSR: true,
  title: 'CVEX Trading Terminal',
  dockBorders: true,
  fullUnicode: true
});

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

const marketsTable = grid.set(0, 0, 6, 12, contrib.table, {
  parent: marketsTab,
  keys: true,
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

const orderBookBox = grid.set(0, 0, 6, 4, contrib.table, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  label: 'Order Book',
  columnSpacing: 3,
  columnWidth: [15, 15, 15]
});

const tradesBox = grid.set(0, 4, 6, 8, contrib.table, {
  parent: tradingTab,
  keys: true,
  fg: 'white',
  label: 'Recent Trades',
  columnSpacing: 3,
  columnWidth: [20, 15, 20, 20, 10]
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
  'Dashboard': function() { showTab('dashboard'); },
  'Markets': function() { showTab('markets'); },
  'Trading': function() { showTab('trading'); },
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
  // Hide all tabs
  dashboardTab.hide();
  marketsTab.hide();
  tradingTab.hide();
  configTab.hide();

  // Show the selected tab
  switch(tabName) {
    case 'dashboard':
      dashboardTab.show();
      refreshDashboard();
      break;
    case 'markets':
      marketsTab.show();
      refreshMarkets();
      break;
    case 'trading':
      tradingTab.show();
      refreshTrading();
      break;
    case 'config':
      configTab.show();
      loadConfigForm();
      break;
  }

  state.currentTab = tabName;
  screen.render();
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
    // Fetch contracts list
    const result = await apiRequest('GET', '/v1/market/futures?active=true');

    if (result && result.contracts) {
      state.contracts = result.contracts;

      // Create table data
      const tableData = result.contracts.map(contract => [
        contract.contract_id,
        contract.symbol,
        contract.index,
        formatNumber(contract.last_price),
        formatNumber(contract.mark_price),
        formatNumber(contract.volume_24h)
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
    }

    statusBar.setContent(' Markets data updated');
  } catch (error) {
    statusBar.setContent(` Error: ${error.message}`);
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
    // Price history
    const priceHistory = await apiRequest('GET', `/v1/market/futures/${contractId}/price?period=1h&count=24`);
    
    if (priceHistory && priceHistory.data) {
      state.marketData.priceHistory = priceHistory.data;
      
      // Update price chart
      const times = priceHistory.data.map(item => new Date(item.time_open).getHours() + ':00');
      const closePrices = priceHistory.data.map(item => parseFloat(item.price_close));
      
      priceChart.setData([{
        x: times,
        y: closePrices,
        style: { line: 'yellow' }
      }]);
    }
    
    // Recent trades
    const recentTrades = await apiRequest('GET', `/v1/market/futures/${contractId}/latest-trades?count=10`);
    
    if (recentTrades && recentTrades.trades) {
      state.marketData.recentTrades = recentTrades.trades;
      
      // Set trades table data
      const tradesData = recentTrades.trades.map(trade => [
        new Date(trade.time).toLocaleString(),
        formatNumber(trade.last_price),
        formatNumber(trade.quantity_contracts),
        formatNumber(trade.quantity_base),
        trade.taker_side
      ]);
      
      tradesBox.setData({
        headers: ['Time', 'Price', 'Quantity', 'Base Qty', 'Side'],
        data: tradesData
      });
    }
    
    // Order book
    const orderBook = await apiRequest('GET', `/v1/market/futures/${contractId}/order-book?price_step=1`);
    
    if (orderBook && orderBook.asks && orderBook.bids) {
      state.marketData.orderBook = orderBook;
      
      // Prepare order book data for visualization
      const asksData = orderBook.asks.slice(0, 7).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      const bidsData = orderBook.bids.slice(0, 7).map(item => [
        formatNumber(item.price),
        formatNumber(item.quantity_contracts),
        formatNumber(item.quantity_base)
      ]);
      
      // Combine and set order book data
      const combinedData = [
        ['ASK PRICES', 'CONTRACTS', 'BASE'],
        ...asksData.reverse(),
        ['---', '---', '---'],
        ...bidsData
      ];
      
      orderBookBox.setData({
        headers: ['Price', 'Quantity', 'Base'],
        data: combinedData
      });
    }
  } catch (error) {
    statusBar.setContent(` Error: ${error.message}`);
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
  
  // Update order book and recent trades
  await updateMarketData(state.selectedContract.contract_id);
  
  // Update order form with current market price
  if (state.marketData.orderBook && state.marketData.orderBook.asks && state.marketData.orderBook.asks.length > 0) {
    const bestAsk = state.marketData.orderBook.asks[0].price;
    priceInput.setValue(bestAsk.toString());
    state.orderForm.limitPrice = bestAsk.toString();
  }
  
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
    // Use the same API request function from utils.js
    const { apiRequest } = require('./actions/utils');
    return await apiRequest(method, endpoint, data, needsSignature);
  } catch (error) {
    statusBar.setContent(` API Error: ${error.message}`);
    screen.render();
    throw error;
  }
}

// Initialize with the dashboard tab
showTab('config');

// Start the CLI
screen.render();
