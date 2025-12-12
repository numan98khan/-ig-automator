# URGENT FIX - Instagram OAuth Redirect

## Problem Identified

Your deployment has **TWO separate Railway services**:
- Frontend: `https://frontend-production-2fe82.up.railway.app`
- Backend: `https://social-interactive-production.up.railway.app`

The Instagram callback is trying to hit the **frontend domain**, which doesn't have the backend API routes.

## Solution

### 1. Update Environment Variables in Backend Service

Go to your **Backend Railway service** (`social-interactive-production`) and set these:

```bash
# Backend service (social-interactive-production.up.railway.app)
FRONTEND_URL=https://frontend-production-2fe82.up.railway.app
INSTAGRAM_REDIRECT_URI=https://social-interactive-production.up.railway.app/api/instagram/callback
MONGODB_URI=mongodb+srv://...
INSTAGRAM_CLIENT_ID=850905220854896
INSTAGRAM_CLIENT_SECRET=your-secret-here
JWT_SECRET=your-jwt-secret-here
```

**KEY CHANGE**: `INSTAGRAM_REDIRECT_URI` should point to **backend domain**, not frontend!

### 2. Update Instagram App Settings in Meta Developer Portal

1. Go to https://developers.facebook.com/apps
2. Select your app (ID: 850905220854896)
3. Go to **Instagram Basic Display** or **Instagram Graph API** settings
4. Under **OAuth Redirect URIs**, change from:
   - ❌ `https://frontend-production-2fe82.up.railway.app/api/instagram/callback`
   - ✅ `https://social-interactive-production.up.railway.app/api/instagram/callback`

### 3. Update Frontend Environment Variable

Go to your **Frontend Railway service** and set:

```bash
# Frontend service (frontend-production-2fe82.up.railway.app)
VITE_API_URL=https://social-interactive-production.up.railway.app
```

This ensures the frontend calls the correct backend API.

## How OAuth Flow Should Work

1. User clicks "Sign in with Instagram" on frontend
2. Frontend calls: `https://social-interactive-production.up.railway.app/api/instagram/auth-login`
3. Backend redirects to Instagram OAuth
4. Instagram redirects back to: `https://social-interactive-production.up.railway.app/api/instagram/callback?code=...`
5. Backend creates user, workspace, Instagram account
6. Backend redirects to: `https://frontend-production-2fe82.up.railway.app/landing?token=...&instagram_connected=true`
7. Frontend receives token, stores it, and logs user in

## After Making Changes

1. **Redeploy both services** (or they should auto-deploy when env vars change)
2. **Wait 2-3 minutes** for deployment to complete
3. **Try OAuth flow again**
4. **Check browser console** - you should now see:
   ```
   🔍 Landing page URL params: {
     token: 'PRESENT',
     instagram_connected: 'true'
   }
   ```

## Verification

Test the endpoints:

```bash
# Backend health check
curl https://social-interactive-production.up.railway.app/health

# Backend OAuth initiation
curl https://social-interactive-production.up.railway.app/api/instagram/auth-login

# Frontend should load
curl https://frontend-production-2fe82.up.railway.app
```

## Summary

**The issue**: Instagram callback was hitting frontend (static files) instead of backend (API server)

**The fix**: Point Instagram redirect URI to backend domain

**Environment variables to update**:
- Backend `INSTAGRAM_REDIRECT_URI` → backend domain
- Frontend `VITE_API_URL` → backend domain
- Meta Developer Portal OAuth Redirect URI → backend domain
