# Webhook Logging System - Summary

## What Was Added

A comprehensive logging system for all Instagram webhook-related activities to help debug and monitor real-time message syncing.

## New Files Created

1. **`backend-new/src/utils/webhook-logger.ts`** - Core logging utility
2. **`backend-new/src/routes/instagram-logs.ts`** - API endpoints for viewing logs
3. **`WEBHOOK_LOGGING.md`** - Complete documentation

## Modified Files

1. **`backend-new/src/routes/instagram-webhook.ts`** - Added logging to all webhook handlers
2. **`backend-new/src/utils/instagram-api.ts`** - Added logging to all API calls
3. **`backend-new/src/index.ts`** - Registered logs route

## Features

### 1. Console Logging (Color-Coded)
- 🔵 Webhook verification (Cyan)
- 🔵 Webhook received (Blue)
- 🟢 Successfully processed (Green)
- 🔴 Errors (Red)
- 🟡 API calls (Yellow)
- 🟣 API responses (Magenta)

### 2. Persistent Logging
- All logs saved to `backend-new/logs/webhook-logs.json`
- Structured JSON format with timestamps
- Includes full payloads, responses, and metadata

### 3. Log Viewing API
```bash
# View recent logs
GET /api/instagram/logs?count=50

# Rotate/clean old logs
POST /api/instagram/logs/rotate?keep=1000
```

## What Gets Logged

Every webhook-related activity is now logged:

1. **Webhook Verification** - When Instagram verifies your webhook URL
2. **Incoming Webhooks** - Full payload of every webhook received
3. **Processing Results** - Successful message/comment processing with details
4. **API Calls** - Every Instagram Graph API request (with parameters)
5. **API Responses** - Every Instagram Graph API response (with data/errors)
6. **Errors** - All errors with stack traces and context

## Usage

### During Development
Watch your console for color-coded real-time logs as webhooks are processed.

### Via API
```bash
# Get recent logs
curl https://your-backend.railway.app/api/instagram/logs?count=50

# Or view directly
cat backend-new/logs/webhook-logs.json
```

### Example Log Entry
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "type": "webhook_received",
  "method": "POST",
  "url": "/api/instagram/webhook",
  "payload": {
    "object": "instagram",
    "entry": [
      {
        "id": "...",
        "messaging": [...]
      }
    ]
  },
  "metadata": {
    "entryCount": 1
  }
}
```

## Debugging Flow

When testing webhooks:
1. Send a test DM to your Instagram account
2. Check console for colored logs showing the entire flow
3. If errors occur, check the detailed error logs
4. Use `/api/instagram/logs` to review historical data
5. Compare with `/api/instagram/debug` for comprehensive diagnostics

## Security

- Logs directory already in `.gitignore`
- Logs may contain access tokens - keep secure
- Consider restricting `/api/instagram/logs` endpoint in production

## Next Steps

1. Deploy the updated backend to Railway
2. Send a test DM to your Instagram account
3. Watch the console logs in Railway
4. Use the logs endpoint to view detailed webhook data
5. Use this data to debug why conversations aren't being fetched

Read `WEBHOOK_LOGGING.md` for complete documentation!
