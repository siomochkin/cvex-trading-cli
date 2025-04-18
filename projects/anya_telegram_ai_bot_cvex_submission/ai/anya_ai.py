import os
from dotenv import load_dotenv
from openai import AsyncOpenAI
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import CommandHandler, CallbackQueryHandler, CallbackContext
from telegram.constants import ParseMode
import json
import logging

from security.anya_security import restrict_access, trading_key

load_dotenv()
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

logger = logging.getLogger(__name__)


@restrict_access(need_trading=True)
async def anya_command(update: Update, context: CallbackContext, user_id: str):
    with trading_key(user_id):
        if not context.args:
            # Casual chat response
            await update.message.reply_text("Waku waku! Hiii, b-baka! What’s on your mind? Wanna trade or just chat?")
            return

        query = " ".join(context.args).lower()
        if "analyse" in query or "analyze" in query:
            await analyze_market(update, context)
        elif any(word in query for word in ["buy", "sell", "trade", "order"]):
            await process_order(update, context, query, is_dummy=False)
        else:
            # Casual fallback with OpenAI
            prompt = [
                {"role": "system", "content": "You’re Anya from spy x family acting as a playful trading assistant! Respond to casual chat with fun and sass. But return user focus to trading as you are not a chatbot. But a well respected trading assistant with psychic powers."},
                {"role": "user", "content": query}
            ]
            response = await openai_client.chat.completions.create(model="gpt-3.5-turbo", messages=prompt)
            await update.message.reply_text(response.choices[0].message.content)


async def process_order(update: Update, context: CallbackContext, query: str, is_dummy: bool):
    from end_points_handlers.cvex_handler import list_contracts
    contracts_data = list_contracts()

    if "⚠️ Error" in contracts_data and "403" in contracts_data:
        await update.message.reply_text("🚫 Anya can’t trade right now—spy network’s throwing a tantrum (403 error)! Try later, b-baka!")
        return

    contracts_list = (
        [line.split('*')[1].strip()
         for line in contracts_data.split('\n') if line.startswith('*')]
        if "⚠️ Error" not in contracts_data else ["BTC-PERP", "ETH-PERP", "SOL-PERP"]
    )

    prompt = [
        {"role": "system", "content": f"""You’re Anya, a playful trading assistant! Parse this into order parameters:
Available contracts: {', '.join(contracts_list)}
Extract: contract, orderSide ("buy"/"sell"), orderType ("market"/"limit"), quantity (decimal), limitPrice (if limit).
Defaults: orderType="market", quantity=1. Return JSON. Add a fun comment!"""},
        {"role": "user", "content": query}
    ]

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=prompt,
            response_format={"type": "json_object"}
        )
        order = json.loads(response.choices[0].message.content)
    except Exception as e:
        await update.message.reply_text(f"😵 Anya’s brain fritzed! Error: {str(e)}")
        return

    if order.get("contract") not in contracts_list:
        await update.message.reply_text(f"❌ Anya can’t find {order.get('contract', 'that contract')}! Pick from: {', '.join(contracts_list)}")
        return
    if not order.get("orderSide"):
        await update.message.reply_text("⚖️ Buy or sell, b-baka? Tell Anya!")
        return

    context.user_data['start_order'] = {
        'state': 'confirm_order',
        'data': {
            'contract': order['contract'],
            'side': order['orderSide'],
            'type': order.get('orderType', 'market'),
            'quantity': order.get('quantity', 1),
            'price': order.get('limitPrice') if order.get('orderType') == 'limit' else None
        },
        # Dummy if API fails.. for testing purposes
        'is_dummy': is_dummy or "⚠️ Error" in contracts_data
    }
    from trade.anya_trader import confirm_order
    await confirm_order(update, context)


async def analyze_market(update: Update, context: CallbackContext):
    from end_points_handlers.cvex_handler import list_contracts, get_contract_details
    contracts_data = list_contracts()

    if "⚠️ Error" in contracts_data and "403" in contracts_data:
        await update.message.reply_text("🚫 Anya can’t spy the market—Cloudflare’s being a meanie (403 error)! Try later!")
        return

    contracts_list = (
        [line.split('*')[1].strip()
         for line in contracts_data.split('\n') if line.startswith('*')]
        if "⚠️ Error" not in contracts_data else ["BTC-PERP", "ETH-PERP", "SOL-PERP"]
    )
    is_dummy = "⚠️ Error" in contracts_data

    market_data = []
    for contract in contracts_list[:3]:
        if is_dummy:
            market_data.append({'symbol': contract, 'last_price': '50000',
                               'price_change_24h': '2.5%', 'volume_24h': '1000000'})
        else:
            details = get_contract_details(contract)
            if "⚠️ Error" in details and "403" in details:
                await update.message.reply_text("🚫 Anya’s market scan failed—403 error! Can’t trade now, b-baka!")
                return
            elif "⚠️ Error" not in details:
                lines = details.split('\n')
                market_data.append({
                    'symbol': contract,
                    'last_price': lines[3].split('$')[1].strip(),
                    'volume_24h': lines[6].split(': ')[1].strip(),
                    'price_change_24h': 'N/A'  # TODO: Add real data from history
                })

    prompt = [
        {"role": "system", "content": """You’re Anya, a crypto trading expert with a playful streak! Analyze this market data and suggest 1-2 trades:
Consider price, volume, etc. For each: symbol, action ("buy"/"sell"), price, size ("small"/"medium"/"large"), rationale (fun, short). Format as "1. " list."""},
        {"role": "user", "content": json.dumps(market_data, indent=2)}
    ]

    try:
        response = await openai_client.chat.completions.create(model="gpt-4o", messages=prompt)
        suggestions = response.choices[0].message.content
    except Exception as e:
        await update.message.reply_text(f"😵 Anya’s analysis broke! Error: {str(e)}")
        return

    buttons = [[InlineKeyboardButton(f"{line.split()[2].capitalize()} {line.split()[1]}",
                                     callback_data=f"ai_trade_{line.split()[1]}_{line.split()[2]}_market_1")]
               for line in suggestions.split('\n') if line.strip().startswith(('1.', '2.'))]
    buttons.append([InlineKeyboardButton(
        "❌ Nope!", callback_data="ai_cancel")])

    await update.message.reply_text(f"📊 *Anya’s Market Scoop!*\n\n{suggestions}",
                                    reply_markup=InlineKeyboardMarkup(buttons),
                                    parse_mode=ParseMode.MARKDOWN)


async def handle_ai_buttons(update: Update, context: CallbackContext):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "ai_cancel":
        context.user_data.pop('start_order', None)
        await query.edit_message_text("🚫 Anya’s trade ideas ignored! Back to spying... 🧠")
        return
    if data.startswith("ai_trade_"):
        from end_points_handlers.cvex_handler import list_contracts
        contracts_data = list_contracts()
        if "⚠️ Error" in contracts_data and "403" in contracts_data:
            await query.edit_message_text("🚫 Anya can’t trade—403 error’s blocking the spy network! Try later!")
            return

        _, contract, side, order_type, quantity = data.split('_')
        context.user_data['start_order'] = {
            'state': 'confirm_order',
            'data': {
                'contract': contract,
                'side': side,
                'type': order_type,
                'quantity': float(quantity),
                'price': None  # Market order for now
            },
            'is_dummy': "⚠️ Error" in contracts_data
        }
        from trade.anya_trader import confirm_order
        await confirm_order(update, context)

AI_HANDLERS = [
    CommandHandler("anya", anya_command),
    CallbackQueryHandler(handle_ai_buttons, pattern=r"^ai_(trade|cancel)")
]
