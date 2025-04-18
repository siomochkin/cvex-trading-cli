from contextlib import contextmanager
from typing import Generator, Union, Tuple
from functools import wraps
import os
import sqlite3
import logging
from dotenv import load_dotenv
from telegram import Update
from telegram.ext import CommandHandler, MessageHandler, filters, CallbackContext
from telegram.constants import ParseMode
from cryptography.fernet import Fernet
import end_points_handlers.cvex_handler as cvex_handler

load_dotenv()
MASTER_KEY = os.getenv("MASTER_KEY")
if not MASTER_KEY:
    raise ValueError(
        "MASTER_KEY not set in .env! Generate with Fernet.generate_key()")
cipher = Fernet(MASTER_KEY)

DB_PATH = "db/anya.db"
SUPPORT_LINK = "t.me/anyatraderbot69"

logging.basicConfig(
    format="%(asctime)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, trading_key TEXT, readonly_key TEXT)")
    conn.commit()
    conn.close()


def encrypt_key(key):
    return cipher.encrypt(key.encode()).decode()


def decrypt_key(encrypted_key):
    return cipher.decrypt(encrypted_key.encode()).decode()


def store_key(user_id, key_type, key):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    encrypted_key = encrypt_key(key)
    if key_type == "trading":
        c.execute("INSERT OR REPLACE INTO users (user_id, trading_key) VALUES (?, ?)",
                  (user_id, encrypted_key))
    elif key_type == "readonly":
        c.execute("INSERT OR REPLACE INTO users (user_id, readonly_key) VALUES (?, ?)",
                  (user_id, encrypted_key))
    conn.commit()
    conn.close()


def get_user_keys(user_id: str, username: str = None):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT trading_key, readonly_key FROM users WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()

    if result and (result[0] or result[1]):
        return (decrypt_key(result[0]) if result[0] else None, decrypt_key(result[1]) if result[1] else None)
    elif username == "DanOdin":
        return "anya2.pem", os.getenv("CVEX_API_KEY")
    return None, None


async def setreadonlykey(update: Update, context: CallbackContext):
    if not context.args:
        await update.message.reply_text(
            "⚠️ Usage: /setreadonlykey <API_KEY>\nExample: /setreadonlykey 2edf443f0db5137b155c..."
        )
        return
    user_id = str(update.effective_user.id)
    key = " ".join(context.args).strip()
    try:
        store_key(user_id, "readonly", key)
        with readonly_key(user_id):
            result = cvex_handler.fetch_market_data()
            if isinstance(result, str) and "⚠️" in result:
                raise ValueError(result[2:])
        await update.message.reply_text("✅ Read-only key saved and verified!")
    except Exception as e:
        await update.message.reply_text(f"❌ Anya unfortunately failed to set up your key: {str(e)}")


async def settradingkey(update: Update, context: CallbackContext):
    context.user_data["expecting_key"] = "trading"
    await update.message.reply_text(
        "📤 Upload your .pem file now!\nAnya will secure it faster than peanuts disappear!"
    )


async def handle_key_upload(update: Update, context: CallbackContext):
    if not update.message.document:
        return
    user_id = str(update.effective_user.id)
    if not update.message.document.file_name.endswith(".pem"):
        await update.message.reply_text("❌ Trading key must be a .pem file!")
        return
    try:
        file = await update.message.document.get_file()
        key = (await file.download_as_bytearray()).decode().strip()
        store_key(user_id, "trading", key)
        with trading_key(user_id):
            result = cvex_handler.get_portfolio_overview(user_id)
            if isinstance(result, str) and "⚠️" in result:
                raise ValueError(result[2:])
        await update.message.reply_text("🔐 Trading key secured and verified!")
        context.user_data.pop("expecting_key", None)
    except Exception as e:
        await update.message.reply_text(f"⚠️ Anya tripped! {str(e)}")


async def support(update: Update, context: CallbackContext):
    await update.message.reply_text(f"Need help? Join [t.me/anyatraderbot69] for Anya’s support crew!", parse_mode=ParseMode.MARKDOWN)


def restrict_access(need_trading: bool = False):
    def decorator(func):
        @wraps(func)
        async def wrapper(update: Update, context: CallbackContext, *args, **kwargs):
            if update.effective_chat.type != "private":
                await update.message.reply_text("🔒 Anya only works in private chats!", parse_mode=ParseMode.MARKDOWN)
                return
            user_id = str(update.effective_user.id)
            username = update.effective_user.username
            trading_key, readonly_key = get_user_keys(user_id, username)
            if need_trading:
                if not trading_key:
                    await show_key_required(update, trading=True)
                    return
            elif not readonly_key:
                await show_key_required(update, trading=False)
                return
            return await func(update, context, user_id=user_id, *args, **kwargs)
        return wrapper
    return decorator


async def show_key_required(update: Update, trading: bool):
    key_type = "trading" if trading else "read-only"
    command = "/settradingkey" if trading else "/setreadonlykey"
    await update.message.reply_text(
        f"🔐 {key_type.capitalize()} key required!\nUse {command} to configure your keys.\n\nNeed help? Visit @anyatraderbot69",
        parse_mode=ParseMode.MARKDOWN
    )


def delete_keys(user_id: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()


async def cancel_key_setup(update: Update, context: CallbackContext):
    if "expecting_key" in context.user_data:
        context.user_data.pop("expecting_key")
        await update.message.reply_text("🚫 Key setup cancelled")
    else:
        await update.message.reply_text("No active key setup to cancel")


@contextmanager
def readonly_key(user_id: str) -> Generator[None, None, None]:
    _, readonly_key = get_user_keys(user_id)
    original_key = cvex_handler.API_KEY
    cvex_handler.API_KEY = readonly_key
    try:
        yield
    finally:
        cvex_handler.API_KEY = original_key


@contextmanager
def trading_key(user_id: str) -> Generator[None, None, None]:
    trading_key, _ = get_user_keys(user_id)
    original_key = cvex_handler.PRIVATE_KEY_PATH
    cvex_handler.PRIVATE_KEY_PATH = trading_key
    try:
        yield
    finally:
        cvex_handler.PRIVATE_KEY_PATH = original_key


def main(app):
    init_db()
    app.add_handler(CommandHandler("setreadonlykey", setreadonlykey))
    app.add_handler(CommandHandler("settradingkey", settradingkey))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_key_upload))
    app.add_handler(CommandHandler("support", support))
    app.add_handler(CommandHandler("cancel", cancel_key_setup))
