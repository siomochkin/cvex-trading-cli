import os
import json
import hashlib
from venv import logger
import requests

from datetime import datetime
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat


API_KEY = os.getenv("CVEX_API_KEY")
PRIVATE_KEY_PATH = "anya2.pem"
BASE_URL = "https://api.cvex.trade/v1"


def load_private_key(file_path: str):
    if not file_path:
        raise ValueError(
            "Private key path is not set. Check your environment variables.")
    with open(file_path, "rb") as pem_file:
        return serialization.load_pem_private_key(
            pem_file.read(),
            password=None
        )


def format_tx_hash(tx_hash):
    if not tx_hash:
        return ""
    return (f"`{tx_hash}`" if len(tx_hash) < 66
            else f"`{tx_hash[:10]}...{tx_hash[-6:]}`")


def create_headers(method: str, url: str, body: dict):
    """
    Smart header generator that automatically:
    - Uses PRIVATE_KEY_PATH for trading endpoints
    - Uses API_KEY for read-only endpoints
    """

    if url.startswith(f"{BASE_URL}/trading/"):
        private_key = load_private_key(PRIVATE_KEY_PATH)
        return _create_signed_headers(private_key, method, url, body)
    else:
        return {'X-API-KEY': API_KEY, 'accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/115.0'}


def _create_signed_headers(private_key, method: str, url: str, body: dict) -> dict:
    pub_key = private_key.public_key().public_bytes(
        Encoding.Raw,
        PublicFormat.Raw
    ).hex()
    message = f"{method} {url}\n{json.dumps(body)}"
    signature = private_key.sign(
        hashlib.sha256(message.encode()).digest()
    ).hex()
    return {
        'X-API-KEY': pub_key,
        'X-Signature': signature,
        'accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:58.0) Gecko/20100101 Firefox/115.0'
    }


def format_timestamp(timestamp):
    if not timestamp:
        return "N/A"
    try:
        if isinstance(timestamp, int):
            return datetime.fromtimestamp(timestamp/1000).strftime('%Y-%m-%d %H:%M:%S')
        elif isinstance(timestamp, str):
            return timestamp.replace('T', ' ').replace('Z', '')[:19]
        return str(timestamp)
    except Exception as e:
        logger.error(f"Timestamp format error: {e}")
        return str(timestamp)[:19]


def format_price(price):
    if isinstance(price, (int, float)):
        return f"{price:.2f}"
    return price


def fetch_market_data():
    url = f"{BASE_URL}/market/indices"
    headers = create_headers("GET", url, {})
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        """
        Telegram was bugging out for whatever reason

        or was it skill issue? Lmao.
        """
        def escape_markdown(text):
            if not isinstance(text, str):
                return str(text)
            for char in ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']:
                text = text.replace(char, f'\\{char}')
            return text

        formatted = ["📊 *MARKET INDICES*\\n\\n"]
        for index in data.get("indices", []):
            symbol = escape_markdown(index.get('symbol', 'Unknown'))
            price = escape_markdown(format_price(index.get('price', 'N/A')))
            active = '✅' if index.get('active', False) else '❌'

            formatted.append(
                f"*{symbol}*\\n"
                f"• Price: ${price}\\n"
                f"• Active: {active}\\n\\n"
            )

        return ''.join(formatted)

    except Exception as e:
        logger.error(f"Market data fetch failed: {str(e)}")
        return f"⚠️ Error retrieving market data: {str(e)}"


def get_index_details(id_or_symbol):

    url = f"{BASE_URL}/market/indices/{id_or_symbol}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        details = data.get("details", {})

        formatted_output = f"📈 *INDEX: {details.get('symbol', id_or_symbol)}*\n\n"
        formatted_output += f"• *Symbol*: {details.get('symbol', 'N/A')}\n"
        formatted_output += f"• *Description*: {details.get('description', 'N/A')}\n"
        formatted_output += f"• *Long Description*: {details.get('long_description', 'N/A')}\n"
        formatted_output += f"• *Price*: ${format_price(details.get('price', 'N/A'))}\n"
        formatted_output += f"• *Active*: {details.get('active', 'N/A')}\n"
        formatted_output += f"• *Website*: {details.get('website_url', 'N/A')}\n"
        formatted_output += f"• *White Paper*: {details.get('white_paper_url', 'N/A')}\n"

        block = data.get("block", {})
        if block:
            formatted_output += f"\n📦 *Block ID*: {block.get('block_id', 'N/A')}\n"
            formatted_output += f"• *Block Timestamp*: {format_timestamp(block.get('block_timestamp', 'N/A'))}\n"

        return formatted_output
    else:
        return f"⚠️ Error retrieving index details: {response.text}"


def list_contracts():

    url = f"{BASE_URL}/market/futures"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        contracts = data.get("contracts", [])

        if not contracts:
            return "📋 No available contracts at the moment."

        formatted_output = "📋 *AVAILABLE CONTRACTS*\n\n"

        for contract in contracts:
            formatted_output += f"*{contract.get('symbol', 'Unknown')}*\n"
            formatted_output += f"• ID: {contract.get('contract_id', 'N/A')}\n"
            formatted_output += f"• Index: {contract.get('index', 'N/A')}\n"
            formatted_output += f"• Mark Price: ${format_price(contract.get('mark_price', 'N/A'))}\n"
            formatted_output += f"• 24h Volume: {contract.get('volume_tokens_24h', 'N/A')}\n"
            formatted_output += f"• Expiry: {format_timestamp(contract.get('settlement_time', 'N/A'))}\n\n"

        return formatted_output
    else:
        return f"⚠️ Error retrieving contracts: {response.text}"


def get_contract_details(id_or_symbol):

    url = f"{BASE_URL}/market/futures/{id_or_symbol}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        contract = data.get("details", {})

        if not contract:
            return f"⚠️ No contract found for '{id_or_symbol}'. Please check the symbol and try again."

        formatted_output = f"📊 *CONTRACT: {contract.get('symbol', id_or_symbol)}*\n\n"
        formatted_output += f"• ID: {contract.get('contract_id', 'N/A')}\n"
        formatted_output += f"• Index: {contract.get('index', 'N/A')}\n"
        formatted_output += f"• Mark Price: ${format_price(contract.get('mark_price', 'N/A'))}\n"
        formatted_output += f"• Last Price: ${format_price(contract.get('last_price', 'N/A'))}\n"
        formatted_output += f"• 24h High: ${format_price(contract.get('high_24h', 'N/A'))}\n"
        formatted_output += f"• 24h Low: ${format_price(contract.get('low_24h', 'N/A'))}\n"
        formatted_output += f"• 24h Volume: {contract.get('volume_24h', 'N/A')}\n"
        formatted_output += f"• Open Interest: {contract.get('open_interest', 'N/A')}\n"
        formatted_output += f"• Expiry: {format_timestamp(contract.get('settlement_time', 'N/A'))}\n"

        return formatted_output

    elif response.status_code == 404:
        return f"⚠️ Contract '{id_or_symbol}' not found. Please verify the symbol and try again."

    else:
        return f"⚠️ Error retrieving contract details: {response.text}"


def get_index_price_history(id_or_symbol, limit=5, period="1d"):

    url = f"{BASE_URL}/market/indices/{id_or_symbol}/price"
    params = {
        "period": period
    }
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        data = response.json()
        price_data = data.get("data", [])

        if not price_data:
            return f"⚠️ No price history found for {id_or_symbol}."

        formatted_output = f"📉 *INDEX PRICE HISTORY: {id_or_symbol}*\n\n"

        for price in price_data[:limit]:
            formatted_output += f"• Open: {format_timestamp(price.get('time_open', 'N/A'))}\n"
            formatted_output += f"  Close: {format_timestamp(price.get('time_close', 'N/A'))}\n"
            formatted_output += f"  Open Price: ${format_price(price.get('price_open', 'N/A'))}\n"
            formatted_output += f"  Close Price: ${format_price(price.get('price_close', 'N/A'))}\n"
            formatted_output += f"  High: ${format_price(price.get('price_high', 'N/A'))} | Low: ${format_price(price.get('price_low', 'N/A'))}\n"
            formatted_output += f"  Volume (Contracts): {price.get('volume_contracts', 'N/A')}\n\n"

        return formatted_output
    elif response.status_code == 404:
        return f"⚠️ Index '{id_or_symbol}' not found."
    else:
        return f"⚠️ Error retrieving index price history: {response.text}\n\nwaku waku - Be sure you are parsing a valid Index. Check /market to see available index"


def get_contract_price_history(id_or_symbol, period="1h", limit=5):

    url = f"{BASE_URL}/market/futures/{id_or_symbol}/price?period={period}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        prices = data.get("data", [])

        formatted_output = f"📉 *CONTRACT PRICE HISTORY: {id_or_symbol} ({period})*\n\n"

        for price in prices[:limit]:
            formatted_output += f"• Open Time: {format_timestamp(price.get('time_open', 'N/A'))}\n"
            formatted_output += f"  Close Time: {format_timestamp(price.get('time_close', 'N/A'))}\n"
            formatted_output += f"  Open Price: ${format_price(price.get('price_open', 'N/A'))}\n"
            formatted_output += f"  Close Price: ${format_price(price.get('price_close', 'N/A'))}\n"
            formatted_output += f"  High: ${format_price(price.get('price_high', 'N/A'))}\n"
            formatted_output += f"  Low: ${format_price(price.get('price_low', 'N/A'))}\n"
            formatted_output += f"  Volume Contracts: {price.get('volume_contracts', 'N/A')}\n"
            formatted_output += f"  Volume Base: {price.get('volume_base', 'N/A')}\n\n"

        return formatted_output
    else:
        return f"⚠️ Error retrieving contract price history: {response.text}"


def get_mark_price_history(id_or_symbol, period="1h", limit=5):

    url = f"{BASE_URL}/market/futures/{id_or_symbol}/mark-price?period={period}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        prices = data.get("data", [])

        if not prices:
            return f"⚠️ No mark price history found for {id_or_symbol}"

        formatted_output = f"📉 MARK PRICE HISTORY: {id_or_symbol} ({period})\n\n"

        for price in prices[:limit]:
            formatted_output += f"• Time: {format_timestamp(price.get('time_open', 'N/A'))}\n"
            formatted_output += f"  Price: ${format_price(price.get('price_close', 'N/A'))}\n"
            formatted_output += f"  High: ${format_price(price.get('price_high', 'N/A'))}\n"
            formatted_output += f"  Low: ${format_price(price.get('price_low', 'N/A'))}\n\n"

        return formatted_output
    else:

        error_message = "Unknown error"
        try:
            error_data = response.json()
            if "error" in error_data and "message" in error_data["error"]:
                error_message = error_data["error"]["message"]
        except:
            error_message = f"HTTP {response.status_code}: {response.text}"

        return f"⚠️ Error: {error_message}"


def get_ask_price_history(id_or_symbol, period="1h", limit=5):

    url = f"{BASE_URL}/market/futures/{id_or_symbol}/ask-price?period={period}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        prices = data.get("data", [])

        if not prices:
            return f"⚠️ No ask price history found for {id_or_symbol}"

        formatted_output = f"📉 ASK PRICE HISTORY: {id_or_symbol} ({period})\n\n"

        for price in prices[:limit]:

            formatted_output += f"• Time: {format_timestamp(price.get('time_open', 'N/A'))}\n"
            formatted_output += f"  Price: ${format_price(price.get('price_close', 'N/A'))}\n"
            formatted_output += f"  High: ${format_price(price.get('price_high', 'N/A'))}\n"
            formatted_output += f"  Low: ${format_price(price.get('price_low', 'N/A'))}\n\n"

        return formatted_output
    else:

        error_message = "Unknown error"
        try:
            error_data = response.json()
            if "error" in error_data and "message" in error_data["error"]:
                error_message = error_data["error"]["message"]
        except:
            error_message = f"HTTP {response.status_code}"

        return f"⚠️ Error: {error_message}"


def get_bid_price_history(id_or_symbol, period="1h", limit=5):

    url = f"{BASE_URL}/market/futures/{id_or_symbol}/bid-price?period={period}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        prices = data.get("data", [])

        if not prices:
            return f"⚠️ No bid price history found for {id_or_symbol}"

        formatted_output = f"📉 BID PRICE HISTORY: {id_or_symbol} ({period})\n\n"

        for price in prices[:limit]:

            formatted_output += f"• Open Time: {format_timestamp(price.get('time_open', 'N/A'))}\n"
            formatted_output += f"  Close Time: {format_timestamp(price.get('time_close', 'N/A'))}\n"
            formatted_output += f"  Price: ${format_price(price.get('price_close', 'N/A'))}\n"
            formatted_output += f"  High: ${format_price(price.get('price_high', 'N/A'))}\n"
            formatted_output += f"  Low: ${format_price(price.get('price_low', 'N/A'))}\n\n"

        return formatted_output
    else:

        error_message = "Unknown error"
        try:
            error_data = response.json()
            if "error" in error_data and "message" in error_data["error"]:
                error_message = error_data["error"]["message"]
        except:
            error_message = f"HTTP {response.status_code}"

        return f"⚠️ Error: {error_message}"


def get_order_book(id_or_symbol, limit=5):
    """
    Try to fetch the order book data using multiple possible endpoint formats
    and provide helpful error messages when the API fails.

    CVEX was stressing my ass
    """

    is_id = str(id_or_symbol).isdigit()

    endpoints_to_try = [

        f"{BASE_URL}/market/futures/{id_or_symbol}/order-book",


        f"{BASE_URL}/market/futures/by-{'id' if is_id else 'symbol'}/{id_or_symbol}/order-book",


        f"{BASE_URL}/market/futures/{id_or_symbol.lower() if not is_id else id_or_symbol}/order-book",


        f"{BASE_URL}/market/order-book/futures/{id_or_symbol}"
    ]

    errors = []

    for url in endpoints_to_try:
        try:
            logger.info(f"Attempting order book request: {url}")
            headers = create_headers("GET", url, {})
            response = requests.get(url, headers=headers, timeout=10)

            logger.info(f"Response status: {response.status_code}")

            if response.status_code == 200:
                data = response.json()

                if not data.get('asks') and not data.get('bids'):
                    logger.warning(f"Empty order book for {id_or_symbol}")
                    return f"📊 Order book for {id_or_symbol} is currently empty."

                formatted_output = f"📊 ORDER BOOK: {id_or_symbol}\n\n"

                formatted_output += "🔴 SELL ORDERS (Asks):\n"
                for ask in data.get("asks", [])[:limit]:
                    price = float(ask.get('price', 0))
                    quantity = float(ask.get('quantity_contracts', 0))
                    formatted_output += f"• Price: ${price:,.2f} | Size: {quantity:g} contracts\n"

                formatted_output += "\n🟢 BUY ORDERS (Bids):\n"
                for bid in data.get("bids", [])[:limit]:
                    price = float(bid.get('price', 0))
                    quantity = float(bid.get('quantity_contracts', 0))
                    formatted_output += f"• Price: ${price:,.2f} | Size: {quantity:g} contracts\n"

                if 'block' in data and 'block_id' in data['block']:
                    formatted_output += f"\nBlock: {data['block']['block_id']}"

                logger.info(
                    f"Successfully retrieved order book for {id_or_symbol}")
                return formatted_output

            errors.append(f"{response.status_code}: {response.reason}")

        except requests.exceptions.RequestException as e:
            logger.error(f"Request error: {str(e)}")
            errors.append(str(e))
        except Exception as e:
            logger.error(f"Processing error: {str(e)}", exc_info=True)
            errors.append(str(e))

    logger.error(
        f"All order book attempts failed for {id_or_symbol}: {errors}")

    try:
        contracts_data = list_contracts()
        if f"*{id_or_symbol}*" in contracts_data or f"ID: {id_or_symbol}" in contracts_data:
            return ("📛 The order book feature may be temporarily unavailable.\n\n"
                    f"Contract '{id_or_symbol}' exists, but the order book endpoint is not responding correctly.")
        else:
            return f"⚠️ Contract '{id_or_symbol}' not found. Use /contracts to see available contracts."
    except:
        return ("⚠️ Unable to fetch order book data. This might be due to:\n"
                "• API limitations\n"
                "• Temporary service outage\n"
                "• The contract having no active orders\n\n"
                "Try again later or check /contracts for available contracts.")


def get_latest_trades(id_or_symbol, limit=5):
    try:

        url = f"{BASE_URL}/market/futures/{id_or_symbol}/latest-trades"
        body = {}
        headers = create_headers("GET", url, {})
        response = requests.get(url, headers=headers)

        if response.status_code == 200:
            data = response.json()
            trades = data.get("trades", [])
            if trades:
                logger.debug(f"First trade raw data: {trades[0]}")

            if not trades:
                return f"⚠️ No recent trades found for {id_or_symbol}"

            formatted_output = f"🔃 LATEST TRADES: {id_or_symbol}\n\n"
            for trade in trades[:limit]:
                side = "BUY" if trade.get("taker_side") == "buy" else "SELL"
                price = format_price(trade.get("last_price", "N/A"))
                quantity_contracts = trade.get("quantity_contracts", "N/A")
                quantity_base = trade.get("quantity_base", "N/A")

                timestamp = trade.get("timestamp")
                if not timestamp and "tx_info" in trade and trade["tx_info"]:
                    timestamp = trade["tx_info"].get("block_timestamp")

                timestamp_formatted = format_timestamp(timestamp)

                tx_hash = None
                if "tx_info" in trade and trade["tx_info"]:
                    tx_hash = trade["tx_info"].get("tx_hash")

                tx_formatted = format_tx_hash(tx_hash) if tx_hash else "N/A"

                formatted_output += (
                    f"• {side} at ${price}\n"
                    f"  Size: {quantity_contracts} contracts ({quantity_base} base)\n"
                    f"  Time: {timestamp_formatted}\n"
                    f"  TX: {tx_formatted}\n\n"
                )
            return formatted_output
        else:
            error_message = "Unknown error"
            try:
                error_data = response.json()
                if "error" in error_data and "message" in error_data["error"]:
                    error_message = error_data["error"]["message"]
            except:
                error_message = f"HTTP {response.status_code}"

            return f"⚠️ Error: {error_message}"
    except Exception as e:
        logger.error(f"Latest trades processing error: {e}", exc_info=True)
        return f"⚠️ Processing error: {str(e)}"


def get_contracts_history(limit=5):

    url = f"{BASE_URL}/market/contracts-history"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        events = data.get("events", [])

        if not events:
            return "📭 No contract history events found"

        formatted_output = "🕰 Contracts History\n\n"

        for event in events[:limit]:
            event_type = event.get("type", "N/A").replace("_", " ").title()
            contract_symbol = event.get("symbol", "N/A")
            tx_hash = event.get("tx_info", {}).get("transaction_hash", "")
            timestamp = format_timestamp(
                event.get("tx_info", {}).get("block_timestamp"))

            formatted_output += f"• Type: {event_type}\n"
            formatted_output += f"  Contract: {contract_symbol}\n"
            if tx_hash:
                tx_display = format_tx_hash(tx_hash)
                formatted_output += f"  TX Hash: {tx_display}\n"

            formatted_output += f"  Time: {timestamp}\n\n"

        return formatted_output

    except requests.exceptions.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return f"⚠️ Failed to fetch history: API error"
    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        return f"⚠️ Error processing history data"


def get_portfolio_overview():

    url = f"{BASE_URL}/portfolio/overview"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        portfolio = data.get("portfolio", {})

        formatted_output = "💼 *PORTFOLIO OVERVIEW*\n\n"
        formatted_output += f"• *Portfolio ID*: {portfolio.get('portfolio_id', 'N/A')}\n"
        formatted_output += f"• *Collateral Balance*: ${portfolio.get('collateral_balance', 'N/A')}\n"
        formatted_output += f"• *Unrealized Profit*: ${portfolio.get('unrealized_profit', 'N/A')}\n"
        formatted_output += f"• *Equity*: ${portfolio.get('equity', 'N/A')}\n"
        formatted_output += f"• *Required Margin*: ${portfolio.get('positions_required_margin', 'N/A')}\n"
        formatted_output += f"• *Available to Withdraw*: ${portfolio.get('available_to_withdraw', 'N/A')}\n"
        formatted_output += f"• *Margin Utilization*: {portfolio.get('margin_utilization', 'N/A')}%\n"

        risk = float(portfolio.get('liquidation_risk_1d', 0))
        risk_indicator = "🟢 Low" if risk < 0.3 else "🟠 Medium" if risk < 0.7 else "🔴 High"
        formatted_output += f"• *Liquidation Risk (24h)*: {risk_indicator} ({risk})\n"

        block = data.get("block", {})
        if block:
            formatted_output += f"\n📦 *Block Info*\n"
            formatted_output += f"• ID: {block.get('block_id', 'N/A')}\n"
            formatted_output += f"• Timestamp: {format_timestamp(block.get('block_timestamp', 'N/A'))}\n"

        return formatted_output
    else:
        return f"⚠️ Error retrieving portfolio overview: {response.text}"


def get_positions():

    url = f"{BASE_URL}/portfolio/positions"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        positions = data.get("positions", [])

        if not positions:
            return "📋 *POSITIONS*\n\nNo open positions found."

        formatted_output = "📋 *POSITIONS*\n\n"

        for position in positions:

            position_type = "LONG 📈" if float(
                position.get('size_contracts', 0)) > 0 else "SHORT 📉"

            formatted_output += f"*{position.get('contract', 'Unknown')}* ({position_type})\n"
            formatted_output += f"• Size: {position.get('size_contracts', 'N/A')} contracts ({position.get('size_assets', 'N/A')} assets)\n"
            formatted_output += f"• Entry Price: ${format_price(position.get('average_entry_price', 'N/A'))}\n"
            formatted_output += f"• Net Value: ${format_price(position.get('net_value', 'N/A'))}\n"
            formatted_output += f"• Liquidation Price: ${format_price(position.get('liquidation_price', 'N/A'))}\n"

            unrealized_profit = float(position.get('unrealized_profit', 0))
            profit_indicator = "🟢" if unrealized_profit > 0 else "🔴"
            formatted_output += f"• Unrealized P/L: {profit_indicator} ${format_price(abs(unrealized_profit))}\n"

            if 'leverage' in position:
                formatted_output += f"• Leverage: {position.get('leverage', 'N/A')}x\n"

            deleverage_rank = float(position.get('deleverage_rank', 0))
            risk_indicator = "🟢 Low" if deleverage_rank < 0.3 else "🟠 Medium" if deleverage_rank < 0.7 else "🔴 High"
            formatted_output += f"• Deleverage Rank: {risk_indicator} ({deleverage_rank})\n"

            contract_info = position.get('contract_info', {})
            if contract_info:
                formatted_output += f"\n*Contract Details:*\n"
                formatted_output += f"• Symbol: {contract_info.get('symbol', 'N/A')}\n"
                formatted_output += f"• Name: {contract_info.get('name', 'N/A')}\n"
                formatted_output += f"• Delivery: {format_timestamp(contract_info.get('delivery_date', 'N/A'))}\n"

            formatted_output += "\n"

        block = data.get("block", {})
        if block:
            formatted_output += f"📦 *Block Info*\n"
            formatted_output += f"• ID: {block.get('block_id', 'N/A')}\n"
            formatted_output += f"• Timestamp: {format_timestamp(block.get('block_timestamp', 'N/A'))}\n"

        return formatted_output
    else:
        return f"⚠️ Error retrieving positions: {response.text}"


def get_position_details(id_or_symbol: str):
    """Fetch detailed position info by symbol or ID"""

    url = f"{BASE_URL}/portfolio/positions/{id_or_symbol}"
    body = {}
    headers = create_headers("GET", url, {})
    response = requests.get(url, headers=headers)

    if response.status_code == 200:
        data = response.json()
        details = data.get("details", {})

        formatted_output = f"📊 *POSITION DETAILS: {details.get('contract', id_or_symbol)}*\n\n"
        formatted_output += f"• Size (Contracts): `{details.get('size_contracts', 'N/A')}`\n"
        formatted_output += f"• Size (Assets): `{details.get('size_assets', 'N/A')}`\n"
        formatted_output += f"• Entry Price: `${format_price(details.get('average_entry_price', 'N/A'))}`\n"
        formatted_output += f"• Liquidation Price: `${format_price(details.get('liquidation_price', 'N/A'))}`\n"
        formatted_output += f"• Unrealized P/L: `${format_price(details.get('unrealized_profit', 'N/A'))}`\n"
        formatted_output += f"• Deleverage Rank: `{details.get('deleverage_rank', 'N/A')}`\n"

        return formatted_output
    else:
        return f"⚠️ Error fetching position: {response.text}"


def get_orders():
    """Fetch all open limit orders for the account"""

    url = f"{BASE_URL}/portfolio/orders"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

        if not data.get("orders"):
            return "📭 No open orders found."

        formatted = "📜 *OPEN ORDERS*\n\n"

        for order in data["orders"]:
            formatted += (
                f"🆔 *{order.get('contract_info', {}).get('symbol', 'Unknown')}*\n"
                f"• ID: `{order.get('order_id', 'N/A')}`\n"
                f"• Side: `{order.get('side', 'N/A').upper()}`\n"
                f"• Price: `${format_price(order.get('limit_price', 'N/A'))}`\n"
                f"• Opened: `{order.get('opened_quantity_contracts', 'N/A')} contracts`\n"
                f"• Filled: `{order.get('filled_quantity_contracts', 'N/A')} contracts`\n"
                f"• Created: `{format_timestamp(order.get('created_at', 'N/A'))}`\n"
                f"• Updated: `{format_timestamp(order.get('updated_at', 'N/A'))}`\n"
                f"• Time in Force: `{order.get('time_in_force', 'N/A')}`\n"
                f"• Reduce Only: `{'✅' if order.get('reduce_only') else '❌'}`\n\n"
            )

        return formatted

    except requests.RequestException as e:
        return f"⚠️ Anya couldn't fetch orders: {str(e)}"


def get_order_details(order_id: str):

    url = f"{BASE_URL}/portfolio/orders/{order_id}"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        details = response.json().get("details", {})
        return (
            f"📄 *ORDER {order_id}*\n\n"
            f"• Contract: `{details.get('contract_id', 'N/A')}`\n"
            f"• Price: `${format_price(details.get('limit_price', 'N/A'))}`\n"
            f"• Filled: `{details.get('filled_quantity_contracts', 'N/A')}/{details.get('opened_quantity_contracts', 'N/A')} contracts`\n"
            f"• Created: `{format_timestamp(details.get('created_at', 'N/A'))}`\n"
            f"• Status: `{'✅ Active' if int(details.get('opened_quantity_contracts', 0)) > 0 else '❌ Filled/Cancelled'}`"
        )
    except Exception as e:
        return f"⚠️ Order lookup failed: {str(e)}"


def get_trade_history(limit: int = 5):

    url = f"{BASE_URL}/portfolio/history/positions"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        events = response.json().get("events", [])

        if not events:
            return "📭 No trade history found."

        formatted = "📜 *TRADE HISTORY*\n\n"
        for event in events[:limit]:
            formatted += (
                f"⚡ *{event['type'].replace('_', ' ').title()}*\n"
                f"• Contract: `{event.get('contract_info', {}).get('symbol', 'N/A')}`\n"
                f"• Side: `{event.get('side', 'N/A').upper()}`\n"
                f"• Size: `{event.get('quantity_contracts', 'N/A')} contracts`\n"
                f"• Price: `${format_price(event.get('entry_price', 'N/A'))}`\n"
                f"• Time: `{format_timestamp(event.get('created_ad', 'N/A'))}`\n\n"
            )
        return formatted

    except Exception as e:
        return f"⚠️ Failed to fetch history: {str(e)}"


def get_orders_history(limit: int = 5):

    url = f"{BASE_URL}/portfolio/history/orders"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        events = response.json().get("events", [])

        if not events:
            return "📭 No order history found."

        formatted = "📜 *ORDERS HISTORY*\n\n"
        for event in events[:limit]:
            formatted += (
                f"🔄 *{event['type'].replace('_', ' ').title()}*\n"
                f"• Order: `{event.get('order_id', 'N/A')}`\n"
                f"• Contract: `{event.get('contract_info', {}).get('symbol', 'N/A')}`\n"
                f"• Side: `{event.get('side', 'N/A').upper()}`\n"
                f"• Price: `${format_price(event.get('limit_price', 'N/A'))}`\n"
                f"• Status: `{'❌ Rejected' if event['type'] == 'order_rejected' else '✅ Active'}`\n"
                f"• Time: `{format_timestamp(event.get('created_at', 'N/A'))}`\n\n"
            )
        return formatted

    except Exception as e:
        return f"⚠️ Failed to fetch orders history: {str(e)}"


def get_transactions_history(limit: int = 5):

    url = f"{BASE_URL}/portfolio/history/transactions"
    headers = create_headers("GET", url, {})

    try:
        response = requests.get(url, headers=headers)
        events = response.json().get("events", [])

        if not events:
            return "💸 No transactions found."

        formatted = "📊 *TRANSACTIONS HISTORY*\n\n"
        for event in events[:limit]:
            amount = float(event.get("amount", 0))
            formatted += (
                f"💰 *{event['type'].replace('_', ' ').title()}*\n"
                f"• Amount: `{'🔴' if amount < 0 else '🟢'} {abs(amount):.6f}`\n"
                f"• Contract: `{event.get('contract_info', {}).get('symbol', 'N/A')}`\n"
                f"• Time: `{format_timestamp(event.get('created_at', 'N/A'))}`\n"
                f"• TX: `{event.get('tx_info', {}).get('transaction_hash', 'N/A')[:10]}...`\n\n"
            )
        return formatted

    except Exception as e:
        return f"⚠️ Failed to fetch transactions: {str(e)}"


def send_order(contract: str, order_type: str, quantity: float, price: float = None, time_in_force: str = "GTC", side: str = "buy"):
    url = f"{BASE_URL}/trading/order"
    # Flip quantity for sells
    quantity_steps = str(quantity) if side.lower() == "buy" else str(-quantity)
    payload = {
        "contract": contract,
        "type": order_type,
        "quantity_steps": quantity_steps,
        "time_in_force": time_in_force
    }
    if price and order_type == "limit":
        payload["limit_price"] = str(price)

    headers = create_headers("POST", url, payload)
    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()
        if response.status_code != 200:
            return {"error": data.get("message", "Order failed")}
        return {
            "order_id": data.get("events", [{}])[0].get("id"),
            "contract": data.get("events", [{}])[0].get("contract_id"),
            "status": "✅ Order accepted" if "order_accepted" in [e["type"] for e in data.get("events", [])] else "🟡 Pending"
        }
    except Exception as e:
        return {"error": str(e)}


def estimate_order(contract: str, order_type: str, quantity: float, price: float = None, side: str = "buy"):
    url = f"{BASE_URL}/trading/estimate-order"
    quantity_steps = str(quantity) if side.lower() == "buy" else str(-quantity)
    payload = {
        "contract": contract,
        "type": order_type,
        "quantity_steps": quantity_steps,
        "time_in_force": "GTC"
    }
    if price and order_type == "limit":
        payload["limit_price"] = str(price)

    headers = create_headers("POST", url, payload)
    try:
        response = requests.post(url, json=payload, headers=headers)
        return response.json()
    except Exception as e:
        return {"error": str(e)}


def execute_atomic_orders(orders: list):
    """Execute multiple orders atomically"""

    url = f"{BASE_URL}/trading/atomic-orders"
    headers = create_headers("POST", url, orders)

    try:
        response = requests.post(url, json=orders, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Atomic execution failed")}

        return {
            "tx_hash": data.get("transaction_hash"),
            "accepted_orders": [
                e for e in data.get("events", [])
                if e.get("type") == "order_accepted"
            ],
            "fees": data.get("fees", {})
        }
    except Exception as e:
        return {"error": str(e)}


def estimate_atomic_orders(orders: list):
    """Simulate atomic order execution"""

    url = f"{BASE_URL}/trading/estimate-atomic-orders"
    headers = create_headers("POST", url, orders)

    try:
        response = requests.post(url, json=orders, headers=headers)
        return response.json()
    except Exception as e:
        return {"error": str(e)}


def reduce_order(order_id: str, reduce_by: float):
    """Reduce an existing order's size"""

    url = f"{BASE_URL}/trading/reduce-order"
    payload = {
        "order_id": order_id,
        "reduce_by_quantity_steps": str(reduce_by)
    }
    headers = create_headers("POST", url, payload)

    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Reduction failed")}

        return {
            "order_id": data.get("events", [{}])[0].get("id"),
            "reduced": data.get("events", [{}])[0].get("reduced_quantity_contracts"),
            "remaining": data.get("events", [{}])[0].get("remained_quantity_contracts"),
            "fees": data.get("fees", {})
        }
    except Exception as e:
        return {"error": str(e)}


def replace_order(order_id: str, new_price: float = None, new_quantity: float = None):
    """Replace an existing order"""

    url = f"{BASE_URL}/trading/replace-order"
    payload = {"order_id": order_id}

    if new_price:
        payload["limit_price"] = str(new_price)
    if new_quantity:
        payload["quantity_steps"] = str(new_quantity)

    headers = create_headers("POST", url, payload)

    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Replacement failed")}

        return {
            "new_id": data.get("events", [{}])[0].get("id"),
            "customer_id": data.get("events", [{}])[0].get("customer_order_id"),
            "contract": data.get("events", [{}])[0].get("contract_id"),
            "quantity": data.get("events", [{}])[0].get("quantity_contracts"),
            "price": data.get("events", [{}])[0].get("limit_price"),
            "fees": data.get("fees", {})
        }
    except Exception as e:
        return {"error": str(e)}


def cancel_live_order(order_id: str):
    """Cancel an order already on the exchange"""

    url = f"{BASE_URL}/trading/cancel-order"
    payload = {"order_id": order_id}
    headers = create_headers("POST", url, payload)

    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Live cancellation failed")}

        return {
            "cancelled_id": data.get("events", [{}])[0].get("id"),
            "contract": data.get("events", [{}])[0].get("contract_id"),
            "canceled_qty": data.get("events", [{}])[0].get("reduced_quantity_contracts", "0")
        }
    except Exception as e:
        return {"error": str(e)}


def execute_cancel_all_orders(order_type: str = None):
    """Cancel all active orders (optionally filtered by type)"""

    url = f"{BASE_URL}/trading/cancel-all-orders"
    payload = {"order_type": order_type} if order_type else {}
    headers = create_headers("POST", url, payload)

    try:
        response = requests.post(url, json=payload, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Bulk cancellation failed")}

        return {
            "cancelled_ids": [e.get("id") for e in data.get("events", [])],
            "total_cancelled": len(data.get("events", [])),
            "fees": data.get("fees", {}),
            "order_type": order_type
        }
    except Exception as e:
        return {"error": str(e)}


def execute_batch_actions(actions: list):
    """
    Execute multiple trading actions in a single batch
    :param actions: List of action dicts (create_order, reduce_order, etc.)
    :return: {"status": str, "tx_hash": str, "events": list, "fees": dict} or {"error": str}
    """

    url = f"{BASE_URL}/trading/batch-actions"
    headers = create_headers("POST", url, actions)

    try:
        response = requests.post(url, json=actions, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Batch execution failed")}

        return {
            "tx_hash": data.get("transaction_hash"),
            "events": data.get("events", []),
            "fees": data.get("fees", {})
        }
    except Exception as e:
        return {"error": str(e)}


def set_cancel_all_after(timeout_ms: int):
    """
    Set automatic cancellation timer
    :param timeout_ms: Time in milliseconds (0 to disable)
    :return: {"trigger_id": str, "trigger_time": str} or {"error": str}
    """

    url = f"{BASE_URL}/trading/cancel-all-orders-after"
    body = {"timeout": timeout_ms}
    headers = create_headers("POST", url, timeout_ms)

    try:
        response = requests.post(url, json=body, headers=headers)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Timer activation failed")}

        return {
            "trigger_id": data["id"],
            "trigger_time": data["trigger_time"],
            "server_time": data["server_time"]
        }
    except Exception as e:
        return {"error": str(e)}


def get_cancel_timer_status(trigger_id: str = None):
    """
    Check status of cancellation timer
    :param trigger_id: Optional specific trigger ID
    :return: {"status": str, "message": str, "tx_hash": str} or {"error": str}
    """

    url = f"{BASE_URL}/trading/cancel-all-orders-after/status"
    params = {"id": trigger_id} if trigger_id else {}
    headers = create_headers("GET", url, params)

    try:
        response = requests.get(url, headers=headers, params=params)
        data = response.json()

        if response.status_code != 200:
            return {"error": data.get("message", "Status check failed")}

        return {
            "id": data["id"],
            "status": data["status"],
            "message": data.get("message", ""),
            "tx_hash": data.get("tx_hash"),
            "created_at": data["created_at"]
        }
    except Exception as e:
        return {"error": str(e)}


READ_ONLY_FUNCTIONS = [
    "fetch_market_data", "get_index_details", "list_contracts", "get_contract_details",
    "get_index_price_history", "get_contract_price_history", "get_mark_price_history",
    "get_ask_price_history", "get_bid_price_history", "get_order_book", "get_latest_trades",
    "get_contracts_history", "get_positions", "get_position_details", "get_orders",
    "get_order_details", "get_trade_history", "get_orders_history", "get_transactions_history", "get_portfolio_overview"
]

TRADING_FUNCTIONS = [
    "send_order", "execute_atomic_orders", "reduce_order", "replace_order", "cancel_live_order",
    "execute_cancel_all_orders", "execute_batch_actions", "set_cancel_all_after", "get_cancel_timer_status", "estimate_order", "estimate_atomic_orders"
]


__all__ = READ_ONLY_FUNCTIONS + TRADING_FUNCTIONS
