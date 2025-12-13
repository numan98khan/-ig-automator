#!/bin/bash

# start-dev.sh - Local Development Helper
# Fetches envs from Railway, starts Ngrok, updates Webhook URL, and runs app.

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Instagram Automator Local Dev Environment...${NC}"

# 1. Check Dependencies
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Please install: npm i -g @railway/cli${NC}"
    exit 1
fi

if ! command -v ngrok &> /dev/null; then
    echo -e "${RED}❌ Ngrok not found. Please install: brew install ngrok/ngrok/ngrok${NC}"
    exit 1
fi

# 2. Fetch Environment Variables
echo -e "${BLUE}📥 Fetching environment variables from Railway...${NC}"
# Adjust 'backend' to match your actual Railway service name if different
railway variables --service backend --kv > backend/.env

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to fetch variables. Make sure you are logged in (railway login) and linked (railway link).${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Environment variables saved to backend/.env${NC}"

# 3. Start/Check Ngrok
echo -e "${BLUE}🔗 Checking for Ngrok tunnel...${NC}"

# Check if ngrok is already running (we assume user configured it to 5001 if managing manually, or we start it)
if ! pgrep -x "ngrok" > /dev/null; then
  # Load domain from .env if present
  if [ -f backend/.env ]; then
    export $(grep NGROK_DOMAIN backend/.env | xargs) 2>/dev/null
  fi

  if [ -n "$NGROK_DOMAIN" ]; then
    echo "   Starting new instance on port 5001 with domain: $NGROK_DOMAIN..."
    ngrok http --domain=$NGROK_DOMAIN 5001 > ngrok.log 2>&1 &
  else
    echo "   Starting new instance on port 5001 (random domain)..."
    ngrok http 5001 > ngrok.log 2>&1 &
  fi
  NGROK_PID=$!
else
  echo "   Ngrok is already running. Using existing instance."
fi

# 4. Get Ngrok URL (Retry Loop)
echo "   Waiting for Ngrok public URL..."
NGROK_URL=""
for i in {1..30}; do
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*ngrok[^"]*' | head -n 1)
  if [ -n "$NGROK_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$NGROK_URL" ]; then
    echo -e "${RED}❌ Failed to get Ngrok URL after 30 seconds.${NC}"
    echo -e "${RED}👇 Ngrok Log Output:${NC}"
    tail -n 10 ngrok.log 2>/dev/null
    echo -e "${RED}👉 SUGGESTION: Run 'ngrok update' in a separate terminal OR start ngrok manually: 'ngrok http 5001'${NC}"
    # Only kill if we started it
    if [ -n "$NGROK_PID" ]; then kill $NGROK_PID 2>/dev/null; fi
    exit 1
fi

WEBHOOK_URL="$NGROK_URL/webhook"
BACKEND_URL="$NGROK_URL"

echo -e "${GREEN}✅ Ngrok Tunnel Active: ${NGROK_URL}${NC}"
echo -e "${GREEN}✅ Webhook URL: ${WEBHOOK_URL}${NC}"

# 5. Update Env Vars
# We set BACKEND_URL, WEBHOOK_URL, and INSTAGRAM_REDIRECT_URI to use the public Ngrok URL
echo -e "${BLUE}📝 Updating backend/.env with Ngrok URLs...${NC}"

# Update/Add WEBHOOK_URL
if grep -q "WEBHOOK_URL=" backend/.env; then
    SAFE_URL=$(echo $WEBHOOK_URL | sed 's/\//\\\//g')
    sed -i '' "s/^WEBHOOK_URL=.*/WEBHOOK_URL=$SAFE_URL/" backend/.env
else
    echo "WEBHOOK_URL=$WEBHOOK_URL" >> backend/.env
fi

# Update/Add BACKEND_URL
if grep -q "BACKEND_URL=" backend/.env; then
    SAFE_URL=$(echo $BACKEND_URL | sed 's/\//\\\//g')
    sed -i '' "s/^BACKEND_URL=.*/BACKEND_URL=$SAFE_URL/" backend/.env
else
    echo "BACKEND_URL=$BACKEND_URL" >> backend/.env
fi

# Update/Add INSTAGRAM_REDIRECT_URI (Critical for OAuth)
REDIRECT_URI="$NGROK_URL/api/instagram/callback"
if grep -q "INSTAGRAM_REDIRECT_URI=" backend/.env; then
    SAFE_URL=$(echo $REDIRECT_URI | sed 's/\//\\\//g')
    sed -i '' "s/^INSTAGRAM_REDIRECT_URI=.*/INSTAGRAM_REDIRECT_URI=$SAFE_URL/" backend/.env
else
    echo "INSTAGRAM_REDIRECT_URI=$REDIRECT_URI" >> backend/.env
fi
echo -e "${GREEN}✅ Updated .env variables to use Ngrok URL${NC}"

# 6. Start Services
echo -e "${BLUE}🚀 Starting Backend & Frontend...${NC}"

# Trap Ctrl+C to kill all processes
trap "kill $NGROK_PID 2>/dev/null; pkill -P $$; exit" SIGINT SIGTERM EXIT

echo -e "${BLUE}🧹 Ensuring port 5001 is free...${NC}"

# Check for process holding port 5001
PID=$(lsof -ti:5001)

if [ -n "$PID" ]; then
  PROCESS_NAME=$(ps -p $PID -o comm= | head -n 1)
  echo -e "${RED}⚠️  Found process '$PROCESS_NAME' ($PID) on port 5001. Killing...${NC}"
  
  # Robust kill
  lsof -ti:5001 | xargs kill -9 2>/dev/null

  # Verify release
  for i in {1..5}; do
    if ! lsof -ti:5001 >/dev/null; then
      break
    fi
    echo "   Waiting for port 5001 to be released..."
    sleep 1
  done
fi

# Final check
if lsof -ti:5001 >/dev/null; then
    echo -e "${RED}❌ Port 5001 is STILL in use. Cannot start backend.${NC}"
    exit 1
else
    echo "✅ Port 5001 is free."
fi

# Start Backend on 5001
(cd backend && PORT=5001 npm run dev) &
BACKEND_PID=$!

# Start Frontend (telling it API is on Ngrok URL)
(cd frontend && VITE_API_URL=$NGROK_URL npm run dev) &
FRONTEND_PID=$!

echo -e "${GREEN}✨ Development environment is running!${NC}"
echo -e "   Backend: $NGROK_URL (Public)"
echo -e "   Frontend: http://localhost:5173"
echo -e "   Webhook: $WEBHOOK_URL"
echo -e "   OAuth Callback: $NGROK_URL/api/instagram/callback"
echo -e "${BLUE}👉 Keep this terminal open.${NC}"

wait
