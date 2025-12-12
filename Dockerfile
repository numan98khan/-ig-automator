# Railway Dockerfile for AI Instagram Inbox
# Node.js + Express + TypeScript backend with React frontend

FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy root package files (if any)
COPY package*.json* ./

# Copy backend
COPY backend-new/package*.json ./backend-new/
WORKDIR /app/backend-new
RUN npm install

# Copy backend source
COPY backend-new/ ./

# Build backend TypeScript
RUN npm run build

# Copy and build frontend
WORKDIR /app
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install
COPY frontend/ ./
RUN npm run build

# Back to app root
WORKDIR /app

# Copy startup script
COPY startup.sh ./
RUN chmod +x startup.sh

# Expose port (Railway will set PORT env var, but we default to 5000)
EXPOSE 5000

# Use startup script
CMD ["./startup.sh"]
