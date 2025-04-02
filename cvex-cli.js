#!/usr/bin/env node
// cvex-cli.js - Main entry point for the CVEX CLI
const readline = require('readline');
const { program } = require('commander');

// Import actions
const { loadConfig, saveConfig, getConfig } = require('./actions/config');
const { listContracts, getContractDetails, getMarketData } = require('./actions/markets');
const { getAccountInformation } = require('./actions/account');
const { 
  getPositions, 
  getPortfolio, 
  getContracts, 
  estimateOrder, 
  placeOrder, 
  placeOrderWithoutConfirmation,
  placeMultipleOrders,
  createOrderFromOptions,
  selectContract,
  createTestOrder,
  createStressTestOrder
} = require('./actions/trading');

// Initialize CLI
program
  .name('cvex-cli')
  .description('CVEX Trading API CLI Tool')
  .version('1.0.0');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility to ask questions
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Configure command
program
  .command('config')
  .description('Configure API credentials')
  .action(async () => {
    try {
      loadConfig();
      const config = getConfig();
      
      console.log('CVEX API Configuration');
      console.log('-'.repeat(30));
      
      const apiUrl = await question(`API URL [${config.apiUrl}]: `);
      if (apiUrl) config.apiUrl = apiUrl;
      
      const apiKey = await question(`API Key [${config.apiKey ? '********' : ''}]: `);
      if (apiKey) config.apiKey = apiKey;
      
      const privateKeyPath = await question(`Private Key File Path [${config.privateKeyPath || ''}]: `);
      if (privateKeyPath) config.privateKeyPath = privateKeyPath;
      
      saveConfig();
    } finally {
      rl.close();
    }
  });

// Show current config
program
  .command('show-config')
  .description('Display current configuration')
  .action(() => {
    try {
      if (!loadConfig()) {
        console.log('No configuration found. Please run "cvex-cli config" to set up.');
        return;
      }
      
      const config = getConfig();
      console.log('Current Configuration:');
      console.log('-'.repeat(30));
      console.log(`API URL:              ${config.apiUrl}`);
      console.log(`API Key:              ${config.apiKey ? '********' : 'Not set'}`);
      console.log(`Private Key Path:     ${config.privateKeyPath || 'Not set'}`);
      console.log('-'.repeat(30));
    } finally {
      rl.close();
    }
  });

// Markets command
program
  .command('markets')
  .description('List available markets/contracts')
  .action(async () => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      await listContracts();
    } finally {
      rl.close();
    }
  });

// Contract detail command
program
  .command('contract <id>')
  .description('Get details for a specific contract')
  .action(async (id) => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      await getContractDetails(id);
      await getMarketData(id);
    } finally {
      rl.close();
    }
  });

// Account command
program
  .command('account')
  .description('Get account information')
  .action(async () => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      await getAccountInformation();
    } finally {
      rl.close();
    }
  });

// Trading command
program
  .command('trade')
  .description('Interactive trading interface')
  .option('--contract_id <id>', 'Contract ID')
  .option('--order_side <side>', 'Order side (buy/sell)')
  .option('--order_type <type>', 'Order type (market/limit)')
  .option('--limit_price <price>', 'Limit price (for limit orders)')
  .option('--time_in_force <tif>', 'Time in force (GTC/IOC/FOK/PO)')
  .option('--reduce_only <bool>', 'Reduce only (true/false)')
  .option('--quantity <amount>', 'Quantity in steps or assets')
  .option('--quantity_type <type>', 'Quantity type (steps/contracts/assets)')
  .option('--num_orders <count>', 'Number of orders to submit')
  .option('--frequency <rate>', 'Orders per second for multiple orders')
  .action(async (options) => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      console.log('CVEX Trading Interface');
      console.log('======================');
      
      // First, get account info
      await getAccountInformation();
      
      // Then, select a contract
      let contract;
      if (options.contract_id) {
        // Get contract by ID
        const contracts = await getContracts();
        contract = contracts.find(c => c.contract_id === parseInt(options.contract_id));
        if (!contract) {
          console.log(`Contract with ID ${options.contract_id} not found.`);
          return;
        }
        console.log(`Selected contract: ${contract.symbol}`);
      } else {
        contract = await selectContract(question);
        if (!contract) {
          console.log('Trading session cancelled.');
          return;
        }
      }
      
      // Get order parameters and estimate
      let orderData;
      if (options.order_side) {
        // Use command line parameters
        orderData = await createOrderFromOptions(contract, options);
      } else {
        // Use interactive mode
        orderData = await estimateOrder(contract, question);
      }
      
      if (!orderData) {
        console.log('Order estimation failed or cancelled.');
        return;
      }

      // Ask for number of orders if not provided
      let numOrders;
      if (options.num_orders) {
        numOrders = parseInt(options.num_orders);
      } else {
        while (true) {
          const input = await question('How many orders do you want to submit? (1 for single order): ');
          numOrders = parseInt(input);
          if (!isNaN(numOrders) && numOrders > 0) break;
          console.log('Invalid input. Please enter a positive number.');
        }
      }
      
      // Place the order(s)
      if (numOrders === 1) {
        // For single orders, if running non-interactively, skip confirmation
        if (options.order_side) {
          // Skip confirmation for command-line orders
          await placeOrderWithoutConfirmation(orderData);
        } else {
          await placeOrder(orderData, question);
        }
      } else {
        // Ask for frequency if not provided
        let frequency;
        if (options.frequency) {
          frequency = parseFloat(options.frequency);
        } else {
          while (true) {
            const input = await question('How many orders per second? (default: 10): ');
            if (input === '') {
              frequency = 10;
              break;
            }
            frequency = parseFloat(input);
            if (!isNaN(frequency) && frequency > 0) break;
            console.log('Invalid input. Please enter a positive number.');
          }
        }
        
        // If options were provided via command line, skip confirmation
        const skipConfirmation = options.order_side ? true : false;
        await placeMultipleOrders(orderData, numOrders, frequency, question, skipConfirmation);
      }
    } finally {
      rl.close();
    }
  });

// Test Orders command (for debugging)
program
  .command('test-orders')
  .description('Test with invalid orders to generate server errors')
  .option('--contract_id <id>', 'Contract ID to test with', '43')
  .option('--num_orders <count>', 'Number of orders to submit', '5')
  .option('--frequency <rate>', 'Orders per second', '2')
  .action(async (options) => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      console.log('CVEX Test Orders Mode');
      console.log('====================');
      console.log('Warning: This will generate intentional errors for testing purposes');
      
      const contractId = parseInt(options.contract_id);
      const numOrders = parseInt(options.num_orders);
      const frequency = parseFloat(options.frequency);
      
      // Create test order data
      const orderData = await createTestOrder(contractId);
      if (!orderData) {
        console.log('Failed to create test order.');
        return;
      }
      
      // Submit multiple test orders
      await placeMultipleOrders(orderData, numOrders, frequency, question, true);
    } finally {
      rl.close();
    }
  });

// Stress Test command
program
  .command('stress-test')
  .description('Run a stress test with high frequency valid orders')
  .option('--contract_id <id>', 'Contract ID to test with', '43')
  .option('--num_orders <count>', 'Number of orders to submit', '50')
  .option('--frequency <rate>', 'Orders per second', '20')
  .action(async (options) => {
    try {
      if (!loadConfig()) {
        console.log('Please run "cvex-cli config" first to set up your API credentials.');
        return;
      }
      
      console.log('CVEX Stress Test Mode');
      console.log('====================');
      console.log('Warning: This will generate a high volume of orders for stress testing');
      
      const contractId = parseInt(options.contract_id);
      const numOrders = parseInt(options.num_orders);
      const frequency = parseFloat(options.frequency);
      
      console.log(`Submitting ${numOrders} orders at ${frequency} orders/second`);
      
      // Create stress test order data
      const orderData = await createStressTestOrder(contractId);
      if (!orderData) {
        console.log('Failed to create stress test order.');
        return;
      }
      
      // Submit multiple stress test orders
      await placeMultipleOrders(orderData, numOrders, frequency, question, true);
    } finally {
      rl.close();
    }
  });

// Help command
program
  .command('help')
  .description('Show usage instructions')
  .action(() => {
    console.log('CVEX CLI Usage Instructions');
    console.log('==========================');
    console.log('\nBasic Commands:');
    console.log('  cvex-cli config          Configure your API credentials');
    console.log('  cvex-cli show-config     Display current configuration');
    console.log('  cvex-cli trade           Start interactive trading interface');
    
    console.log('\nNon-Interactive Trading:');
    console.log('  You can submit orders directly using command-line parameters:');
    console.log('  cvex-cli trade [options]');
    
    console.log('\nOptions:');
    console.log('  --contract_id <id>       Contract ID to trade');
    console.log('  --order_side <side>      Order side (buy/sell)');
    console.log('  --order_type <type>      Order type (market/limit)');
    console.log('  --limit_price <price>    Limit price (required for limit orders)');
    console.log('  --time_in_force <tif>    Time in force (GTC/IOC/FOK/PO)');
    console.log('  --reduce_only <bool>     Reduce only flag (true/false)');
    console.log('  --quantity <amount>      Order quantity');
    console.log('  --quantity_type <type>   Quantity type (steps/contracts/assets)');
    console.log('  --num_orders <count>     Number of orders to submit (default: 1)');
    console.log('  --frequency <rate>       Orders per second (for multiple orders)');
    
    console.log('\nExamples:');
    console.log('  # Submit a market buy order for 10 steps on contract 43');
    console.log('  cvex-cli trade --contract_id 43 --order_side buy --order_type market \\');
    console.log('    --time_in_force GTC --quantity 10 --quantity_type steps');
    
    console.log('\n  # Submit 100 market sell orders at 5 orders/second');
    console.log('  cvex-cli trade --contract_id 43 --order_side sell --order_type market \\');
    console.log('    --time_in_force GTC --quantity 1 --quantity_type steps --num_orders 100 \\');
    console.log('    --frequency 5');
    
    console.log('\n  # Submit a limit order');
    console.log('  cvex-cli trade --contract_id 43 --order_side buy --order_type limit \\');
    console.log('    --limit_price 25000.50 --time_in_force GTC --quantity 0.01 \\');
    console.log('    --quantity_type assets');

    console.log('\nTesting Commands:');
    console.log('  cvex-cli test-orders     Submit intentionally invalid orders to generate errors');
    console.log('  cvex-cli stress-test     Submit a high volume of orders to stress test the API');
    
    console.log('\nTest Options:');
    console.log('  --contract_id <id>       Contract ID to test with (default: 43)');
    console.log('  --num_orders <count>     Number of test orders to submit');
    console.log('  --frequency <rate>       Orders per second for the test');
    
    console.log('\nEach test run creates a detailed log file with timestamps and trace IDs for failed orders.');
  });

// Main execution
if (require.main === module) {
  program.parse(process.argv);
  
  // Display help if no args
  if (process.argv.length <= 2) {
    program.help();
  }
}

module.exports = {
  listContracts,
  getContractDetails,
  getMarketData,
  getAccountInformation,
  estimateOrder,
  placeOrder,
  placeMultipleOrders
};