import logging
from typing import List, Optional

from storage.database import get_connection
from storage.models import ChatMessage

logger = logging.getLogger(__name__)


class ChatRepository:
    """All database operations for chat history and user tracking."""

    # --- User operations ---

    def upsert_user(self, user_id: int, first_name: str = "", username: str = ""):
        """Insert or update a user record."""
        conn = get_connection()
        try:
            conn.execute(
                """
                INSERT INTO users (user_id, first_name, username, message_count)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(user_id) DO UPDATE SET
                    first_name = excluded.first_name,
                    username = excluded.username,
                    last_seen = CURRENT_TIMESTAMP,
                    message_count = message_count + 1
                """,
                (user_id, first_name, username),
            )
            conn.commit()
        finally:
            conn.close()

    def get_user_count(self) -> int:
        conn = get_connection()
        try:
            row = conn.execute("SELECT COUNT(*) as cnt FROM users").fetchone()
            return row["cnt"]
        finally:
            conn.close()

    def get_total_messages(self) -> int:
        conn = get_connection()
        try:
            row = conn.execute("SELECT COALESCE(SUM(message_count), 0) as cnt FROM users").fetchone()
            return row["cnt"]
        finally:
            conn.close()

    # --- Chat history operations ---

    def get_history(self, user_id: int, max_messages: int = 20) -> List[ChatMessage]:
        """Get recent chat history for a user, oldest first."""
        conn = get_connection()
        try:
            rows = conn.execute(
                """
                SELECT role, content, created_at
                FROM chat_history
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, max_messages),
            ).fetchall()
            # Reverse to get chronological order
            return [
                ChatMessage(role=row["role"], content=row["content"])
                for row in reversed(rows)
            ]
        finally:
            conn.close()

    def add_message(self, user_id: int, role: str, content: str):
        """Store a single message."""
        conn = get_connection()
        try:
            conn.execute(
                "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
                (user_id, role, content),
            )
            conn.commit()
        finally:
            conn.close()

    def clear_history(self, user_id: int):
        """Delete all history for a user."""
        conn = get_connection()
        try:
            conn.execute("DELETE FROM chat_history WHERE user_id = ?", (user_id,))
            conn.commit()
            logger.info("Cleared chat history for user %d", user_id)
        finally:
            conn.close()