"""
Pyrogram user-client (userbot) entry point.

Runs the bot as a real Telegram user account using API_ID + API_HASH.
Reuses the same providers/ and storage/ layers as the bot-mode client.

Usage:
    This module is imported and started by main.py when TELEGRAM_MODE=user.
"""

import asyncio
import logging
from collections import defaultdict

from pyrogram import Client as PyroClient, filters
from pyrogram.enums import ChatAction
from pyrogram.types import Message

from config.settings import settings
from providers import get_provider
from storage.repository import ChatRepository
from bot.system_message import SYSTEM_MESSAGE

logger = logging.getLogger(__name__)

# --- Per-user state ---
message_buffers: dict[int, list[str]] = defaultdict(list)
pending_tasks: dict[int, asyncio.Task] = {}

# --- Shared instances ---
repo = ChatRepository()
ai_provider = get_provider()


def _build_history(user_id: int) -> list[dict]:
    """Build the full message list: system + stored history."""
    messages = [{"role": "system", "content": SYSTEM_MESSAGE}]
    history = repo.get_history(user_id, max_messages=settings.MAX_HISTORY_MESSAGES)
    for msg in history:
        messages.append(msg.to_dict())
    return messages


async def _keep_typing(client: PyroClient, chat_id: int):
    """Send typing action every 4 seconds until cancelled."""
    try:
        while True:
            await client.send_chat_action(chat_id=chat_id, action=ChatAction.TYPING)
            await asyncio.sleep(4)
    except asyncio.CancelledError:
        pass


async def _reply_after_wait(user_id: int, chat_id: int, client: PyroClient):
    """Wait for debounce period, then send the AI response."""
    try:
        await asyncio.sleep(settings.DEBOUNCE_SECONDS)
    except asyncio.CancelledError:
        return

    buffered = message_buffers.get(user_id, [])
    if not buffered:
        return
    message_buffers[user_id] = []

    combined = "\n\n".join(buffered)
    logger.info("Processing %d buffered messages for user %d", len(buffered), user_id)

    typing_task = asyncio.create_task(_keep_typing(client, chat_id))

    try:
        # Build history and add new user message
        messages = _build_history(user_id)
        messages.append({"role": "user", "content": combined})

        # Store user message
        repo.add_message(user_id, "user", combined)

        # Generate response (run in thread to not block event loop)
        loop = asyncio.get_event_loop()
        reply = await loop.run_in_executor(None, ai_provider.chat, messages)

        # Store assistant reply
        repo.add_message(user_id, "assistant", reply)

        # Send reply
        await client.send_message(chat_id=chat_id, text=reply)
        logger.info("OUT | user=%d | %s", user_id, reply[:200])

    except Exception:
        logger.exception("Error generating response for user %d", user_id)
        await client.send_message(
            chat_id=chat_id,
            text="عذراً، حصل خطأ تقني. حاول مرة تانية بعد شوية 🙏",
        )
    finally:
        typing_task.cancel()
        pending_tasks.pop(user_id, None)


# --- Simple in-memory rate limiter (mirrors bot/middleware.py) ---
_rate_limit_windows: dict[int, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = 30
RATE_LIMIT_WINDOW = 60.0


def _rate_limit_check(user_id: int) -> bool:
    """Return True if the message should be processed, False if rate-limited."""
    import time
    now = time.time()
    _rate_limit_windows[user_id] = [
        t for t in _rate_limit_windows[user_id] if now - t < RATE_LIMIT_WINDOW
    ]
    if len(_rate_limit_windows[user_id]) >= RATE_LIMIT_MAX:
        logger.warning("Rate limited user %d", user_id)
        return False
    _rate_limit_windows[user_id].append(now)
    return True


# --- Pyrogram client ---
# Store session in data/ directory for persistence across restarts
import os
_session_path = os.path.join("data", settings.SESSION_NAME)
app = PyroClient(
    _session_path,
    api_id=settings.API_ID,
    api_hash=settings.API_HASH,
)


@app.on_message(filters.private & filters.incoming & ~filters.me)
async def handle_message(client: PyroClient, message: Message):
    """Handle all incoming private text messages with debouncing."""
    user_text = message.text or message.caption or ""
    if not user_text.strip():
        return

    user = message.from_user
    user_id = user.id

    # Track user
    repo.upsert_user(user_id, user.first_name or "", user.username or "")

    # Rate limiting
    if not _rate_limit_check(user_id):
        await client.send_message(
            chat_id=message.chat.id,
            text="بطيء شوية يا صديق، أنا بحاول أوصل لكل الناس 😅",
        )
        return

    # Log incoming
    display = user_text[:200] + "..." if len(user_text) > 200 else user_text
    logger.info("IN  | user=%d (@%s) | %s", user_id, user.username or "N/A", display)

    # Buffer the message
    message_buffers[user_id].append(user_text)

    # Cancel existing timer for this user
    if user_id in pending_tasks and not pending_tasks[user_id].done():
        pending_tasks[user_id].cancel()

    # Start new debounce timer
    pending_tasks[user_id] = asyncio.create_task(
        _reply_after_wait(user_id, message.chat.id, client)
    )


@app.on_message(filters.private & filters.incoming & filters.command("start") & ~filters.me)
async def start_command(client: PyroClient, message: Message):
    """Handle /start command."""
    user = message.from_user
    repo.upsert_user(user.id, user.first_name or "", user.username or "")
    logger.info("New user started: %d (@%s)", user.id, user.username or "N/A")

    welcome = (
        "أهلاً وسهلاً بيك! 👋\n\n"
        "أنا أحمد، مستشار تسويق رقمي متخصص في بناء الحضور الرقمي "
        "للشركات السودانية.\n\n"
        "كيف أقدر أساعدك اليوم؟"
    )
    await client.send_message(chat_id=message.chat.id, text=welcome)


@app.on_message(filters.private & filters.incoming & filters.command("reset") & ~filters.me)
async def reset_command(client: PyroClient, message: Message):
    """Handle /reset command — clears chat history."""
    user_id = message.from_user.id
    repo.clear_history(user_id)
    message_buffers[user_id] = []
    if user_id in pending_tasks:
        pending_tasks[user_id].cancel()
        del pending_tasks[user_id]

    msg = "تم مسح المحادقة السابقة. نبدأ من جديد! 🔄"
    await client.send_message(chat_id=message.chat.id, text=msg)
    logger.info("User %d reset their history", user_id)


@app.on_message(filters.private & filters.incoming & filters.command("stats") & ~filters.me)
async def stats_command(client: PyroClient, message: Message):
    """Handle /stats command — show bot statistics."""
    user_count = repo.get_user_count()
    msg_count = repo.get_total_messages()
    stats_text = (
        f"📊 إحصائيات البوت:\n\n"
        f"👥 عدد المستخدمين: {user_count}\n"
        f"💬 إجمالي الرسائل: {msg_count}\n"
        f"🤖 مزود الذكاء: {settings.AI_PROVIDER}\n"
    )
    await client.send_message(chat_id=message.chat.id, text=stats_text)


async def run_user_client():
    """Start the Pyrogram user client and keep alive."""
    logger.info("=" * 60)
    logger.info("Starting user client (Pyrogram)...")
    logger.info("=" * 60)

    await app.start()
    logger.info("User client is running...")

    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("User client stopped.")
        await app.stop()