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
  currentMarketIndex: 0,
  tradeForm: {
    side: 'buy',
    type: 'limit',
    limitPrice: '0',
    timeInForce: 'GTC',
    reduceOnly: false,
    quantity: '1'
  }
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
  content: '(T)rade | (Q)uit | (R)efresh',
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

// Function to show the trade screen
function showTradeScreen() {
  // Create trade form overlay
  const tradeForm = blessed.form({
    parent: screen,
    top: 1,
    left: 'center',
    width: 70,
    height: 22,
    border: 'line',
    label: ` New Order: ${state.selectedContract.symbol} `,
    tags: true,
    keys: true,
    mouse: true,
    style: {
      bg: 'black',
      fg: 'white',
      border: {
        fg: 'white'
      }
    }
  });

  // Form fields
  blessed.text({
    parent: tradeForm,
    top: 2,
    left: 2,
    content: '{bold}Order Details{/bold}',
    tags: true
  });

  // Order side label
  blessed.text({
    parent: tradeForm,
    top: 4,
    left: 2,
    content: 'Order Side:',
    tags: true
  });

  // Buy radio
  const buyRadio = blessed.radiobutton({
    parent: tradeForm,
    top: 4,
    left: 15,
    content: 'BUY',
    checked: state.tradeForm.side === 'buy',
    style: {
      fg: 'green'
    }
  });

  // Sell radio
  const sellRadio = blessed.radiobutton({
    parent: tradeForm,
    top: 4,
    left: 25,
    content: 'SELL',
    checked: state.tradeForm.side === 'sell',
    style: {
      fg: 'red'
    }
  });

  // Order type label
  blessed.text({
    parent: tradeForm,
    top: 6,
    left: 2,
    content: 'Order Type:',
    tags: true
  });

  // Limit radio
  const limitRadio = blessed.radiobutton({
    parent: tradeForm,
    top: 6,
    left: 15,
    content: 'Limit',
    checked: state.tradeForm.type === 'limit'
  });

  // Market radio
  const marketRadio = blessed.radiobutton({
    parent: tradeForm,
    top: 6,
    left: 25,
    content: 'Market',
    checked: state.tradeForm.type === 'market'
  });

  // Price label
  blessed.text({
    parent: tradeForm,
    top: 8,
    left: 2,
    content: 'Price:',
    tags: true
  });

  // Price input
  const priceInput = blessed.textbox({
    parent: tradeForm,
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

  // Quantity label
  blessed.text({
    parent: tradeForm,
    top: 10,
    left: 2,
    content: 'Quantity:',
    tags: true
  });

  // Quantity input
  const quantityInput = blessed.textbox({
    parent: tradeForm,
    top: 10,
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

  // Time in Force label
  blessed.text({
    parent: tradeForm,
    top: 12,
    left: 2,
    content: 'Time in Force:',
    tags: true
  });

  // TIF select
  const tifList = blessed.list({
    parent: tradeForm,
    top: 12,
    left: 15,
    width: 20,
    height: 4,
    border: 'line',
    items: ['GTC', 'IOC', 'FOK', 'PO'],
    style: {
      selected: {
        bg: 'blue',
        fg: 'white'
      },
      focus: {
        border: {
          fg: 'cyan'
        }
      }
    }
  });

  // Find the index of current TIF
  const tifOptions = ['GTC', 'IOC', 'FOK', 'PO'];
  const currentTifIndex = tifOptions.indexOf(state.tradeForm.timeInForce);
  if (currentTifIndex >= 0) {
    tifList.select(currentTifIndex);
  }

  // Reduce Only label
  blessed.text({
    parent: tradeForm,
    top: 17,
    left: 2,
    content: 'Reduce Only:',
    tags: true
  });

  // Reduce Only checkbox
  const reduceOnlyCheckbox = blessed.checkbox({
    parent: tradeForm,
    top: 17,
    left: 15,
    content: '',
    checked: state.tradeForm.reduceOnly,
    style: {
      fg: 'white'
    }
  });

  // Estimate button
  const estimateButton = blessed.button({
    parent: tradeForm,
    top: 19,
    left: 10,
    width: 15,
    height: 1,
    content: 'Estimate',
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

  // Cancel button
  const cancelButton = blessed.button({
    parent: tradeForm,
    top: 19,
    left: 30,
    width: 15,
    height: 1,
    content: 'Cancel',
    style: {
      bg: 'red',
      fg: 'white',
      focus: {
        bg: 'cyan'
      },
      hover: {
        bg: 'cyan'
      }
    }
  });

  // Set initial values
  priceInput.setValue(state.selectedContract.mark_price.toString());
  quantityInput.setValue(state.tradeForm.quantity);

  // Radio button handlers
  buyRadio.on('check', () => {
    state.tradeForm.side = 'buy';
    sellRadio.uncheck();
  });

  sellRadio.on('check', () => {
    state.tradeForm.side = 'sell';
    buyRadio.uncheck();
  });

  limitRadio.on('check', () => {
    state.tradeForm.type = 'limit';
    priceInput.style.bg = 'black';
    priceInput.readOnly = false;
    marketRadio.uncheck();
  });

  marketRadio.on('check', () => {
    state.tradeForm.type = 'market';
    priceInput.style.bg = 'gray';
    priceInput.readOnly = true;
    limitRadio.uncheck();
  });

  // List selection handler
  tifList.on('select', (item) => {
    state.tradeForm.timeInForce = item.content;
  });

  // Checkbox handler
  reduceOnlyCheckbox.on('check', () => {
    state.tradeForm.reduceOnly = true;
  });

  reduceOnlyCheckbox.on('uncheck', () => {
    state.tradeForm.reduceOnly = false;
  });

  // Button handlers
  estimateButton.on('press', () => {
    state.tradeForm.limitPrice = priceInput.value;
    state.tradeForm.quantity = quantityInput.value;
    
    // Show estimation result
    showOrderEstimationResult();
    
    // Hide the form
    tradeForm.detach();
    screen.render();
  });

  cancelButton.on('press', () => {
    tradeForm.detach();
    screen.render();
  });

  // Focus on first field
  buyRadio.focus();
  screen.render();
}

// Function to show order estimation result
function showOrderEstimationResult() {
  // Base price and quantity
  const basePrice = parseFloat(state.tradeForm.limitPrice) || state.selectedContract.mark_price;
  const quantity = parseInt(state.tradeForm.quantity) || 1;
  
  // Create a formatted quantity steps string (positive for buy, negative for sell)
  const quantitySteps = state.tradeForm.side === 'buy' ? quantity : -quantity;
  
  // Create result modal
  const resultBox = blessed.box({
    parent: screen,
    top: 1,
    left: 'center',
    width: 70,
    height: 20,
    border: 'line',
    label: ` Order Estimation: ${state.selectedContract.symbol} `,
    tags: true,
    keys: true,
    style: {
      border: {
        fg: state.tradeForm.side === 'buy' ? 'green' : 'red'
      }
    },
    content: ''
  });
  
  // Generate sample values for display
  const orderValue = Math.abs(basePrice * quantity);
  const tradingFee = orderValue * 0.0005; // 0.05%
  const operationalFee = orderValue * 0.0001; // 0.01%
  const totalFees = tradingFee + operationalFee;
  
  // Mock some values for estimation
  const leverage = 2.5;
  const currentEquity = orderValue * 2;
  const newEquity = currentEquity - orderValue * 0.001;
  const liquidationPrice = state.tradeForm.side === 'buy' 
    ? basePrice * 0.6 
    : basePrice * 1.4;
  
  // Create estimation content
  let content = '';
  content += '{bold}Order Parameters:{/bold}\n';
  content += `Contract: ${state.selectedContract.symbol}\n`;
  content += `Side: ${state.tradeForm.side.toUpperCase()}\n`;
  content += `Type: ${state.tradeForm.type.toUpperCase()}\n`;
  content += `Price: ${formatNumber(basePrice)}\n`;
  content += `Quantity: ${quantity} contracts\n`;
  content += `Time in Force: ${state.tradeForm.timeInForce}\n`;
  content += `Reduce Only: ${state.tradeForm.reduceOnly ? 'Yes' : 'No'}\n\n`;
  
  content += '{bold}Estimation Results:{/bold}\n';
  content += `Order Value: ${formatNumber(orderValue)}\n`;
  content += `Trading Fee: ${formatNumber(tradingFee)}\n`;
  content += `Operational Fee: ${formatNumber(operationalFee)}\n`;
  content += `Total Fees: ${formatNumber(totalFees)}\n\n`;
  
  content += `Current Equity: ${formatNumber(currentEquity)}\n`;
  content += `New Equity: ${formatNumber(newEquity)}\n`;
  content += `Current Leverage: ${formatNumber(leverage)}x\n`;
  content += `Est. Liquidation Price: ${formatNumber(liquidationPrice)}\n\n`;
  
  content += 'Press Enter to submit order, Esc to cancel';
  
  resultBox.setContent(content);
  
  // Key handlers
  resultBox.key(['escape'], () => {
    resultBox.detach();
    screen.render();
  });
  
  resultBox.key(['enter'], () => {
    resultBox.detach();
    
    // Show confirmation dialog
    showOrderConfirmation();
    
    screen.render();
  });
  
  // Focus on the box to enable key handling
  resultBox.focus();
  screen.render();
}

// Function to show order confirmation
function showOrderConfirmation() {
  const confirmDialog = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 10,
    border: 'line',
    label: ' Confirm Order ',
    tags: true,
    keys: true,
    mouse: true,
    content: `Are you sure you want to place this ${state.tradeForm.side.toUpperCase()} order?`,
    style: {
      bg: 'black',
      fg: 'white',
      border: {
        fg: 'white'
      }
    }
  });
  
  confirmDialog.ask((err, value) => {
    if (value) {
      // Show success message
      showOrderResult(true);
    }
    screen.render();
  });
}

// Function to show order result
function showOrderResult(success) {
  let message = '';
  
  if (success) {
    message = `{green-fg}Order placed successfully!{/green-fg}\n\n` +
              `Contract: ${state.selectedContract.symbol}\n` +
              `Type: ${state.tradeForm.side.toUpperCase()} ${state.tradeForm.type.toUpperCase()}\n` +
              `Transaction ID: TXN${Math.floor(Math.random() * 1000000)}`;
  } else {
    message = '{red-fg}Order failed.{/red-fg}\n\nPlease try again.';
  }
  
  const resultBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 10,
    border: 'line',
    label: ' Order Result ',
    tags: true,
    content: message,
    style: {
      bg: 'black',
      fg: 'white',
      border: {
        fg: success ? 'green' : 'red'
      }
    }
  });
  
  // Close on any key
  resultBox.key(['escape', 'enter', 'space'], () => {
    resultBox.detach();
    screen.render();
  });
  
  // Focus on the result box
  resultBox.focus();
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

// Trade key shortcut
screen.key(['t', 'T'], function() {
  if (state.selectedContract) {
    showTradeScreen();
  } else {
    statusBar.setContent(' Please select a contract first');
    screen.render();
  }
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