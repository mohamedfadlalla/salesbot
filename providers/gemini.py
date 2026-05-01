"""
Google Gemini provider — ready to use.
To activate: set AI_PROVIDER=gemini and GEMINI_API_KEY in .env,
then register it in providers/__init__.py.
"""

import logging
from typing import List, Dict

import google.generativeai as genai

from config.settings import settings
from providers.base import AIProvider

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self._model = genai.GenerativeModel(settings.GEMINI_MODEL)
        logger.info("GeminiProvider initialized (model=%s)", settings.GEMINI_MODEL)

    def chat(self, messages: List[Dict[str, str]]) -> str:
        # Convert OpenAI-style messages to Gemini format
        # Gemini uses "user" and "model" roles
        gemini_messages = []
        system_content = ""
        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            elif msg["role"] == "assistant":
                gemini_messages.append({"role": "model", "parts": [msg["content"]]})
            else:
                gemini_messages.append({"role": "user", "parts": [msg["content"]]})

        # Prepend system instruction if present
        if system_content:
            self._model._system_instruction = system_content

        chat = self._model.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
        response = chat.send_message(gemini_messages[-1]["parts"][0])
        return response.text

    def health_check(self) -> bool:
        try:
            self._model.generate_content("ping", generation_config={"max_output_tokens": 5})
            return True
        except Exception as e:
            logger.error("Gemini health check failed: %s", e)
            return False