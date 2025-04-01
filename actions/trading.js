// trading.js - Trading related actions
const { apiRequest, formatNumber } = require('./utils');
const { placeMultipleOrders } = require('./multiple-orders');

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

// Remove the placeMultipleOrders function and keep only the exports
module.exports = {
  estimateOrder,
  placeOrder,
  placeMultipleOrders
};