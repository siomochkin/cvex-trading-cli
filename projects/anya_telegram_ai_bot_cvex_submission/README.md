# Anya Trading Bot

![Anya Waku Waku](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2V5YjA1d2czam9xajI2b25kOGRwbHNpeDN1amJicHZ5OHM3M3NycSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/FWAcpJsFT9mvrv0e7a/giphy.gif)


`version 1.0` ||

`Current Trading Market Capabilites:  Crypto ` || 

`Track: AI AGENTS`


chat with her on telegram: [@anyatraderbot](https://t.me/anyatraderbot)

!!WARNING!! -- CVEX refuses to fix the 403 error on their cloudflare. Anya won't accept keys as a result. But she is functional.

Welcome to **Anya Trading Bot**, the sassiest and cutest trading assistant!  Anya’s here to guide you through the wild world of CVEX(for now) trading with a wink, a giggle, and a whole lot of “waku waku!” Whether you’re a newbie needing a hand or a pro firing off quick trades, Anya’s got your back—complete with playful banter and (soon!) some adorable GIFs.

## What’s Anya All About?

Anya’s not just a bot—she’s your trading sidekick, inspired by a certain peanut-loving spy girl(from spy x family lol). She’s designed to:
- **Hold Your Hand**: Step-by-step trading with `/start_order` for beginners.
- **Keep It Quick**: Shorthand commands like `/place_order` and `/place_sim_order` for the pros.
- **Simulate Like a Boss**: Test trades with estimates before you commit.
- **Stay Playful**: Responses dripping with Anya’s “b-baka!” charm—because trading should be fun!

Powered by Telegram, OpenAI, and the CVEX API, Anya’s a blend of tech smarts, cute and anime sass, all wrapped up in a neat little package.

## Features

### Trading Made Easy
- **Interactive Flow** (`anya_trader.py`):
  - `/start_order`: Pick a contract, side (buy/sell), type (market/limit), quantity, and price—Anya walks you through it with buttons!
  - Perfect for newbies who want a guided tour of the trading desk.

- **Shorthand Commands** (`anya_bot.py`):
  - `/place_order <contract> <buy/sell> <market/limit> <quantity> [price]`: Quick trades with a 5-second confirm window.
    - Example: `/place_order BTC-24MAR24 sell limit 10 55000.00`
  - `/place_sim_order <contract> <buy/sell> <market/limit> <quantity> [price]`: Simulate a trade and see fees, leverage, and liquidation price.
    - Copy to real order with a button—smooth as Anya’s spy moves!

### AI Smarts
- **Natural Language** (`anya_ai.py`):
  - `/anya buy 1 BTC-PERP`: Parses your command with OpenAI magic and jumps to confirmation.
  - `/anya analyze market`: Spits out market insights and trade suggestions—Anya’s a trading guru! Heh.

### Safety First
- **Trading Keys**: Uses `restrict_access(need_trading=True)` and dynamic keys from `anya_security.py`—no funny business allowed!
- **Error Handling**: From “Anya tripped over the trading desk!” to “Simulation exploded!”—she’s got sass for every slip-up.

### CVEX Sync
- Matches the CVEX API’s quirks (thanks, `siomochkin`!):
  - `quantity_steps` goes negative for sells, positive for buys.
  - `type` sticks to `market` or `limit`.
- Handles Cloudflare 403s with a cheeky “spy network’s down!” and dummy data fallback.

## How It Works

### The Code Squad
- **`anya_trader.py`**: The step-by-step trading wizard—buttons, states, and all.
- **`anya_ai.py`**: OpenAI-powered parsing and market analysis—Anya’s brainy side.
- **`anya_bot.py`**: Shorthand commands and button callbacks—her quick-draw skills.
- **`cvex_handler.py`**: API calls to CVEX—signed payloads, estimates, and orders.
- **`anya_security.py`**: Key management—keeps Anya locked tight.

### Flow Example
1. **Newbie**: `/start_order` → Pick `BTC-PERP` → `Sell` → `Market` → `1.5` → Confirm → “Order Executed!”
   - Payload: `{"type": "market", "quantity_steps": "-1.5"}`
2. **Pro**: `/place_order BTC-24MAR24 buy market 10` → Confirm → Done!
   - Payload: `{"type": "market", "quantity_steps": "10"}`
3. **Curious**: `/place_sim_order BTC-24MAR24 sell limit 5 60000` → See results → Copy to real order.

### Coming Soon
- **GIFs!**: Anya’s about to get animated—think “waku waku” dances and “oops” moments. Stay tuned!
- **PLATFORMS!**: classic trading platfrom integration like Deriv

## License

Anya Trading Bot is shared under the [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND 4.0)](https://creativecommons.org/licenses/by-nc-nd/4.0/). Built by *Dan Odin*, this code’s here for you to peek at and study—give credit if you mention it—but please don’t use, copy, or remix it. It’s all about transparency with a dash of Anya magic!

Or you know: This license doesn't stop you from copying it, go ahead, copy. Who is gonna know right? — no one. But your mind is gonna know and you will feel like a fraud for all eternity.  

## How To Run Anya On Your System

## Demo Instructions
### Local Setup
`
1. **Install**:
   - Python 3.10.12
   - `pip install -r src/requirements.txt`
2. **Configure**:
   - Set environment variables (e.g., in a `.env` file or shell):
     ```bash
     export TELEGRAM_TOKEN="your_telegram_bot_token"
     export CVEX_API_KEY="your_cvex_readonly_key"
     export PRIVATE_KEY_PATH="path/to/anya2.pem"
     Run: python anya_bot.py
     Test: On Telegram, message your bot
     
###  Additional Notes for Judges

- Cloudflare Limitation: Despite matching CVEX’s signing and headers, Heroku’s US IPs triggered a geo-block. Local tests confirmed API compatibility—curl fetched data successfully. But was blocked by cloudflare 403. 
- Future Plans: Integrate with Deriv’s API for synthetic, crypto, and forex trading—WebSocket for real-time, REST for analytics.

[Link To Original Github Repo](https://github.com/danodin69/anya-trader-bot)

## Shoutouts

- **siomochkin**: for writing the JS CLI [demo](https://github.com/siomochkin/cvex-trading-cli/) through which I was able to go crazy on Anya in a few days. 

Got questions? Hit me up on Twitter/Telegram @danodin69 or visit my [links](https://bit.ly/m/danodin)—Anya’s too busy spying on the market to reply herself!

---

*Waku waku!* Let’s trade, b-baka! xD this has got me more excited than it should! 
