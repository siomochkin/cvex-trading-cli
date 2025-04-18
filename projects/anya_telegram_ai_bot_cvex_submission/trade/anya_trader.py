from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    CallbackContext,
    filters
)
from telegram.constants import ParseMode
import logging
from end_points_handlers.cvex_handler import send_order, estimate_order, list_contracts
from security.anya_security import restrict_access, trading_key

logger = logging.getLogger(__name__)

"""
So many ways I have approached the same thing. 
I am having loads of fun with this..
should i become a bot maker!?

"""
# states


STATE_CONTRACT = 'select_contract'
STATE_SIDE = 'select_side'
STATE_TYPE = 'select_type'
STATE_QUANTITY = 'enter_quantity'
STATE_PRICE = 'enter_price'
STATE_CONFIRM = 'confirm_order'


DUMMY_CONTRACTS = ["BTC-PERP", "ETH-PERP", "SOL-PERP"]


@restrict_access(need_trading=True)
async def start_order(update: Update, context: CallbackContext, user_id: str):
    """Entry point for interactive order flow"""
    with trading_key(user_id):
        if 'start_order' in context.user_data:
            await update.message.reply_text("🧠 Anya’s already juggling an order! Finish or /cancel it first!")
            return
        try:
            context.user_data['start_order'] = {
                'state': STATE_CONTRACT,
                'data': {},
                'is_dummy': False
            }

            try:
                contracts_data = list_contracts()
                if "⚠️ Error" in contracts_data or isinstance(contracts_data, str) and "<html" in contracts_data:
                    raise ValueError("API returned an error or HTML")
                # Assuming list_contracts returns a formatted string like "*BTC-PERP\n*ETH-PERP"
                contract_lines = contracts_data.split('\n')
                contract_symbols = [
                    line.split('*')[1] for line in contract_lines if line.startswith('*') and '*' in line
                ][:5]
            except Exception as e:
                logger.error(f"Failed to fetch contracts: {str(e)}")
                contract_symbols = DUMMY_CONTRACTS
                context.user_data['start_order']['is_dummy'] = True

            buttons = [
                [InlineKeyboardButton(
                    symbol, callback_data=f"order_contract_{symbol}")]
                for symbol in contract_symbols
            ]
            buttons.append([InlineKeyboardButton(
                "❌ Cancel", callback_data="order_cancel")])

            await update.message.reply_text(
                "📜 *Waku Waku! Select a contract to trade:*",
                reply_markup=InlineKeyboardMarkup(buttons),
                parse_mode=ParseMode.MARKDOWN
            )
        except Exception as e:
            logger.error(f"Start order failed: {str(e)}", exc_info=True)
            await update.message.reply_text(
                "💥 Anya tripped over the trading desk! (╯°□°)╯\nTry /start_order again!"
            )


async def handle_order_buttons(update: Update, context: CallbackContext):
    """Handle button callbacks"""
    query = update.callback_query
    await query.answer()
    data = query.data
    user_data = context.user_data.get('start_order', {})

    logger.info(f"Button clicked: {data}, State: {user_data.get('state')}")

    if not user_data:
        await query.edit_message_text("💥 Anya lost the order! Please /start_order again")
        return

    if data == "order_cancel":
        await query.edit_message_text("🚫 Anya cancelled the order flow! Back to spying... 🧠")
        context.user_data.pop('start_order', None)
        return

    state = user_data.get('state')

    if state == STATE_CONTRACT and data.startswith("order_contract_"):
        symbol = data.split("_")[-1]
        user_data['data']['contract'] = symbol
        user_data['state'] = STATE_SIDE

        await query.edit_message_text(
            f"⚖️ *{symbol}* - Buy or Sell, b-baka?",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton(
                    "📈 Buy", callback_data="order_side_buy")],
                [InlineKeyboardButton(
                    "📉 Sell", callback_data="order_side_sell")],
                [InlineKeyboardButton("↩ Back", callback_data="order_back")]
            ]),
            parse_mode=ParseMode.MARKDOWN
        )

    elif state == STATE_SIDE and data.startswith("order_side_"):
        side = data.split("_")[-1]
        user_data['data']['side'] = side
        user_data['state'] = STATE_TYPE

        await query.edit_message_text(
            "🔢 *Choose your order type, smarty!*",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton(
                    "Market", callback_data="order_type_market")],
                [InlineKeyboardButton(
                    "Limit", callback_data="order_type_limit")],
                [InlineKeyboardButton("↩ Back", callback_data="order_back")]
            ]),
            parse_mode=ParseMode.MARKDOWN
        )

    elif state == STATE_TYPE and data.startswith("order_type_"):
        order_type = data.split("_")[-1]
        user_data['data']['type'] = order_type
        user_data['state'] = STATE_QUANTITY

        await query.edit_message_text(
            f"🔢 *How many for this {order_type} order?*\n\n"
            "Type a number (e.g., `1.5` for 1.5 contracts)",
            parse_mode=ParseMode.MARKDOWN
        )

    elif data == "order_back":
        if state == STATE_SIDE:
            await start_order(Update(update._effective_chat.id, query.message), context)
        elif state == STATE_TYPE:
            symbol = user_data['data']['contract']
            user_data['state'] = STATE_SIDE
            await query.edit_message_text(
                f"⚖️ *{symbol}* - Buy or Sell, b-baka?",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton(
                        "📈 Buy", callback_data="order_side_buy")],
                    [InlineKeyboardButton(
                        "📉 Sell", callback_data="order_side_sell")],
                    [InlineKeyboardButton(
                        "↩ Back", callback_data="order_back")]
                ]),
                parse_mode=ParseMode.MARKDOWN
            )
        elif state == STATE_QUANTITY:
            user_data['state'] = STATE_TYPE
            await query.edit_message_text(
                "🔢 *Choose your order type, smarty!*",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton(
                        "Market", callback_data="order_type_market")],
                    [InlineKeyboardButton(
                        "Limit", callback_data="order_type_limit")],
                    [InlineKeyboardButton(
                        "↩ Back", callback_data="order_back")]
                ]),
                parse_mode=ParseMode.MARKDOWN
            )
        elif state == STATE_PRICE:
            user_data['state'] = STATE_QUANTITY
            order_type = user_data['data']['type']
            await query.edit_message_text(
                f"🔢 *How many for this {order_type} order?*\n\n"
                "Type a number (e.g., `1.5` for 1.5 contracts)",
                parse_mode=ParseMode.MARKDOWN
            )

        elif data == "order_back" and state == STATE_CONFIRM:
            user_data['state'] = STATE_PRICE if user_data['data']['type'] == 'limit' else STATE_QUANTITY
            order_type = user_data['data']['type']
            await query.edit_message_text(
                f"🔢 *How many for this {order_type} order?*\n\nType a number (e.g., `1.5` for 1.5 contracts)",
                parse_mode=ParseMode.MARKDOWN
            )


async def handle_quantity_input(update: Update, context: CallbackContext):
    """Handles text input for quantity and price"""
    user_data = context.user_data.get('start_order', {})
    if not user_data:
        await update.message.reply_text("💥 Anya lost track! Please /start_order again")
        return

    state = user_data.get('state')

    if state == STATE_QUANTITY:
        try:
            quantity = float(update.message.text)
            if quantity <= 0:
                raise ValueError("Quantity must be positive!")
            user_data['data']['quantity'] = quantity
            if user_data['data']['type'] == 'limit':
                user_data['state'] = STATE_PRICE
                await update.message.reply_text(
                    "💵 *What’s your limit price, huh?*\n\n"
                    "Type a price (e.g., `50000` for $50,000)",
                    parse_mode=ParseMode.MARKDOWN
                )
            else:
                user_data['state'] = STATE_CONFIRM
                await confirm_order(update, context)
        except ValueError:
            await update.message.reply_text("❌ Nuh uh! Enter a valid number (e.g., 1.5)")

    elif state == STATE_PRICE:
        try:
            price = float(update.message.text)
            if price <= 0:
                raise ValueError("Price must be positive!")
            user_data['data']['price'] = price
            user_data['state'] = STATE_CONFIRM
            await confirm_order(update, context)
        except ValueError:
            await update.message.reply_text("❌ Baka! Enter a valid price (e.g., 50000.50)")


async def confirm_order(update: Update, context: CallbackContext):
    user_data = context.user_data.get('start_order', {})
    if not user_data or not user_data.get('data'):
        await update.message.reply_text("💥 Anya forgot the order! Please /start_order again")
        return

    order = user_data['data']
    required_fields = ['contract', 'side', 'type', 'quantity']
    if not all(field in order for field in required_fields):
        await update.message.reply_text("💥 Missing pieces! Start over with /start_order")
        return

    if order['type'] == 'limit' and 'price' not in order:
        await update.message.reply_text("💥 Where’s the limit price? Start over!")
        return

    quantity = order['quantity']
    side = order['side']

    if user_data.get('is_dummy'):
        est = {
            'trading_fee': '0.001',
            'operational_fee': '0.0005',
            'new_leverage': '10',
            'estimated_liquidation_price': '45000' if side == 'buy' else '55000'
        }
    else:
        est = estimate_order(
            contract=order['contract'],
            order_type=order['type'],
            quantity=quantity,
            price=order.get('price') if order['type'] == 'limit' else None,
            side=side
        )

    msg = [
        f"🔮 *Order Summary*: {order['contract']}",
        f"├─ Side: {'🟢 BUY' if side == 'buy' else '🔴 SELL'}",
        f"├─ Type: {order['type'].upper()}",
        f"├─ Quantity: {quantity} contracts",
    ]
    if order['type'] == 'limit':
        msg.append(f"├─ Price: ${order['price']:.2f}")
    msg.append("└─ Ready to launch? Waku waku!")

    if est and 'error' not in est:
        msg.extend([
            "",
            "📉 *Estimated Impact*:",
            f"├─ Fees: ${float(est.get('trading_fee', 0)) + float(est.get('operational_fee', 0)):.2f}",
            f"├─ New Leverage: {est.get('new_leverage', 'N/A')}x",
            f"└─ Liq. Price: ${est.get('estimated_liquidation_price', 'N/A')}"
        ])
    else:
        logger.error(f"Estimate failed: {est.get('error', 'Unknown error')}")
        msg.append("\n⚠️ *Estimation unavailable* - Anya’s guessing for now!")

    reply_markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Confirm", callback_data="order_confirm")],
        [InlineKeyboardButton("↩ Back", callback_data="order_back")],
        [InlineKeyboardButton("❌ Cancel", callback_data="order_cancel")]
    ])

    if update.message:
        await update.message.reply_text("\n".join(msg), reply_markup=reply_markup, parse_mode=ParseMode.MARKDOWN)
    else:
        await update.edit_message_text("\n".join(msg), reply_markup=reply_markup, parse_mode=ParseMode.MARKDOWN)


async def handle_order_confirmation(update: Update, context: CallbackContext):
    query = update.callback_query
    await query.answer()

    if query.data != "order_confirm":
        return

    user_data = context.user_data.get('start_order', {})
    if not user_data or not user_data.get('data'):
        await query.edit_message_text("💥 Order vanished! Start over with /start_order")
        return

    order = user_data['data']
    quantity = order['quantity']
    side = order['side']

    try:
        if user_data.get('is_dummy'):
            result = {
                'order_id': f"IMAG-{order['contract'][:3]}{int(quantity*100)}",
                'contract': order['contract'],
                'status': 'filled'
            }
        else:
            result = send_order(
                contract=order['contract'],
                order_type=order['type'],
                quantity=quantity,
                price=order.get('price'),
                side=side
            )

        if "error" in result:
            await query.edit_message_text(f"❌ Anya failed to place the order! (×﹏×)\nError: {result['error']}")
        else:
            prefix = "🎉 *Imaginary Order Placed!* (Anya’s pretending!)" if user_data.get(
                'is_dummy') else "✅ *Order Placed! Waku Waku!* 🎉"
            await query.edit_message_text(
                f"{prefix}\n\n"
                f"• ID: `{result['order_id']}`\n"
                f"• Contract: `{result['contract']}`\n"
                f"• Status: `{result['status']}`",
                parse_mode=ParseMode.MARKDOWN
            )
    except Exception as e:
        logger.error(f"Order execution failed: {str(e)}", exc_info=True)
        await query.edit_message_text(f"💥 Anya messed up the trade! (╯°□°)╯\nError: {str(e)}")
    finally:
        context.user_data.pop('start_order', None)


async def cancel_order(update: Update, context: CallbackContext):
    if 'start_order' in context.user_data:
        context.user_data.pop('start_order')
        await update.message.reply_text("🚫 Order flow cancelled! Anya’s free now!")
    else:
        await update.message.reply_text("🤔 Nothing to cancel, b-baka!")


TRADING_HANDLERS = [
    CommandHandler("start_order", start_order),
    CommandHandler("cancel", cancel_order),
    CallbackQueryHandler(handle_order_buttons,
                         pattern=r"^order_(contract|side|type|back|cancel)"),
    CallbackQueryHandler(handle_order_confirmation,
                         pattern=r"^order_confirm$"),
    MessageHandler(filters.TEXT & ~filters.COMMAND, handle_quantity_input),
]
