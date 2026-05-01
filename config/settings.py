import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")


class Settings:
    """Centralized configuration. All secrets come from environment variables."""

    # --- Telegram ---
    BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")

    # --- AI Provider ---
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "ollama")

    # Ollama
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "https://ollama.com")
    OLLAMA_API_KEY: str = os.getenv("OLLAMA_API_KEY", "")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma3:27b")

    # OpenRouter
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")

    # Gemini
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # --- Bot Behavior ---
    DEBOUNCE_SECONDS: float = float(os.getenv("DEBOUNCE_SECONDS", "3.0"))
    MAX_HISTORY_MESSAGES: int = int(os.getenv("MAX_HISTORY_MESSAGES", "20"))

    # --- Paths ---
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", "data/bot.db")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/bot.log")

    def validate(self):
        """Raise immediately if required config is missing."""
        errors = []
        if not self.BOT_TOKEN:
            errors.append("BOT_TOKEN is required")
        if self.AI_PROVIDER == "ollama" and not self.OLLAMA_API_KEY:
            errors.append("OLLAMA_API_KEY is required when AI_PROVIDER=ollama")
        if self.AI_PROVIDER == "openrouter" and not self.OPENROUTER_API_KEY:
            errors.append("OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter")
        if self.AI_PROVIDER == "gemini" and not self.GEMINI_API_KEY:
            errors.append("GEMINI_API_KEY is required when AI_PROVIDER=gemini")
        if errors:
            raise ValueError(
                "Configuration errors:\n" + "\n".join(f"  - {e}" for e in errors)
            )

    def ensure_directories(self):
        """Create data/ and logs/ if they don't exist."""
        Path(self.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
        Path(self.LOG_FILE).parent.mkdir(parents=True, exist_ok=True)


settings = Settings()