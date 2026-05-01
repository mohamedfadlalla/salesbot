"""
Production-ready Telegram chatbot entry point.

Usage:
    python main.py              # Start the bot
    python main.py --health     # Run health check and exit
"""

import argparse
import asyncio
import logging
import signal
import sys

from telegram.ext import Application

from config.settings import settings
from storage.database import init_db
from providers import get_provider
from bot.handlers import register_handlers
from utils.logger import setup_logging

logger = logging.getLogger(__name__)


def health_check():
    """Verify all components are functional."""
    errors = []

    # 1. Config validation
    try:
        settings.validate()
        print("✅ Config: OK")
    except ValueError as e:
        errors.append(f"Config: {e}")
        print(f"❌ Config: {e}")

    # 2. Database
    try:
        init_db()
        print("✅ Database: OK")
    except Exception as e:
        errors.append(f"Database: {e}")
        print(f"❌ Database: {e}")

    # 3. AI Provider
    try:
        provider = get_provider()
        if provider.health_check():
            print(f"✅ AI Provider ({settings.AI_PROVIDER}): OK")
        else:
            errors.append(f"AI Provider ({settings.AI_PROVIDER}): health check failed")
            print(f"❌ AI Provider ({settings.AI_PROVIDER}): health check failed")
    except Exception as e:
        errors.append(f"AI Provider: {e}")
        print(f"❌ AI Provider: {e}")

    if errors:
        print(f"\n{len(errors)} check(s) failed.")
        sys.exit(1)
    else:
        print("\nAll checks passed.")
        sys.exit(0)


async def run_bot():
    """Initialize and run the bot."""
    # Setup
    setup_logging()
    logger.info("=" * 60)
    logger.info("Starting bot...")
    logger.info("=" * 60)

    # Validate config
    settings.validate()
    settings.ensure_directories()
    logger.info("Configuration validated")

    # Init database
    init_db()

    # Health check on AI provider
    provider = get_provider()
    if not provider.health_check():
        logger.error("AI provider health check failed on startup")
        sys.exit(1)
    logger.info("AI provider (%s) is healthy", settings.AI_PROVIDER)

    # Build Telegram application
    app = Application.builder().token(settings.BOT_TOKEN).build()

    # Register handlers
    register_handlers(app)

    # Graceful shutdown
    def shutdown(sig, frame):
        logger.info("Received signal %s, shutting down...", sig)
        app.stop_running()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start polling
    logger.info("Bot is running — polling for updates...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling(drop_pending_updates=True)

    # Keep alive
    try:
        while True:
            await asyncio.sleep(3600)
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Bot stopped.")
        await app.stop()


def main():
    parser = argparse.ArgumentParser(description="Telegram Chatbot")
    parser.add_argument(
        "--health", action="store_true", help="Run health check and exit"
    )
    args = parser.parse_args()

    if args.health:
        health_check()
    else:
        asyncio.run(run_bot())


if __name__ == "__main__":
    main()