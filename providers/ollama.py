import logging
from typing import List, Dict

from ollama import Client as OllamaClient

from config.settings import settings
from providers.base import AIProvider

logger = logging.getLogger(__name__)


class OllamaProvider(AIProvider):
    """Ollama Cloud provider — uses the Ollama Python SDK with streaming."""

    def __init__(self):
        self._client = OllamaClient(
            host=settings.OLLAMA_HOST,
            headers={"Authorization": f"Bearer {settings.OLLAMA_API_KEY}"},
        )
        self._model = settings.OLLAMA_MODEL
        logger.info("OllamaProvider initialized (host=%s, model=%s)", settings.OLLAMA_HOST, self._model)

    def chat(self, messages: List[Dict[str, str]]) -> str:
        reply = ""
        for part in self._client.chat(
            self._model, messages=messages, stream=True
        ):
            content = part.get("message", {}).get("content", "")
            reply += content
        return reply

    def health_check(self) -> bool:
        try:
            # A minimal request to verify connectivity
            self._client.list()
            return True
        except Exception as e:
            logger.error("Ollama health check failed: %s", e)
            return False