const { apiRequest } = require('./utils');
const fs = require('fs');
const path = require('path');

// Function to create log file name with timestamp
function getLogFileName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(process.cwd(), `multiple-orders-${timestamp}.log`);
}

// Function to write to log file
function appendToLog(logFile, message) {
  fs.appendFileSync(logFile, message + '\n');
}

// Function to submit multiple orders with delay
async function placeMultipleOrders(orderData, numOrders, frequency, question, skipConfirmation = false) {
  try {
    if (!orderData || !orderData.orderParams) {
      console.log('No order parameters available.');
      return;
    }

    // Create log file
    const logFile = getLogFileName();
    appendToLog(logFile, '='.repeat(50));
    appendToLog(logFile, `Multiple Orders Execution Log - ${new Date().toISOString()}`);
    appendToLog(logFile, '='.repeat(50));
    appendToLog(logFile, `\nTarget: ${numOrders} orders at ${frequency} orders/second\n`);

    // Ask for confirmation before proceeding (unless skipConfirmation is true)
    let confirmed = skipConfirmation;
    if (!skipConfirmation) {
      const confirm = await question(`\nDo you want to submit ${numOrders} orders at ${frequency} orders/second? (yes/no): `);
      confirmed = confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y';
    }
    
    if (!confirmed) {
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
      actualFrequency: 0,
      failedOrders: [] // Track failed orders details
    };

    // Array to store all order promises
    const orderPromises = [];

    // Submit orders with delay between submissions but don't wait for responses
    for (let i = 0; i < numOrders; i++) {
      console.log(`\nSubmitting order ${i + 1} of ${numOrders}...`);
      
      // Get current GMT timestamp in milliseconds
      const currentGMTTimestamp = Date.now();
      
      // Create order parameters with unique customer_order_id
      const orderParams = {
        ...orderData.orderParams,
        customer_order_id: `cli-${currentGMTTimestamp}-${i}`,
        timestamp: currentGMTTimestamp,
        recv_window: 30000
      };

      console.log(`Using GMT timestamp: ${currentGMTTimestamp} (${new Date(currentGMTTimestamp).toISOString()})`);

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
              const errorLog = {
                orderId: orderParams.customer_order_id,
                timestamp: new Date().toISOString(),
                error: 'Order submission failed',
                status: result.status,
                message: result.message,
                code: result.code,
                traceId: result.headers?.['trace-id'] || 'N/A'
              };
              stats.failedOrders.push(errorLog);
              appendToLog(logFile, `\nFailed Order:\n${JSON.stringify(errorLog, null, 2)}`);
            }
          }
        })
        .catch(error => {
          stats.lastOrderTime = Date.now();
          
          const errorMessage = error.message || '';
          const statusCode = error.status || error.response?.status || errorMessage.match(/status code (\d+)/)?.[1];
          
          // Get trace ID from the correct header name with more variations
          let traceId = 'N/A';
          const headerNames = ['trace-id', 'x-trace-id', 'x-request-id', 'traceid', 'requestid'];
          
          // Check headers directly attached to error
          if (error.headers) {
            for (const headerName of headerNames) {
              if (error.headers[headerName]) {
                traceId = error.headers[headerName];
                console.log(`Found trace ID in error.headers['${headerName}']: ${traceId}`);
                break;
              }
            }
          }
          
          // Check response headers
          if (traceId === 'N/A' && error.response?.headers) {
            for (const headerName of headerNames) {
              if (error.response.headers[headerName]) {
                traceId = error.response.headers[headerName];
                console.log(`Found trace ID in error.response.headers['${headerName}']: ${traceId}`);
                break;
              }
            }
            
            // If still not found, log all header keys to help debug
            if (traceId === 'N/A') {
              const allHeaderKeys = Object.keys(error.response.headers).join(', ');
              console.log(`All response header keys: ${allHeaderKeys}`);
            }
          }
          
          // For 5xx errors, check if trace ID is in the response body
          if (traceId === 'N/A' && statusCode >= 500 && error.response?.data) {
            try {
              const responseBody = error.response.data;
              
              // If responseBody is HTML (like from Cloudflare errors), try to extract ID
              if (typeof responseBody === 'string' && responseBody.includes('Cloudflare')) {
                // Try to extract Cloudflare Ray ID as a fallback
                const rayIdMatch = responseBody.match(/Ray ID: <strong[^>]*>([^<]+)<\/strong>/);
                if (rayIdMatch && rayIdMatch[1]) {
                  traceId = `CF-Ray-${rayIdMatch[1]}`;
                  console.log(`Extracted Cloudflare Ray ID as trace ID: ${traceId}`);
                }
              } 
              // If responseBody is an object, look for common trace ID field names
              else if (typeof responseBody === 'object') {
                const possibleTraceIdFields = ['trace_id', 'traceId', 'request_id', 'requestId', 'id', 'error_id'];
                for (const field of possibleTraceIdFields) {
                  if (responseBody[field]) {
                    traceId = responseBody[field];
                    console.log(`Found trace ID in response body field '${field}': ${traceId}`);
                    break;
                  }
                }
              }
            } catch (parseError) {
              console.error(`Could not parse error response body: ${parseError.message}`);
            }
          }

          // Create a more detailed error log
          const errorLog = {
            orderId: orderParams.customer_order_id,
            timestamp: new Date().toISOString(),
            statusCode,
            error: errorMessage,
            traceId,
            responseData: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : 'No response data'
          };

          // Determine error type
          if (errorMessage.includes('429')) {
            stats.rateLimited++;
            errorLog.type = 'Rate Limited';
          } else if (errorMessage.includes('524')) {
            stats.serverErrors['524']++;
            errorLog.type = 'Timeout Error';
          } else if (errorMessage.includes('503')) {
            stats.serverErrors['503']++;
            errorLog.type = 'Service Unavailable';
          } else if (errorMessage.includes('502')) {
            stats.serverErrors['502']++;
            errorLog.type = 'Bad Gateway';
          } else if (errorMessage.includes('500')) {
            stats.serverErrors['500']++;
            errorLog.type = 'Internal Server Error';
          } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ECONNRESET')) {
            stats.networkErrors++;
            errorLog.type = 'Network Error';
          } else {
            stats.serverErrors.other++;
            errorLog.type = 'Other Error';
          }

          stats.failedOrders.push(errorLog);
          appendToLog(logFile, `\nFailed Order:\n${JSON.stringify(errorLog, null, 2)}`);

          console.error(`Error in order ${i + 1}:`, errorMessage);
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

    // Log summary
    const summary = {
      totalOrders: stats.total,
      successfulOrders: stats.successful,
      rateLimitedOrders: stats.rateLimited,
      serverErrors: stats.serverErrors,
      networkErrors: stats.networkErrors,
      otherErrors: stats.otherErrors,
      successRate: `${successRate.toFixed(2)}%`,
      targetFrequency: `${stats.targetFrequency} orders/second`,
      actualFrequency: `${stats.actualFrequency.toFixed(2)} orders/second`,
      totalDuration: `${duration.toFixed(2)} seconds`,
      totalFailedOrders: stats.failedOrders.length
    };

    appendToLog(logFile, '\n' + '='.repeat(50));
    appendToLog(logFile, 'EXECUTION SUMMARY');
    appendToLog(logFile, '='.repeat(50));
    appendToLog(logFile, JSON.stringify(summary, null, 2));
    appendToLog(logFile, '\n' + '='.repeat(50));

    // Print summary to console
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
    console.log(`\nDetailed log file has been created: ${logFile}`);
  } catch (error) {
    console.error('Error placing multiple orders:', error.message);
  }
}

module.exports = {
  placeMultipleOrders
}; 