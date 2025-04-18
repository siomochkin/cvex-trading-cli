import json
import os
import logging
from time import time
from dotenv import load_dotenv
import requests
from telegram import Update
from telegram.ext import CallbackQueryHandler
from telegram.constants import ParseMode
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from telegram.ext import Application, CommandHandler, CallbackContext
from end_points_handlers.cvex_handler import (
    fetch_market_data, get_index_details, list_contracts, get_contract_details,
    get_index_price_history, get_contract_price_history, get_mark_price_history,
    get_ask_price_history, get_bid_price_history, get_order_book, get_latest_trades,
    get_contracts_history, get_portfolio_overview, get_positions, get_position_details,
    get_orders, get_order_details, get_trade_history, get_orders_history, get_transactions_history,
    send_order, estimate_order, execute_atomic_orders, estimate_atomic_orders, reduce_order, replace_order,
    cancel_live_order, execute_cancel_all_orders, execute_batch_actions, set_cancel_all_after, get_cancel_timer_status

)
from trade.anya_trader import TRADING_HANDLERS
from ai.anya_ai import AI_HANDLERS
from security.anya_security import main as security_main, readonly_key, trading_key
from security.anya_security import restrict_access

load_dotenv()
# TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TOKEN = os.environ.get("TELEGRAM_TOKEN")
PORT = int(os.environ.get("PORT", 8443))
VALID_PERIODS = ["15m", "30m", "1h", "3h", "7d",
                 "1m", "2h", "4h", "8h", "1d", "5d", "1M", "5m"]

logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO
)
logger = logging.getLogger(__name__)


async def test_api(update: Update, context: CallbackContext):
    """Direct API test endpoint"""
    try:
        url = "https://api.cvex.trade/v1/market/indices"
        response = requests.get(
            url, headers={"accept": "application/json", "User-Agent": "Mozilla/5.0"})

        result = (
            f"Status: {response.status_code}\n"
            f"Headers: {response.headers}\n"
            f"First 200 chars:\n{response.text[:200]}"
        )

        await update.message.reply_text(f"```\n{result}\n```", parse_mode=ParseMode.MARKDOWN)
    except Exception as e:
        await update.message.reply_text(f"🔥 RAW API FAILURE:\n{str(e)}")


async def start(update: Update, context: CallbackContext) -> None:
    await update.message.reply_text("Waku Waku. Anya is online! ⚡️\n\nUse /info to see what Anya can do for you!🎀✨")


async def help_command(update: Update, context: CallbackContext) -> None:

    if update.message:
        message = update.message
    else:
        message = update.callback_query.message

    keyboard = [

        [InlineKeyboardButton("🤖 AI", callback_data="help_ai")],
        [InlineKeyboardButton("📊 Market Data", callback_data="help_market")],
        [InlineKeyboardButton("👤 Account", callback_data="help_account")],
        [InlineKeyboardButton(
            "📈 Price History", callback_data="help_history")],
        [InlineKeyboardButton("💎 Trading", callback_data="help_trading")],
        [InlineKeyboardButton("🚀 Advanced", callback_data="help_advanced")],
        [InlineKeyboardButton("⚠️ Safety", callback_data="help_safety")],
        [InlineKeyboardButton("🎉 Fun", callback_data="help_fun")],
        [InlineKeyboardButton("ℹ️ About", callback_data="help_about")]
    ]

    await message.reply_text(
        "✨🎀 ANYA'S COMMAND CENTER 🎀✨\n\n"
        "Select a category to see commands:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def help_category(update: Update, context: CallbackContext) -> None:
    query = update.callback_query
    await query.answer()

    category = query.data.replace("help_", "")

    if category == "back":
        await help_command(update, context)
        await query.delete_message()
        return

    category_texts = {
        "ai": (
            "🤖 AI COMMAND\n\n"
            "To talk to anya in natural language\n\n"
            "- use /anya <query>\n\n"
            "More Examples\n\n"
            "/anya analyse\n\n"
            "/anya buy stuff\n\n"
            "/anya anything goes here. heh. \n"

        ),
        "market": (
            "📊 MARKET DATA COMMANDS:\n\n"
            "/market - View all market indices\n"
            "/index <symbol> - Get index details\n"
            "/contracts - List available contracts\n"
            "/contract <symbol> - Get contract details\n"
            "/order_book <symbol> - View order book\n"
            "/latest_trades <symbol> - Recent trades\n"
            "/contracts_history - Contract events"
        ),
        "account": (
            "👤 ACCOUNT COMMANDS:\n\n"
            "/portfolio - Portfolio overview\n"
            "/positions - Open positions\n"
            "/position <symbol> - Position details\n"
            "/orders - Open orders\n"
            "/order <id> - Order details\n"
            "/history [limit] - Trade history\n"
            "/orders_history [limit] - Order history\n"
            "/transactions [limit] - Transactions"
        ),
        "history": (
            "🗒 PRICE HISTORY COMMANDS:\n\n"
            "/index_history <symbol>\n"
            "/contract_history <symbol>\n"
            "/mark_history <symbol>\n"
            "/ask_history <symbol>\n"
            "/bid_history <symbol>"
        ),
        "trading": (
            "💎 TRADING COMMANDS:\n\n"
            "/start_order ... auto guides your trade\n"
            "/place_order <contract> <type> <qty> [price]\n"
            "/place_sim_order <contract> <type> <qty> [price]\n"
            "/atomic_order <orders...>\n"
            "/atomic_sim_order <orders...>\n"
            "/reduce_order <id> <amount>\n"
            "/replace_order <id> [price] [qty]\n"
            "/cancel_live_order <id>\n"
            "/cancel_all [limit/market]"
        ),
        "advanced": (
            "🚀 ADVANCED COMMANDS:\n\n"
            "/batch <JSON>\n"
            "Example: /batch '[{\"action\":\"cancel_order\",\"order_id\":\"123\"}]'"
        ),
        "safety": (
            "⚠️ SAFETY COMMANDS:\n\n"
            "/set_timer <seconds> (0=disable)\n"
            "Recommended: /set_timer 60\n"
            "/timer_status [id]"
        ),
        "fun": (
            "🎉 FUN COMMANDS:\n\n"
            "/mood - Anya's Psychic Market sentiment\n"
            "/peanuts - Treat for Anya 🥜"
        ),
        "about": (
            "ABOUT ANYA\n\n"
            "version1.0\n\n"
            "Developed by @DanOdin\n\n"
            "Source Link: https://github.com/danodin69/anya-trader-bot\n\n"
            "Released under the Attribution-NonCommercial-NoDerivatives 4.0 International License(CC BY-NC-NE 4.0)\n\n"
            "Platform: https://cvex.trade\n\n"
            "Raw Test Cvex Network: /testapi\n\n"

            "Support: /support\n\n"
            "Dev Note: This version of Anya uses only CVEX.\n"
            "Watch out for future iterations that may add Deriv for FX market.\n\n"
            "Have suggestions or want to invest in this? Message me directly @DanOdin"
        )
    }

    back_button = InlineKeyboardButton(
        "🔙 Back to Categories", callback_data="help_back")

    await query.edit_message_text(
        text=category_texts[category],
        reply_markup=InlineKeyboardMarkup([[back_button]]),
        parse_mode=None
    )


async def help_back(update: Update, context: CallbackContext) -> None:
    query = update.callback_query
    await query.answer()
    await help_command(update, context)
    await query.delete_message()


@restrict_access(need_trading=False)
async def market(update: Update, context: CallbackContext, user_id: str):
    try:

        with readonly_key(user_id):

            logger.info(f"Fetching market data for {user_id}...")
            data = fetch_market_data()

            if "⚠️" in data:
                logger.error(f"API Error: {data}")
                await update.message.reply_text("📉 Market data unavailable. Try again later.")
                return

            logger.info(f"Market data received: {data[:100]}...")
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)

    except Exception as e:
        logger.error(f"Market error: {str(e)}", exc_info=True)
        await update.message.reply_text("🔧 Temporary issues. Use /testapi to check")


@restrict_access(need_trading=False)
async def index(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /index <id_or_symbol>")
            return
        id_or_symbol = context.args[0]
        try:
            data = get_index_details(id_or_symbol)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Index command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya is confused: {str(e)}")


@restrict_access(need_trading=False)
async def contracts(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        try:
            data = list_contracts()
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Contracts command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya is confused: {str(e)}")


@restrict_access(need_trading=False)
async def contract(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /contract <id_or_symbol>")
            return
        id_or_symbol = context.args[0]
        try:
            data = get_contract_details(id_or_symbol)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Contract command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya is confused: {str(e)}")


@restrict_access(need_trading=False)
async def index_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /index_history <id_or_symbol> [period] [limit]")
            return

        id_or_symbol = context.args[0]
        period = context.args[1] if len(context.args) > 1 else "1d"
        limit = int(context.args[2]) if len(context.args) > 2 else 5

        if period not in VALID_PERIODS:
            await update.message.reply_text(f"⚠️ Nuh Uh! Invalid period. Valid options are: {', '.join(VALID_PERIODS)}")
            return

        try:
            data = get_index_price_history(id_or_symbol, limit, period)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Index history command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya is confused: {str(e)}")


@restrict_access(need_trading=False)
async def contract_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /contract_history <id_or_symbol> [period]")
            return

        id_or_symbol = context.args[0]
        period = context.args[1] if len(context.args) > 1 else "1h"

        if period not in VALID_PERIODS:
            valid_periods_str = ", ".join(sorted(VALID_PERIODS))
            await update.message.reply_text(f"⚠️ Invalid period. Choose from: {valid_periods_str}")
            return

        limit = int(context.args[2]) if len(context.args) > 2 else 5

        try:
            data = get_contract_price_history(id_or_symbol, period, limit)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(
                f"Contract history command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya is confused: {str(e)}")


@restrict_access(need_trading=False)
async def mark_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /mark_history <id_or_symbol> [period] [limit]")
            return

        id_or_symbol = context.args[0]

        period = "1h"
        if len(context.args) > 1:
            period = context.args[1]

            if hasattr(context, 'VALID_PERIODS') and period not in context.VALID_PERIODS:
                valid_periods_str = ", ".join(sorted(context.VALID_PERIODS))
                await update.message.reply_text(f"⚠️ Invalid period. Choose from: {valid_periods_str}")
                return

        limit = 5
        if len(context.args) > 2:
            try:
                limit = int(context.args[2])
                if limit < 1 or limit > 20:
                    await update.message.reply_text("Limit must be between 1 and 20. Using default of 5.")
                    limit = 5
            except ValueError:
                await update.message.reply_text("Invalid limit value. Using default of 5.")

        try:
            data = get_mark_price_history(id_or_symbol, period, limit)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Mark history command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Error processing request: {str(e)}")


@restrict_access(need_trading=False)
async def ask_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /ask_history <id_or_symbol> [period] [limit]")
            return

        id_or_symbol = context.args[0]

        period = "1h"
        if len(context.args) > 1:
            period = context.args[1]

            if hasattr(context, 'VALID_PERIODS') and period not in context.VALID_PERIODS:
                valid_periods_str = ", ".join(sorted(context.VALID_PERIODS))
                await update.message.reply_text(f"⚠️ Invalid period. Choose from: {valid_periods_str}")
                return

        limit = 5
        if len(context.args) > 2:
            try:
                limit = int(context.args[2])
                if limit < 1 or limit > 20:
                    await update.message.reply_text("Limit must be between 1 and 20. Using default of 5.")
                    limit = 5
            except ValueError:
                await update.message.reply_text("Invalid limit value. Using default of 5.")

        try:
            data = get_ask_price_history(id_or_symbol, period, limit)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Ask history command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Error processing request: {str(e)}")


@restrict_access(need_trading=False)
async def bid_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /bid_history <id_or_symbol> [period] [limit]")
            return

        id_or_symbol = context.args[0]

        period = "1h"
        if len(context.args) > 1:
            period = context.args[1]

            if period not in VALID_PERIODS:
                valid_periods_str = ", ".join(sorted(VALID_PERIODS))
                await update.message.reply_text(f"⚠️ Nuh Uh! Invalid period. Valid options are: {valid_periods_str}")
                return

        limit = 5
        if len(context.args) > 2:
            try:
                limit = int(context.args[2])
                if limit < 1 or limit > 20:
                    await update.message.reply_text("Limit must be between 1 and 20. Using default of 5.")
                    limit = 5
            except ValueError:
                await update.message.reply_text("Invalid limit value. Using default of 5.")

        try:

            data = get_bid_price_history(id_or_symbol, period, limit)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Bid history command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Error processing request: {str(e)}")


@restrict_access(need_trading=False)
async def order_book(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text(
                "ℹ️ *Order Book Command*\n\n"
                "Use this command to view the current buy and sell orders for a contract.\n\n"
                "*Usage:* /order_book <symbol or ID> [limit]\n\n"
                "*Examples:*\n"
                "• /order_book BTC-25APR25\n"
                "• /order_book 43\n"
                "• /order_book ETH-30MAY25 3 (show top 3 orders)\n\n"
                "Use /contracts to see the list of available contracts.",
                parse_mode=ParseMode.MARKDOWN
            )
            return

        try:

            contract_identifier = context.args[0].strip()

            limit = 5
            if len(context.args) > 1:
                try:
                    requested_limit = int(context.args[1])
                    if requested_limit > 10:
                        await update.message.reply_text("⚠️ Maximum limit is 10. Using 10 instead.")
                        limit = 10
                    else:
                        limit = requested_limit
                except ValueError:
                    await update.message.reply_text("⚠️ Invalid limit. Using default of 5 orders.")

            processing_message = await update.message.reply_text(
                "🔍 Fetching order book data...",
                parse_mode=None
            )

            result = get_order_book(contract_identifier, limit)

            await context.bot.delete_message(
                chat_id=update.effective_chat.id,
                message_id=processing_message.message_id
            )

            await update.message.reply_text(
                result,
                parse_mode=None,
                disable_web_page_preview=True
            )

        except Exception as e:
            logger.error(f"Order book command failed: {e}", exc_info=True)
            await update.message.reply_text(
                "😵 Anya couldn't process your request:\n"
                f"{str(e)}\n\n"
                "Try checking /contracts for available contracts.",
                parse_mode=None
            )


@restrict_access(need_trading=False)
async def latest_trades(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):

        if not context.args:
            await update.message.reply_text("Usage: /latest_trades <symbol> [limit]")
            return

        id_or_symbol = context.args[0].upper()

        limit = 5
        if len(context.args) > 1:
            try:
                limit = int(context.args[1])
                if limit < 1 or limit > 20:
                    await update.message.reply_text("Limit must be between 1 and 20. Using default of 5.")
                    limit = 5
            except ValueError:
                await update.message.reply_text("Invalid limit value. Using default of 5.")

        try:
            data = get_latest_trades(id_or_symbol, limit)
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Latest trades command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Error processing request: {str(e)}")


@restrict_access(need_trading=False)
async def contracts_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        try:
            limit = int(context.args[0]) if context.args else 5
            if limit > 20:
                limit = 20

            data = get_contracts_history(limit)
            await update.message.reply_text(
                data,
                parse_mode=None,
                disable_web_page_preview=True
            )
        except ValueError:
            await update.message.reply_text("Please provide a valid number (e.g. /contracts_history 5)")
        except Exception as e:
            logger.error(f"Command failed: {e}", exc_info=True)
            await update.message.reply_text("🔮 Anya's crystal ball fogged up... Try again later!")


@restrict_access(need_trading=False)
async def portfolio(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        try:
            data = get_portfolio_overview()
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Portfolio command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya couldn't read your portfolio: {str(e)}")


@restrict_access(need_trading=False)
async def positions(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        try:
            data = get_positions()
            await update.message.reply_text(data, parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            logger.error(f"Positions command failed: {e}", exc_info=True)
            await update.message.reply_text(f"😵 Anya couldn't fetch your positions: {str(e)}")


@restrict_access(need_trading=False)
async def position_details(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        await update.message.reply_text(
            "B-Baka! Give me a symbol! (e.g., /position BTC-24MAR24) (╯°□°)╯",
            parse_mode=ParseMode.MARKDOWN
        )
        return

    symbol = context.args[0]
    try:
        data = get_position_details(symbol)

        response = f"🔮 *Psychic Peek at {symbol}* 🔮\n\n{data}"
        await update.message.reply_text(response, parse_mode=ParseMode.MARKDOWN)
    except Exception as e:
        logger.error(f"Position command failed: {e}", exc_info=True)
        await update.message.reply_text(
            f"*Anya's vision blurred...* (×_×)\nError: {str(e)}",
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=False)
async def orders(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        try:
            data = get_orders()
            await update.message.reply_text(
                f"*🔮 Anya peered into your orders...*\n\n{data}",
                parse_mode=ParseMode.MARKDOWN
            )
        except Exception as e:
            logger.error(f"Orders command failed: {e}")
            await update.message.reply_text(
                "Anya dropped the order book! (╯°□°)╯",
                parse_mode=ParseMode.MARKDOWN
            )


@restrict_access(need_trading=False)
async def order(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        if not context.args:
            await update.message.reply_text("Usage: /order <order_id>")
            return
        try:
            data = get_order_details(context.args[0])
            await update.message.reply_text(f"🔍 *Anya found this order...*\n\n{data}", parse_mode=ParseMode.MARKDOWN)
        except Exception as e:
            await update.message.reply_text(f"Anya lost the order slip! (×﹏×)\nError: {str(e)}")


@restrict_access(need_trading=False)
async def history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        limit = int(context.args[0]) if context.args else 5
        try:
            data = get_trade_history(limit)
            await update.message.reply_text(
                f"*🔮 Anya reviewed your trades...*\n\n{data}",
                parse_mode=ParseMode.MARKDOWN
            )
        except Exception as e:
            await update.message.reply_text(f"Anya burned the history books! (ﾉ≧∇≦)ﾉ\nError: {str(e)}")


@restrict_access(need_trading=False)
async def orders_history(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        limit = int(context.args[0]) if context.args else 5
        try:
            data = get_orders_history(limit)
            await update.message.reply_text(
                f"*🗂 Anya dug through your orders...*\n\n{data}",
                parse_mode=ParseMode.MARKDOWN
            )
        except Exception as e:
            await update.message.reply_text(f"Anya spilled the order files! (ﾉ´･ω･)ﾉ\nError: {str(e)}")


@restrict_access(need_trading=False)
async def transactions(update: Update, context: CallbackContext, user_id: str):
    with readonly_key(user_id):
        limit = int(context.args[0]) if context.args else 5
        try:
            data = get_transactions_history(limit)
            await update.message.reply_text(
                f"*🏦 Anya checked your money trail...*\n\n{data}",
                parse_mode=ParseMode.MARKDOWN
            )
        except Exception as e:
            await update.message.reply_text(f"Anya lost the receipts! (╥﹏╥)\nError: {str(e)}")


@restrict_access(need_trading=True)
async def place_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 4:
            await update.message.reply_text(
                "Usage: /place_order <contract> <buy/sell> <market/limit> <quantity> [price]\n"
                "Example: /place_order BTC-24MAR24 sell limit 10 55000.00"
            )
            return

        contract, side, order_type, quantity = context.args[0], context.args[1].lower(
        ), context.args[2].lower(), context.args[3]
        if side not in ["buy", "sell"]:
            await update.message.reply_text("❌ B-baka! Side must be 'buy' or 'sell'!")
            return
        if order_type not in ["market", "limit"]:
            await update.message.reply_text("❌ Nuh uh! Type must be 'market' or 'limit'!")
            return
        try:
            quantity = float(quantity)
            if quantity <= 0:
                raise ValueError("Quantity must be positive!")
            price = float(context.args[4]) if len(
                context.args) > 4 and order_type == "limit" else None
        except ValueError as e:
            await update.message.reply_text(f"❌ Numbers only, silly! Error: {str(e)}")
            return

        context.user_data['pending_order'] = {
            'contract': contract,
            'side': side,
            'type': order_type,
            'quantity': quantity,
            'price': price,
            'timestamp': time.time()
        }

        order = context.user_data['pending_order']
        keyboard = [
            [
                InlineKeyboardButton(
                    "🚀 Confirm", callback_data="confirm_order"),
                InlineKeyboardButton("🗑️ Cancel", callback_data="cancel_order")
            ]
        ]

        await update.message.reply_text(
            f"🔮 *Order Preview*\n\n"
            f"• Contract: `{order['contract']}`\n"
            f"• Side: `{order['side'].upper()}`\n"
            f"• Type: `{order['type'].upper()}`\n"
            f"• Quantity: `{order['quantity']}`\n"
            f"{'• Price: $' + str(order['price']) if order['price'] else ''}\n\n"
            f"⚠️ Confirm within 5 seconds",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        query = update.callback_query
        await query.answer()

        if 'pending_order' not in context.user_data:
            await query.edit_message_text("No pending order to confirm!")
            return

        order = context.user_data['pending_order']
        try:
            result = send_order(
                contract=order['contract'],
                order_type=order['type'],
                quantity=order['quantity'],
                price=order['price'],
                side=order['side']
            )

            if "error" in result:
                await query.edit_message_text(f"❌ Failed: {result['error']}")
            else:
                await query.edit_message_text(
                    f"*🌀 Order Executed!*\n\n"
                    f"• ID: `{result['order_id']}`\n"
                    f"• Contract: `{result['contract']}`\n"
                    f"• Status: `{result['status']}`",
                    parse_mode=ParseMode.MARKDOWN
                )
        except Exception as e:
            await query.edit_message_text(f"Psychic interference! (×﹏×)\nError: {str(e)}")
        finally:
            context.user_data.pop('pending_order', None)


async def cancel_order(update: Update, context: CallbackContext):
    query = update.callback_query
    await query.answer()
    if 'pending_order' in context.user_data:
        context.user_data.pop('pending_order')
        await query.edit_message_text("🗑️ Order cancelled, b-baka!")
    else:
        await query.edit_message_text("🤔 Nothing to cancel, silly!")


@restrict_access(need_trading=True)
async def place_sim_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 4:
            await update.message.reply_text(
                "Usage: /place_sim_order <contract> <buy/sell> <market/limit> <quantity> [price]\n"
                "Example: /place_sim_order BTC-24MAR24 sell limit 10 55000.00"
            )
            return

        contract, side, order_type, quantity = context.args[0], context.args[1].lower(
        ), context.args[2].lower(), context.args[3]
        if side not in ["buy", "sell"]:
            await update.message.reply_text("❌ B-baka! Side must be 'buy' or 'sell'!")
            return
        if order_type not in ["market", "limit"]:
            await update.message.reply_text("❌ Nuh uh! Type must be 'market' or 'limit'!")
            return
        try:
            quantity = float(quantity)
            if quantity <= 0:
                raise ValueError("Quantity must be positive!")
            price = float(context.args[4]) if len(
                context.args) > 4 and order_type == "limit" else None
        except ValueError as e:
            await update.message.reply_text(f"❌ Numbers only, silly! Error: {str(e)}")
            return

        try:
            sim_data = estimate_order(
                contract=contract,
                order_type=order_type,
                quantity=quantity,
                price=price,
                side=side
            )
            if "error" in sim_data:
                await update.message.reply_text(f"❌ Simulation failed: {sim_data['error']}")
                return

            context.user_data['last_sim_args'] = [
                contract, side, order_type, str(quantity)] + ([str(price)] if price else [])

            keyboard = [
                [InlineKeyboardButton(
                    "📋 Copy to Real Order",
                    callback_data=f"copy_order_{'_'.join(context.user_data['last_sim_args'])}"
                )]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)

            await update.message.reply_text(
                f"🔮 *Simulation Results*\n\n"
                f"• Side: `{side.upper()}`\n"
                f"• Contract: `{contract}`\n"
                f"• Type: `{order_type.upper()}`\n"
                f"• Quantity: `{quantity}`\n"
                f"{'• Price: $' + str(price) if price else ''}\n"
                f"• Fees: `${float(sim_data.get('trading_fee', 0)) + float(sim_data.get('operational_fee', 0)):.6f}`\n"
                f"• New Leverage: `{sim_data.get('new_leverage', 'N/A')}x`\n"
                f"• Liq Price: `${sim_data.get('estimated_liquidation_price', 'N/A')}`",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=reply_markup
            )

        except Exception as e:
            await update.message.reply_text(f"Anya's simulation exploded! (ﾉ≧∇≦)ﾉ\nError: {str(e)}")


@restrict_access(need_trading=True)
async def confirm_sim_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'simulation' not in context.user_data:
            await update.message.reply_text("No active simulation to confirm!")
            return

        await update.message.reply_text(
            "🧠 *Pro Tip*: Use `/send_order` with the same parameters to execute.\n"
            "Simulations don't require confirmation since they're just estimates.",
            parse_mode=ParseMode.MARKDOWN
        )
        context.user_data.pop('simulation', None)


@restrict_access(need_trading=True)
async def cancel_sim_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'simulation' in context.user_data:
            context.user_data.pop('simulation')
            await update.message.reply_text("🗑️ Simulation cleared!")
        else:
            await update.message.reply_text("No active simulation to cancel.")


@restrict_access(need_trading=True)
async def atomic_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 3:
            await update.message.reply_text(
                "📝 *Atomic Order Format*\n\n"
                "Example:\n`/atomic_order BTC-24MAR24 limit 10 55000 ETH-24MAR24 market 5`",
                parse_mode=ParseMode.MARKDOWN
            )
            return

        orders = []
        i = 0

        while i < len(context.args):
            try:
                contract = context.args[i]
                order_type = context.args[i + 1]
                quantity_steps = str(float(context.args[i + 2]))

                order = {
                    "contract": contract,
                    "type": order_type,
                    "quantity_steps": quantity_steps,
                    "time_in_force": "GTC"
                }

                if order_type == "limit":
                    if i + 3 >= len(context.args):
                        await update.message.reply_text("⚠️ Missing limit price for a limit order.")
                        return
                    order["limit_price"] = str(float(context.args[i + 3]))
                    i += 4
                else:
                    i += 3

                orders.append(order)

            except (IndexError, ValueError):
                await update.message.reply_text("⚠️ Invalid order format. Please check your input.")
                return

        context.user_data["pending_atomic"] = {
            "orders": orders,
            "timestamp": time.time()
        }

        msg = ["⚡ *Confirm Atomic Orders*"]
        for idx, order in enumerate(orders, start=1):
            order_info = f"{idx}. {order['contract']} {order['type']} {order['quantity_steps']}"
            if "limit_price" in order:
                order_info += f" @ ${order['limit_price']}"
            msg.append(order_info)

        keyboard = [
            [
                InlineKeyboardButton(
                    "💣 Execute", callback_data="confirm_atomic"),
                InlineKeyboardButton("🐹 Cancel", callback_data="cancel_atomic")
            ]
        ]

        await update.message.reply_text(
            "\n".join(msg) + "\n\n⚠️ Confirm within 5 seconds",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_atomic(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_atomic' not in context.user_data:
            await update.message.reply_text("No pending atomic orders!")
            return

        try:
            result = execute_atomic_orders(context.user_data['pending_atomic'])
            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                response = [
                    "✅ *Atomic Execution*",
                    f"• TX: `{result['tx_hash'][:10]}...`",
                    f"• Fees: ${float(result['fees'].get('trading_fee',0))+float(result['fees'].get('operational_fee',0)):.6f}",
                    "\n*Executed Orders:*"
                ]
                for order in result['accepted_orders']:
                    response.append(
                        f"  - {order['contract_id']} {order['quantity_contracts']} contracts")

                await update.message.reply_text(
                    '\n'.join(response),
                    parse_mode=ParseMode.MARKDOWN
                )
        finally:
            context.user_data.pop('pending_atomic', None)


@restrict_access(need_trading=True)
async def cancel_atomic(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_atomic' in context.user_data:
            context.user_data.pop('pending_atomic')
            await update.message.reply_text("🗑️ Atomic orders canceled!")
        else:
            await update.message.reply_text("No pending atomic orders.")


@restrict_access(need_trading=True)
async def atomic_sim_order(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 3:
            await update.message.reply_text(
                "📝 *Atomic Simulation Format*\n\n"
                "Example:\n`/atomic_sim_order BTC-24MAR24 limit 10 55000 ETH-24MAR24 market 5`\n\n"
                "⚠️ Max one order per contract",
                parse_mode=ParseMode.MARKDOWN
            )
            return

        orders = []
        i = 0
        while i < len(context.args):
            order = {
                "contract": context.args[i],
                "type": context.args[i+1],
                "quantity_steps": str(float(context.args[i+2])),
                "time_in_force": "GTC"
            }
            if context.args[i+1] == "limit" and i+3 < len(context.args):
                order["limit_price"] = str(float(context.args[i+3]))
                i += 4
            else:
                i += 3
            orders.append(order)

        try:
            results = estimate_atomic_orders(orders)
            if "error" in results:
                await update.message.reply_text(f"❌ Simulation failed: {results['error']}")
                return

            response = ["🔮 *Atomic Simulation*"]
            total_fee = 0
            for idx, res in enumerate(results):
                order_fee = float(res.get('trading_fee', 0)) + \
                    float(res.get('operational_fee', 0))
                total_fee += order_fee
                response.append(
                    f"\n*Order {idx+1}*\n"
                    f"• Fees: ${order_fee:.6f}\n"
                    f"• New Leverage: {res.get('new_leverage', 'N/A')}x\n"
                    f"• Liq Price: ${res.get('estimated_liquidation_price', 'N/A')}"
                )

            response.append(f"\n\n💸 *Total Fees*: ${total_fee:.6f}")

            keyboard = [[InlineKeyboardButton(
                "📋 Copy to Atomic Order",
                callback_data=f"copy_atomic_{'_'.join(context.args)}"
            )]]

            await update.message.reply_text(
                '\n'.join(response),
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=InlineKeyboardMarkup(keyboard))
        except Exception as e:
            await update.message.reply_text(f"Anya's crystal ball broke! (ﾉ≧∇≦)ﾉ\nError: {str(e)}")


@restrict_access(need_trading=True)
async def reduce_order_cmd(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 2:
            await update.message.reply_text(
                "Usage: /reduce_order <order_id> <amount>\n"
                "Example: /reduce_order CUST12349 2.5"
            )
            return

        order_id, reduce_by = context.args[0], context.args[1]

        context.user_data['pending_reduction'] = {
            'order_id': order_id,
            'reduce_by': reduce_by
        }

        await update.message.reply_text(
            f"⚡ *Confirm Order Reduction*\n\n"
            f"• Order ID: `{order_id}`\n"
            f"• Reduce By: `{reduce_by} contracts`\n\n"
            f"Reply /confirm_reduce to proceed or /cancel_reduce to abort",
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_reduce(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_reduction' not in context.user_data:
            await update.message.reply_text("No pending reduction to confirm!")
            return

        order_id = context.user_data['pending_reduction']['order_id']
        reduce_by = float(context.user_data['pending_reduction']['reduce_by'])

        try:
            result = reduce_order(order_id, reduce_by)
            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                await update.message.reply_text(
                    f"✅ *Order Reduced*\n\n"
                    f"• ID: `{result['order_id']}`\n"
                    f"• Reduced: `{result['reduced']} contracts`\n"
                    f"• Remaining: `{result['remaining']} contracts`\n"
                    f"• Fees: `${float(result['fees'].get('trading_fee',0))+float(result['fees'].get('operational_fee',0)):.6f}`",
                    parse_mode=ParseMode.MARKDOWN
                )
        finally:
            context.user_data.pop('pending_reduction', None)


@restrict_access(need_trading=True)
async def cancel_reduce(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_reduction' in context.user_data:
            context.user_data.pop('pending_reduction')
            await update.message.reply_text("🗑️ Reduction canceled!")
        else:
            await update.message.reply_text("No pending reduction to cancel.")


@restrict_access(need_trading=True)
async def replace_order_cmd(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if len(context.args) < 1:
            await update.message.reply_text(
                "Usage: /replace_order <order_id> [new_price] [new_quantity]"
            )
            return

        order_id = context.args[0]
        new_price = float(context.args[1]) if len(context.args) > 1 else None
        new_quantity = float(context.args[2]) if len(
            context.args) > 2 else None

        context.user_data['pending_replace'] = {
            'order_id': order_id,
            'new_price': new_price,
            'new_quantity': new_quantity,
            'timestamp': time.time()
        }

        keyboard = [
            [
                InlineKeyboardButton(
                    "🔄 Confirm", callback_data=f"confirm_replace_{order_id}"),
                InlineKeyboardButton(
                    "❌ Cancel", callback_data="cancel_replace")
            ]
        ]

        msg = ["⚡ *Confirm Replacement*", f"• Order ID: `{order_id}`"]
        if new_price:
            msg.append(f"• New Price: `${new_price:.2f}`")
        if new_quantity:
            msg.append(f"• New Quantity: `{new_quantity}`")

        await update.message.reply_text(
            '\n'.join(msg) + "\n\n⚠️ Confirm within 5 seconds",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_replace(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_replace' not in context.user_data:
            await update.message.reply_text("No pending replacement to confirm!")
            return

        params = context.user_data['pending_replace']
        try:
            result = replace_order(
                params['order_id'],
                params['new_price'],
                params['new_quantity']
            )
            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                response = [
                    "✅ *Order Replaced*",
                    f"• New ID: `{result['new_id']}`",
                    f"• Contract: `{result['contract']}`",
                    f"• Quantity: `{result['quantity']} contracts`"
                ]
                if result['price']:
                    response.append(f"• Price: `${result['price']}`")
                response.append(
                    f"• Fees: `${float(result['fees'].get('trading_fee',0))+float(result['fees'].get('operational_fee',0)):.6f}`")

                await update.message.reply_text(
                    '\n'.join(response),
                    parse_mode=ParseMode.MARKDOWN
                )
        finally:
            context.user_data.pop('pending_replace', None)


@restrict_access(need_trading=True)
async def cancel_replace(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_replace' in context.user_data:
            context.user_data.pop('pending_replace')
            await update.message.reply_text("🗑️ Replacement canceled!")
        else:
            await update.message.reply_text("No pending replacement to cancel.")


@restrict_access(need_trading=True)
async def cancel_live_order_cmd(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if not context.args:
            await update.message.reply_text(
                "Usage: /cancel_live_order <order_id>\n"
                "Example: /cancel_live_order CUST12349\n\n"
                "⚠️ Cancels orders already on the exchange",
                parse_mode=ParseMode.MARKDOWN
            )
            return

        context.user_data['pending_live_cancel'] = context.args[0]

        await update.message.reply_text(
            f"⚡ *Confirm Live Order Cancellation*\n\n"
            f"• Order ID: `{context.args[0]}`\n\n"
            f"Reply /confirm_live_cancel to proceed or /cancel_live_cancel to abort",
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_live_cancel(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_live_cancel' not in context.user_data:
            await update.message.reply_text("No pending live cancellation!")
            return

        order_id = context.user_data['pending_live_cancel']
        try:
            result = cancel_live_order(order_id)
            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                await update.message.reply_text(
                    f"🗑️ *Live Order Cancelled*\n\n"
                    f"• ID: `{result['cancelled_id']}`\n"
                    f"• Contract: `{result['contract']}`\n"
                    f"• Canceled Qty: `{result['canceled_qty']} contracts`",
                    parse_mode=ParseMode.MARKDOWN
                )
        finally:
            context.user_data.pop('pending_live_cancel', None)


@restrict_access(need_trading=True)
async def cancel_live_cancel(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_live_cancel' in context.user_data:
            context.user_data.pop('pending_live_cancel')
            await update.message.reply_text("✅ Live cancellation aborted")
        else:
            await update.message.reply_text("No pending live cancellation")


@restrict_access(need_trading=True)
async def cancel_all_orders(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        order_type = context.args[0].lower() if context.args else None
        if order_type and order_type not in ("limit", "market"):
            await update.message.reply_text("❌ Invalid order type! Use 'limit' or 'market'")
            return

        context.user_data['pending_bulk_cancel'] = {
            'order_type': order_type,
            'timestamp': time.time()
        }

        keyboard = [
            [
                InlineKeyboardButton(
                    "💣 Confirm", callback_data="confirm_cancel_all"),
                InlineKeyboardButton(
                    "🐹 Cancel", callback_data="cancel_cancel_all")
            ]
        ]

        warning_msg = (
            f"⚡ *CONFIRM MASS CANCELLATION*\n\n"
            f"This will cancel ALL *{order_type+' ' if order_type else ''}orders*!\n\n"
            f"⚠️ Safety Features:\n"
            f"- 5-second confirmation delay\n"
            f"- Shows affected contracts\n"
            f"- Lists example cancelled ID\n\n"
            f"*This action cannot be undone!*"
        )

        await update.message.reply_text(
            warning_msg,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode=ParseMode.MARKDOWN
        )


@restrict_access(need_trading=True)
async def confirm_cancel_all(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_bulk_cancel' not in context.user_data:
            await update.message.reply_text("No pending bulk cancellation!")
            return

        try:
            result = cancel_all_orders(
                context.user_data['pending_bulk_cancel']['order_type'])
            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                msg = [
                    f"🗑️ *Mass Cancellation Complete*",
                    f"• Type: `{result['order_type'] or 'ALL'}`",
                    f"• Total Cancelled: `{result['total_cancelled']}` orders",
                    f"• Fees: `${float(result['fees'].get('trading_fee',0))+float(result['fees'].get('operational_fee',0)):.6f}`"
                ]
                if result['total_cancelled'] > 0:
                    msg.append(
                        f"\nFirst cancelled ID: `{result['cancelled_ids'][0]}`")

                await update.message.reply_text(
                    '\n'.join(msg),
                    parse_mode=ParseMode.MARKDOWN
                )
        finally:
            context.user_data.pop('pending_bulk_cancel', None)


@restrict_access(need_trading=True)
async def cancel_cancel_all(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if 'pending_bulk_cancel' in context.user_data:
            context.user_data.pop('pending_bulk_cancel')
            await update.message.reply_text("✅ Bulk cancellation aborted")
        else:
            await update.message.reply_text("No pending bulk cancellation")


@restrict_access(need_trading=True)
async def batch_actions(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if not context.args:
            await update.message.reply_text(
                "Usage: /batch <JSON actions>\n"
                "Example:\n"
                "/batch '[{\"action\":\"create_order\",\"contract\":\"BTC-24MAR24\",\"type\":\"limit\",\"quantity\":1,\"price\":50000}]'"
            )
            return

        try:
            actions = json.loads(' '.join(context.args))
            context.user_data['pending_batch'] = actions

            keyboard = [
                [InlineKeyboardButton(
                    "💣 Execute Batch", callback_data="confirm_batch")],
                [InlineKeyboardButton(
                    "❌ Cancel", callback_data="cancel_batch")]
            ]

            await update.message.reply_text(
                f"⚡ *Batch Actions Preview*\n\n"
                f"• Actions: `{len(actions)}`\n"
                f"• First Action: `{actions[0].get('action')}`\n\n"
                f"⚠️ Confirm execution:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.MARKDOWN
            )

        except json.JSONDecodeError:
            await update.message.reply_text("Invalid JSON format! Use proper JSON array syntax.")
        except Exception as e:
            await update.message.reply_text(f"Anya can't parse this! (╯°□°)╯\nError: {str(e)}")


@restrict_access(need_trading=True)
async def confirm_batch(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        query = update.callback_query
        await query.answer()

        if "pending_batch" not in context.user_data:
            await query.edit_message_text("No pending batch actions!")
            return

        try:
            result = execute_batch_actions(context.user_data["pending_batch"])

            if "error" in result:
                await query.edit_message_text(f"❌ Failed: {result['error']}")
            else:
                msg = [
                    "✅ *Batch Execution Complete*",
                    f"• TX Hash: `{result['tx_hash'][:10]}...`",
                    f"• Fees: ${float(result['fees'].get('trading_fee', 0)):.6f}",
                    f"• Events Processed: {len(result['events'])}"
                ]
                await query.edit_message_text(
                    "\n".join(msg),
                    parse_mode=ParseMode.MARKDOWN
                )
        except Exception as e:
            await query.edit_message_text(f"⚠️ Error executing batch: {str(e)}")
        finally:
            context.user_data.pop("pending_batch", None)


@restrict_access(need_trading=True)
async def set_order_timer(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if not context.args:
            await update.message.reply_text(
                "Usage: /set_timer <seconds>\n"
                "Example:\n"
                "/set_timer 60 → Sets 1-minute safety timer\n"
                "/set_timer 0 → Disables timer"
            )
            return

        try:
            timeout_sec = int(context.args[0])
            result = set_cancel_all_after(timeout_sec * 1000)

            if "error" in result:
                await update.message.reply_text(f"❌ Failed: {result['error']}")
            else:
                await update.message.reply_text(
                    f"⏳ *Safety Timer {'Set' if timeout_sec > 0 else 'Disabled'}*\n\n"
                    f"• Trigger ID: `{result['trigger_id']}`\n"
                    f"• Cancels at: `{result['trigger_time']}`\n"
                    f"• Server Time: `{result['server_time']}`",
                    parse_mode=ParseMode.MARKDOWN
                )

        except ValueError:
            await update.message.reply_text("Invalid timeout! Use whole seconds (e.g. 60)")


@restrict_access(need_trading=True)
async def check_timer_status(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        trigger_id = context.args[0] if context.args else None

        try:
            result = get_cancel_timer_status(trigger_id)

            if not result or "error" in result:
                await update.message.reply_text(f"❌ Failed: {result.get('error', 'Unknown error')}")
                return

            status_emoji = {
                "turned_off": "🔴",
                "orders_cancel_failed": "⚠️",
                "orders_canceled": "✅"
            }.get(result.get("status", ""), "🟡")

            tx_hash_display = f"\n• TX Hash: `{result['tx_hash'][:10]}...`" if result.get(
                "tx_hash") else ""
            message_display = f"\n• Message: {result['message']}" if result.get(
                "message") else ""

            response_text = (
                f"{status_emoji} *Timer Status*\n\n"
                f"• ID: `{result.get('id', 'N/A')}`\n"
                f"• Status: `{result.get('status', '').replace('_', ' ').title()}`\n"
                f"• Created: `{result.get('created_at', 'N/A')}`"
                f"{tx_hash_display}{message_display}"
            )

            await update.message.reply_text(response_text, parse_mode=ParseMode.MARKDOWN)

        except Exception as e:
            await update.message.reply_text(f"Anya can't check the timer! (×﹏×)\nError: {str(e)}")


async def button_callback(update: Update, context: CallbackContext):
    query = update.callback_query
    await query.answer()
    try:

        if query.data.startswith("copy_order_"):
            args = query.data.replace("copy_order_", "").split('_')
            if len(args) < 4:
                await query.edit_message_text("❌ Simulation args got scrambled! Try again, b-baka!")
                return

            readable_cmd = args[:4]
            if len(args) > 4:
                readable_cmd.append(args[4])
            await query.edit_message_text(
                f"📋 Copied to clipboard!\nUse: /place_order {' '.join(readable_cmd)}",
                reply_markup=None
            )
        elif query.data.startswith("copy_atomic_"):
            args = query.data.replace("copy_atomic_", "").split('_')
            readable_cmd = []
            i = 0
            while i < len(args):
                readable_cmd.extend(args[i:i+3])
                if i+3 < len(args) and args[i+1] == "limit":
                    readable_cmd.append(args[i+3])
                    i += 4
                else:
                    i += 3
            await query.edit_message_text(
                f"📋 Copied to clipboard!\nUse: /atomic_order {' '.join(readable_cmd)}",
                reply_markup=None
            )

        elif query.data == "confirm_cancel_all":
            if 'pending_bulk_cancel' not in context.user_data:
                await query.edit_message_text("❌ No pending cancellation!")
                return

            if time.time() - context.user_data['pending_bulk_cancel'].get('timestamp', 0) < 5:
                await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                return

            try:
                result = execute_cancel_all_orders(
                    context.user_data['pending_bulk_cancel']['order_type']
                )

                if "error" in result:
                    await query.edit_message_text(f"💥 Failed: {result['error']}")
                else:
                    msg = [
                        f"🗑️ *Mass Cancellation Complete*",
                        f"• Type: `{result.get('order_type') or 'ALL'}`",
                        f"• Cancelled: `{result['total_cancelled']}` orders",
                        f"• Fees: `${float(result['fees'].get('trading_fee',0)):.6f}`"
                    ]

                    if result['total_cancelled'] > 0:
                        contracts = {e['contract_id']
                                     for e in result.get('events', [])}
                        msg.append(f"\n• Contracts: {', '.join(contracts)}")
                        msg.append(
                            f"• Example ID: `{result['cancelled_ids'][0]}`")

                    await query.edit_message_text(
                        '\n'.join(msg),
                        parse_mode=ParseMode.MARKDOWN,
                        reply_markup=None
                    )

            finally:
                context.user_data.pop('pending_bulk_cancel', None)

            if query.data == "cancel_cancel_all":
                if 'pending_bulk_cancel' in context.user_data:
                    context.user_data.pop('pending_bulk_cancel')
                await query.edit_message_text(
                    "✅ *Cancellation Aborted*",
                    parse_mode=ParseMode.MARKDOWN,
                    reply_markup=None
                )
            elif query.data == "confirm_live_cancel":
                if 'pending_live_cancel' not in context.user_data:
                    await query.edit_message_text("❌ No pending cancellation!")
                    return

                if time.time() - context.user_data['pending_live_cancel'].get('timestamp', 0) < 5:
                    await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                    return

                order_id = context.user_data['pending_live_cancel']['order_id']
                result = cancel_live_order(order_id)

                if "error" in result:
                    await query.edit_message_text(f"💥 Failed: {result['error']}")
                else:
                    await query.edit_message_text(
                        f"🗑️ *Live Order Cancelled*\n\n"
                        f"• ID: `{result['cancelled_id']}`\n"
                        f"• Contract: `{result['contract']}`\n"
                        f"• Canceled Qty: `{result['canceled_qty']} contracts`",
                        parse_mode=ParseMode.MARKDOWN,
                        reply_markup=None
                    )

            elif query.data == "cancel_live_cancel":
                if 'pending_live_cancel' in context.user_data:
                    context.user_data.pop('pending_live_cancel')
                await query.edit_message_text(
                    "✅ *Cancellation Aborted*",
                    parse_mode=ParseMode.MARKDOWN,
                    reply_markup=None
                )

            elif query.data.startswith("confirm_order_"):
                if 'pending_order' not in context.user_data:
                    await query.edit_message_text("❌ No pending order!")
                    return

                if time.time() - context.user_data['pending_order']['timestamp'] < 5:
                    await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                    return

                order = context.user_data['pending_order']
                result = send_order(
                    contract=order['contract'],
                    order_type=order['type'],
                    quantity=order['quantity'],
                    price=order.get('price')
                )

                if "error" in result:
                    await query.edit_message_text(f"💥 Failed: {result['error']}")
                else:
                    await query.edit_message_text(
                        f"✅ *Order Executed*\n\n"
                        f"• ID: `{result['order_id']}`\n"
                        f"• Contract: `{result['contract']}`\n"
                        f"• Status: `{result['status']}`",
                        parse_mode=ParseMode.MARKDOWN
                    )
                context.user_data.pop('pending_order', None)

            elif query.data == "cancel_order":
                context.user_data.pop('pending_order', None)
                await query.edit_message_text("🗑️ Order canceled!")

            # ===== ATOMIC ORDERS =====
            elif query.data == "confirm_atomic":
                if 'pending_atomic' not in context.user_data:
                    await query.edit_message_text("❌ No atomic orders pending!")
                    return

                if time.time() - context.user_data['pending_atomic']['timestamp'] < 5:
                    await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                    return

                result = execute_atomic_orders(
                    context.user_data['pending_atomic']['orders'])
                if "error" in result:
                    await query.edit_message_text(f"💥 Failed: {result['error']}")
                else:
                    response = [
                        "✅ *Atomic Execution*",
                        f"• TX: `{result['tx_hash'][:10]}...`",
                        f"• Fees: ${float(result['fees'].get('trading_fee',0)):.6f}",
                        "\n*Executed Orders:*"
                    ]
                    for order in result['accepted_orders']:
                        response.append(
                            f"  - {order['contract_id']} {order['quantity_contracts']} contracts")

                    await query.edit_message_text(
                        '\n'.join(response),
                        parse_mode=ParseMode.MARKDOWN
                    )
                context.user_data.pop('pending_atomic', None)

            elif query.data == "cancel_atomic":
                context.user_data.pop('pending_atomic', None)
                await query.edit_message_text("🗑️ Atomic orders canceled!")

            # ===== ORDER REPLACEMENT =====
            elif query.data.startswith("confirm_replace_"):
                order_id = query.data.split('_')[-1]
                if 'pending_replace' not in context.user_data:
                    await query.edit_message_text("❌ No replacement pending!")
                    return

                if time.time() - context.user_data['pending_replace']['timestamp'] < 5:
                    await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                    return

                params = context.user_data['pending_replace']
                result = replace_order(
                    params['order_id'],
                    params['new_price'],
                    params['new_quantity']
                )

                if "error" in result:
                    await query.edit_message_text(f"💥 Failed: {result['error']}")
                else:
                    response = [
                        "✅ *Order Replaced*",
                        f"• New ID: `{result['new_id']}`",
                        f"• Contract: `{result['contract']}`"
                    ]
                    if result['price']:
                        response.append(f"• Price: `${result['price']}`")
                    response.append(
                        f"• Fees: `${float(result['fees'].get('trading_fee',0)):.6f}`")

                    await query.edit_message_text(
                        '\n'.join(response),
                        parse_mode=ParseMode.MARKDOWN
                    )
                context.user_data.pop('pending_replace', None)

            elif query.data == "cancel_replace":
                context.user_data.pop('pending_replace', None)
                await query.edit_message_text("🗑️ Replacement canceled!")
             # ===== BATCH ACTIONS =====
            elif query.data == "confirm_batch":
                if 'pending_batch' not in context.user_data:
                    await query.edit_message_text("❌ No batch actions pending!")
                    return

                # 5-second safety delay
                if time.time() - context.user_data['pending_batch'].get('timestamp', 0) < 5:
                    await query.edit_message_text("⏳ Too fast! Wait 5 seconds to confirm.")
                    return

                try:
                    result = execute_batch_actions(
                        context.user_data['pending_batch'])

                    if "error" in result:
                        await query.edit_message_text(f"💥 Failed: {result['error']}")
                    else:
                        msg = [
                            "✅ *Batch Execution Complete*",
                            f"• TX Hash: `{result['tx_hash'][:10]}...`",
                            f"• Fees: ${float(result['fees'].get('trading_fee', 0)):.6f}",
                            f"• Events Processed: {len(result['events'])}"
                        ]
                        await query.edit_message_text(
                            '\n'.join(msg),
                            parse_mode=ParseMode.MARKDOWN,
                            reply_markup=None
                        )
                finally:
                    context.user_data.pop('pending_batch', None)

            elif query.data == "cancel_batch":
                if 'pending_batch' in context.user_data:
                    context.user_data.pop('pending_batch')
                await query.edit_message_text(
                    "✅ *Batch Execution Canceled*",
                    parse_mode=ParseMode.MARKDOWN,
                    reply_markup=None
                )

    except Exception as e:
        logger.error(f"Button callback failed: {e}")
        await query.edit_message_text("💥 Anya messed up the buttons! (╯°□°)╯")


async def mood(update: Update, context: CallbackContext) -> None:
    from random import choice
    moods = [
        "Bullish 🐂 - Anya thinks numbers go up!",
        "Bearish 🐻 - Anya feels market is grumpy today.",
        "Sideways 🤷‍♀️ - Market is boring. Anya wants peanuts instead.",
        "Chaotic 😵‍💫 - Waku waku! Big moves coming!",
        "Cautious 🧐 - Anya senses danger...",
        "Excited 🤩 - So many opportunities today!"
    ]
    await update.message.reply_text(f"*ANYA'S MARKET MOOD*\n\n{choice(moods)}", parse_mode=ParseMode.MARKDOWN)


async def peanuts(update: Update, context: CallbackContext) -> None:
    await update.message.reply_text("*Anya loves peanuts!* 🥜\n\nThank you! Anya will work extra hard on your trades now!", parse_mode=ParseMode.MARKDOWN)


async def whoami(update: Update, context: CallbackContext):
    await update.message.reply_text(f"Your user id: {update.effective_user.username}")


def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("whoami", whoami))
    security_main(app)
    # LAUNCH
    for handler in AI_HANDLERS:
        app.add_handler(handler)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("info", help_command))
    app.add_handler(CallbackQueryHandler(help_category, pattern="^help_"))
    app.add_handler(CallbackQueryHandler(help_back, pattern="^help_back$"))
    # Market Data
    app.add_handler(CommandHandler("market", market))
    app.add_handler(CommandHandler("index", index))
    app.add_handler(CommandHandler("contracts", contracts))
    app.add_handler(CommandHandler("contract", contract))

    # Account Info
    app.add_handler(CommandHandler("portfolio", portfolio))
    app.add_handler(CommandHandler("positions", positions))
    app.add_handler(CommandHandler("orders", orders))
    app.add_handler(CommandHandler("order", order))
    app.add_handler(CommandHandler("history", history))
    app.add_handler(CommandHandler("orders_history", orders_history))
    app.add_handler(CommandHandler("transactions", transactions))
    app.add_handler(CommandHandler("position", position_details))

    # Price History
    app.add_handler(CommandHandler("index_history", index_history))
    app.add_handler(CommandHandler("contract_history", contract_history))
    app.add_handler(CommandHandler("mark_history", mark_history))
    app.add_handler(CommandHandler("ask_history", ask_history))
    app.add_handler(CommandHandler("bid_history", bid_history))
    app.add_handler(CommandHandler("order_book", order_book))
    app.add_handler(CommandHandler("latest_trades", latest_trades))
    app.add_handler(CommandHandler("contracts_history", contracts_history))

    # Trading Commands (Updated)

    for handler in TRADING_HANDLERS:
        app.add_handler(handler)

    app.add_handler(CommandHandler("place_order", place_order))
    app.add_handler(CommandHandler("place_sim_order", place_sim_order))
    app.add_handler(CommandHandler("atomic_order", atomic_order))
    app.add_handler(CommandHandler("atomic_sim_order", atomic_sim_order))
    app.add_handler(CommandHandler("reduce_order", reduce_order_cmd))
    app.add_handler(CommandHandler("replace_order", replace_order_cmd))
    app.add_handler(CommandHandler("cancel_live_order", cancel_live_order_cmd))
    app.add_handler(CommandHandler("cancel_all", cancel_all_orders))
    app.add_handler(CommandHandler("batch", batch_actions))
    app.add_handler(CallbackQueryHandler(
        confirm_batch, pattern="^confirm_batch$"))
    CallbackQueryHandler(confirm_order, pattern="^confirm_order$")
    CallbackQueryHandler(cancel_order, pattern="^cancel_order$")
    app.add_handler(CommandHandler("set_timer", set_order_timer))
    app.add_handler(CommandHandler("timer_status", check_timer_status))

    app.add_handler(CommandHandler("testapi", test_api))

    # Fun Commands
    app.add_handler(CommandHandler("mood", mood))
    app.add_handler(CommandHandler("peanuts", peanuts))

    app.run_webhook(
        listen="0.0.0.0",
        port=PORT,
        url_path=TOKEN,
        webhook_url=f"https://anya-trading-bot-3a10db3c051a.herokuapp.com/{TOKEN}"
    )

    # Button handler
    app.add_handler(CallbackQueryHandler(button_callback))

    logger.info("Anya is awaiting commands... 🧠")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
