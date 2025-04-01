const { apiRequest } = require('./utils');

// Function to submit multiple orders with delay
async function placeMultipleOrders(orderData, numOrders, frequency, question) {
  try {
    if (!orderData || !orderData.orderParams) {
      console.log('No order parameters available.');
      return;
    }

    // Ask for confirmation before proceeding
    const confirm = await question(`\nDo you want to submit ${numOrders} orders at ${frequency} orders/second? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('Multiple order submission cancelled by user.');
      return;
    }

    // Determine the order side for display
    const orderSide = parseInt(orderData.orderParams.quantity_steps) > 0 ? 'BUY' : 'SELL';
    console.log(`\nSubmitting ${numOrders} ${orderSide} orders at ${frequency} orders/second...`);

    // Create a delay function
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Calculate delay between orders (in milliseconds)
    const delayBetweenOrders = Math.round(1000 / frequency);

    // Statistics tracking
    const stats = {
      total: numOrders,
      successful: 0,
      rateLimited: 0,
      serverErrors: {
        '500': 0,
        '502': 0,
        '503': 0,
        '524': 0,
        other: 0
      },
      networkErrors: 0,
      otherErrors: 0,
      startTime: Date.now(),
      lastOrderTime: null,
      targetFrequency: frequency,
      actualFrequency: 0
    };

    // Array to store all order promises
    const orderPromises = [];

    // Submit orders with delay between submissions but don't wait for responses
    for (let i = 0; i < numOrders; i++) {
      console.log(`\nSubmitting order ${i + 1} of ${numOrders}...`);
      
      // Create order parameters with unique customer_order_id
      const orderParams = {
        ...orderData.orderParams,
        customer_order_id: `cli-${Date.now()}-${i}`,
        timestamp: Date.now(),
        recv_window: 30000
      };

      // Submit the order without awaiting the response
      const orderPromise = apiRequest('POST', '/v1/trading/order', orderParams, true)
        .then(result => {
          stats.lastOrderTime = Date.now();
          if (result) {
            if (result.status === 'success' || result.transaction_hash) {
              stats.successful++;
              console.log(`${orderSide} order ${i + 1} successfully submitted!`);
              console.log(`Transaction Hash: ${result.transaction_hash || 'N/A'}`);
              
              if (result.events && result.events.length > 0) {
                console.log('\nEvents:');
                result.events.forEach((event, index) => {
                  console.log(`Event ${index+1}: ${JSON.stringify(event)}`);
                });
              }
            } else {
              stats.otherErrors++;
              console.log(`Status: ${result.status || 'error'}`);
              if (result.message) console.log(`Message: ${result.message}`);
              if (result.code) console.log(`Code: ${result.code}`);
            }
          }
        })
        .catch(error => {
          stats.lastOrderTime = Date.now();
          const errorMessage = error.message || '';
          const statusCode = errorMessage.match(/status code (\d+)/)?.[1];

          if (errorMessage.includes('429')) {
            stats.rateLimited++;
            console.error(`Rate limit hit for order ${i + 1}. Waiting before retry...`);
            // Add extra delay on rate limit
            return delay(1000).then(() => {
              console.log(`Retrying order ${i + 1} after rate limit...`);
              return apiRequest('POST', '/v1/trading/order', orderParams, true);
            });
          } else if (errorMessage.includes('524')) {
            stats.serverErrors['524']++;
            console.error(`Timeout error for order ${i + 1}. Server took too long to respond.`);
          } else if (errorMessage.includes('503')) {
            stats.serverErrors['503']++;
            console.error(`Service temporarily unavailable for order ${i + 1}. Server is overloaded.`);
          } else if (errorMessage.includes('502')) {
            stats.serverErrors['502']++;
            console.error(`Bad gateway error for order ${i + 1}. Server is not responding correctly.`);
          } else if (errorMessage.includes('500')) {
            stats.serverErrors['500']++;
            console.error(`Internal server error for order ${i + 1}. Server encountered an error.`);
          } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ECONNRESET')) {
            stats.networkErrors++;
            console.error(`Network error for order ${i + 1}. Connection issues detected.`);
          } else {
            stats.serverErrors.other++;
            console.error(`Error in order ${i + 1}:`, errorMessage);
          }
        });

      // Add the promise to our array
      orderPromises.push(orderPromise);

      // Wait before submitting the next order
      if (i < numOrders - 1) {
        console.log(`\nWaiting ${delayBetweenOrders}ms before submitting next order...`);
        await delay(delayBetweenOrders);
      }
    }

    // Wait for all orders to complete
    await Promise.all(orderPromises);

    // Calculate statistics
    const duration = (stats.lastOrderTime - stats.startTime) / 1000; // in seconds
    stats.actualFrequency = stats.successful / duration;
    const successRate = (stats.successful / stats.total) * 100;

    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('ORDER SUBMISSION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Orders Attempted: ${stats.total}`);
    console.log(`Successful Orders: ${stats.successful}`);
    console.log(`Rate Limited Orders: ${stats.rateLimited}`);
    console.log('\nServer Errors:');
    console.log(`  • 500 Internal Server Error: ${stats.serverErrors['500']}`);
    console.log(`  • 502 Bad Gateway: ${stats.serverErrors['502']}`);
    console.log(`  • 503 Service Unavailable: ${stats.serverErrors['503']}`);
    console.log(`  • 524 Timeout: ${stats.serverErrors['524']}`);
    console.log(`  • Other Server Errors: ${stats.serverErrors.other}`);
    console.log(`Network Errors: ${stats.networkErrors}`);
    console.log(`Other Errors: ${stats.otherErrors}`);
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Target Frequency: ${stats.targetFrequency} orders/second`);
    console.log(`Actual Frequency: ${stats.actualFrequency.toFixed(2)} orders/second`);
    console.log(`Total Duration: ${duration.toFixed(2)} seconds`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error placing multiple orders:', error.message);
  }
}

module.exports = {
  placeMultipleOrders
}; 