"""
OpenRouter provider — ready to use.
To activate: set AI_PROVIDER=openrouter and OPENROUTER_API_KEY in .env,
then register it in providers/__init__.py.
"""

import logging
from typing import List, Dict

import httpx

from config.settings import settings
from providers.base import AIProvider

logger = logging.getLogger(__name__)


class OpenRouterProvider(AIProvider):
    BASE_URL = "https://openrouter.ai/api/v1/chat/completions"

    def __init__(self):
        self._api_key = settings.OPENROUTER_API_KEY
        self._model = settings.OPENROUTER_MODEL
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
        logger.info("OpenRouterProvider initialized (model=%s)", self._model)

    def chat(self, messages: List[Dict[str, str]]) -> str:
        payload = {
            "model": self._model,
            "messages": messages,
        }
        response = self._client.post(self.BASE_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]

    def health_check(self) -> bool:
        try:
            payload = {
                "model": self._model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 5,
            }
            response = self._client.post(self.BASE_URL, json=payload)
            return response.status_code == 200
        except Exception as e:
            logger.error("OpenRouter health check failed: %s", e)
            return False