# Railway Dockerfile for AI Instagram Inbox
# Node.js + Express + TypeScript backend with React frontend

FROM node:20-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps

# Backend deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund

# Frontend deps
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build

WORKDIR /app
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
RUN npm run build

WORKDIR /app/frontend
RUN npm run build

FROM base AS runtime

WORKDIR /app

# Production backend deps only
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/backend/dist ./dist

# Frontend build output
WORKDIR /app
COPY --from=build /app/frontend/dist ./frontend/dist

# Startup script
COPY startup.sh ./
RUN chmod +x startup.sh

# Expose port (Railway will set PORT env var, but we default to 5000)
EXPOSE 5000

# Use startup script
CMD ["./startup.sh"]
