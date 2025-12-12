# Instagram Webhook Logging System

## Overview

The webhook logging system provides comprehensive logging for all Instagram webhook-related activities, including verification attempts, incoming payloads, processing results, API calls, and errors.

## Features

- **Color-coded console output** for easy debugging
- **Persistent JSON logs** stored in `backend-new/logs/webhook-logs.json`
- **Structured logging** with timestamps and detailed metadata
- **API endpoints** to view and manage logs
- **Automatic logging** for all Instagram Graph API calls

## Log Types

The system logs the following event types:

1. **webhook_verification** - Webhook verification attempts (GET requests)
2. **webhook_received** - Incoming webhook payloads (POST requests)
3. **webhook_processed** - Successfully processed events (messages/comments)
4. **webhook_error** - Errors during webhook processing
5. **api_call** - Outgoing Instagram Graph API requests
6. **api_response** - Instagram Graph API responses

## Console Output

Logs are displayed in the console with color coding:
- 🔵 **Cyan** - Webhook verification
- 🔵 **Blue** - Webhook received
- 🟢 **Green** - Webhook processed successfully
- 🔴 **Red** - Webhook errors
- 🟡 **Yellow** - API calls
- 🟣 **Magenta** - API responses

## Log File Location

Logs are stored at: `backend-new/logs/webhook-logs.json`

Each log entry is appended to this file with a comma-separated JSON format.

## Viewing Logs

### Via API Endpoint

**Get recent logs:**
```bash
GET https://your-backend.railway.app/api/instagram/logs?count=50
```

Response:
```json
{
  "success": true,
  "count": 50,
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "type": "webhook_received",
      "method": "POST",
      "url": "/api/instagram/webhook",
      "payload": { ... },
      "metadata": { ... }
    },
    ...
  ]
}
```

### Via Log File

You can also directly access the log file on your server:
```bash
cat backend-new/logs/webhook-logs.json
```

Or use `jq` for prettier output:
```bash
cat backend-new/logs/webhook-logs.json | jq '.'
```

## Managing Logs

### Rotate Logs

To prevent the log file from growing too large, you can rotate logs to keep only the most recent entries:

```bash
POST https://your-backend.railway.app/api/instagram/logs/rotate?keep=1000
```

This will keep the last 1000 log entries and remove older ones.

## What Gets Logged

### 1. Webhook Verification
```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "type": "webhook_verification",
  "method": "GET",
  "url": "/api/instagram/webhook",
  "payload": {
    "hub.mode": "subscribe",
    "hub.challenge": "...",
    "hub.verify_token": "***"
  }
}
```

### 2. Webhook Received
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "type": "webhook_received",
  "method": "POST",
  "url": "/api/instagram/webhook",
  "payload": {
    "object": "instagram",
    "entry": [...]
  },
  "metadata": {
    "headers": {
      "x-hub-signature": "...",
      "content-type": "application/json"
    },
    "entryCount": 1
  }
}
```

### 3. Webhook Processed
```json
{
  "timestamp": "2024-01-15T10:30:05Z",
  "type": "webhook_processed",
  "payload": {
    "sender": { "id": "..." },
    "recipient": { "id": "..." },
    "message": { ... }
  },
  "response": {
    "conversationId": "...",
    "messageId": "...",
    "participantHandle": "@username"
  },
  "metadata": {
    "eventType": "messaging",
    "success": true
  }
}
```

### 4. API Calls & Responses
```json
{
  "timestamp": "2024-01-15T10:30:01Z",
  "type": "api_call",
  "method": "GET",
  "url": "https://graph.instagram.com/v24.0/12345",
  "payload": {
    "access_token": "...",
    "fields": "id,username,name"
  },
  "metadata": {
    "apiType": "Instagram Graph API"
  }
}
```

### 5. Errors
```json
{
  "timestamp": "2024-01-15T10:30:02Z",
  "type": "webhook_error",
  "error": {
    "message": "Failed to fetch user details",
    "stack": "...",
    "name": "Error"
  },
  "metadata": {
    "eventType": "messaging",
    "messaging": { ... }
  }
}
```

## Debugging Workflow

1. **Monitor console output** in real-time while testing webhooks
2. **Send a test DM** to your Instagram Business Account
3. **Check the logs** for:
   - ✅ Webhook received (blue)
   - ✅ API call to fetch user details (yellow)
   - ✅ API response (magenta)
   - ✅ Webhook processed (green)
4. **If errors occur**, check the red error logs for details
5. **View persistent logs** via the API endpoint for historical data

## Integration Points

The webhook logger is integrated into:

- `backend-new/src/routes/instagram-webhook.ts` - Webhook endpoints
- `backend-new/src/utils/instagram-api.ts` - Instagram Graph API calls
- `backend-new/src/routes/instagram-logs.ts` - Log viewing endpoints

## Best Practices

1. **Monitor logs regularly** during webhook setup and testing
2. **Rotate logs periodically** to prevent excessive file size
3. **Check API response logs** when debugging Instagram API issues
4. **Use the debug endpoint** (`/api/instagram/debug`) alongside logs for comprehensive debugging
5. **Keep logs secure** - they may contain access tokens and user data

## Security Note

⚠️ **Important**: Log files may contain sensitive data including access tokens and user information. Ensure:
- The `logs/` directory is added to `.gitignore`
- Log files are not exposed publicly
- Access to the logs endpoint is restricted in production

## Example: Debugging a Failed Webhook

If a webhook isn't processing:

1. Check if verification succeeded (cyan log)
2. Check if webhook was received (blue log with full payload)
3. Look for API call logs (yellow) to see if user details were fetched
4. Check API responses (magenta) for error messages
5. Look for error logs (red) with stack traces
6. Compare logged data with Instagram API documentation

This systematic approach helps identify whether the issue is with verification, payload structure, API permissions, or processing logic.
