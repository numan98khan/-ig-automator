import express, { Request, Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router = express.Router();

// Instagram OAuth Configuration
const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:5000/api/instagram/callback';

// Generate Instagram OAuth authorization URL
router.get('/auth', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (!INSTAGRAM_CLIENT_ID) {
      return res.status(500).json({ error: 'Instagram OAuth not configured' });
    }

    // Generate state parameter with workspace ID for callback
    const state = Buffer.from(JSON.stringify({
      workspaceId,
      userId: req.userId,
      timestamp: Date.now()
    })).toString('base64');

    // Instagram OAuth URL
    const authUrl = 'https://api.instagram.com/oauth/authorize' +
      `?client_id=${INSTAGRAM_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
      '&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments' +
      '&response_type=code' +
      `&state=${state}`;

    res.json({ authUrl });
  } catch (error) {
    console.error('Instagram auth error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// Handle Instagram OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('Instagram OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=missing_code_or_state`);
    }

    // Decode state to get workspace and user info
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { workspaceId, userId } = stateData;

    // Exchange code for access token
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
      client_id: INSTAGRAM_CLIENT_ID!,
      client_secret: INSTAGRAM_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code: code as string,
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, user_id } = tokenResponse.data;

    // Exchange short-lived token for long-lived token
    const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: INSTAGRAM_CLIENT_SECRET,
        access_token,
      },
    });

    const finalAccessToken = longLivedResponse.data.access_token || access_token;
    const expiresIn = longLivedResponse.data.expires_in || 3600;

    // Get Instagram account info
    const accountResponse = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'user_id,id,username,account_type,media_count,followers_count,follows_count,name,profile_picture_url',
        access_token: finalAccessToken,
      },
    });

    const accountData = accountResponse.data;

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Check if account already exists
    const existingAccount = await InstagramAccount.findOne({
      workspaceId,
      $or: [
        { instagramAccountId: accountData.user_id || user_id },
        { username: accountData.username },
      ],
    });

    if (existingAccount) {
      // Update existing account
      existingAccount.username = accountData.username;
      existingAccount.name = accountData.name || accountData.username;
      existingAccount.instagramAccountId = accountData.user_id || user_id;
      existingAccount.instagramUserId = accountData.id;
      existingAccount.profilePictureUrl = accountData.profile_picture_url;
      existingAccount.followersCount = accountData.followers_count || 0;
      existingAccount.followsCount = accountData.follows_count || 0;
      existingAccount.mediaCount = accountData.media_count || 0;
      existingAccount.accountType = accountData.account_type;
      existingAccount.accessToken = finalAccessToken;
      existingAccount.tokenExpiresAt = tokenExpiresAt;
      existingAccount.lastSyncedAt = new Date();
      existingAccount.status = 'connected';

      await existingAccount.save();
    } else {
      // Create new account
      await InstagramAccount.create({
        workspaceId,
        username: accountData.username,
        name: accountData.name || accountData.username,
        instagramAccountId: accountData.user_id || user_id,
        instagramUserId: accountData.id,
        profilePictureUrl: accountData.profile_picture_url,
        followersCount: accountData.followers_count || 0,
        followsCount: accountData.follows_count || 0,
        mediaCount: accountData.media_count || 0,
        accountType: accountData.account_type,
        accessToken: finalAccessToken,
        tokenExpiresAt,
        lastSyncedAt: new Date(),
        status: 'connected',
      });
    }

    // Subscribe to webhooks
    try {
      const webhookUrl = `https://graph.instagram.com/v21.0/${accountData.user_id || user_id}/subscribed_apps`;
      await axios.post(webhookUrl, new URLSearchParams({
        subscribed_fields: 'comments,messages',
        access_token: finalAccessToken,
      }));
      console.log('✅ Successfully subscribed to Instagram webhooks');
    } catch (webhookError) {
      console.error('⚠️ Failed to subscribe to webhooks (non-fatal):', webhookError);
    }

    // Redirect back to frontend with success
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/?instagram_connected=true`);
  } catch (error) {
    console.error('Instagram callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=connection_failed`);
  }
});

export default router;