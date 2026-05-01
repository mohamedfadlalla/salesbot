import asyncio
import logging
from collections import defaultdict

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

from config.settings import settings
from providers import get_provider
from storage.repository import ChatRepository
from bot.system_message import SYSTEM_MESSAGE
from bot.middleware import rate_limit_check, log_incoming, log_outgoing
from storage.models import ChatMessage

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


async def _reply_after_wait(user_id: int, chat_id: int, app: Application):
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

    # Show typing indicator
    await app.bot.send_chat_action(chat_id=chat_id, action="typing")

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
        await app.bot.send_message(chat_id=chat_id, text=reply)
        await log_outgoing(user_id, reply)

    except Exception as e:
        logger.exception("Error generating response for user %d: %s", user_id, e)
        await app.bot.send_message(
            chat_id=chat_id,
            text="عذراً، حصل خطأ تقني. حاول مرة تانية بعد شوية 🙏",
        )
    finally:
        # Clean up pending task
        pending_tasks.pop(user_id, None)


# --- Telegram handlers ---

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command."""
    user = update.effective_user
    repo.upsert_user(user.id, user.first_name or "", user.username or "")
    logger.info("New user started: %d (@%s)", user.id, user.username or "N/A")

    welcome = (
        "أهلاً وسهلاً بيك! 👋\n\n"
        "أنا أحمد، مستشار تسويق رقمي متخصص في بناء الحضور الرقمي "
        "للشركات السودانية.\n\n"
        "كيف أقدر أساعدك اليوم؟"
    )
    await update.message.reply_text(welcome)
    await log_outgoing(user.id, welcome)


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /reset command — clears chat history."""
    user_id = update.effective_user.id
    repo.clear_history(user_id)
    message_buffers[user_id] = []
    if user_id in pending_tasks:
        pending_tasks[user_id].cancel()
        del pending_tasks[user_id]

    msg = "تم مسح المحادقة السابقة. نبدأ من جديد! 🔄"
    await update.message.reply_text(msg)
    logger.info("User %d reset their history", user_id)


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /stats command — show bot statistics."""
    user_count = repo.get_user_count()
    msg_count = repo.get_total_messages()
    stats_text = (
        f"📊 إحصائيات البوت:\n\n"
        f"👥 عدد المستخدمين: {user_count}\n"
        f"💬 إجمالي الرسائل: {msg_count}\n"
        f"🤖 مزود الذكاء: {settings.AI_PROVIDER}\n"
    )
    await update.message.reply_text(stats_text)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle all incoming private text messages with debouncing."""
    if not update.message or not update.message.text:
        return

    user = update.effective_user
    user_text = update.message.text.strip()
    if not user_text:
        return

    # Track user
    repo.upsert_user(user.id, user.first_name or "", user.username or "")

    # Rate limiting
    if not await rate_limit_check(update, context):
        await update.message.reply_text(
            "بطيء شوية يا صديق، أنا بحاول أوصل لكل الناس 😅"
        )
        return

    # Log incoming
    await log_incoming(update, context)

    # Buffer the message
    message_buffers[user.id].append(user_text)

    # Cancel existing timer for this user
    if user.id in pending_tasks and not pending_tasks[user.id].done():
        pending_tasks[user.id].cancel()

    # Start new debounce timer
    pending_tasks[user.id] = asyncio.create_task(
        _reply_after_wait(user.id, update.effective_chat.id, context.application)
    )


def register_handlers(app: Application):
    """Register all handlers with the application."""
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("reset", reset_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )
    logger.info("All handlers registered")