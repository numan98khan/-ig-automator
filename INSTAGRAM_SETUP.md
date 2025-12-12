# Instagram OAuth Setup Guide

This guide explains how to set up Instagram OAuth integration for the AI Instagram Inbox application.

## Required Environment Variables

### Backend Environment Variables

Add these to your Railway project or `.env` file:

```bash
# Instagram OAuth (Required for real Instagram integration)
INSTAGRAM_CLIENT_ID=your-instagram-app-id
INSTAGRAM_CLIENT_SECRET=your-instagram-app-secret
INSTAGRAM_REDIRECT_URI=https://your-backend-url.railway.app/api/instagram/callback

# Frontend URL (for redirects after OAuth)
FRONTEND_URL=https://your-frontend-url.railway.app

# MongoDB Connection (Required)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/instagram-inbox

# OpenAI API Key (Required for AI features)
OPENAI_API_KEY=sk-...

# JWT Secret (Recommended)
JWT_SECRET=your-secure-random-secret

# Node Environment
NODE_ENV=production
```

## How to Get Instagram OAuth Credentials

### Step 1: Create a Meta (Facebook) App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Select "Business" as the app type
4. Fill in app details:
   - **App Name**: AI Instagram Inbox (or your preferred name)
   - **Contact Email**: Your email
   - **Business Account**: Select or create one

### Step 2: Add Instagram Basic Display API

1. In your app dashboard, click "Add Product"
2. Find "Instagram Basic Display" and click "Set Up"
3. Scroll down to "User Token Generator"
4. Click "Create New App" (if needed)

### Step 3: Configure Instagram Basic Display

1. Under "Instagram App ID", note your **Instagram App ID** (this is your `INSTAGRAM_CLIENT_ID`)
2. Under "Instagram App Secret", click "Show" to reveal your **Instagram App Secret** (this is your `INSTAGRAM_CLIENT_SECRET`)
3. Under "Valid OAuth Redirect URIs", add:
   ```
   https://your-backend-url.railway.app/api/instagram/callback
   http://localhost:5000/api/instagram/callback  (for local development)
   ```
4. Under "Deauthorize Callback URL", add:
   ```
   https://your-backend-url.railway.app/api/instagram/deauthorize
   ```
5. Under "Data Deletion Request URL", add:
   ```
   https://your-backend-url.railway.app/api/instagram/data-deletion
   ```
6. Click "Save Changes"

### Step 4: Add Instagram Product (for Business Features)

For accessing Instagram Business accounts (DMs, comments):

1. Go back to app dashboard
2. Click "Add Product" → Find "Instagram Graph API"
3. Click "Set Up"
4. Complete the setup wizard

### Step 5: Configure App Permissions

1. In app dashboard, go to "App Review" → "Permissions and Features"
2. Request these permissions:
   - `instagram_basic` (Basic Profile Access)
   - `instagram_manage_messages` (Read and send direct messages)
   - `instagram_manage_comments` (Read, create, and delete comments)
   - `pages_show_list` (List Facebook Pages)
   - `pages_read_engagement` (Read Page data)

### Step 6: Switch to Instagram Business Account

Your Instagram account must be a **Business** or **Creator** account:

1. Open Instagram app
2. Go to Settings → Account → Switch to Professional Account
3. Choose Business or Creator
4. Connect to a Facebook Page (required for API access)

### Step 7: Test Mode vs Live Mode

#### Test Mode (Development)
- App starts in "Test Mode"
- Only works with test users
- Add test users in "Roles" → "Test Users"

#### Live Mode (Production)
- Submit app for review
- Required permissions need approval from Meta
- Takes 3-7 days for review

## Railway Deployment Setup

### Required Services

1. **MongoDB**: Add MongoDB plugin or use MongoDB Atlas
2. **OpenAI**: Get API key from OpenAI platform

### Environment Variables for Railway

Set these in your Railway project settings:

```bash
MONGODB_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...
INSTAGRAM_CLIENT_ID=your-instagram-app-id
INSTAGRAM_CLIENT_SECRET=your-instagram-app-secret
INSTAGRAM_REDIRECT_URI=https://your-app.railway.app/api/instagram/callback
FRONTEND_URL=https://your-app.railway.app
JWT_SECRET=your-random-secret
NODE_ENV=production
```

## OAuth Flow

### How It Works

1. User clicks "Connect Instagram" button
2. Frontend calls `/api/instagram/auth?workspaceId=xxx`
3. Backend generates Instagram OAuth URL with:
   - Client ID
   - Redirect URI
   - Scopes: `instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments`
   - State (contains workspaceId and userId)
4. User is redirected to Instagram for authorization
5. Instagram redirects back to `/api/instagram/callback` with authorization code
6. Backend exchanges code for access token
7. Backend exchanges short-lived token for long-lived token (60 days)
8. Backend fetches Instagram account details
9. Backend saves account to database
10. Backend subscribes to Instagram webhooks
11. Backend redirects user back to frontend with success

### OAuth Scopes Explained

- `instagram_business_basic`: Read profile info (username, account type, media count)
- `instagram_business_manage_messages`: Read and send Instagram DMs
- `instagram_business_manage_comments`: Read and reply to comments

## Troubleshooting

### Common Issues

#### 1. "Redirect URI Mismatch" Error
- Ensure `INSTAGRAM_REDIRECT_URI` in env matches exactly what's in Meta App settings
- Include protocol (http:// or https://)
- Railway URLs: Use the generated Railway domain

#### 2. "Invalid Client ID" Error
- Double-check `INSTAGRAM_CLIENT_ID` matches Instagram App ID (not Facebook App ID)
- No spaces or quotes in environment variable

#### 3. "This app is in Development Mode" Error
- Add your Instagram account as a test user in Meta App settings
- Or submit app for review to go live

#### 4. "Instagram account not found" Error
- Ensure Instagram account is a Business or Creator account
- Ensure it's connected to a Facebook Page
- Try switching account type in Instagram app settings

#### 5. Token Expires
- Long-lived tokens last 60 days
- Implement token refresh (TODO in future version)
- Users will need to reconnect after expiration

## Webhooks Setup (Optional)

To receive real-time updates for messages and comments:

1. In Meta App → Products → Webhooks
2. Set Callback URL: `https://your-app.railway.app/api/webhooks/instagram`
3. Set Verify Token: (any random string, save it in env as `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`)
4. Subscribe to:
   - `messages`
   - `comments`

## Testing

### Local Testing

1. Use ngrok to expose local backend:
   ```bash
   ngrok http 5000
   ```
2. Update `INSTAGRAM_REDIRECT_URI` to ngrok URL:
   ```
   https://xxxx-xx-xx-xx-xx.ngrok.io/api/instagram/callback
   ```
3. Add ngrok URL to Meta App settings
4. Test OAuth flow

### Production Testing

1. Deploy to Railway
2. Update environment variables with Railway URLs
3. Update Meta App settings with Railway URLs
4. Test OAuth flow
5. Check Railway logs for any errors

## Security Notes

- Never commit `.env` file to git
- Rotate secrets regularly
- Use HTTPS in production
- Validate state parameter in OAuth callback
- Store access tokens securely (encrypted in database recommended)
- Implement rate limiting for API endpoints

## Support

For issues with:
- **Meta/Instagram API**: [Meta Developer Support](https://developers.facebook.com/support/)
- **Railway Deployment**: [Railway Documentation](https://docs.railway.app/)
- **MongoDB**: [MongoDB Atlas Support](https://www.mongodb.com/cloud/atlas)
