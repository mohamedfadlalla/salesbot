"""Data models for storage layer."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict


@dataclass
class User:
    user_id: int
    first_name: str = ""
    username: str = ""
    first_seen: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)
    message_count: int = 0


@dataclass
class ChatMessage:
    role: str  # "system", "user", "assistant"
    content: str
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}