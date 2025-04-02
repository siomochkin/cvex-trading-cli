// utils.js - Utility functions
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');

/**
 * Extracts the API key from the private key by processing the DER public key.
 * @param {Object} privateKey - The private key object.
 * @returns {string} - The extracted API key in hexadecimal format.
 */
function getApiKey(privateKey) {
  const derPublicKey = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  const rawPublicKey = derPublicKey.subarray(-32); // Extract the last 32 bytes (raw key)
  return rawPublicKey.toString('hex');
}

/**
 * Constructs the message to be signed by combining HTTP method, URL, and body.
 * @param {string} method - The HTTP method (e.g., POST).
 * @param {string} url - The request URL.
 * @param {string} body - The request body.
 * @returns {string} - The message to be signed.
 */
function getMessageForSigning(method, url, body) {
  return `${method} ${url}\n${body}`;
}

/**
 * Signs a message using the provided private key.
 * @param {Object} privateKey - The private key object.
 * @param {string} method - HTTP method.
 * @param {string} url - The request URL.
 * @param {string} body - The request body as JSON string.
 * @returns {string} - The generated signature in hexadecimal format.
 */
function signMessage(privateKey, method, url, body) {
  try {
    console.log(`Signing message with method: ${method}, URL: ${url}`);
    console.log(`Message body: ${body}`);
    
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
    console.error('Error signing message (detailed):', error);
    throw error;
  }
}

// Function to save request/response details to file
function saveDebugInfo(requestId, data) {
  try {
    const debugDir = path.join(process.cwd(), 'debug-logs');
    // Create directory if it doesn't exist
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const filename = path.join(debugDir, `request-${requestId}.json`);
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`Debug info saved to ${filename}`);
    return filename;
  } catch (error) {
    console.error('Error saving debug info:', error.message);
    return null;
  }
}

// API request helper
async function apiRequest(method, endpoint, data = null, needsSignature = false) {
  const requestId = Date.now();
  const debugInfo = {
    timestamp: new Date().toISOString(),
    requestId,
    method,
    endpoint,
    url: null,
    requestHeaders: null,
    requestData: data,
    responseHeaders: null,
    responseStatus: null,
    responseData: null,
    error: null
  };
  
  try {
    const config = getConfig();
    const url = `${config.apiUrl}${endpoint}`;
    debugInfo.url = url;
    
    let headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CVEX-CLI/1.0'
    };

    if (needsSignature) {
      if (!config.privateKeyPath || !fs.existsSync(config.privateKeyPath)) {
        throw new Error('Private key not configured or file not found');
      }

      const privateKeyPEM = fs.readFileSync(config.privateKeyPath, 'utf8');
      
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
      const messageToSign = JSON.stringify(data);
      console.log('Message to sign:', messageToSign);
      
      // Generate signature
      const signature = signMessage(privateKey, method, url, messageToSign);
      headers['X-Signature'] = signature;
    } else {
      // For non-signature requests, use API key from config
      headers['X-API-KEY'] = config.apiKey;
    }
    
    debugInfo.requestHeaders = { ...headers };
    
    // Log request details before making the request
    console.log(`[DEBUG] Request ${requestId}: ${method} ${url}`);
    console.log(`[DEBUG] Request ${requestId} Headers:`, headers);
    if (data) {
      console.log(`[DEBUG] Request ${requestId} Data:`, JSON.stringify(data));
    }

    const response = await axios({
      method,
      url,
      headers,
      data: data || undefined,
      // Increase timeout for potential server delays
      timeout: 30000
    });

    // Log response details
    console.log(`[DEBUG] Response ${requestId} Status:`, response.status);
    console.log(`[DEBUG] Response ${requestId} Headers:`, response.headers);
    
    // Store response info for debugging
    debugInfo.responseStatus = response.status;
    debugInfo.responseHeaders = response.headers;
    debugInfo.responseData = response.data;
    
    // Save debug info to file
    saveDebugInfo(requestId, debugInfo);

    // Include headers in the response data
    return {
      ...response.data,
      headers: response.headers
    };
  } catch (error) {
    // Store error info for debugging
    debugInfo.error = {
      message: error.message,
      stack: error.stack,
      code: error.code
    };
    
    if (error.response) {
      debugInfo.responseStatus = error.response.status;
      debugInfo.responseHeaders = error.response.headers;
      debugInfo.responseData = error.response.data;
      
      // Add headers directly to the error for easier access
      error.headers = error.response.headers;
      
      // Log detailed error information
      console.error(`[DEBUG] Response ${requestId} Error Status: ${error.response.status}`);
      console.error(`[DEBUG] Response ${requestId} Error Headers:`, error.response.headers);
      console.error(`[DEBUG] Response ${requestId} Error Data:`, error.response.data);
      
      console.error(`API Error (${error.response.status}):`, error.response.data);
      
      // Check if trace ID is available in headers
      const traceId = error.response.headers['trace-id'] || 
                     error.response.headers['x-trace-id'] || 
                     error.response.headers['x-request-id'] || 
                     'Not found in headers';
      console.error(`[DEBUG] Trace ID for error ${requestId}: ${traceId}`);
      
      // Add more variations to check where trace ID might be hiding
      const allHeaderKeys = Object.keys(error.response.headers).join(', ');
      console.error(`[DEBUG] All response header keys: ${allHeaderKeys}`);
      
      // Check if trace ID is in the response body for 5xx errors
      if (error.response.status >= 500) {
        try {
          const responseBody = error.response.data;
          console.error(`[DEBUG] Full 5xx error response body: ${JSON.stringify(responseBody)}`);
          
          if (typeof responseBody === 'object') {
            const possibleTraceIdFields = ['trace_id', 'traceId', 'request_id', 'requestId', 'id'];
            for (const field of possibleTraceIdFields) {
              if (responseBody[field]) {
                console.error(`[DEBUG] Found potential trace ID in response body field '${field}': ${responseBody[field]}`);
              }
            }
          }
        } catch (parseError) {
          console.error(`[DEBUG] Could not parse error response body: ${parseError.message}`);
        }
      }
    } else {
      console.error('[DEBUG] No response object in error');
      console.error('Request Error:', error.message);
    }
    
    // Save debug info to file even for errors
    const debugFile = saveDebugInfo(requestId, debugInfo);
    console.error(`[DEBUG] Full error details saved to ${debugFile}`);
    
    throw error;
  }
}

// Format numbers for display
function formatNumber(num) {
  return parseFloat(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  });
}

// Display table helper
function displayTable(headers, data) {
  // Calculate column widths
  const widths = headers.map((header, index) => {
    const maxDataLength = data.reduce((max, row) => {
      const cell = String(row[index] || '');
      return cell.length > max ? cell.length : max;
    }, 0);
    return Math.max(header.length, maxDataLength) + 2;
  });

  // Print headers
  console.log(
    headers.map((header, i) => header.padEnd(widths[i])).join(' | ')
  );
  console.log(
    headers.map((_, i) => '-'.repeat(widths[i])).join('-+-')
  );

  // Print data
  data.forEach(row => {
    console.log(
      row.map((cell, i) => String(cell || '').padEnd(widths[i])).join(' | ')
    );
  });
}

module.exports = {
  signMessage,
  apiRequest,
  formatNumber,
  displayTable,
  getApiKey,
  getMessageForSigning
};