// tests/trading.test.js
const sinon = require('sinon');
const cvexTui = require('../cvex-tui');

// Mock the API request function that will be used by the trading functions
jest.mock('../actions/utils', () => ({
  apiRequest: jest.fn().mockImplementation(async (method, endpoint, data) => {
    if (endpoint === '/v1/trading/estimate-order') {
      return {
        fee: 10.5,
        margin_usage: 1000,
        average_price: 85000,
        total: 85000,
        status: "ok",
        direction: data.direction
      };
    } else if (endpoint === '/v1/trading/order') {
      return {
        transaction_hash: "0x123456789abcdef",
        status: "accepted"
      };
    }
    return {};
  })
}));

describe('Trading Functions', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Mock the state object that would normally contain contract information
    global.state = {
      contracts: [
        { contract_id: 43, symbol: 'BTC-25APR25', mark_price: 85000 },
        { contract_id: 44, symbol: 'ETH-25APR25', mark_price: 1800 }
      ],
      selectedContract: { contract_id: 43, symbol: 'BTC-25APR25', mark_price: 85000 }
    };
  });

  afterEach(() => {
    sandbox.restore();
    delete global.state;
  });

  describe('estimateOrder', () => {
    test('should validate required fields', async () => {
      try {
        // Missing contract ID
        await cvexTui.estimateOrder({ type: 'limit', quantity_contracts: '1' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('contract');
      }

      try {
        // Missing order type
        await cvexTui.estimateOrder({ contract: 43, quantity_contracts: '1' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('type');
      }

      try {
        // Limit order without price
        await cvexTui.estimateOrder({ 
          contract: 43, 
          type: 'limit', 
          quantity_contracts: '1' 
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('limit price');
      }

      try {
        // No quantity specified
        await cvexTui.estimateOrder({ 
          contract: 43, 
          type: 'market'
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('quantity');
      }
    });

    test('should call API with correct parameters', async () => {
      const orderParams = {
        contract: 43,
        direction: 'buy',
        type: 'limit',
        limit_price: '85000',
        quantity_contracts: '1',
        time_in_force: 'GTC'
      };

      const result = await cvexTui.estimateOrder(orderParams);
      
      expect(result).toBeTruthy();
      expect(result.status).toBe('ok');
      expect(result.average_price).toBe(85000);
    });

    test('should handle API errors gracefully', async () => {
      // Mock the API to return an error
      const apiRequestMock = require('../actions/utils').apiRequest;
      apiRequestMock.mockImplementationOnce(() => {
        return { status: 'error', error: 'Insufficient balance' };
      });

      const orderParams = {
        contract: 43,
        direction: 'buy',
        type: 'limit',
        limit_price: '85000',
        quantity_contracts: '100',
        time_in_force: 'GTC'
      };

      const result = await cvexTui.estimateOrder(orderParams);
      
      expect(result).toBeTruthy();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Insufficient balance');
    });
  });

  describe('placeOrder', () => {
    test('should validate required parameters before submitting', async () => {
      try {
        // Missing contract ID
        await cvexTui.placeOrder({ 
          direction: 'buy',
          type: 'limit',
          limit_price: '85000',
          quantity_contracts: '1'
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('contract');
      }

      try {
        // Limit order without price
        await cvexTui.placeOrder({ 
          contract: 43,
          direction: 'buy',
          type: 'limit',
          quantity_contracts: '1'
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('limit_price');
      }

      try {
        // No quantity specified
        await cvexTui.placeOrder({ 
          contract: 43,
          direction: 'buy',
          type: 'limit',
          limit_price: '85000'
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e.message).toContain('quantity');
      }
    });

    test('should automatically add required metadata fields', async () => {
      const apiRequestMock = require('../actions/utils').apiRequest;
      
      const orderParams = {
        contract: 43,
        direction: 'buy',
        type: 'limit',
        limit_price: '85000',
        quantity_contracts: '1'
      };

      const result = await cvexTui.placeOrder(orderParams);
      
      expect(result).toBeTruthy();
      expect(result.status).toBe('accepted');
      expect(result.transaction_hash).toBeTruthy();
      
      // Verify the call included the additional required fields
      const lastCall = apiRequestMock.mock.calls[apiRequestMock.mock.calls.length - 1];
      const sentData = lastCall[2];
      
      expect(sentData.customer_order_id).toBeTruthy();
      expect(sentData.timestamp).toBeTruthy();
      expect(sentData.recv_window).toBeTruthy();
    });

    test('should handle API errors gracefully', async () => {
      const apiRequestMock = require('../actions/utils').apiRequest;
      apiRequestMock.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const orderParams = {
        contract: 43,
        direction: 'buy',
        type: 'limit',
        limit_price: '85000',
        quantity_contracts: '1'
      };

      const result = await cvexTui.placeOrder(orderParams);
      
      expect(result).toBeTruthy();
      expect(result.status).toBe('error');
      expect(result.error).toBe('Network error');
    });
  });
}); 