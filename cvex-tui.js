#!/usr/bin/env node
// cvex-tui.js - Simplified Text-based User Interface for CVEX Trading API

const blessed = require('neo-blessed');
const contrib = require('blessed-contrib');
const { loadConfig, getConfig } = require('./actions/config');
const { formatNumber } = require('./actions/utils');

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
  { contract_id: 50, symbol: 'ETH-30MAY25', index: 'ETH', last_price: 1815, mark_price: 1797.7273, volume_24h: 532203.93 }
];

// Create the screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'CVEX Trading Terminal',
  fullUnicode: true
});

// State management
let state = {
  selectedContract: null,
  currentMarketIndex: 0
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
  keyable: true,
  focusable: true,
  inputOnFocus: true,
  scrollbar: {
    ch: ' ',
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
  content: ' Press ↑/↓ to navigate, Enter to select, Q to quit',
  style: {
    bg: 'blue',
    fg: 'white'
  }
});

// Help text
blessed.text({
  parent: header,
  top: 1,
  right: 2,
  content: '(Q)uit | (R)efresh',
  style: {
    fg: 'white'
  }
});

// Populate markets list
function populateMarketsList() {
  const items = sampleContracts.map(contract => 
    `${contract.symbol} (${contract.index})`
  );
  marketsList.setItems(items);
  marketsList.select(state.currentMarketIndex);
  screen.render();
}

// Update contract details
function updateContractDetails(index) {
  state.currentMarketIndex = index;
  state.selectedContract = sampleContracts[index];
  const contract = state.selectedContract;
  
  // Update details view
  contractDetails.setContent(
    `{bold}Symbol:{/bold} ${contract.symbol}\n` +
    `{bold}Index:{/bold} ${contract.index}\n` +
    `{bold}Last Price:{/bold} ${formatNumber(contract.last_price)}\n` +
    `{bold}Mark Price:{/bold} ${formatNumber(contract.mark_price)}\n` +
    `{bold}24h Volume:{/bold} ${formatNumber(contract.volume_24h)}\n`
  );
  
  // Generate sample order book with columnar layout
  const basePrice = contract.mark_price;
  
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
  
  // Generate sample trades with columnar layout
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
    
    const price = basePrice * (1 + (Math.random() * 0.01 - 0.005));
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
  
  // Update status
  statusBar.setContent(` Viewing ${contract.symbol} contract details. Press Q to quit.`);
  
  screen.render();
}

// Set up key bindings - on the list itself to prevent conflict with list navigation
marketsList.key(['escape', 'q', 'C-c'], function() {
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
    statusBar.setContent(' Data refreshed. Press ↑/↓ to navigate, Enter to select, Q to quit');
    screen.render();
  }, 500);
});

// Also add to screen for when list doesn't have focus
screen.key(['escape', 'q', 'C-c'], function() {
  return process.exit(0);
});

// Handle list selection
marketsList.on('select', function(item, index) {
  updateContractDetails(index);
});

// Initialize
populateMarketsList();

// Ensure markets list has focus
marketsList.focus();

// Remove the explicit up/down handlers as they're conflicting
// Let the native list control handle these events

// Also handle enter directly
screen.key(['enter'], function() {
  if (marketsList.selected >= 0 && marketsList.selected < sampleContracts.length) {
    updateContractDetails(marketsList.selected);
  }
});

screen.render();