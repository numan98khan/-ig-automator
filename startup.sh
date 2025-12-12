#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "🚀 Starting AI Instagram Inbox"
echo "========================================="

# Ensure script runs from project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "📂 Working directory: $SCRIPT_DIR"

# ---- Runtime environment -----------------------------------------------
echo ""
echo "⚙️  Configuring runtime environment..."

# Railway injects $PORT; default to 5000 for local development
: "${PORT:=5000}"
echo "   Port: $PORT"

# Set Node environment
export NODE_ENV="${NODE_ENV:-production}"
echo "   Node environment: $NODE_ENV"

# ---- MongoDB Connection -----------------------------------------------
echo ""
echo "🔗 Database Configuration..."

if [[ -n "${DATABASE_URL:-}" ]]; then
  # Railway PostgreSQL URL - convert to MongoDB if needed
  # Or use MONGODB_URI if Railway provides it
  echo "   Using DATABASE_URL from Railway"
  export MONGODB_URI="${DATABASE_URL}"
elif [[ -n "${MONGODB_URI:-}" ]]; then
  echo "   Using MONGODB_URI"
  # Show first 30 chars only for security
  echo "   MongoDB: ${MONGODB_URI:0:30}..."
else
  echo "⚠️  No MongoDB URI found!"
  echo "   Set MONGODB_URI in Railway dashboard"
  echo "   Example: mongodb+srv://user:pass@cluster.mongodb.net/instagram-inbox"
  exit 1
fi

# ---- OpenAI API Key -----------------------------------------------
echo ""
echo "🤖 AI Configuration..."

if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "   OpenAI API Key: ${OPENAI_API_KEY:0:10}..."
  echo "✅ OpenAI configured"
else
  echo "⚠️  OPENAI_API_KEY not set!"
  echo "   AI reply generation will not work"
  echo "   Set OPENAI_API_KEY in Railway dashboard"
fi

# ---- JWT Secret -----------------------------------------------
echo ""
echo "🔐 Authentication Configuration..."

if [[ -z "${JWT_SECRET:-}" ]]; then
  echo "⚠️  JWT_SECRET not set, generating random secret..."
  export JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || echo 'default-jwt-secret-please-change')"
  echo "   Generated JWT secret (set JWT_SECRET in Railway for persistence)"
else
  echo "✅ JWT secret configured"
fi

# ---- Frontend Check ---------------------------------------------------
echo ""
echo "========================================="
echo "🎨 Checking React Frontend Build"
echo "========================================="

if [[ -d "frontend/dist" ]]; then
  echo "✅ Frontend build found at frontend/dist"
  echo "   (Built during Railway build phase)"
else
  echo "⚠️  Frontend dist not found"
  echo "   Attempting to build now..."
  cd frontend
  npm run build || echo "⚠️  Frontend build failed"
  cd ..
fi

# ---- Launch Node.js Backend -----------------------------------------------
echo ""
echo "========================================="
echo "🚀 Launching Node.js + Express Backend"
echo "========================================="
echo "   Host: 0.0.0.0"
echo "   Port: $PORT"
echo "   Backend: backend-new/dist"
echo ""

cd backend-new

# Export PORT for the Node app
export PORT="$PORT"

# Start the Node.js backend
if [[ -d "dist" ]]; then
  echo "✅ Starting production server..."
  exec node dist/index.js
else
  echo "⚠️  No dist found, attempting TypeScript compilation..."
  npm run build
  exec node dist/index.js
fi
