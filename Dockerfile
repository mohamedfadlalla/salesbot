FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create directories for data and logs
RUN mkdir -p data logs

# Health check
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
    CMD python main.py --health || exit 1

# Run the bot
CMD ["python", "main.py"]