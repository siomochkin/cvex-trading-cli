// trading.js - Trading related actions
const { apiRequest, formatNumber } = require('./utils');
const { placeMultipleOrders } = require('./multiple-orders');

// Get all available contracts
async function getContracts() {
  try {
    console.log('Fetching available contracts...');
    const result = await apiRequest('GET', '/v1/market/futures?active=true');
    return result.contracts || [];
  } catch (error) {
    console.error('Error fetching contracts:', error.message);
    return [];
  }
}

// 5 & 6. Input Parameters and Get order estimate
async function estimateOrder(contract, question) {
  try {
    console.log('\nOrder Estimation Form:');
    console.log('-'.repeat(50));
    
    // Get order side (buy or sell)
    let orderSide;
    while (true) {
      orderSide = await question('Order side (buy/sell): ');
      if (orderSide.toLowerCase() === 'buy' || orderSide.toLowerCase() === 'sell') break;
      console.log('Invalid order side. Please enter "buy" or "sell".');
    }
    
    // Get order type
    let orderType;
    while (true) {
      orderType = await question('Order type (market/limit): ');
      if (orderType === 'market' || orderType === 'limit') break;
      console.log('Invalid order type. Please enter "market" or "limit".');
    }
    
    // Get price for limit orders
    let limitPrice = '0';
    if (orderType === 'limit') {
      while (true) {
        limitPrice = await question('Limit price: ');
        if (!isNaN(limitPrice) && parseFloat(limitPrice) > 0) break;
        console.log('Invalid price. Please enter a positive number.');
      }
    }
    
    // Get time in force
    let timeInForce;
    while (true) {
      const tifInfo = 'GTC (Good Till Cancel), IOC (Immediate or Cancel), FOK (Fill or Kill), PO (Post Only)';
      timeInForce = await question(`Time in force (${tifInfo}): `);
      if (['GTC', 'IOC', 'FOK', 'PO'].includes(timeInForce)) break;
      console.log('Invalid time in force. Please use one of the valid options.');
    }
    
    // Get reduce only flag
    let reduceOnly;
    while (true) {
      const input = await question('Reduce only (yes/no): ');
      if (input.toLowerCase() === 'yes' || input.toLowerCase() === 'y') {
        reduceOnly = true;
        break;
      } else if (input.toLowerCase() === 'no' || input.toLowerCase() === 'n') {
        reduceOnly = false;
        break;
      }
      console.log('Invalid input. Please enter "yes" or "no".');
    }
    
    // Get quantity
    let quantitySteps;
    while (true) {
      quantitySteps = await question('Quantity (in steps): ');
      if (!isNaN(quantitySteps) && parseInt(quantitySteps) > 0) break;
      console.log('Invalid quantity. Please enter a positive integer.');
    }
    
    // Convert orderSide to quantity_steps format (positive for buy, negative for sell)
    const formattedQuantitySteps = orderSide.toLowerCase() === 'buy' 
      ? quantitySteps 
      : `-${quantitySteps}`;
    
    // Create estimation payload
    const estimatePayload = {
      contract: contract.contract_id.toString(),
      type: orderType,
      limit_price: limitPrice,
      time_in_force: timeInForce,
      reduce_only: reduceOnly,
      quantity_steps: formattedQuantitySteps,
      quantity_contracts: '',
      quantity_assets: ''
    };
    
    console.log('\nEstimating order with parameters:');
    console.log(JSON.stringify(estimatePayload, null, 2));
    
    // Make the estimation request
    const estimationResult = await apiRequest('POST', '/v1/trading/estimate-order', estimatePayload);
    
    if (estimationResult) {
      console.log('\nOrder Estimation Result:');
      console.log('-'.repeat(50));
      
      if (estimationResult.error) {
        console.log(`Error: ${estimationResult.error}`);
        return null;
      }
      
      console.log(`Order Type:                 ${orderSide.toUpperCase()} ${orderType}`);
      console.log(`Trading Fee:                ${formatNumber(estimationResult.trading_fee)}`);
      console.log(`Operational Fee:            ${formatNumber(estimationResult.operational_fee)}`);
      console.log(`Realized Profit:            ${formatNumber(estimationResult.realized_profit)}`);
      console.log(`Taker Amount (Base):        ${formatNumber(estimationResult.taker_base_amount)}`);
      console.log(`Taker Amount (Tokens):      ${formatNumber(estimationResult.taker_tokens_amount)}`);
      console.log(`Current Equity:             ${formatNumber(estimationResult.current_equity)}`);
      console.log(`New Equity:                 ${formatNumber(estimationResult.new_equity)}`);
      console.log(`Current Leverage:           ${formatNumber(estimationResult.current_leverage)}`);
      console.log(`New Leverage:               ${formatNumber(estimationResult.new_leverage)}`);
      console.log(`Est. Liquidation Price:     ${formatNumber(estimationResult.estimated_liquidation_price)}`);
      console.log('-'.repeat(50));
      
      // Return the result with parameters
      return {
        estimationResult,
        orderParams: {
          customer_order_id: `cli-${Date.now()}`,
          contract: estimatePayload.contract,
          type: estimatePayload.type,
          limit_price: estimatePayload.limit_price,
          time_in_force: estimatePayload.time_in_force,
          reduce_only: estimatePayload.reduce_only,
          quantity_steps: estimatePayload.quantity_steps,
          quantity_contracts: '',
          quantity_assets: '',
          timestamp: Date.now(),
          recv_window: 30000
        }
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error estimating order:', error.message);
    return null;
  }
}

// 7. Confirm submitting of order
async function placeOrder(orderData, question) {
  try {
    if (!orderData || !orderData.orderParams) {
      console.log('No order parameters available.');
      return;
    }
    
    const confirm = await question('\nDo you want to submit this order? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Order cancelled by user.');
      return;
    }
    
    // Determine the order side for display
    const orderSide = parseInt(orderData.orderParams.quantity_steps) > 0 ? 'BUY' : 'SELL';
    console.log(`\nSubmitting ${orderSide} order...`);
    
    // Create order parameters
    const orderParams = {
      customer_order_id: `cli-${Date.now()}`,
      contract: orderData.orderParams.contract,
      type: orderData.orderParams.type,
      limit_price: orderData.orderParams.limit_price,
      time_in_force: orderData.orderParams.time_in_force,
      reduce_only: orderData.orderParams.reduce_only,
      quantity_steps: orderData.orderParams.quantity_steps,
      quantity_contracts: "",
      quantity_assets: "",
      timestamp: Date.now(),
      recv_window: 30000
    };
    
    // Submit the order - ensure we use the exact same structure as the working example
    // First create the message to sign and ensure it's properly formatted
    const messageToSign = JSON.stringify(orderParams);
    console.log('Message to sign:', messageToSign);
    
    const result = await apiRequest('POST', '/v1/trading/order', orderParams, true);
    
    console.log('\nOrder Submission Result:');
    console.log('-'.repeat(50));
    console.log(JSON.stringify(result, null, 2));
    
    if (result) {
      if (result.status === 'success' || result.transaction_hash) {
        console.log(`${orderSide} order successfully submitted!`);
        console.log(`Transaction Hash: ${result.transaction_hash || 'N/A'}`);
        
        if (result.events && result.events.length > 0) {
          console.log('\nEvents:');
          result.events.forEach((event, index) => {
            console.log(`Event ${index+1}: ${JSON.stringify(event)}`);
          });
        }
      } else {
        console.log(`Status: ${result.status || 'error'}`);
        if (result.message) console.log(`Message: ${result.message}`);
        if (result.code) console.log(`Code: ${result.code}`);
      }
      
      console.log('-'.repeat(50));
    }
  } catch (error) {
    console.error('Error placing order:', error.message);
  }
}

// Create order from command line options
async function createOrderFromOptions(contract, options) {
  try {
    // Validate required parameters
    if (!options.order_side || !['buy', 'sell'].includes(options.order_side.toLowerCase())) {
      console.log('Error: Invalid or missing order_side. Must be "buy" or "sell".');
      return null;
    }
    
    if (!options.order_type || !['market', 'limit'].includes(options.order_type.toLowerCase())) {
      console.log('Error: Invalid or missing order_type. Must be "market" or "limit".');
      return null;
    }
    
    // For limit orders, validate limit price
    if (options.order_type.toLowerCase() === 'limit' && (!options.limit_price || isNaN(parseFloat(options.limit_price)))) {
      console.log('Error: Limit price is required for limit orders and must be a valid number.');
      return null;
    }
    
    // Validate time in force
    if (!options.time_in_force || !['GTC', 'IOC', 'FOK', 'PO'].includes(options.time_in_force)) {
      console.log('Error: Invalid or missing time_in_force. Must be one of GTC, IOC, FOK, PO.');
      return null;
    }
    
    // Validate reduce_only
    const reduceOnly = options.reduce_only ? 
      (options.reduce_only.toLowerCase() === 'true') : false;
    
    // Validate quantity
    if (!options.quantity || isNaN(parseFloat(options.quantity)) || parseFloat(options.quantity) <= 0) {
      console.log('Error: Invalid or missing quantity. Must be a positive number.');
      return null;
    }
    
    // Validate quantity type
    if (!options.quantity_type || !['steps', 'contracts', 'assets'].includes(options.quantity_type.toLowerCase())) {
      console.log('Error: Invalid or missing quantity_type. Must be one of steps, contracts, assets.');
      return null;
    }
    
    // Create base order parameters
    const orderParams = {
      contract: contract.contract_id.toString(),
      type: options.order_type.toLowerCase(),
      limit_price: options.order_type.toLowerCase() === 'limit' ? options.limit_price : '0',
      time_in_force: options.time_in_force,
      reduce_only: reduceOnly
    };
    
    // Set quantity based on type
    const quantity = parseFloat(options.quantity);
    
    // Apply quantity to the appropriate field
    if (options.quantity_type.toLowerCase() === 'steps') {
      // Adjust sign based on order side
      orderParams.quantity_steps = options.order_side.toLowerCase() === 'buy' ? 
        quantity.toString() : (-quantity).toString();
      orderParams.quantity_contracts = '';
      orderParams.quantity_assets = '';
    } else if (options.quantity_type.toLowerCase() === 'contracts') {
      orderParams.quantity_steps = '';
      orderParams.quantity_contracts = options.order_side.toLowerCase() === 'buy' ? 
        quantity.toString() : (-quantity).toString();
      orderParams.quantity_assets = '';
    } else {
      // assets
      orderParams.quantity_steps = '';
      orderParams.quantity_contracts = '';
      orderParams.quantity_assets = options.order_side.toLowerCase() === 'buy' ? 
        quantity.toString() : (-quantity).toString();
    }
    
    console.log('\nOrder Parameters:');
    console.log('-'.repeat(50));
    console.log(`Contract: ${contract.symbol} (ID: ${contract.contract_id})`);
    console.log(`Side: ${options.order_side.toUpperCase()}`);
    console.log(`Type: ${options.order_type}`);
    if (options.order_type.toLowerCase() === 'limit') {
      console.log(`Limit Price: ${options.limit_price}`);
    }
    console.log(`Time in Force: ${options.time_in_force}`);
    console.log(`Reduce Only: ${reduceOnly}`);
    console.log(`Quantity: ${quantity} ${options.quantity_type}`);
    console.log('-'.repeat(50));
    
    return { orderParams };
  } catch (error) {
    console.error('Error creating order from options:', error.message);
    return null;
  }
}

// Place order without confirmation
async function placeOrderWithoutConfirmation(orderData) {
  try {
    if (!orderData || !orderData.orderParams) {
      console.log('No order parameters available.');
      return;
    }
    
    // Determine the order side for display
    const orderSide = parseInt(orderData.orderParams.quantity_steps) > 0 ? 'BUY' : 'SELL';
    console.log(`\nSubmitting ${orderSide} order without confirmation...`);
    
    // Create order parameters
    const orderParams = {
      customer_order_id: `cli-${Date.now()}`,
      contract: orderData.orderParams.contract,
      type: orderData.orderParams.type,
      limit_price: orderData.orderParams.limit_price,
      time_in_force: orderData.orderParams.time_in_force,
      reduce_only: orderData.orderParams.reduce_only,
      quantity_steps: orderData.orderParams.quantity_steps,
      quantity_contracts: orderData.orderParams.quantity_contracts || "",
      quantity_assets: orderData.orderParams.quantity_assets || "",
      timestamp: Date.now(),
      recv_window: 30000
    };
    
    // Submit the order
    const messageToSign = JSON.stringify(orderParams);
    console.log('Message to sign:', messageToSign);
    
    const result = await apiRequest('POST', '/v1/trading/order', orderParams, true);
    
    console.log('\nOrder Submission Result:');
    console.log('-'.repeat(50));
    console.log(JSON.stringify(result, null, 2));
    
    if (result) {
      if (result.status === 'success' || result.transaction_hash) {
        console.log(`${orderSide} order successfully submitted!`);
        console.log(`Transaction Hash: ${result.transaction_hash || 'N/A'}`);
        
        if (result.events && result.events.length > 0) {
          console.log('\nEvents:');
          result.events.forEach((event, index) => {
            console.log(`Event ${index+1}: ${JSON.stringify(event)}`);
          });
        }
      } else {
        console.log(`Status: ${result.status || 'error'}`);
        if (result.message) console.log(`Message: ${result.message}`);
        if (result.code) console.log(`Code: ${result.code}`);
      }
      
      console.log('-'.repeat(50));
    }
  } catch (error) {
    console.error('Error placing order:', error.message);
  }
}

// Get contract selection from user
async function selectContract(question) {
  try {
    // Fetch available contracts
    const contracts = await getContracts();
    
    if (!contracts || contracts.length === 0) {
      console.log('No contracts available.');
      return null;
    }
    
    console.log('\nAvailable Contracts:');
    console.log('-'.repeat(80));
    console.log('ID | Symbol        | Price          | 24h Change     | 24h Volume');
    console.log('-'.repeat(80));
    
    // Sort contracts by ID
    contracts.sort((a, b) => a.contract_id - b.contract_id);
    
    // Display contracts
    contracts.forEach(contract => {
      const price = parseFloat(contract.mark_price) || 0;
      const change = contract['24h_change'] ? `${parseFloat(contract['24h_change']).toFixed(2)}%` : 'N/A';
      const volume = contract.volume_24h ? formatNumber(contract.volume_24h) : 'N/A';
      
      console.log(`${contract.contract_id.toString().padEnd(3)} | ${contract.symbol.padEnd(14)} | $${price.toFixed(4).padEnd(14)} | ${change.padEnd(14)} | ${volume}`);
    });
    
    // Ask user to select a contract
    while (true) {
      const contractId = await question('\nEnter contract ID (or q to quit): ');
      
      if (contractId.toLowerCase() === 'q') {
        return null;
      }
      
      const id = parseInt(contractId);
      if (isNaN(id)) {
        console.log('Invalid input. Please enter a number.');
        continue;
      }
      
      const selectedContract = contracts.find(c => c.contract_id === id);
      if (!selectedContract) {
        console.log('Contract not found. Please select a valid ID.');
        continue;
      }
      
      console.log(`\nSelected ${selectedContract.symbol}`);
      return selectedContract;
    }
  } catch (error) {
    console.error('Error selecting contract:', error.message);
    return null;
  }
}

// Create order with minimal validation for testing errors
async function createTestOrder(contractId) {
  try {
    // Create order parameters that will likely be rejected by the server
    const orderParams = {
      contract: contractId.toString(),
      type: "market",
      limit_price: "0",
      time_in_force: "invalid", // This should cause a server error
      reduce_only: false,
      quantity_steps: "0.1", // Invalid quantity format to trigger rejection
      quantity_contracts: "",
      quantity_assets: ""
    };
    
    console.log('\nCreating test order with invalid parameters:');
    console.log(JSON.stringify(orderParams, null, 2));
    
    return { orderParams };
  } catch (error) {
    console.error('Error creating test order:', error.message);
    return null;
  }
}

// Create order for stress testing
async function createStressTestOrder(contractId) {
  try {
    // Create valid order parameters but we'll send many of them quickly
    const orderParams = {
      contract: contractId.toString(),
      type: "market",
      limit_price: "0",
      time_in_force: "GTC",
      reduce_only: false,
      quantity_steps: "1", // Small valid order
      quantity_contracts: "",
      quantity_assets: ""
    };
    
    console.log('\nCreating stress test order:');
    console.log(JSON.stringify(orderParams, null, 2));
    
    return { orderParams };
  } catch (error) {
    console.error('Error creating stress test order:', error.message);
    return null;
  }
}

// Export all functions
module.exports = {
  estimateOrder,
  placeOrder,
  placeOrderWithoutConfirmation,
  placeMultipleOrders,
  createOrderFromOptions,
  getContracts,
  selectContract,
  createTestOrder,
  createStressTestOrder
};