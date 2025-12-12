#!/usr/bin/env bash
set -euo pipefail

echo "========================================="
echo "🚀 Starting Document RAG Application"

echo "========================================="

# Activate Python virtual environment if it exists (Railway auto-detect creates this)
if [ -d "/opt/venv" ]; then
  echo "✅ Activating Python virtual environment..."
  export VIRTUAL_ENV="/opt/venv"
  export PATH="/opt/venv/bin:$PATH"
elif [ -n "${VIRTUAL_ENV:-}" ]; then
  echo "✅ Using Railway-provided virtual environment"
else
  echo "ℹ️  Using system Python (no virtual environment detected)"
fi

# Ensure script runs from project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "📂 Working directory: $SCRIPT_DIR"

# ---- Runtime environment & paths -----------------------------------------------
echo ""
echo "⚙️  Configuring runtime environment..."

# Railway injects $PORT; default to 8000 for local development
: "${PORT:=8000}"
: "${WEB_CONCURRENCY:=1}"
echo "   Port: $PORT"
echo "   Workers: $WEB_CONCURRENCY"

# Ensure system binaries (tesseract, pdftoppm, etc. from Aptfile) are on PATH
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH}"

# Ensure Python can import the application modules
export PYTHONPATH="$SCRIPT_DIR:${PYTHONPATH:-}"

# Application directories (can be overridden via environment variables)
export CHROMA_DIR="${CHROMA_DIR:-/app/demo_chroma}"
export DATA_DIR="${DATA_DIR:-/app/data}"
export GDRIVE_FOLDER_NAME="${GDRIVE_FOLDER_NAME:-documents}"


# NOTE: Auto-build disabled for PostgreSQL migration - use /api/index/build endpoint instead
export AUTO_BUILD_INDEX="${AUTO_BUILD_INDEX:-false}"

echo "   Chroma DB: $CHROMA_DIR"
echo "   Data directory: $DATA_DIR"
echo "   Auto-build index: $AUTO_BUILD_INDEX"

# Create directories if they don't exist
mkdir -p "$DATA_DIR"
echo "✅ Directories initialized"

# ---- Google credentials -------------------------------------------------------
echo ""
echo "🔐 Setting up Google Drive credentials..."

# Option A: Service Account JSON from Railway environment variable (recommended)
if [[ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  echo "   Using GOOGLE_SERVICE_ACCOUNT_JSON environment variable"
  echo "$GOOGLE_SERVICE_ACCOUNT_JSON" > /tmp/google.json
  export GOOGLE_APPLICATION_CREDENTIALS="/tmp/google.json"
  echo "✅ Google service account credentials configured"
elif [[ -n "${GOOGLE_OAUTH_TOKEN_JSON:-}" ]]; then
  # Option B: OAuth token (alternative method)
  echo "   Using GOOGLE_OAUTH_TOKEN_JSON environment variable"
  echo "$GOOGLE_OAUTH_TOKEN_JSON" > /app/token.json
  echo "✅ Google OAuth token configured"
else
  echo "⚠️  No Google Drive credentials found (this is optional)"
  echo "   Set GOOGLE_SERVICE_ACCOUNT_JSON in Railway dashboard to enable sync"
fi

# Run credential setup script if it exists
if [[ -f "setup_credentials.py" ]]; then
  echo "   Running setup_credentials.py..."
  python setup_credentials.py || echo "⚠️  setup_credentials.py failed; continuing..."
fi

# ---- Vector index check (PostgreSQL + pgvector) -------------------------------
echo ""
echo "🔍 Vector Database Status..."
echo "   ℹ️  Using PostgreSQL + pgvector (migrated from local Chroma)"
echo "   ℹ️  Database URL: ${DATABASE_URL:0:30}..." # Show first 30 chars only

if [[ "$AUTO_BUILD_INDEX" == "true" ]]; then
  echo "⚠️  AUTO_BUILD_INDEX is enabled but not recommended for Railway deployments"
  echo "   Use the API endpoint instead: POST /api/index/build"
else
  echo "✅ Use POST /api/index/build to build index after deployment"
  echo "   Or upload documents via POST /api/upload endpoint"
fi

# ---- Check Frontend Build ---------------------------------------------------
echo ""
echo "========================================="
echo "🎨 Checking React Frontend Build"
echo "========================================="

if [[ -d "frontend/dist" ]]; then
  echo "✅ Frontend build found at frontend/dist"
  echo "   (Built during Railway build phase)"
else
  echo "⚠️  Frontend dist not found"
  echo "   Frontend will not be served (API-only mode)"
fi


##
# ---- Launch FastAPI application -----------------------------------------------
echo ""
echo "========================================="
echo "🚀 Launching FastAPI with Uvicorn"
echo "========================================="
echo "   Host: 0.0.0.0"
echo "   Port: $PORT"
echo "   Workers: $WEB_CONCURRENCY"
echo "   Log level: info"
echo ""

exec uvicorn backend.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers "$WEB_CONCURRENCY" \
  --proxy-headers \
  --log-level info
