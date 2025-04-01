#!/usr/bin/env node
// cvex-tui.js - Simplified Text-based User Interface for CVEX Trading API

// Add this at the beginning of the file after #!

// Global error handlers
const fs = require('fs');
const path = require('path');

// Add error logging functionality
function logError(error, context = '') {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? 
    `${error.message}\n${error.stack}` : 
    String(error);
  
  const logEntry = `[${timestamp}] ${context ? `[${context}] ` : ''}${errorMessage}\n\n`;
  
  try {
    fs.appendFileSync(path.join(__dirname, 'cvex-error.log'), logEntry);
  } catch (fsError) {
    // If we can't write to the log file, we're in trouble, but don't crash
    console.error('Failed to write to error log:', fsError);
  }
}

// Update global error handlers to use the logging function
process.on('unhandledRejection', (reason, promise) => {
  logError(reason, 'Unhandled Rejection');
  statusBar.setContent(' {red-bg}ERROR{/red-bg} Unhandled rejection. Check logs for details.');
  screen.render();
});

process.on('uncaughtException', (error) => {
  logError(error, 'Uncaught Exception');
  statusBar.setContent(' {red-bg}ERROR{/red-bg} Uncaught exception. Check logs for details.');
  screen.render();
});

const blessed = require('neo-blessed');
const contrib = require('blessed-contrib');
const { loadConfig, getConfig } = require('./actions/config');
const { formatNumber } = require('./actions/utils');

// Initialize API related constants and utilities
const crypto = require('crypto');
const axios = require('axios');

// API related utility functions - integrated from utils.js
function getApiKey(privateKey) {
  const derPublicKey = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const rawPublicKey = derPublicKey.subarray(-32); // Extract the last 32 bytes (raw key)
  return rawPublicKey.toString('hex');
}

function getMessageForSigning(method, url, body) {
  return `${method} ${url}\n${body}`;
}

function signMessage(privateKey, method, url, body) {
  try {
    console.log(`Signing message with method: ${method}, URL: ${url}`);
    
    // Create the message to sign according to canonical implementation
    const messageForSigning = getMessageForSigning(method, url, body);
    console.log(`Message for signing: ${messageForSigning}`);
    
    // Create a hash of the message
    const hash = crypto.createHash('sha256').update(messageForSigning).digest();
    
    // Sign the hash with private key
    const signature = crypto.sign(null, hash, privateKey);
    
    // Convert signature to hex
    const signatureHex = signature.toString('hex');
    console.log(`Generated signature: ${signatureHex}`);
    
    return signatureHex;
  } catch (error) {
    console.error('Error signing message:', error);
    throw error;
  }
}

// API request helper - integrated from utils.js
async function apiRequest(method, endpoint, data = null, needsSignature = false) {
  try {
    const config = getConfig();
    const url = `${config.apiUrl}${endpoint}`;
    
    let headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CVEX-TUI/1.0'
    };

    if (needsSignature) {
      if (!config.privateKeyPath || !fs.existsSync(config.privateKeyPath)) {
        throw new Error('Private key not configured or file not found');
      }

      const privateKeyPEM = fs.readFileSync(config.privateKeyPath, 'utf8');
      
      try {
        // Create private key object
        const privateKey = crypto.createPrivateKey({
          key: privateKeyPEM,
          format: 'pem',
          type: 'pkcs8',
        });
        
        // Extract API key from private key
        const apiKey = getApiKey(privateKey);
        console.log('Extracted API key:', apiKey);
        headers['X-API-KEY'] = apiKey;
        
        // For trading endpoints that require signatures
        const messageData = typeof data === 'string' ? data : JSON.stringify(data || {});
        console.log('Message to sign:', messageData);
        
        // Generate signature
        const signature = signMessage(privateKey, method, url, messageData);
        headers['X-Signature'] = signature;
      } catch (error) {
        console.error('Error processing private key:', error);
        throw new Error(`Private key processing error: ${error.message}`);
      }
    } else {
      // For non-signature requests, use API key from config
      headers['X-API-KEY'] = config.apiKey;
    }

    console.log(`Sending ${method} request to ${url}`);
    console.log('Headers:', JSON.stringify(headers));
    console.log('Data:', data ? JSON.stringify(data) : 'none');

    const response = await axios({
      method,
      url,
      headers,
      data: data || undefined,
      timeout: 10000 // 10 second timeout
    });

    console.log(`Response status: ${response.status}`);
    return response.data;
  } catch (error) {
    logError(error, `API Request: ${method} ${endpoint}`);
    if (error.response) {
      console.error(`API Error (${error.response.status}):`, error.response.data);
      
      // Create more informative error message with API error details
      const apiError = error.response.data?.error || {};
      const errorMessage = apiError.message || error.message || 'Unknown API error';
      const errorCode = apiError.code || error.response.status || 'ERROR';
      
      const enhancedError = new Error(`API Error (${errorCode}): ${errorMessage}`);
      enhancedError.apiErrorDetails = apiError;
      enhancedError.statusCode = error.response.status;
      throw enhancedError;
    } else if (error.request) {
      console.error('No response received:', error.message);
      throw new Error(`No response received: ${error.message}`);
    } else {
      console.error('Request Error:', error.message);
      throw error;
    }
  }
}

// Function to get account information - integrated from account.js
async function getAccountInfo() {
  try {
    console.log('Fetching account information...');
    
    // Get portfolio overview
    const portfolioResult = await apiRequest('GET', '/v1/portfolio/overview');
    
    if (portfolioResult && portfolioResult.portfolio) {
      const portfolio = portfolioResult.portfolio;
      state.account = {
        portfolioId: portfolio.portfolio_id,
        collateralBalance: portfolio.collateral_balance,
        unrealizedProfit: portfolio.unrealized_profit,
        equity: portfolio.equity,
        availableToWithdraw: portfolio.available_to_withdraw,
        marginUtilization: portfolio.margin_utilization * 100, // Convert to percentage
        leverage: portfolio.leverage,
        liquidationRisk: portfolio.liquidation_risk_1d * 100 // Convert to percentage
      };
      
      // Get positions
      const positionsResult = await apiRequest('GET', '/v1/portfolio/positions');
      if (positionsResult && positionsResult.positions) {
        state.positions = positionsResult.positions;
      }
      
      // Get open orders
      const ordersResult = await apiRequest('GET', '/v1/portfolio/orders');
      if (ordersResult && ordersResult.orders) {
        state.openOrders = ordersResult.orders;
      }
      
      // Get recent transactions
      const txResult = await apiRequest('GET', '/v1/portfolio/transactions?limit=5');
      if (txResult && txResult.transactions) {
        state.transactions = txResult.transactions;
      }
      
      return state.account;
    }
    
    throw new Error('Failed to fetch account information');
  } catch (error) {
    console.error('Error fetching account information:', error.message);
    return null;
  }
}

// Function to fetch contracts - integrated from markets.js
async function fetchContracts() {
  try {
    console.log('Fetching available contracts...');
    const result = await apiRequest('GET', '/v1/market/futures?active=true');
    
    if (result.contracts && result.contracts.length > 0) {
      state.contracts = result.contracts;
      return state.contracts;
    } else {
      console.log('No contracts available.');
      return [];
    }
  } catch (error) {
    console.error('Error fetching contracts:', error.message);
    return [];
  }
}

// Function to get contract details - integrated from markets.js
async function getContractDetails(contractId) {
  try {
    console.log(`Fetching details for contract ${contractId}...`);
    const result = await apiRequest('GET', `/v1/market/futures/${contractId}`);
    
    if (result.details) {
      return result.details;
    } else {
      console.log('Contract details not available.');
      return null;
    }
  } catch (error) {
    console.error('Error fetching contract details:', error.message);
    return null;
  }
}

// Function to get order book - integrated from markets.js
async function getOrderBook(contractId, priceStep = '1') {
  try {
    console.log(`Fetching order book for contract ${contractId}...`);
    // Valid price steps according to API error: 0.1, 1, 10, 50, 100
    
    // Make sure priceStep is a valid option and is a string
    if (typeof priceStep !== 'string') {
      priceStep = String(priceStep);
    }
    
    const validPriceSteps = ['0.1', '1', '10', '50', '100'];
    if (!validPriceSteps.includes(priceStep)) {
      priceStep = '1'; // Default to 1 if invalid
    }
    
    const orderBook = await apiRequest('GET', `/v1/market/futures/${contractId}/order-book?price_step=${priceStep}`);
    
    if (orderBook && (orderBook.asks || orderBook.bids)) {
      return orderBook;
    }
    return { asks: [], bids: [] };
  } catch (error) {
    logError(error, `Order Book API - Contract ${contractId}, Step ${priceStep}`);
    console.error(`Error fetching order book for contract ${contractId} with price step ${priceStep}:`, error.message);
    return { asks: [], bids: [] };
  }
}

// Function to get recent trades - integrated from markets.js
async function getRecentTrades(contractId, count = 7) {
  try {
    console.log(`Fetching recent trades for contract ${contractId}...`);
    const recentTrades = await apiRequest('GET', `/v1/market/futures/${contractId}/latest-trades?count=${count}`);
    
    if (recentTrades.trades && recentTrades.trades.length > 0) {
      return recentTrades.trades;
    }
    return [];
  } catch (error) {
    console.error('Error fetching recent trades:', error.message);
    return [];
  }
}

// Function to estimate order - integrated from trading.js
async function estimateOrder(orderParams) {
  try {
    console.log('Estimating order with parameters:', orderParams);
    
    // Validate required fields
    if (!orderParams.contract) {
      throw new Error('Missing contract ID');
    }
    
    if (!orderParams.type) {
      throw new Error('Missing order type');
    }
    
    // For limit orders, ensure limit price is set
    if (orderParams.type === 'limit' && !orderParams.limit_price) {
      throw new Error('Limit orders require a limit price');
    }
    
    // Make sure at least one quantity parameter is set
    if (!orderParams.quantity_steps && !orderParams.quantity_contracts && !orderParams.quantity_assets) {
      throw new Error('Order must specify quantity (steps, contracts, or assets)');
    }
    
    // Convert quantities to strings as the API expects string values
    if (orderParams.quantity_steps) {
      orderParams.quantity_steps = String(orderParams.quantity_steps);
    }
    if (orderParams.quantity_contracts) {
      orderParams.quantity_contracts = String(orderParams.quantity_contracts);
    }
    if (orderParams.quantity_assets) {
      orderParams.quantity_assets = String(orderParams.quantity_assets);
    }
    
    // If the contract is invalid, report the error immediately
    const cachedContract = state.contracts.find(c => c.contract_id === parseInt(orderParams.contract));
    if (!cachedContract) {
      throw new Error(`Invalid contract ID: ${orderParams.contract}`);
    }
    
    // Make the estimation request
    const estimationResult = await apiRequest('POST', '/v1/trading/estimate-order', orderParams);
    
    if (estimationResult) {
      if (estimationResult.error) {
        logError(new Error(estimationResult.error), 'Order Estimation Error from API');
        console.error(`Order estimation error: ${estimationResult.error}`);
        return { error: estimationResult.error, status: 'error' };
      }
      
      console.log('Order estimation result:', estimationResult);
      return estimationResult;
    }
    
    throw new Error('Empty response from API');
  } catch (error) {
    logError(error, 'Order Estimation');
    console.error('Error estimating order:', error.message);
    return { error: error.message, status: 'error' };
  }
}

// Function to place order - integrated from trading.js
async function placeOrder(orderParams) {
  try {
    console.log('Placing order with parameters:', orderParams);
    
    // Add required fields for API if not present
    const completeParams = {
      ...orderParams,
      customer_order_id: orderParams.customer_order_id || `tui-${Date.now()}`,
      timestamp: orderParams.timestamp || Date.now(),
      recv_window: orderParams.recv_window || 30000
    };
    
    // Validate the quantity fields
    if (!completeParams.quantity_steps && !completeParams.quantity_contracts && !completeParams.quantity_assets) {
      console.error('Order missing quantity fields');
      throw new Error('Order must specify quantity_steps, quantity_contracts, or quantity_assets');
    }
    
    // Validate contract id
    if (!completeParams.contract) {
      console.error('Order missing contract field');
      throw new Error('Order must specify contract');
    }
    
    // For limit orders, ensure limit price is specified
    if (completeParams.type === 'limit' && !completeParams.limit_price) {
      console.error('Limit order missing limit_price');
      throw new Error('Limit orders must specify limit_price');
    }
    
    // Submit the order with signature
    console.log('Submitting order to API with complete parameters:', completeParams);
    const result = await apiRequest('POST', '/v1/trading/order', completeParams, true);
    
    if (result) {
      console.log('Order placement result:', result);
      return result;
    }
    
    console.error('No result from order placement API call');
    return null;
  } catch (error) {
    console.error('Error placing order:', error.message);
    return { error: error.message, status: 'error' };
  }
}

// Log startup
console.log('Starting CVEX Trading Terminal...');

// Load configuration
try {
  loadConfig();
} catch (error) {
  console.error('Error loading configuration:', error.message);
}

// Sample data to demonstrate UI without API
const sampleContracts = [
  { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', last_price: 86995, mark_price: 83008.785, volume_24h: 697443.53 },
  { contract_id: 44, symbol: 'ETH-25APR25', index: 'ETH', last_price: 1879, mark_price: 1820.1984, volume_24h: 513162.09 },
  { contract_id: 45, symbol: 'BNB-25APR25', index: 'BNB', last_price: 0, mark_price: 496.43067, volume_24h: 0 },
  { contract_id: 46, symbol: 'XRP-25APR25', index: 'XRP', last_price: 2.193, mark_price: 2.1020967, volume_24h: 8116.01 },
  { contract_id: 47, symbol: 'SOL-25APR25', index: 'SOL', last_price: 119.6, mark_price: 125.92581, volume_24h: 240746.92 },
  { contract_id: 48, symbol: 'LINK-25APR25', index: 'LINK', last_price: 13.78, mark_price: 13.420022, volume_24h: 396603.35 },
  { contract_id: 49, symbol: 'BTC-30MAY25', index: 'BTC', last_price: 82820, mark_price: 83168.512, volume_24h: 602429.28 },
  { contract_id: 50, symbol: 'ETH-30MAY25', index: 'ETH', last_price: 1815, mark_price: 1797.7273, volume_24h: 532203.93 },
  { contract_id: 51, symbol: 'BNB-30MAY25', index: 'BNB', last_price: 502, mark_price: 499.75, volume_24h: 187654.21 },
  { contract_id: 52, symbol: 'XRP-30MAY25', index: 'XRP', last_price: 2.154, mark_price: 2.1723, volume_24h: 12346.78 },
  { contract_id: 53, symbol: 'SOL-30MAY25', index: 'SOL', last_price: 121.4, mark_price: 123.56, volume_24h: 356891.45 },
  { contract_id: 54, symbol: 'LINK-30MAY25', index: 'LINK', last_price: 13.92, mark_price: 13.86, volume_24h: 287456.32 }
];

// Create a new screen with explicit input handling configurations
const screen = blessed.screen({
  smartCSR: true,
  title: 'CVEX Trading Terminal',
  fullUnicode: true,
  input: process.stdin,
  output: process.stdout,
  terminal: 'xterm-256color',
  fastCSR: true,
  dockBorders: true,
  ignoreLocked: ['C-c'],     // Always allow Ctrl+C to work
  grabKeys: false,           // Start without grabbing keys (modals will set this when shown)
  sendFocus: true,           // Send focus events to make sure we know which element has focus
  autoPadding: true,
  cursor: {
    artificial: true,
    shape: 'line',
    blink: true
  }
});

// Safety timeout to ensure ESC key always works
// This will reset the screen's grabKeys flag if it gets stuck
setInterval(() => {
  // If there are no open modals but grabKeys is true, reset it
  const hasVisibleModals = screen.children.some(child => 
    child.type === 'box' && child.visible && child.border && child.shadow);
  
  if (!hasVisibleModals && screen.grabKeys) {
    // console.log('Safety check: resetting grabKeys as no modals are visible');
    screen.grabKeys = false;
  }
}, 3000);

// Enable raw keystroke handling for more reliable key detection
screen.program.enableMouse();
screen.program.rawMode = true;
screen.program.setRawMode = true;

// Root-level keyboard handler that will always work no matter what
const rootKeysHandler = (ch, key) => {
  // Convert raw character to key object if needed
  if (!key && ch) {
    key = { name: ch.toLowerCase(), sequence: ch };
  }
  
  // Nothing to do if we don't have a key object
  if (!key) return;
  
  // Commented out debugging logs to prevent them from covering the interface
  // console.log(`Root keypress: "${ch}" (charCode: ${ch ? ch.charCodeAt(0) : 'none'}), key name: ${key.name || 'none'}`);
  
  // Force quit with Ctrl-C, always available
  if (key.ctrl && (key.name === 'c' || ch === '\u0003')) {
    // console.log('CTRL+C detected at root level - force exit');
    process.exit(0);
  }
  
  // Handle ESC key with special care - it's often problematic
  if (key.name === 'escape' || ch === '\u001b') {
    // console.log('ESC key pressed (root handler)');
    
    // If there are open dialogs with visible shadows, they should handle ESC
    const hasVisibleModals = screen.children.some(child => 
      child.type === 'box' && child.visible && child.border && child.shadow);
    
    if (hasVisibleModals) {
      // console.log('Visible modals detected, simulating ESC to them');
      // Force an escape event on all visible modal boxes
      screen.children.forEach(child => {
        if (child.type === 'box' && child.visible && child.border && child.shadow) {
          child.emit('keypress', '\u001b', { name: 'escape', sequence: '\u001b' });
        }
      });
      return;
    }
    
    // If no modals are visible, ensure we're on the main screen
    // console.log('No modals visible, returning to main view');
    screen.grabKeys = false;
    statusBar.setContent(' Returning to main view. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    marketsList.focus();
    screen.render();
  }
  
  // Handle T key for trading at the root level
  else if ((key.name === 't' || ch === 't' || ch === 'T') && !screen.grabKeys) {
    // console.log('T key pressed (root handler)');
    if (state.selectedContract) {
      showTradeScreen();
    } else {
      statusBar.setContent(' Please select a contract first');
      screen.render();
    }
  }
  
  // Handle R key for refresh at the root level
  else if ((key.name === 'r' || ch === 'r' || ch === 'R') && !screen.grabKeys) {
    // console.log('R key pressed (root handler)');
    statusBar.setContent(' Refreshing data...');
    screen.render();
    setTimeout(() => {
      populateMarketsList();
      if (state.selectedContract) {
        updateContractDetails(state.currentMarketIndex);
      }
      statusBar.setContent(' Data refreshed. Press ↑/↓ to navigate, (T)rade, (Q)uit');
      screen.render();
    }, 500);
  }
  
  // Handle Q key to quit at the root level
  else if ((key.name === 'q' || ch === 'q' || ch === 'Q') && !screen.grabKeys) {
    // console.log('Q key pressed (root handler)');
    return process.exit(0);
  }
  
  // Handle A key to toggle activity feed
  else if ((key.name === 'a' || ch === 'a' || ch === 'A') && !screen.grabKeys) {
    activityFeed.hidden = !activityFeed.hidden;
    if (!activityFeed.hidden) {
      activityFeed.focus();
      statusBar.setContent(' Activity Feed visible. Press A to hide.');
    } else {
      marketsList.focus();
      statusBar.setContent(' Activity Feed hidden. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    }
    screen.render();
  }
};

// Set up both direct process level and screen level handlers for maximum coverage
process.stdin.on('keypress', rootKeysHandler);
screen.program.input.on('keypress', rootKeysHandler);

// Set up multiple global key event handlers using different approaches for redundancy
// This main keystroke handler uses full name matching for more reliability
screen.key(['t', 'T'], function() {
  // console.log('T key pressed (screen.key handler)');
  if (state.selectedContract) {
    showTradeScreen();
  } else {
    statusBar.setContent(' Please select a contract first');
    screen.render();
  }
});

screen.key(['r', 'R'], function() {
  // console.log('R key pressed (screen.key handler)');
  statusBar.setContent(' Refreshing data...');
  screen.render();
  setTimeout(() => {
    populateMarketsList();
    if (state.selectedContract) {
      updateContractDetails(state.currentMarketIndex);
    }
    statusBar.setContent(' Data refreshed. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    screen.render();
  }, 500);
});

screen.key(['q', 'Q'], function() {
  // console.log('Q key pressed (screen.key handler)');
  return process.exit(0);
});

// Additional keypress handler as a backup approach
screen.on('keypress', function(ch, key) {
  if (!key) return;
  
  // Commented out debugging logs to prevent them from covering the interface
  // console.log(`Screen keypress: ${ch}, key: ${key.name}`);
  
  // Handle letter T
  if (key.name === 't' || ch === 't' || ch === 'T') {
    // console.log('T key pressed (global handler)');
    if (state.selectedContract) {
      showTradeScreen();
    } else {
      statusBar.setContent(' Please select a contract first');
      screen.render();
    }
  }
  
  // Handle R for refresh
  else if (key.name === 'r' || ch === 'r' || ch === 'R') {
    // console.log('R key pressed (global handler)');
    statusBar.setContent(' Refreshing data...');
    screen.render();
    setTimeout(() => {
      populateMarketsList();
      if (state.selectedContract) {
        updateContractDetails(state.currentMarketIndex);
      }
      statusBar.setContent(' Data refreshed. Press ↑/↓ to navigate, (T)rade, (Q)uit');
      screen.render();
    }, 500);
  }
  
  // Handle Q to quit
  else if (key.name === 'q' || ch === 'q' || ch === 'Q') {
    // console.log('Q key pressed (screen handler)');
    return process.exit(0);
  }
});

// Remove the direct keypress handler as it's interfering with blessed's key handling

// State management
let state = {
  selectedContract: null,
  currentMarketIndex: 0,
  tradeForm: {
    side: 'buy',
    type: 'limit',
    limitPrice: '0',
    timeInForce: 'GTC',
    reduceOnly: false,
    quantity: '1'
  },
  // Fields for API data
  contracts: [],
  account: null,
  positions: [],
  openOrders: [],
  transactions: [],
  orderBookData: null,
  recentTradesData: null,
  orderEstimation: null,
  pendingOrderParams: null,
  lastOrderResult: null
};

// Create layout
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Header
const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  content: ' CVEX TRADING TERMINAL ',
  tags: true,
  style: {
    bg: 'blue',
    fg: 'white',
    bold: true
  }
});

// Activity Feed - a dedicated area for displaying console logs and activity
const activityFeed = blessed.log({
  parent: screen,
  top: 'center',
  right: 3,
  width: 30,
  height: 10,
  label: ' Activity Feed ',
  hidden: true, // Hidden by default
  tags: true,
  border: {
    type: 'line'
  },
  scrollable: true,
  scrollbar: {
    ch: '█',
    style: {
      inverse: true
    }
  },
  style: {
    fg: 'white',
    bg: '#222222',
    border: {
      fg: 'gray'
    }
  },
  mouse: true
});

// Make the activity feed more visible when needed
activityFeed.width = 60;     // Make it wider 
activityFeed.height = 15;    // Make it taller
activityFeed.top = 3;       // Position it right below header
activityFeed.right = 1;     // Position near right edge
activityFeed.style.border.fg = 'cyan'; // Better border visibility

// Function to toggle activity feed 
function toggleActivityFeed(show = true) {
  activityFeed.hidden = !show;
  if (!activityFeed.hidden) {
    activityFeed.setFront();
    statusBar.setContent(' Activity Feed visible. Press A to hide.');
  } else {
    marketsList.focus();
    statusBar.setContent(' Activity Feed hidden. Press ↑/↓ to navigate, (T)rade, (Q)uit');
  }
  screen.render();
}

// Additional activity feed toggle key (A)
screen.key(['a', 'A'], function() {
  toggleActivityFeed(!activityFeed.hidden);
  screen.render();
});

// Enhanced console.log implementation
const originalConsoleLog = console.log;
console.log = function() {
  const args = Array.from(arguments);
  // Don't log empty messages
  if (args.length === 0) return;
  
  // Format the message
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  // Add timestamp
  const timestamp = new Date().toLocaleTimeString();
  
  // Show activity feed on API-related logs
  if (message.includes('API') || message.includes('Error') || message.includes('error')) {
    toggleActivityFeed(true);
  }
  
  // Log to both the activity feed and the original console
  activityFeed.log(`{gray-fg}${timestamp}{/gray-fg} ${message}`);
  originalConsoleLog.apply(console, arguments);
};

// Same for console.error
const originalConsoleError = console.error;
console.error = function() {
  const args = Array.from(arguments);
  if (args.length === 0) return;
  
  // Format the message
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  // Add timestamp and error styling
  const timestamp = new Date().toLocaleTimeString();
  
  // Always show activity feed for errors
  toggleActivityFeed(true);
  
  // Log with red highlighting for errors
  activityFeed.log(`{gray-fg}${timestamp}{/gray-fg} {red-fg}ERROR: ${message}{/red-fg}`);
  originalConsoleError.apply(console, arguments);
};

// Markets list
const marketsList = grid.set(3, 0, 9, 3, blessed.list, {
  parent: screen,
  label: 'Markets',
  tags: true,
  keys: true,
  vi: true,
  mouse: true,
  interactive: true,
  invertSelected: true,
  scrollable: true,
  alwaysScroll: true, // Always show scroll capability even when all items fit
  keyable: true,
  focusable: true,
  inputOnFocus: true,
  autoFocus: true, // Make sure list gets focus automatically
  scrollbar: {
    ch: '█',
    track: {
      bg: 'blue'
    },
    style: {
      inverse: true
    }
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: 'white'
    },
    selected: {
      bg: 'blue',
      fg: 'white',
      bold: true
    },
    item: {
      hover: {
        bg: 'gray'
      }
    },
    // Enhanced scrollbar style
    scrollbar: {
      bg: 'blue',
      fg: 'white'
    }
  },
  border: {
    type: 'line'
  }
});

// Contract details
const contractDetails = grid.set(3, 3, 4, 9, blessed.box, {
  parent: screen,
  label: 'Contract Details',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: 'white'
    }
  },
  border: {
    type: 'line'
  },
  padding: {
    left: 1,
    right: 1
  },
  content: 'Select a contract to view details'
});

// Order book
const orderBook = grid.set(7, 3, 5, 4, blessed.box, {
  parent: screen,
  label: 'Order Book',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: 'white'
    }
  },
  border: {
    type: 'line'
  },
  padding: {
    left: 1,
    right: 1
  },
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'blue' }
  },
  content: 'Select a contract to view order book'
});

// Recent trades
const recentTrades = grid.set(7, 7, 5, 5, blessed.box, {
  parent: screen,
  label: 'Recent Trades',
  tags: true,
  style: {
    fg: 'white',
    bg: 'black',
    border: {
      fg: 'white'
    }
  },
  border: {
    type: 'line'
  },
  padding: {
    left: 1,
    right: 1
  },
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'blue' }
  },
  content: 'Select a contract to view recent trades'
});

// Status bar
const statusBar = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  content: ' Press ↑/↓ to navigate, Enter to select, (T)rade, (Q)uit',
  style: {
    bg: 'blue',
    fg: 'white'
  }
});

// Help text with activity feed toggle
blessed.text({
  parent: header,
  top: 1,
  right: 2,
  content: '(T)rade | (Q)uit | (R)efresh | (A)ctivity Feed | PageUp/Down to scroll',
  tags: true,
  style: {
    fg: 'white'
  }
});

// Populate markets list
async function populateMarketsList() {
  // Show loading status
  statusBar.setContent(' Fetching market data from API...');
  screen.render();
  
  try {
    // Check config
    const config = getConfig();
    if (!config.apiKey) {
      console.log('API key not configured, using sample data');
      useSampleData();
      return;
    }
    
    // Fetch contracts from API
    const contracts = await fetchContracts();
    
    if (contracts && contracts.length > 0) {
      // Store contracts in state
      state.contracts = contracts;
      
      // Create items for list
      const items = contracts.map(contract => 
        `${contract.symbol} (${contract.index})`
      );
      
      // Update UI
      marketsList.setItems(items);
      marketsList.select(state.currentMarketIndex);
      statusBar.setContent(' Live market data loaded. Press ↑/↓ to navigate, (T)rade, (Q)uit');
      screen.render();
      
      // If we had a selected contract, update its details
      if (state.selectedContract) {
        updateContractDetails(state.currentMarketIndex);
      }
    } else {
      console.log('No contracts returned from API, using sample data');
      useSampleData();
    }
  } catch (error) {
    console.log('Error fetching market data, using sample data:', error.message);
    useSampleData();
  }
  
  // Function to use sample data as fallback
  function useSampleData() {
    const sampleContracts = [
      { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', last_price: 86995, mark_price: 83008.785, volume_24h: 697443.53 },
      { contract_id: 44, symbol: 'ETH-25APR25', index: 'ETH', last_price: 1879, mark_price: 1820.1984, volume_24h: 513162.09 },
      { contract_id: 45, symbol: 'BNB-25APR25', index: 'BNB', last_price: 0, mark_price: 496.43067, volume_24h: 0 },
      { contract_id: 46, symbol: 'XRP-25APR25', index: 'XRP', last_price: 2.193, mark_price: 2.1020967, volume_24h: 8116.01 },
      { contract_id: 47, symbol: 'SOL-25APR25', index: 'SOL', last_price: 119.6, mark_price: 125.92581, volume_24h: 240746.92 },
      { contract_id: 48, symbol: 'LINK-25APR25', index: 'LINK', last_price: 13.78, mark_price: 13.420022, volume_24h: 396603.35 },
      { contract_id: 49, symbol: 'BTC-30MAY25', index: 'BTC', last_price: 82820, mark_price: 83168.512, volume_24h: 602429.28 },
      { contract_id: 50, symbol: 'ETH-30MAY25', index: 'ETH', last_price: 1815, mark_price: 1797.7273, volume_24h: 532203.93 },
      { contract_id: 51, symbol: 'BNB-30MAY25', index: 'BNB', last_price: 502, mark_price: 499.75, volume_24h: 187654.21 },
      { contract_id: 52, symbol: 'XRP-30MAY25', index: 'XRP', last_price: 2.154, mark_price: 2.1723, volume_24h: 12346.78 },
      { contract_id: 53, symbol: 'SOL-30MAY25', index: 'SOL', last_price: 121.4, mark_price: 123.56, volume_24h: 356891.45 },
      { contract_id: 54, symbol: 'LINK-30MAY25', index: 'LINK', last_price: 13.92, mark_price: 13.86, volume_24h: 287456.32 }
    ];
    
    state.contracts = sampleContracts;
    
    const items = sampleContracts.map(contract => 
      `${contract.symbol} (${contract.index})`
    );
    
    marketsList.setItems(items);
    marketsList.select(state.currentMarketIndex);
    statusBar.setContent(' Sample market data loaded. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    screen.render();
  }
}

// Function to show the trade screen
function showTradeScreen() {
  // Check if we have a selected contract
  if (!state.selectedContract) {
    statusBar.setContent(' Please select a contract first');
    screen.render();
    return;
  }
  
  // Create trade form overlay with a dark semitransparent background
  const overlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black',
      transparent: true,
      opacity: 0.7
    }
  });
  
  // Create the trade form box
  const tradeForm = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 72,
    height: 30, // Increased height for navigation info
    tags: true,
    border: {
      type: 'line',
      fg: 'white'
    },
    label: ` New Order: ${state.selectedContract.symbol} `,
    style: {
      bg: '#222222',
      fg: 'white',
      focus: {
        border: {
          fg: 'cyan'
        }
      }
    },
    shadow: true
  });

  // Title
  blessed.text({
    parent: tradeForm,
    top: 1,
    left: 'center',
    content: '{bold}ORDER DETAILS{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Order Side section
  blessed.text({
    parent: tradeForm,
    top: 3,
    left: 2,
    content: '{bold}Order Side:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Create a box to group the side radio buttons
  const sideBox = blessed.box({
    parent: tradeForm,
    top: 3,
    left: 16,
    width: 25,
    height: 1,
    style: {
      bg: '#222222'
    }
  });

  // Buy radio
  const buyRadio = blessed.radiobutton({
    parent: sideBox,
    left: 0,
    content: ' BUY ',
    checked: state.tradeForm.side === 'buy',
    style: {
      fg: 'green',
      bg: '#222222',
      focus: {
        fg: 'black',
        bg: 'green'
      }
    }
  });

  // Sell radio
  const sellRadio = blessed.radiobutton({
    parent: sideBox,
    left: 12,
    content: ' SELL ',
    checked: state.tradeForm.side === 'sell',
    style: {
      fg: 'red',
      bg: '#222222',
      focus: {
        fg: 'black',
        bg: 'red'
      }
    }
  });

  // Order Type section
  blessed.text({
    parent: tradeForm,
    top: 5,
    left: 2,
    content: '{bold}Order Type:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Create a box to group the type radio buttons
  const typeBox = blessed.box({
    parent: tradeForm,
    top: 5,
    left: 16,
    width: 30,
    height: 1,
    style: {
      bg: '#222222'
    }
  });

  // Limit radio
  const limitRadio = blessed.radiobutton({
    parent: typeBox,
    left: 0,
    content: ' Limit ',
    checked: state.tradeForm.type === 'limit',
    style: {
      fg: 'white',
      bg: '#222222',
      focus: {
        fg: 'black',
        bg: 'white'
      }
    }
  });

  // Market radio
  const marketRadio = blessed.radiobutton({
    parent: typeBox,
    left: 12,
    content: ' Market ',
    checked: state.tradeForm.type === 'market',
    style: {
      fg: 'white',
      bg: '#222222',
      focus: {
        fg: 'black',
        bg: 'white'
      }
    }
  });

  // Price section
  blessed.text({
    parent: tradeForm,
    top: 7,
    left: 2,
    content: '{bold}Price:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Price input - improved input approach
  const priceInput = blessed.textbox({
    parent: tradeForm,
    top: 7,
    left: 16,
    width: 25,
    height: 3,
    content: state.selectedContract.mark_price.toString(),
    inputOnFocus: true,
    padding: {
      left: 1,
      right: 1
    },
    border: {
      type: 'line'
    },
    style: {
      fg: '#ffffff',
      bg: '#333333',
      border: {
        fg: 'white'
      },
      focus: {
        bg: '#444444',
        border: {
          fg: 'cyan'
        }
      }
    },
    tags: true,
    clickable: true,
    focusable: true,
    keyable: true
  });
  
  // Initialize price with mark price or previous value
  const initialPrice = state.tradeForm.limitPrice !== '0' ? 
    state.tradeForm.limitPrice : 
    state.selectedContract.mark_price.toString();
  priceInput.setValue(initialPrice);

  // Quantity section
  blessed.text({
    parent: tradeForm,
    top: 11,
    left: 2,
    content: '{bold}Quantity:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Get the minimum order size if available
  const minOrderSize = state.selectedContract.min_order_size_contracts || 0.001;
  
  // Quantity input - improved input approach
  const quantityInput = blessed.textbox({
    parent: tradeForm,
    top: 11,
    left: 16,
    width: 25,
    height: 3,
    content: state.tradeForm.quantity,
    inputOnFocus: true,
    padding: {
      left: 1,
      right: 1
    },
    border: {
      type: 'line'
    },
    style: {
      fg: '#ffffff',
      bg: '#333333',
      border: {
        fg: 'white'
      },
      focus: {
        bg: '#444444',
        border: {
          fg: 'cyan'
        }
      }
    },
    tags: true,
    clickable: true,
    focusable: true,
    keyable: true
  });
  
  // Initialize quantity with previous value or minimum
  quantityInput.setValue(state.tradeForm.quantity !== '1' ? 
    state.tradeForm.quantity : 
    minOrderSize.toString());

  // Time in Force section
  blessed.text({
    parent: tradeForm,
    top: 15,
    left: 2,
    content: '{bold}Time in Force:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // TIF select as a list
  const tifList = blessed.list({
    parent: tradeForm,
    top: 15,
    left: 16,
    width: 35,
    height: 4,
    border: {
      type: 'line'
    },
    items: [
      'GTC - Good Till Cancelled',
      'IOC - Immediate Or Cancel',
      'FOK - Fill Or Kill',
      'PO - Post Only'
    ],
    style: {
      fg: 'white',
      bg: '#333333',
      border: {
        fg: 'white'
      },
      selected: {
        bg: 'blue',
        fg: 'white',
        bold: true
      },
      focus: {
        border: {
          fg: 'cyan'
        }
      },
      item: {
        hover: {
          bg: '#444444'
        }
      }
    },
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue'
      }
    },
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true
  });

  // Find the index of current TIF
  const tifOptions = ['GTC', 'IOC', 'FOK', 'PO'];
  const currentTifIndex = tifOptions.indexOf(state.tradeForm.timeInForce);
  if (currentTifIndex >= 0) {
    tifList.select(currentTifIndex);
  }

  // Reduce Only section
  blessed.text({
    parent: tradeForm,
    top: 20,
    left: 2,
    content: '{bold}Reduce Only:{/bold}',
    tags: true,
    style: {
      fg: 'white'
    }
  });

  // Reduce Only checkbox
  const reduceOnlyCheckbox = blessed.checkbox({
    parent: tradeForm,
    top: 20,
    left: 16,
    content: ' Yes',
    checked: state.tradeForm.reduceOnly,
    style: {
      fg: 'cyan',
      bg: '#222222',
      focus: {
        fg: 'black',
        bg: 'cyan'
      }
    }
  });

  // Display minimum order size information if available
  if (state.selectedContract.min_order_size_contracts) {
    blessed.text({
      parent: tradeForm,
      top: 22,
      left: 2,
      content: `{gray-fg}Min Order Size: ${state.selectedContract.min_order_size_contracts} contracts{/gray-fg}`,
      tags: true,
      style: {
        fg: 'gray'
      }
    });
  }

  // Navigation guide box
  const navGuide = blessed.box({
    parent: tradeForm,
    bottom: 3,
    left: 0,
    width: '100%',
    height: 3,
    content: ' {cyan-fg}Tab{/cyan-fg}: Navigate | {cyan-fg}Space{/cyan-fg}: Toggle | {cyan-fg}←/→{/cyan-fg}: Radio Options | {cyan-fg}Enter{/cyan-fg}: Confirm | {cyan-fg}Esc{/cyan-fg}: Cancel',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      fg: 'white',
      bg: '#333333'
    }
  });

  // Button bar at the bottom of the form
  const buttonBar = blessed.box({
    parent: tradeForm,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      bg: '#222222'
    }
  });

  // Estimate button - part of the bottom edge
  const estimateButton = blessed.button({
    parent: buttonBar,
    bottom: 0,
    left: '30%',
    width: 14,
    height: 3,
    content: '(E)stimate',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      bg: 'blue',
      fg: 'white',
      bold: true,
      focus: {
        bg: 'cyan',
        fg: 'black'
      },
      hover: {
        bg: '#00AAAA',
        fg: 'black'
      }
    },
    mouse: true,
    keys: true
  });

  // Cancel button - part of the bottom edge
  const cancelButton = blessed.button({
    parent: buttonBar,
    bottom: 0,
    left: '58%',
    width: 14,
    height: 3,
    content: '(C)ancel',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      bg: 'red',
      fg: 'white',
      bold: true,
      focus: {
        bg: '#AA0000',
        fg: 'white'
      },
      hover: {
        bg: '#AA0000',
        fg: 'white'
      }
    },
    mouse: true,
    keys: true
  });

  // Create the form elements array in tab order
  const formElements = [
    buyRadio, 
    sellRadio, 
    limitRadio, 
    marketRadio, 
    priceInput, 
    quantityInput, 
    tifList, 
    reduceOnlyCheckbox, 
    estimateButton, 
    cancelButton
  ];

  // Setup tab navigation
  formElements.forEach((element, i) => {
    element.key('tab', () => {
      formElements[(i + 1) % formElements.length].focus();
    });
    
    element.key('S-tab', () => {
      formElements[(i - 1 + formElements.length) % formElements.length].focus();
    });
  });

  // Add navigation between radio buttons using arrow keys
  buyRadio.key('right', () => sellRadio.focus());
  sellRadio.key('left', () => buyRadio.focus());
  limitRadio.key('right', () => marketRadio.focus());
  marketRadio.key('left', () => limitRadio.focus());

  // Radio button handlers for Order Side
  buyRadio.on('check', () => {
    state.tradeForm.side = 'buy';
    sellRadio.uncheck();
  });

  sellRadio.on('check', () => {
    state.tradeForm.side = 'sell';
    buyRadio.uncheck();
  });

  // Radio button handlers for Order Type
  limitRadio.on('check', () => {
    state.tradeForm.type = 'limit';
    priceInput.style.bg = '#333333';
    priceInput.style.fg = '#ffffff';
    priceInput.readOnly = false;
    marketRadio.uncheck();
  });

  marketRadio.on('check', () => {
    state.tradeForm.type = 'market';
    priceInput.style.bg = '#555555';
    priceInput.style.fg = '#aaaaaa';
    priceInput.readOnly = true;
    limitRadio.uncheck();
  });

  // Add space key handling for radio buttons and checkbox
  buyRadio.key('space', () => buyRadio.checked ? null : buyRadio.check());
  sellRadio.key('space', () => sellRadio.checked ? null : sellRadio.check());
  limitRadio.key('space', () => limitRadio.checked ? null : limitRadio.check());
  marketRadio.key('space', () => marketRadio.checked ? null : marketRadio.check());
  reduceOnlyCheckbox.key('space', () => reduceOnlyCheckbox.checked ? reduceOnlyCheckbox.uncheck() : reduceOnlyCheckbox.check());

  // TIF list selection handler
  tifList.on('select', (item) => {
    // Extract just the code part (before the dash)
    const codeMatch = item.content.match(/^(\w+)/);
    if (codeMatch && codeMatch[1]) {
      state.tradeForm.timeInForce = codeMatch[1];
    }
  });

  // Checkbox handler
  reduceOnlyCheckbox.on('check', () => {
    state.tradeForm.reduceOnly = true;
  });

  reduceOnlyCheckbox.on('uncheck', () => {
    state.tradeForm.reduceOnly = false;
  });

  // Input validation function
  function validateInputs() {
    let isValid = true;
    let errorMsg = '';
    
    // Validate price input for limit orders
    if (state.tradeForm.type === 'limit') {
      const priceValue = parseFloat(priceInput.getValue());
      if (isNaN(priceValue) || priceValue <= 0) {
        isValid = false;
        errorMsg = 'Please enter a valid price value';
        priceInput.style.border.fg = 'red';
      } else {
        priceInput.style.border.fg = 'white';
        
        // Additional validation for price - check if it's within reasonable range
        const markPrice = state.selectedContract.mark_price;
        if (markPrice > 0) {
          const pricePercent = Math.abs((priceValue - markPrice) / markPrice * 100);
          if (pricePercent > 20) {
            // Warning for price more than 20% away from mark price
            statusBar.setContent(` Warning: Price is ${pricePercent.toFixed(2)}% away from mark price`);
            screen.render();
          }
        }
      }
    }
    
    // Validate quantity input
    const quantityValue = parseFloat(quantityInput.getValue());
    if (isNaN(quantityValue) || quantityValue <= 0) {
      isValid = false;
      errorMsg = 'Please enter a valid quantity value';
      quantityInput.style.border.fg = 'red';
    } else {
      quantityInput.style.border.fg = 'white';
      
      // Additional validation for quantity
      const minOrderSize = state.selectedContract.min_order_size_contracts || 0.001;
      
      if (quantityValue < minOrderSize) {
        isValid = false;
        errorMsg = `Quantity below minimum (${minOrderSize})`;
        quantityInput.style.border.fg = 'red';
      } else if (quantityValue > 1000) {
        isValid = false;
        errorMsg = 'Quantity exceeds maximum allowed (1000)';
        quantityInput.style.border.fg = 'red';
      }
    }
    
    return { isValid, errorMsg };
  }

  // Function to update state from form values
  function updateStateFromForm() {
    state.tradeForm.limitPrice = priceInput.getValue();
    state.tradeForm.quantity = quantityInput.getValue();
  }

  // Button handlers
  estimateButton.on('press', () => {
    const { isValid, errorMsg } = validateInputs();
    
    if (!isValid) {
      // Show error message
      statusBar.setContent(` Error: ${errorMsg}`);
      screen.render();
      return;
    }
    
    // Update form state with current inputs
    updateStateFromForm();
    
    // Close form and show estimation
    closeTradeForm();
    showOrderEstimationResult();
  });

  cancelButton.on('press', () => {
    closeTradeForm();
  });

  // Centralized function to close the trade form
  function closeTradeForm() {
    screen.grabKeys = false; // Release key grab
    overlay.destroy();
    tradeForm.destroy();
    statusBar.setContent(' Order canceled. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    marketsList.focus(); // Return focus to the markets list
    screen.render();
  }

  // Handle keyboard shortcuts - consolidated handler approach
  screen.grabKeys = true; // Mark that we're handling keys globally
  
  // Handle ESC key for escape functionality
  tradeForm.key(['escape'], () => {
    closeTradeForm();
  });
  
  // Handle C key for cancel functionality
  tradeForm.key(['C', 'c'], () => {
    closeTradeForm();
  });
  
  // Handle E key for estimate functionality
  tradeForm.key(['E', 'e'], () => {
    const { isValid, errorMsg } = validateInputs();
    
    if (!isValid) {
      // Show error message
      statusBar.setContent(` Error: ${errorMsg}`);
      screen.render();
      return;
    }
    
    // Update form state with current inputs
    updateStateFromForm();
    
    // Close form and show estimation
    closeTradeForm();
    showOrderEstimationResult();
  });
  
  // Handle Enter key in price and quantity inputs
  priceInput.key('enter', () => {
    quantityInput.focus();
  });
  
  quantityInput.key('enter', () => {
    tifList.focus();
  });

  // Process input correctly for the textboxes
  priceInput.on('submit', () => {
    quantityInput.focus();
  });
  
  quantityInput.on('submit', () => {
    tifList.focus();
  });

  // Focus on first field
  buyRadio.focus();
  
  // Update status bar with helpful instructions
  statusBar.setContent(' Tab: Navigate | Space: Toggle | ←/→: Radio Options | Enter: Confirm | Esc: Cancel');
  
  screen.render();
}

// Function to show order estimation result
async function showOrderEstimationResult() {
  try {
    // Base price and quantity
    const basePrice = parseFloat(state.tradeForm.limitPrice) || state.selectedContract.mark_price;
    const quantity = parseFloat(state.tradeForm.quantity);
    
    // Validation
    if (!validateInputs()) {
      statusBar.setContent(' {red-bg}ERROR{/red-bg} Please fix the input errors before submitting');
      screen.render();
      return;
    }
    
    // Close the trade screen
    closeTradeForm();
    
    // Show waiting popup
    const waitBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 10,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'white'
        }
      },
      content: '{center}Estimating order...\nPlease wait{/center}'
    });
    screen.render();
    
    // Prepare order parameters
    const orderParams = {
      contract: state.selectedContract.contract_id,
      direction: state.tradeForm.direction,
      type: state.tradeForm.orderType,
      quantity_contracts: String(quantity)
    };
    
    // Add limit price for limit orders
    if (state.tradeForm.orderType === 'limit') {
      orderParams.limit_price = String(basePrice);
    }
    
    // Store pending order params for later use
    state.pendingOrderParams = orderParams;
    
    // Attempt to get estimation
    let estimation;
    let isSampleData = false;
    
    try {
      estimation = await estimateOrder(orderParams);
      if (estimation?.status === 'error' || !estimation) {
        throw new Error(estimation?.error || 'Failed to estimate order');
      }
    } catch (error) {
      logError(error, 'Order Estimation Screen');
      console.log('Using sample estimation data due to error:', error.message);
      
      // Create a sample estimation for display purposes
      isSampleData = true;
      estimation = {
        fee: quantity * basePrice * 0.0005,
        margin_usage: quantity * basePrice * 0.1,
        average_price: basePrice,
        total: quantity * basePrice,
        status: "ok",
        direction: state.tradeForm.direction,
        _isSampleData: true  // Flag to indicate this is sample data
      };
    }
    
    // Remove waiting box
    waitBox.destroy();
    
    // Create the order estimation box
    const box = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 80,
      height: 20,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'white'
        }
      }
    });
    
    // Update the UI with the estimation result
    updateEstimationUI(box, estimation, basePrice, quantity, isSampleData);
    
    // Store estimation for confirmation
    state.orderEstimation = estimation;
    
    // Set keyboard focus to the box for key handling
    box.focus();
    
    // Add key handler
    box.key(['enter', 'return'], function() {
      closeEstimationScreen(true);
    });
    
    box.key(['escape', 'q'], function() {
      closeEstimationScreen(false);
    });
    
    // Enable key grabbing while this screen is open
    screen.grabKeys = true;
    
    statusBar.setContent(' Enter: Submit Order | Esc: Cancel');
    screen.render();
  } catch (error) {
    logError(error, 'Order Estimation Screen');
    
    // Show error to user
    statusBar.setContent(` {red-bg}ERROR{/red-bg} ${error.message}`);
    
    // Gracefully handle the error by showing a popup
    const errorBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 10,
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'red',
        border: {
          fg: 'white'
        }
      },
      content: `{center}Error estimating order:\n${error.message}{/center}\n\n{center}Press any key to continue{/center}`
    });
    
    // Add key handler to close on any key
    errorBox.key(['enter', 'escape', 'space'], function() {
      errorBox.destroy();
      showTradeScreen(); // Go back to trade screen
      screen.render();
    });
    
    errorBox.focus();
    screen.grabKeys = true;
    screen.render();
  }
}

// Function to show order confirmation
function showOrderConfirmation() {
  // Create overlay background
  const overlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black',
      transparent: true,
      opacity: 0.7
    }
  });

  const confirmDialog = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 12,
    border: {
      type: 'line',
      fg: state.tradeForm.side === 'buy' ? 'green' : 'red'
    },
    label: ' Confirm Order ',
    tags: true,
    style: {
      bg: '#222222',
      fg: 'white'
    },
    shadow: true
  });
  
  // Add confirmation message
  blessed.text({
    parent: confirmDialog,
    top: 2,
    left: 'center',
    content: `Are you sure you want to place this ${state.tradeForm.side.toUpperCase()} order?`,
    style: {
      fg: 'white',
      bold: true
    }
  });
  
  // Order summary
  blessed.text({
    parent: confirmDialog,
    top: 4,
    left: 'center',
    content: `${state.selectedContract.symbol} ${state.tradeForm.type.toUpperCase()} @ ${formatNumber(state.tradeForm.limitPrice || state.selectedContract.mark_price)}`,
    style: {
      fg: state.tradeForm.side === 'buy' ? 'green' : 'red'
    }
  });

  // Button bar at the bottom of the confirm dialog
  const confirmButtonBar = blessed.box({
    parent: confirmDialog,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      bg: '#222222'
    }
  });

  // Yes button
  const yesButton = blessed.button({
    parent: confirmButtonBar,
    left: '30%',
    bottom: 0,
    width: 10,
    height: 3,
    content: 'Yes',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      bg: state.tradeForm.side === 'buy' ? 'green' : 'red',
      fg: 'white',
      bold: true,
      focus: {
        bg: state.tradeForm.side === 'buy' ? '#00AA00' : '#AA0000',
        fg: 'white'
      },
      hover: {
        bg: state.tradeForm.side === 'buy' ? '#00AA00' : '#AA0000'
      }
    },
    mouse: true,
    keys: true
  });

  // No button
  const noButton = blessed.button({
    parent: confirmButtonBar,
    right: '30%',
    bottom: 0,
    width: 10,
    height: 3,
    content: 'No',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      bg: 'gray',
      fg: 'white',
      bold: true,
      focus: {
        bg: '#555555',
        fg: 'white'
      },
      hover: {
        bg: '#555555'
      }
    },
    mouse: true,
    keys: true
  });
  
  // Add keyboard shortcut text above the button bar
  blessed.text({
    parent: confirmDialog,
    bottom: 3,
    left: 'center',
    content: 'Press Y for Yes, N for No',
    align: 'center',
    style: {
      fg: 'white'
    }
  });
  
  // Function to close the confirm dialog
  function closeConfirmDialog(shouldProceed = false) {
    screen.grabKeys = false;
    overlay.destroy();
    confirmDialog.destroy();
    
    if (shouldProceed) {
      // Before showing the result, attempt to place the order through the API
      placeOrderViaAPI();
    } else {
      statusBar.setContent(' Order canceled. Press ↑/↓ to navigate, Enter to select, Q to quit');
      marketsList.focus();
      screen.render();
    }
  }
  
  // Function to place the order via API
  async function placeOrderViaAPI() {
    try {
      if (!state.pendingOrderParams) {
        throw new Error('Order parameters not found');
      }
      
      // Prepare final order parameters
      const orderParams = {
        ...state.pendingOrderParams,
        customer_order_id: `tui-${Date.now()}`, // This will be added by the placeOrder function too
        timestamp: Date.now(),                 // This will be added by the placeOrder function too
        recv_window: 30000                     // This will be added by the placeOrder function too
      };
      
      // Make API call to place order
      const result = await placeOrder(orderParams);
      
      if (result) {
        state.lastOrderResult = result;
        
        if (result.status === 'accepted' || result.status === 'success' || result.transaction_hash) {
          console.log('Order successfully placed:', result);
          showOrderResult(true);
        } else {
          console.log('Order placement failed:', result);
          showOrderResult(false, result.error || result.message || 'Unknown error');
        }
      } else {
        console.log('No result returned from order placement');
        showOrderResult(false, 'No response from API');
      }
    } catch (error) {
      logError(error, 'Place Order');
      console.log('Error placing order:', error.message);
      showOrderResult(false, error.message);
    }
  }
  
  // Button handlers
  yesButton.on('press', () => {
    closeConfirmDialog(true);
  });
  
  noButton.on('press', () => {
    closeConfirmDialog(false);
  });
  
  // Key handlers
  screen.grabKeys = true;
  
  confirmDialog.key(['y', 'Y'], () => {
    closeConfirmDialog(true);
  });
  
  confirmDialog.key(['n', 'N', 'escape'], () => {
    closeConfirmDialog(false);
  });
  
  // Add a direct keypress handler
  confirmDialog.on('keypress', (ch, key) => {
    if (key) {
      if (key.name === 'escape' || ch === '\u001b' || key.name === 'n' || ch === 'n' || ch === 'N') {
        closeConfirmDialog(false);
      } else if (key.name === 'y' || ch === 'y' || ch === 'Y') {
        closeConfirmDialog(true);
      }
    }
  });
  
  // Focus on a button
  yesButton.focus();
  statusBar.setContent(' Y: Confirm | N: Cancel | Esc: Cancel');
  screen.render();
}

// Function to show order result
function showOrderResult(success, errorMessage = '') {
  // Create overlay background
  const overlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black',
      transparent: true,
      opacity: 0.7
    }
  });

  let message = '';
  
  if (success) {
    // If we have an actual result from the API, use that
    if (state.lastOrderResult) {
      const result = state.lastOrderResult;
      const txHash = result.transaction_hash || 'N/A';
      const txHashShort = txHash.length > 14 ? txHash.substring(0, 10) + '...' : txHash;
      
      message = `{green-fg}Order placed successfully!{/green-fg}\n\n` +
                `Contract: ${state.selectedContract.symbol}\n` +
                `Type: ${state.tradeForm.side.toUpperCase()} ${state.tradeForm.type.toUpperCase()}\n` +
                `Transaction ID: ${txHashShort}\n` +
                `Status: ${result.status || 'accepted'}`;
                
      // Add any events if available
      if (result.events && result.events.length > 0) {
        message += '\n\n{bold}Events:{/bold}\n';
        result.events.forEach((event, index) => {
          message += `Event ${index+1}: ${JSON.stringify(event)}\n`;
        });
      }
    } else {
      // Use generic success message as fallback
      message = `{green-fg}Order placed successfully!{/green-fg}\n\n` +
                `Contract: ${state.selectedContract.symbol}\n` +
                `Type: ${state.tradeForm.side.toUpperCase()} ${state.tradeForm.type.toUpperCase()}\n` +
                `Transaction ID: TXN${Math.floor(Math.random() * 1000000)}`;
    }
  } else {
    // Show error message if available
    message = '{red-fg}Order failed.{/red-fg}\n\n';
    if (errorMessage) {
      message += `Error: ${errorMessage}\n\n`;
    }
    message += 'Please try again.';
  }
  
  const resultBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 15,
    border: {
      type: 'line',
      fg: success ? 'green' : 'red'
    },
    label: ' Order Result ',
    tags: true,
    style: {
      fg: 'white',
      bg: '#222222'
    },
    shadow: true,
    content: message,
    padding: 1,
    scrollable: true
  });
  
  // Button bar at the bottom of the result box
  const doneButtonBar = blessed.box({
    parent: resultBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    style: {
      bg: '#222222'
    }
  });

  // Add a Done button
  const doneButton = blessed.button({
    parent: doneButtonBar,
    bottom: 0,
    left: 'center',
    width: 12,
    height: 3,
    content: 'Done',
    align: 'center',
    valign: 'middle',
    tags: true,
    style: {
      bg: 'blue',
      fg: 'white',
      bold: true,
      focus: {
        bg: 'cyan',
        fg: 'black'
      },
      hover: {
        bg: 'cyan'
      }
    },
    mouse: true,
    keys: true
  });
  
  // Add help text above the button bar
  blessed.text({
    parent: resultBox,
    bottom: 3,
    left: 'center',
    content: 'Press Enter or Esc to close',
    align: 'center',
    style: {
      fg: 'white'
    }
  });
  
  // Function to close the result screen
  function closeResultScreen() {
    screen.grabKeys = false;
    overlay.destroy();
    resultBox.destroy();
    statusBar.setContent(' Press ↑/↓ to navigate, Enter to select, Q to quit');
    marketsList.focus();
    
    // Refresh market data after placing an order
    if (success) {
      setTimeout(() => {
        populateMarketsList();
      }, 1000);
    }
    
    screen.render();
  }
  
  // Button handler
  doneButton.on('press', closeResultScreen);
  
  // Key handlers
  screen.grabKeys = true;
  
  resultBox.key(['escape', 'enter', 'space'], closeResultScreen);
  
  // Add a direct keypress handler for cases where the above handlers don't catch
  resultBox.on('keypress', (ch, key) => {
    if (key) {
      if (key.name === 'escape' || ch === '\u001b' || 
          key.name === 'enter' || ch === '\r' ||
          key.name === 'space' || ch === ' ') {
        closeResultScreen();
      }
    }
  });
  
  // Focus on the button
  doneButton.focus();
  screen.render();
}

// Update contract details
async function updateContractDetails(index) {
  state.currentMarketIndex = index;
  
  if (!state.contracts || state.contracts.length <= index) {
    console.log(`No contract found at index: ${index}`);
    return;
  }
  
  state.selectedContract = state.contracts[index];
  const contract = state.selectedContract;
  
  if (!contract) {
    console.log(`No contract found at index: ${index}`);
    return;
  }
  
  // Show loading indicator
  statusBar.setContent(` Loading details for ${contract.symbol}...`);
  screen.render();
  
  try {
    // Attempt to get more detailed contract information from API
    const detailedContract = await getContractDetails(contract.contract_id);
    if (detailedContract) {
      // Update with more complete information while preserving the index
      state.selectedContract = {
        ...detailedContract,
        index: contract.index // Ensure the index is preserved
      };
      contract = state.selectedContract;
    }
  } catch (error) {
    console.log(`Error fetching detailed contract info: ${error.message}`);
    // Continue with the basic contract info
  }
  
  // Update details view with available information
  contractDetails.setContent(
    `{bold}Symbol:{/bold} ${contract.symbol}\n` +
    `{bold}Index:{/bold} ${contract.index}\n` +
    `{bold}Last Price:{/bold} ${formatNumber(contract.last_price)}\n` +
    `{bold}Mark Price:{/bold} ${formatNumber(contract.mark_price)}\n` +
    `{bold}24h Volume:{/bold} ${formatNumber(contract.volume_24h)}\n` +
    (contract.open_interest ? `{bold}Open Interest:{/bold} ${formatNumber(contract.open_interest)}\n` : '') +
    (contract.min_order_size_contracts ? `{bold}Min Order Size:{/bold} ${formatNumber(contract.min_order_size_contracts)} contracts\n` : '')
  );
  
  // Update order book
  updateOrderBook(contract.contract_id);
  
  // Update recent trades
  updateRecentTrades(contract.contract_id);
  
  // Update status
  statusBar.setContent(` Viewing ${contract.symbol} contract details. Press (T)rade, (Q)uit`);
  screen.render();
}

// Function to update order book
async function updateOrderBook(contractId) {
  orderBook.setContent('Loading order book...');
  screen.render();
  
  // First try to use cached contract details if available
  const cachedContract = state.contracts.find(c => c.contract_id === contractId);
  if (!cachedContract) {
    console.log(`Contract ${contractId} not found in cache`);
    updateSampleOrderBook();
    return;
  }
  
  try {
    // Try the most appropriate price step for this contract
    // Different contracts might need different price steps based on their price range
    let orderBookData = null;
    let usedSampleData = false;
    
    // Try with a single appropriate price step instead of trying all
    // For higher priced assets (BTC, ETH), use larger steps
    let appropriatePriceStep = '1';
    
    if (cachedContract.mark_price > 50000) {
      appropriatePriceStep = '100';
    } else if (cachedContract.mark_price > 10000) {
      appropriatePriceStep = '50';
    } else if (cachedContract.mark_price > 1000) {
      appropriatePriceStep = '10';
    } else if (cachedContract.mark_price < 10) {
      appropriatePriceStep = '0.1';
    }
    
    try {
      orderBookData = await getOrderBook(contractId, appropriatePriceStep);
      
      // Check if we have meaningful data
      const hasData = orderBookData && 
                     (orderBookData.asks && orderBookData.asks.length > 0) || 
                     (orderBookData.bids && orderBookData.bids.length > 0);
      
      if (!hasData) {
        throw new Error('No order book data received');
      }
    } catch (error) {
      console.log(`Failed to get order book data: ${error.message}`);
      
      // Try with all price steps if the first one failed
      const validPriceSteps = ['0.1', '1', '10', '50', '100'];
      let success = false;
      
      for (const step of validPriceSteps) {
        if (step === appropriatePriceStep) continue; // Skip the one we already tried
        
        try {
          console.log(`Retrying with price step ${step}...`);
          orderBookData = await getOrderBook(contractId, step);
          
          // Check if we have data
          if (orderBookData && 
             (orderBookData.asks && orderBookData.asks.length > 0) || 
             (orderBookData.bids && orderBookData.bids.length > 0)) {
            success = true;
            break;
          }
        } catch (retryError) {
          console.log(`Retry with step ${step} failed: ${retryError.message}`);
          continue;
        }
      }
      
      if (!success) {
        usedSampleData = true;
        updateSampleOrderBook();
      }
    }
    
    if (!usedSampleData && orderBookData) {
      // Store order book data
      state.orderBookData = orderBookData;
      
      // Use the order book data to update the display
      updateOrderBookDisplay(orderBookData);
      
      // Add info about data source to status bar
      statusBar.setContent(` Viewing ${cachedContract.symbol} with real order book data. Press (T)rade, (Q)uit`);
    }
  } catch (error) {
    logError(error, `Order Book Update - Contract ${contractId}`);
    console.log(`Error updating order book: ${error.message}`);
    updateSampleOrderBook();
    
    // Make it clear we're using sample data
    statusBar.setContent(` Viewing ${cachedContract.symbol} with sample data (API error). Press (T)rade, (Q)uit`);
  }
  
  screen.render();
}

// Function to update recent trades
async function updateRecentTrades(contractId) {
  recentTrades.setContent('Loading recent trades...');
  screen.render();
  
  try {
    const tradesData = await getRecentTrades(contractId, 7);
    
    if (tradesData && tradesData.length > 0) {
      // Store trades data
      state.recentTradesData = tradesData;
      
      // Update the display with real trades data
      updateRecentTradesDisplay(tradesData);
    } else {
      // Fallback to sample trades
      updateSampleTrades();
    }
  } catch (error) {
    console.log(`Error updating recent trades: ${error.message}`);
    updateSampleTrades();
  }
}

// Helper function to update order book display with real data
function updateOrderBookDisplay(orderBookData) {
  // Define column widths
  const priceWidth = 14;
  const qtyWidth = 8;
  const valueWidth = 14;
  
  // Create header
  let orderBookContent = '{bold}{red-fg}SELL ORDERS{/red-fg}{/bold}\n';
  orderBookContent += '{bold}' + 
    'Price'.padEnd(priceWidth) + 
    'Quantity'.padEnd(qtyWidth) + 
    'Value'.padEnd(valueWidth) + 
    '{/bold}\n';
  
  // Ask prices (sells)
  if (orderBookData.asks && orderBookData.asks.length > 0) {
    // Show asks in descending order (lowest ask first)
    const sortedAsks = [...orderBookData.asks].sort((a, b) => a.price - b.price).slice(0, 5);
    
    for (const ask of sortedAsks) {
      const price = ask.price;
      const quantity = ask.quantity_contracts;
      const value = price * quantity;
      
      orderBookContent += 
        `{red-fg}${formatNumber(price).padEnd(priceWidth)}{/red-fg}` + 
        `${quantity.toString().padEnd(qtyWidth)}` +
        `${formatNumber(value).padEnd(valueWidth)}\n`;
    }
  }
  
  orderBookContent += '{bold}' + '─'.repeat(priceWidth + qtyWidth + valueWidth) + '{/bold}\n';
  
  // Bid prices (buys)
  if (orderBookData.bids && orderBookData.bids.length > 0) {
    // Show bids in descending order (highest bid first)
    const sortedBids = [...orderBookData.bids].sort((a, b) => b.price - a.price).slice(0, 5);
    
    for (const bid of sortedBids) {
      const price = bid.price;
      const quantity = bid.quantity_contracts;
      const value = price * quantity;
      
      orderBookContent += 
        `{green-fg}${formatNumber(price).padEnd(priceWidth)}{/green-fg}` + 
        `${quantity.toString().padEnd(qtyWidth)}` +
        `${formatNumber(value).padEnd(valueWidth)}\n`;
    }
  }
  
  orderBookContent += '{bold}{green-fg}BUY ORDERS{/green-fg}{/bold}';
  orderBook.setContent(orderBookContent);
  screen.render();
}

// Helper function to update order book with sample data
function updateSampleOrderBook() {
  if (!state.selectedContract) return;
  
  const basePrice = state.selectedContract.mark_price;
  
  // Define column widths
  const priceWidth = 14;
  const qtyWidth = 8;
  const valueWidth = 14;
  
  // Create header
  let orderBookContent = '{bold}{red-fg}SELL ORDERS{/red-fg}{/bold}\n';
  orderBookContent += '{bold}' + 
    'Price'.padEnd(priceWidth) + 
    'Quantity'.padEnd(qtyWidth) + 
    'Value'.padEnd(valueWidth) + 
    '{/bold}\n';
  
  // Ask prices (higher than base)
  for (let i = 5; i > 0; i--) {
    const price = basePrice * (1 + i * 0.001);
    const quantity = Math.floor(Math.random() * 20) + 1;
    const value = price * quantity;
    
    orderBookContent += 
      `{red-fg}${formatNumber(price).padEnd(priceWidth)}{/red-fg}` + 
      `${quantity.toString().padEnd(qtyWidth)}` +
      `${formatNumber(value).padEnd(valueWidth)}\n`;
  }
  
  orderBookContent += '{bold}' + '─'.repeat(priceWidth + qtyWidth + valueWidth) + '{/bold}\n';
  
  // Bid prices (lower than base)
  for (let i = 0; i < 5; i++) {
    const price = basePrice * (1 - i * 0.001);
    const quantity = Math.floor(Math.random() * 20) + 1;
    const value = price * quantity;
    
    orderBookContent += 
      `{green-fg}${formatNumber(price).padEnd(priceWidth)}{/green-fg}` + 
      `${quantity.toString().padEnd(qtyWidth)}` +
      `${formatNumber(value).padEnd(valueWidth)}\n`;
  }
  
  orderBookContent += '{bold}{green-fg}BUY ORDERS{/green-fg}{/bold}';
  orderBook.setContent(orderBookContent);
  screen.render();
}

// Helper function to update recent trades with real data
function updateRecentTradesDisplay(tradesData) {
  // Define column widths
  const timeWidth = 10;
  const tradePriceWidth = 14;
  const sideWidth = 6;
  const amountWidth = 8;
  
  let tradesContent = '{bold}RECENT TRADES{/bold}\n';
  tradesContent += '{bold}' + 
    'Time'.padEnd(timeWidth) + 
    'Price'.padEnd(tradePriceWidth) + 
    'Side'.padEnd(sideWidth) + 
    'Amount'.padEnd(amountWidth) + 
    '{/bold}\n';
  
  for (const trade of tradesData) {
    const time = new Date(trade.time);
    const timeStr = time.toLocaleTimeString().slice(0, 8); // HH:MM:SS
    
    const price = trade.last_price;
    const side = trade.taker_side?.toUpperCase() || 'BUY';
    const amount = trade.quantity_contracts;
    
    const color = side === 'BUY' ? 'green-fg' : 'red-fg';
    tradesContent += 
      timeStr.padEnd(timeWidth) + 
      formatNumber(price).padEnd(tradePriceWidth) + 
      `{${color}}${side.padEnd(sideWidth)}{/${color}}` + 
      amount.toString().padEnd(amountWidth) + 
      '\n';
  }
  
  recentTrades.setContent(tradesContent);
  screen.render();
}

// Helper function to update recent trades with sample data
function updateSampleTrades() {
  if (!state.selectedContract) return;
  
  // Define column widths
  const timeWidth = 10;
  const tradePriceWidth = 14;
  const sideWidth = 6;
  const amountWidth = 8;
  
  let tradesContent = '{bold}RECENT TRADES{/bold}\n';
  tradesContent += '{bold}' + 
    'Time'.padEnd(timeWidth) + 
    'Price'.padEnd(tradePriceWidth) + 
    'Side'.padEnd(sideWidth) + 
    'Amount'.padEnd(amountWidth) + 
    '{/bold}\n';
  
  for (let i = 0; i < 7; i++) {
    const time = new Date();
    time.setMinutes(time.getMinutes() - i * 5);
    const timeStr = time.toLocaleTimeString().slice(0, 8); // HH:MM:SS
    
    const price = state.selectedContract.mark_price * (1 + (Math.random() * 0.01 - 0.005));
    const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const amount = Math.floor(Math.random() * 10) + 1;
    
    const color = side === 'BUY' ? 'green-fg' : 'red-fg';
    tradesContent += 
      timeStr.padEnd(timeWidth) + 
      formatNumber(price).padEnd(tradePriceWidth) + 
      `{${color}}${side.padEnd(sideWidth)}{/${color}}` + 
      amount.toString().padEnd(amountWidth) + 
      '\n';
  }
  
  recentTrades.setContent(tradesContent);
  screen.render();
}

// Set up key bindings - on the list itself to prevent conflict with list navigation
marketsList.key(['q', 'C-c'], function() {
  return process.exit(0);
});

marketsList.key(['r'], function() {
  statusBar.setContent(' Refreshing data...');
  screen.render();
  setTimeout(() => {
    populateMarketsList();
    if (state.selectedContract) {
      updateContractDetails(state.currentMarketIndex);
    }
    statusBar.setContent(' Data refreshed. Press ↑/↓ to navigate, (T)rade, (Q)uit');
    screen.render();
  }, 500);
});

// Standard key handler for quitting the application
screen.key(['q', 'C-c'], function() {
  return process.exit(0);
});


// Remove redundant 't' and 'T' handlers from individual components that might be conflicting
// instead we handle them globally at the screen level

// Add page up/down for faster navigation
marketsList.key(['pageup'], function() {
  const newIndex = Math.max(0, marketsList.selected - 5);
  marketsList.select(newIndex);
  if (marketsList.getScroll() > newIndex) {
    marketsList.setScroll(Math.max(0, marketsList.getScroll() - 5));
  }
  updateContractDetails(marketsList.selected);
  screen.render();
});

marketsList.key(['pagedown'], function() {
  const newIndex = Math.min(sampleContracts.length - 1, marketsList.selected + 5);
  marketsList.select(newIndex);
  if (marketsList.getScroll() + marketsList.height - 2 < newIndex) {
    marketsList.setScroll(Math.min(marketsList.items.length - marketsList.height + 2, marketsList.getScroll() + 5));
  }
  updateContractDetails(marketsList.selected);
  screen.render();
});

// Handle list selection
marketsList.on('select', function(item, index) {
  updateContractDetails(index);
});

// Initialize
populateMarketsList();

// Ensure markets list has focus
marketsList.focus();

// Handle enter key at the screen level for consistent behavior
screen.key(['enter'], function() {
  // Only handle if markets list has focus
  if (screen.focused === marketsList && marketsList.selected >= 0 && marketsList.selected < sampleContracts.length) {
    updateContractDetails(marketsList.selected);
  }
});

// We've already set up keyboard handlers globally higher up in the code
// These are redundant and may be causing conflicts

// Explicit focus setup to ensure the market list is active
marketsList.focus();

// Force a screen resize to ensure all elements render properly
screen.program.emit('resize');

// Perform initial rendering
screen.render();

// Silent startup - no console logs to keep terminal UI clean

// Show a startup message in the status bar
statusBar.setContent(' CVEX Trading Terminal ready. Press ↑/↓ to navigate, (T)rade, (R)efresh, (Q)uit');
screen.render();

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Screen and state for tests
    screen,
    state,
    
    // API utility functions
    getApiKey,
    getMessageForSigning,
    signMessage,
    apiRequest,
    
    // UI functions
    populateMarketsList,
    updateContractDetails,
    showTradeScreen,
    updateOrderBook,
    updateRecentTrades,
    toggleActivityFeed,
    validateInputs,
    updateStateFromForm,
    
    // Trading functions
    estimateOrder,
    placeOrder,
    showOrderEstimationResult,
    showOrderConfirmation,
    showOrderResult,
    
    // Error handling
    logError
  };
}