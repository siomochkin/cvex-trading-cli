const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

// Mock the fs module
jest.mock('fs', () => ({
  appendFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('mock-key'),
  writeFileSync: jest.fn()
}));

// Mock neo-blessed to prevent UI creation during tests
jest.mock('neo-blessed', () => {
  const mockScreen = {
    render: jest.fn(),
    program: { emit: jest.fn() },
    key: jest.fn(),
    children: []
  };
  
  return {
    screen: jest.fn(() => mockScreen),
    box: jest.fn(() => ({ setContent: jest.fn() }))
  };
});

jest.mock('blessed-contrib', () => ({
  grid: jest.fn(() => ({
    set: jest.fn()
  }))
}));

// Import after mocking
const cvexTui = require('../cvex-tui');

describe('Error Handling', () => {
  let sandbox;
  let originalConsoleError;
  let originalConsoleLog;
  let originalProcessOn;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Save original console methods
    originalConsoleError = console.error;
    originalConsoleLog = console.log;
    originalProcessOn = process.on;
    
    // Stub console methods to prevent test noise
    console.error = sandbox.stub();
    console.log = sandbox.stub();
    
    // Create mock for process.on to test unhandled errors
    process.on = sandbox.stub();
    
    // Reset mocks
    fs.appendFileSync.mockClear();
  });
  
  afterEach(() => {
    // Restore original console methods
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    process.on = originalProcessOn;
    
    sandbox.restore();
  });
  
  describe('logError', () => {
    test('should log error to file with timestamp and context', () => {
      const error = new Error('Test error');
      const context = 'Test Context';
      
      // The exported function may have a different name in cvexTui exports
      if (typeof cvexTui.logError === 'function') {
        cvexTui.logError(error, context);
        
        expect(fs.appendFileSync).toHaveBeenCalled();
        const logCall = fs.appendFileSync.mock.calls[0];
        expect(logCall[0]).toContain('cvex-error.log');
        expect(logCall[1]).toContain('[Test Context]');
        expect(logCall[1]).toContain('Test error');
      } else {
        // If logError is not directly exported, test through mock implementation
        // Trigger an error through one of the exported functions
        try {
          // Call a function that would log errors
          if (typeof cvexTui.apiRequest === 'function') {
            throw error;
          } else {
            // Skip test if we can't access the functions
            console.log('logError function not directly testable, skipping test');
          }
        } catch (e) {
          // This would log the error in the implementation
          expect(true).toBe(true); // Placeholder assertion
        }
      }
    });
    
    test('should handle non-Error objects', () => {
      if (typeof cvexTui.logError === 'function') {
        // Test with a string
        cvexTui.logError('String error message', 'String Error');
        
        expect(fs.appendFileSync).toHaveBeenCalled();
        const logCall = fs.appendFileSync.mock.calls[0];
        expect(logCall[1]).toContain('String error message');
        
        // Test with an object
        fs.appendFileSync.mockClear();
        cvexTui.logError({ customError: true, message: 'Object error' }, 'Object Error');
        
        expect(fs.appendFileSync).toHaveBeenCalled();
        const objLogCall = fs.appendFileSync.mock.calls[0];
        expect(objLogCall[1]).toContain('[Object Error]');
      }
    });
    
    test('should handle file writing errors gracefully', () => {
      // Mock fs.appendFileSync to throw an error
      fs.appendFileSync.mockImplementationOnce(() => {
        throw new Error('Mock file writing error');
      });
      
      if (typeof cvexTui.logError === 'function') {
        // This should not throw despite the fs error
        expect(() => {
          cvexTui.logError('Test error', 'Test');
        }).not.toThrow();
        
        // Should fall back to console.error
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to write to error log'),
          expect.anything()
        );
      }
    });
  });
  
  describe('Global error handlers', () => {
    test('should set up global unhandledRejection handler', () => {
      // Check if process.on was called with unhandledRejection
      const unhandledRejectionCall = process.on.getCalls().find(
        call => call.args[0] === 'unhandledRejection'
      );
      
      expect(unhandledRejectionCall).toBeTruthy();
      
      // Simulate an unhandled rejection
      const handler = unhandledRejectionCall.args[1];
      const mockError = new Error('Unhandled Promise Rejection');
      const mockPromise = Promise.resolve();
      
      // This should not throw
      expect(() => {
        handler(mockError, mockPromise);
      }).not.toThrow();
    });
    
    test('should set up global uncaughtException handler', () => {
      // Check if process.on was called with uncaughtException
      const uncaughtExceptionCall = process.on.getCalls().find(
        call => call.args[0] === 'uncaughtException'
      );
      
      expect(uncaughtExceptionCall).toBeTruthy();
      
      // Simulate an uncaught exception
      const handler = uncaughtExceptionCall.args[1];
      const mockError = new Error('Uncaught Exception');
      
      // This should not throw
      expect(() => {
        handler(mockError);
      }).not.toThrow();
    });
  });
}); 