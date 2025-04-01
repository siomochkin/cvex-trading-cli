const sinon = require('sinon');

// Mock the blessed and blessed-contrib modules
jest.mock('neo-blessed', () => {
  const mockScreen = {
    render: jest.fn(),
    program: { 
      emit: jest.fn(),
      enableMouse: jest.fn(),
      input: { on: jest.fn() }
    },
    key: jest.fn(),
    on: jest.fn(),
    children: [],
    grabKeys: false,
    focused: null
  };
  
  const eventEmitter = {
    on: jest.fn(),
    emit: jest.fn(),
    key: jest.fn(),
    focus: jest.fn(),
    destroy: jest.fn(),
    setContent: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    setItems: jest.fn(),
    select: jest.fn()
  };
  
  return {
    screen: jest.fn(() => mockScreen),
    box: jest.fn(() => ({ ...eventEmitter, type: 'box' })),
    text: jest.fn(() => ({ ...eventEmitter, type: 'text' })),
    list: jest.fn(() => ({ ...eventEmitter, type: 'list', items: [], selected: 0 })),
    button: jest.fn(() => ({ ...eventEmitter, type: 'button' })),
    radiobutton: jest.fn(() => ({ ...eventEmitter, type: 'radiobutton', checked: false })),
    checkbox: jest.fn(() => ({ ...eventEmitter, type: 'checkbox', checked: false })),
    textbox: jest.fn(() => ({ ...eventEmitter, type: 'textbox', getValue: jest.fn().mockReturnValue('1') })),
    log: jest.fn(() => ({ ...eventEmitter, type: 'log', log: jest.fn() }))
  };
});

jest.mock('blessed-contrib', () => {
  return {
    grid: jest.fn(() => ({
      set: jest.fn().mockImplementation((row, col, rowSpan, colSpan, type) => {
        // Return the type that's passed in
        if (typeof type === 'function') {
          return type();
        }
        return {};
      })
    }))
  };
});

// Mock the configuration and utils modules
jest.mock('../actions/config', () => ({
  loadConfig: jest.fn(),
  getConfig: jest.fn().mockReturnValue({
    apiUrl: 'https://api.cvex.trade',
    apiKey: 'test-api-key',
    privateKeyPath: '/path/to/privatekey.pem'
  })
}));

jest.mock('../actions/utils', () => ({
  formatNumber: jest.fn(num => String(num)),
  apiRequest: jest.fn().mockResolvedValue({})
}));

// Mock the utils functions that are used in the code
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnValue({
      digest: jest.fn().mockReturnValue(Buffer.from('hash'))
    })
  }),
  sign: jest.fn().mockReturnValue(Buffer.from('signature')),
  createPublicKey: jest.fn().mockReturnValue({
    export: jest.fn().mockReturnValue(Buffer.from('pubkey'))
  }),
  createPrivateKey: jest.fn().mockReturnValue({})
}));

// Import after mocking
const cvexTui = require('../cvex-tui');

describe('UI Functions', () => {
  let sandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create initial state
    global.state = {
      contracts: [
        { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', mark_price: 85000, last_price: 84500 },
        { contract_id: 44, symbol: 'ETH-25APR25', index: 'ETH', mark_price: 1800, last_price: 1795 }
      ],
      selectedContract: { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', mark_price: 85000, last_price: 84500 },
      currentMarketIndex: 0,
      tradeForm: {
        side: 'buy',
        type: 'limit',
        limitPrice: '85000',
        timeInForce: 'GTC',
        reduceOnly: false,
        quantity: '1'
      }
    };
    
    // Mock console methods to prevent test noise
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'error');
    sandbox.stub(process, 'exit');
  });
  
  afterEach(() => {
    sandbox.restore();
    delete global.state;
  });
  
  describe('populateMarketsList', () => {
    test('should fetch and display contracts in the markets list', async () => {
      // Mock the API request for fetching contracts
      const apiRequestMock = require('../actions/utils').apiRequest;
      apiRequestMock.mockResolvedValueOnce({
        contracts: [
          { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', mark_price: 85000, last_price: 84500 },
          { contract_id: 44, symbol: 'ETH-25APR25', index: 'ETH', mark_price: 1800, last_price: 1795 }
        ]
      });
      
      // Call the function
      await cvexTui.populateMarketsList();
      
      // Check that API was called correctly
      expect(apiRequestMock).toHaveBeenCalledWith('GET', '/v1/market/futures?active=true');
      
      // Check that state was updated
      expect(global.state.contracts.length).toBe(2);
      expect(global.state.contracts[0].symbol).toBe('BTC-25APR25');
    });
    
    test('should fall back to sample data if API fails', async () => {
      // Mock the API request to fail
      const apiRequestMock = require('../actions/utils').apiRequest;
      apiRequestMock.mockRejectedValueOnce(new Error('API Error'));
      
      // Call the function
      await cvexTui.populateMarketsList();
      
      // Check that sample data was used
      expect(global.state.contracts.length).toBeGreaterThan(0);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Error fetching market data'), 
        expect.anything()
      );
    });
  });
  
  describe('updateContractDetails', () => {
    test('should update contract details when selecting a contract', async () => {
      // Mock the API requests
      const apiRequestMock = require('../actions/utils').apiRequest;
      
      // For detailed contract info
      apiRequestMock.mockResolvedValueOnce({
        details: { contract_id: 43, symbol: 'BTC-25APR25', index: 'BTC', mark_price: 85000, min_order_size_contracts: 0.001 }
      });
      
      // For order book
      apiRequestMock.mockResolvedValueOnce({
        asks: [{ price: 85100, quantity_contracts: 2 }],
        bids: [{ price: 84900, quantity_contracts: 3 }]
      });
      
      // For recent trades
      apiRequestMock.mockResolvedValueOnce({
        trades: [
          { last_price: 85000, taker_side: 'buy', quantity_contracts: 1, time: Date.now() }
        ]
      });
      
      // Call the function
      await cvexTui.updateContractDetails(0);
      
      // Check state was updated
      expect(global.state.currentMarketIndex).toBe(0);
      expect(global.state.selectedContract).toBeTruthy();
      
      // Verify API calls
      expect(apiRequestMock).toHaveBeenCalledWith('GET', '/v1/market/futures/43');
      expect(apiRequestMock).toHaveBeenCalledWith('GET', expect.stringMatching(/order-book/));
      expect(apiRequestMock).toHaveBeenCalledWith('GET', expect.stringMatching(/latest-trades/));
    });
  });
  
  describe('validateInputs', () => {
    test('should validate price input for limit orders', () => {
      // Create a mock input with invalid price
      const invalidPriceInput = {
        getValue: () => 'invalid',
        style: { border: { fg: 'white' } }
      };
      
      const validationResult = cvexTui.validateInputs(invalidPriceInput, { getValue: () => '1' });
      
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errorMsg).toContain('price');
      expect(invalidPriceInput.style.border.fg).toBe('red');
    });
    
    test('should validate quantity input', () => {
      // Create a mock input with invalid quantity
      const invalidQuantityInput = {
        getValue: () => '-1',
        style: { border: { fg: 'white' } }
      };
      
      const validationResult = cvexTui.validateInputs({ getValue: () => '85000' }, invalidQuantityInput);
      
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errorMsg).toContain('quantity');
      expect(invalidQuantityInput.style.border.fg).toBe('red');
    });
    
    test('should validate minimum order size', () => {
      // Set a contract with minimum order size
      global.state.selectedContract.min_order_size_contracts = 0.1;
      
      // Create a mock input with quantity below minimum
      const belowMinQuantityInput = {
        getValue: () => '0.01',
        style: { border: { fg: 'white' } }
      };
      
      const validationResult = cvexTui.validateInputs({ getValue: () => '85000' }, belowMinQuantityInput);
      
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.errorMsg).toContain('minimum');
      expect(belowMinQuantityInput.style.border.fg).toBe('red');
    });
  });
  
  describe('showOrderEstimationResult', () => {
    test('should call estimateOrder with correct parameters', async () => {
      // Mock the estimateOrder function
      sandbox.stub(cvexTui, 'estimateOrder').resolves({
        fee: 10.5,
        margin_usage: 1000,
        average_price: 85000,
        total: 85000,
        status: "ok",
        direction: "buy"
      });
      
      // Set the trade form state
      global.state.tradeForm = {
        side: 'buy',
        type: 'limit',
        limitPrice: '85000',
        quantity: '1'
      };
      
      // We need to mock the validateInputs function too
      sandbox.stub(cvexTui, 'validateInputs').returns({ isValid: true });
      
      // Call the function
      await cvexTui.showOrderEstimationResult();
      
      // Verify estimateOrder was called with the right params
      expect(cvexTui.estimateOrder).toHaveBeenCalledWith(expect.objectContaining({
        contract: 43, // From state.selectedContract
        direction: 'buy',
        type: 'limit',
        limit_price: '85000',
        quantity_contracts: '1'
      }));
    });
    
    test('should handle estimation errors gracefully', async () => {
      // Mock the estimateOrder function to throw an error
      sandbox.stub(cvexTui, 'estimateOrder').rejects(new Error('Estimation failed'));
      
      // Mock necessary UI components
      sandbox.stub(cvexTui, 'validateInputs').returns({ isValid: true });
      
      // Call the function
      await cvexTui.showOrderEstimationResult();
      
      // Verify error handling
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error estimating order'),
        expect.anything()
      );
    });
  });
}); 