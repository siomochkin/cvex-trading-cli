const crypto = require('crypto');
const axios = require('axios');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

// Mock the config module
jest.mock('../actions/config', () => ({
  getConfig: jest.fn().mockReturnValue({
    apiUrl: 'https://api.cvex.trade',
    apiKey: 'test-api-key',
    privateKeyPath: '/path/to/privatekey.pem'
  })
}));

// Extract functions from the main file for testing
// This is a bit unconventional but necessary since the functions aren't properly exported
const cvexTui = require('../cvex-tui');

// Function to generate a test private key
function generateTestPrivateKey() {
  return crypto.generateKeyPairSync('ed25519').privateKey;
}

describe('API Utility Functions', () => {
  let sandbox;
  let mockPrivateKey;
  let fsExistsSync;
  let fsReadFile;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create a mock private key for testing
    mockPrivateKey = generateTestPrivateKey();
    
    // Mock fs functions
    fsExistsSync = sandbox.stub(fs, 'existsSync').returns(true);
    fsReadFile = sandbox.stub(fs, 'readFileSync').returns('MOCK_PRIVATE_KEY_PEM');
    
    // Mock crypto functions
    sandbox.stub(crypto, 'createPrivateKey').returns(mockPrivateKey);
    
    // Mock axios
    sandbox.stub(axios, 'request').resolves({
      status: 200,
      data: { success: true }
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getApiKey', () => {
    test('should extract API key from private key', () => {
      // This test depends on the implementation of getApiKey in the file
      try {
        const privateKey = mockPrivateKey;
        const apiKey = cvexTui.getApiKey(privateKey);
        
        // The apiKey should be a hex string of length 64 (32 bytes)
        expect(apiKey).toBeTruthy();
        expect(typeof apiKey).toBe('string');
        expect(apiKey.length).toBe(64);
      } catch (e) {
        console.error('Error in getApiKey test:', e);
        // It's possible this function might not be properly exported
        expect(e).toBeUndefined();
      }
    });
  });

  describe('getMessageForSigning', () => {
    test('should create correct message format for signing', () => {
      try {
        const method = 'POST';
        const url = 'https://api.cvex.trade/v1/trading/order';
        const body = '{"contract":45,"direction":"buy"}';
        
        const message = cvexTui.getMessageForSigning(method, url, body);
        
        expect(message).toBe(`POST https://api.cvex.trade/v1/trading/order\n{"contract":45,"direction":"buy"}`);
      } catch (e) {
        console.error('Error in getMessageForSigning test:', e);
        expect(e).toBeUndefined();
      }
    });
  });

  describe('signMessage', () => {
    test('should sign message with private key', () => {
      try {
        const privateKey = mockPrivateKey;
        const method = 'POST';
        const url = 'https://api.cvex.trade/v1/trading/order';
        const body = '{"contract":45,"direction":"buy"}';
        
        const signature = cvexTui.signMessage(privateKey, method, url, body);
        
        expect(signature).toBeTruthy();
        expect(typeof signature).toBe('string');
        // Signatures are typically 128 characters for ed25519 (64 bytes)
        expect(signature.length).toBe(128);
      } catch (e) {
        console.error('Error in signMessage test:', e);
        expect(e).toBeUndefined();
      }
    });
  });

  describe('apiRequest', () => {
    test('should make API requests with correct parameters', async () => {
      try {
        const method = 'GET';
        const endpoint = '/v1/market/futures';
        
        const result = await cvexTui.apiRequest(method, endpoint);
        
        expect(result).toEqual({ success: true });
        expect(axios.request.calledOnce).toBe(true);
        
        const axiosConfig = axios.request.getCall(0).args[0];
        expect(axiosConfig.method).toBe('GET');
        expect(axiosConfig.url).toBe('https://api.cvex.trade/v1/market/futures');
        expect(axiosConfig.headers['X-API-KEY']).toBe('test-api-key');
      } catch (e) {
        console.error('Error in apiRequest test:', e);
        expect(e).toBeUndefined();
      }
    });
    
    test('should add signature for endpoints requiring authentication', async () => {
      try {
        const method = 'POST';
        const endpoint = '/v1/trading/order';
        const data = { contract: 45, direction: 'buy' };
        
        const result = await cvexTui.apiRequest(method, endpoint, data, true);
        
        expect(result).toEqual({ success: true });
        expect(axios.request.calledOnce).toBe(true);
        
        const axiosConfig = axios.request.getCall(0).args[0];
        expect(axiosConfig.method).toBe('POST');
        expect(axiosConfig.url).toBe('https://api.cvex.trade/v1/trading/order');
        expect(axiosConfig.headers['X-API-KEY']).toBeTruthy();
        expect(axiosConfig.headers['X-Signature']).toBeTruthy();
        expect(axiosConfig.data).toEqual(data);
      } catch (e) {
        console.error('Error in apiRequest (with signature) test:', e);
        expect(e).toBeUndefined();
      }
    });
    
    test('should handle API errors properly', async () => {
      // Mock axios to throw an error
      axios.request.restore();
      sandbox.stub(axios, 'request').rejects({
        response: {
          status: 400,
          data: { error: 'Bad Request', message: 'Invalid parameters' }
        }
      });
      
      try {
        await cvexTui.apiRequest('GET', '/v1/error');
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeTruthy();
        expect(e.message).toContain('API Error');
      }
    });
  });
}); 