FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package info and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Create directories for data and logs
RUN mkdir -p data logs

# Health check
HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
    CMD node dist/main.js --health || exit 1

# Run the bot
CMD ["node", "dist/main.js"]
