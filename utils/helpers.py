"""Utility helper functions."""


def truncate_text(text: str, max_length: int = 4000) -> str:
    """Truncate text to fit Telegram's message limit."""
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."


def format_user_id(user_id: int) -> str:
    """Format user ID for logging."""
    return f"user_{user_id}"