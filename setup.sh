#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Ubuntu Server Setup Script for Sudan Marketing Chatbot
# Run as root or with sudo:
#   curl -sSL https://your-repo/setup.sh | sudo bash
# ============================================================

REPO_DIR="/opt/sudan-bot"
REPO_URL=""  # Set this if you have a git repo

echo "========================================="
echo "  Sudan Marketing Bot — Server Setup"
echo "========================================="

# 1. System updates
echo "[1/6] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# 2. Install Docker
echo "[2/6] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully."
else
    echo "Docker already installed."
fi

# 3. Install Docker Compose
echo "[3/6] Installing Docker Compose..."
if ! command -v docker compose &> /dev/null; then
    apt-get install -y docker-compose-plugin
    echo "Docker Compose installed."
else
    echo "Docker Compose already installed."
fi

# 4. Create project directory
echo "[4/6] Setting up project directory..."
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"

if [ -n "$REPO_URL" ]; then
    if [ -d ".git" ]; then
        git pull
    else
        git clone "$REPO_URL" .
    fi
fi

# 5. Create .env if it doesn't exist
echo "[5/6] Checking .env configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit $REPO_DIR/.env with your actual secrets!"
    echo "   Run: nano $REPO_DIR/.env"
    echo ""
fi

# 6. Build and start
echo "[6/6] Building and starting the bot..."
docker compose build --no-cache
docker compose up -d

echo ""
echo "========================================="
echo "  Setup complete!"
echo "========================================="
echo ""
echo "Useful commands:"
echo "  cd $REPO_DIR"
echo "  docker compose logs -f     # View logs"
echo "  docker compose restart     # Restart bot"
echo "  docker compose down        # Stop bot"
echo "  docker compose up -d       # Start bot"
echo ""
echo "Don't forget to edit .env with your secrets!"
echo "  nano $REPO_DIR/.env"