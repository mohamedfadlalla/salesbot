import logging
import time
from collections import defaultdict

from telegram import Update
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)

# Simple in-memory rate limiter: user_id -> list of timestamps
_rate_limit_windows: dict[int, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = 30       # max messages
RATE_LIMIT_WINDOW = 60.0  # per 60 seconds


async def rate_limit_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Return True if the message should be processed, False if rate-limited."""
    user_id = update.effective_user.id
    now = time.time()

    # Clean old timestamps
    _rate_limit_windows[user_id] = [
        t for t in _rate_limit_windows[user_id] if now - t < RATE_LIMIT_WINDOW
    ]

    if len(_rate_limit_windows[user_id]) >= RATE_LIMIT_MAX:
        logger.warning("Rate limited user %d", user_id)
        return False

    _rate_limit_windows[user_id].append(now)
    return True


async def log_incoming(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Log every incoming message for debugging."""
    user = update.effective_user
    text = update.message.text or update.message.caption or "[non-text]"
    # Truncate long messages in logs
    display = text[:200] + "..." if len(text) > 200 else text
    logger.info(
        "IN  | user=%d (@%s) | %s",
        user.id,
        user.username or "N/A",
        display,
    )


async def log_outgoing(user_id: int, text: str):
    """Log every outgoing message for debugging."""
    display = text[:200] + "..." if len(text) > 200 else text
    logger.info("OUT | user=%d | %s", user_id, display)