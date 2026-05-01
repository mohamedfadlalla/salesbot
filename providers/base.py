from abc import ABC, abstractmethod
from typing import List, Dict


class AIProvider(ABC):
    """Abstract base class for all AI model providers.

    To add a new provider:
    1. Create a file in providers/ (e.g. providers/openrouter.py)
    2. Subclass AIProvider and implement `chat()`
    3. Register it in providers/__init__.py
    """

    @abstractmethod
    def chat(self, messages: List[Dict[str, str]]) -> str:
        """Send a list of messages and return the assistant's reply.

        Args:
            messages: List of dicts with 'role' and 'content' keys.
                      First message is typically {'role': 'system', 'content': '...'}

        Returns:
            The assistant's response text.
        """
        pass

    @abstractmethod
    def health_check(self) -> bool:
        """Return True if the provider is reachable and functional."""
        pass