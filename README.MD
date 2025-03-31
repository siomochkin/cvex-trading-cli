# CVEX Trading Terminal

A trading interface for interacting with the CVEX Trading API, supporting both CLI (Command Line Interface) and TUI (Text-based User Interface) modes.

## Features

- Configure and manage API credentials
- List available markets and contracts
- View market data (prices, orderbook, recent trades)
- Get detailed contract information
- View account details (portfolio, positions, orders)
- Interactive trading interface for both buying and selling
- Order estimation before placement
- Support for market and limit orders
- TUI mode with intuitive navigation and real-time market data

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Make the CLI executable:
   ```
   chmod +x cvex-cli.js
   ```
4. Install globally (optional):
   ```
   npm install -g .
   ```

## Configuration

Run the configuration command to set up your API credentials:

```
./cvex-cli.js config
```

You'll need to provide:
- API URL (defaults to https://api.cvex.trade)
- API Key
- Path to your Ed25519 private key file (PEM format)

Configuration is stored in `~/.cvex-cli/config.json`.

## Usage

### Command Line Interface (CLI)

#### List Available Markets

```
./cvex-cli.js markets
```

#### Get Contract Details

```
./cvex-cli.js contract <contract_id>
```

#### View Account Information

```
./cvex-cli.js account
```

#### Interactive Trading

```
./cvex-cli.js trade
```

This will guide you through:
1. Selecting a contract
2. Choosing order side (buy or sell)
3. Setting order parameters (type, price, quantity, etc.)
4. Viewing order estimation
5. Confirming order placement

### Text-based User Interface (TUI)

For a more interactive experience, you can use the TUI mode:

```
./cvex --tui
```

Navigate the TUI using:
- Arrow keys to move between items
- Tab to cycle through fields
- Enter to select options or submit forms
- Esc to exit

The TUI provides:
- Dashboard with portfolio overview, positions, and orders
- Markets view with contract details and price charts
- Trading interface with orderbook and real-time price data
- Configuration settings

## Trading Parameters

When placing an order, you'll be prompted for:

- **Order Side**: Buy or Sell
- **Order Type**: Market or Limit
- **Limit Price**: (for limit orders) The price at which you want to execute
- **Time in Force**: 
  - GTC (Good Till Cancel) - Order remains active until filled or cancelled
  - IOC (Immediate or Cancel) - Fill what's possible immediately, cancel the rest
  - FOK (Fill or Kill) - Fill the entire order immediately or cancel
  - PO (Post Only) - Order must be posted to the order book, not matched immediately
- **Reduce Only**: Yes/No - Whether the order should only reduce an existing position
- **Quantity**: The size of your order in steps

## Security Notes

- Your private key is only read from the file when needed to sign requests
- Never share your API key or private key
- Consider adding additional validation for production use

## API Documentation

For more details on the CVEX API, refer to their official API documentation.