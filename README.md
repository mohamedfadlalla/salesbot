# Sudan Marketing Chatbot 🤖

A production-ready Telegram chatbot for a Sudanese digital marketing consultancy. Built with Python and a pluggable AI provider system.

**Supports two Telegram modes:**
- **Bot mode** (default): Uses a bot account via `python-telegram-bot` + BotFather token
- **User mode**: Uses a real Telegram user account via `Pyrogram` + API_ID/API_HASH

## Architecture

```
├── config/          # Settings, env validation
├── providers/       # AI model providers (Ollama, OpenRouter, Gemini)
├── bot/             # Telegram handlers, system prompt, middleware
├── storage/         # SQLite database, models, repository
├── utils/           # Logging, helpers
├── main.py          # Entry point
├── Dockerfile       # Container image
├── docker-compose.yml
└── setup.sh         # One-command Ubuntu server setup
```

## Telegram Mode Configuration

The bot supports two authentication modes, selected via `TELEGRAM_MODE` in `.env`:

### Bot Mode (default) — `TELEGRAM_MODE=bot`

Uses a bot account created via [@BotFather](https://t.me/BotFather).

1. Open Telegram, search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Add to `.env`:
   ```
   TELEGRAM_MODE=bot
   BOT_TOKEN=123456:ABC-DEF...
   ```

### User Mode — `TELEGRAM_MODE=user`

Uses a real Telegram user account (phone number) via Pyrogram.

1. Go to [https://my.telegram.org](https://my.telegram.org) and log in
2. Click **"API development tools"**
3. Create a new application (any name works)
4. Copy the `api_id` (integer) and `api_hash` (string)
5. Add to `.env`:
   ```
   TELEGRAM_MODE=user
   API_ID=12345678
   API_HASH=abcdef1234567890abcdef1234567890
   SESSION_NAME=userbot_session
   ```
6. On first run, Pyrogram will ask for your **phone number** and **verification code** in the terminal
7. The session file is saved in `data/` so you only need to verify once

> **Note:** In user mode, the account acts as a real user. It will only respond to private messages from other users (not itself). The session file in `data/` preserves your login across restarts.

## Quick Start (Local Development)

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd chatbot
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or: venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

2. **Configure:**
   ```bash
   cp .env.example .env
   nano .env  # Add your BOT_TOKEN and OLLAMA_API_KEY
   ```

3. **Run:**
   ```bash
   python main.py
   ```

4. **Health check:**
   ```bash
   python main.py --health
   ```

## Deployment (Ubuntu Server)

### Option A: Docker (Recommended)

```bash
# On your server:
git clone <repo-url> /opt/sudan-bot
cd /opt/sudan-bot
cp .env.example .env
nano .env  # Add your secrets
docker compose up -d
```

Or use the automated setup:
```bash
curl -sSL https://your-repo/setup.sh | sudo bash
```

### Option B: Systemd Service

```bash
sudo cp systemd/sudan-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable sudan-bot
sudo systemctl start sudan-bot
```

## Switching AI Providers

Edit `.env`:

```bash
# Ollama (default)
AI_PROVIDER=ollama
OLLAMA_API_KEY=your_key
OLLAMA_MODEL=gemma3:27b

# OpenRouter
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=google/gemini-2.0-flash-001

# Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.0-flash
```

## Adding a New AI Provider

1. Create `providers/my_provider.py` subclassing `AIProvider`
2. Implement `chat(messages)` and `health_check()`
3. Register in `providers/__init__.py`:
   ```python
   from providers.my_provider import MyProvider
   _PROVIDER_REGISTRY["my_provider"] = MyProvider
   ```
4. Set `AI_PROVIDER=my_provider` in `.env`

## Bot Commands

| Command   | Description                          |
|-----------|--------------------------------------|
| `/start`  | Start conversation with welcome msg  |
| `/reset`  | Clear chat history                   |
| `/stats`  | Show bot statistics                  |

## Logs

```bash
# Docker
docker compose logs -f

# Systemd
journalctl -u sudan-bot -f

# Direct file
tail -f logs/bot.log
```

## Database

SQLite database at `data/bot.db`. Query it directly:

```bash
sqlite3 data/bot.db "SELECT * FROM users;"
sqlite3 data/bot.db "SELECT * FROM chat_history WHERE user_id=12345;"
```

## Project Structure Decisions

- **Provider Pattern**: Swap AI backends by changing one env var
- **SQLite**: Zero-config persistence, survives restarts
- **Debouncing**: Buffers rapid messages, sends one response
- **Rate Limiting**: 30 msg/min per user prevents abuse
- **Rotating Logs**: 5MB per file, 3 backups, never fills disk