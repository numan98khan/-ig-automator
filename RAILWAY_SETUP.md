# Railway Deployment Setup Guide

## Split Frontend Services (Landing + App)

The marketing site and the authenticated app now deploy separately:

- `landing/` → `sendfx.ai` and `www.sendfx.ai`
- `frontend/` → `app.sendfx.ai`

### Landing service env vars

```bash
VITE_SITE_URL=https://sendfx.ai
VITE_APP_URL=https://app.sendfx.ai
```

### App service env vars

```bash
VITE_SITE_URL=https://app.sendfx.ai
VITE_API_URL=https://your-backend-service.railway.app
```

## Critical Environment Variables

Based on your deployment URL: `https://frontend-production-2fe82.up.railway.app`

### Required Environment Variables in Railway Dashboard

Go to your Railway project settings and set these environment variables:

```bash
# MongoDB Connection (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/instagram-inbox?retryWrites=true&w=majority

# Instagram OAuth Configuration (REQUIRED)
INSTAGRAM_CLIENT_ID=your-instagram-app-id
INSTAGRAM_CLIENT_SECRET=your-instagram-app-secret
INSTAGRAM_REDIRECT_URI=https://frontend-production-2fe82.up.railway.app/api/instagram/callback
FRONTEND_URL=https://frontend-production-2fe82.up.railway.app

# Security (REQUIRED)
JWT_SECRET=your-secure-random-secret-at-least-32-characters-long

# OpenAI API Key (REQUIRED for AI replies)
OPENAI_API_KEY=sk-...

# Node.js Environment
NODE_ENV=production
```

## Instagram App Configuration

### Step 1: Meta Developer Portal

1. Go to https://developers.facebook.com/apps
2. Select your Instagram app
3. Navigate to **Instagram Basic Display** or **Instagram Graph API**
4. Under **OAuth Redirect URIs**, add:
   ```
   https://frontend-production-2fe82.up.railway.app/api/instagram/callback
   ```
5. Save changes

### Step 2: Verify Callback URL

The Instagram callback URL **MUST** match exactly:
- In Meta Developer Portal: `https://frontend-production-2fe82.up.railway.app/api/instagram/callback`
- In Railway `INSTAGRAM_REDIRECT_URI`: `https://frontend-production-2fe82.up.railway.app/api/instagram/callback`

## Debugging OAuth Issues

### Check Railway Logs

1. Go to your Railway project
2. Click on your service
3. Open the **Deployments** tab
4. Click on the latest deployment
5. View logs for these messages:

```
=== Instagram OAuth Callback Started ===
✅ Created new user via Instagram OAuth: [user_id]
✅ Created new workspace: [workspace_id]
✅ Created new Instagram account: [account_id]
🎉 OAuth flow complete! Redirecting to: [url]
```

### Common Issues

1. **Redirect Loop**
   - **Cause**: FRONTEND_URL not set or incorrect
   - **Fix**: Set `FRONTEND_URL=https://frontend-production-2fe82.up.railway.app`

2. **Nothing Stored in MongoDB**
   - **Cause**: MongoDB connection failing or not set
   - **Fix**: Verify MONGODB_URI is correct and accessible
   - **Check**: Look for MongoDB connection errors in logs

3. **OAuth Error**
   - **Cause**: Redirect URI mismatch
   - **Fix**: Ensure callback URL matches in both Meta Portal and Railway

4. **Token Invalid**
   - **Cause**: JWT_SECRET not set or different between restarts
   - **Fix**: Set a permanent JWT_SECRET in Railway

### Testing OAuth Flow

1. Visit: `https://frontend-production-2fe82.up.railway.app/login`
2. Click "Sign in with Instagram"
3. Watch Railway logs for the complete flow
4. After Instagram authorization, you should see:
   - "Created new user via Instagram OAuth"
   - "Created new workspace"
   - "Created new Instagram account"
   - Redirect to `/login?token=...&instagram_connected=true`
   - Auto-redirect to `/app/inbox`

### MongoDB Verification

Connect to your MongoDB and verify:

```javascript
// Check users collection
db.users.find({ instagramUserId: { $exists: true } })

// Check workspaces collection
db.workspaces.find()

// Check instagramaccounts collection
db.instagramaccounts.find({ status: 'connected' })
```

## Frontend Environment Variables

If you have a separate frontend build, set:

```bash
VITE_API_URL=https://frontend-production-2fe82.up.railway.app
```

## Health Check

Test your deployment:

```bash
# Health endpoint
curl https://frontend-production-2fe82.up.railway.app/health

# OAuth initiation endpoint
curl https://frontend-production-2fe82.up.railway.app/api/instagram/auth-login
```

## Important Notes

1. **Single Domain**: Your frontend and backend appear to be on the same domain (`frontend-production-2fe82.up.railway.app`)
2. **HTTPS Required**: Instagram OAuth requires HTTPS for production
3. **Business Account**: Instagram OAuth requires a Business or Creator account connected to a Facebook Page
4. **Token Expiry**: Long-lived tokens expire after 60 days and need to be refreshed

## Troubleshooting Steps

1. Check Railway logs during OAuth callback
2. Verify all environment variables are set
3. Confirm Instagram app redirect URI matches exactly
4. Test MongoDB connection separately
5. Clear browser cache and try again
6. Check browser console for JavaScript errors
