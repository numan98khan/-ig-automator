import express, { Request, Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Workspace from '../models/Workspace';
import User from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Instagram OAuth Configuration
const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:5000/api/instagram/callback';

// Generate Instagram OAuth authorization URL for login (no authentication required)
router.get('/auth-login', async (req: Request, res: Response) => {
  try {
    if (!INSTAGRAM_CLIENT_ID) {
      return res.status(500).json({ error: 'Instagram OAuth not configured' });
    }

    // Generate state parameter for OAuth flow (no user/workspace info yet)
    const state = Buffer.from(JSON.stringify({
      isLogin: true,
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
    console.error('Instagram auth-login error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

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
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  console.log('=== Instagram OAuth Callback Started ===');
  console.log('Query params:', req.query);
  console.log('Environment check:', {
    FRONTEND_URL,
    INSTAGRAM_CLIENT_ID: INSTAGRAM_CLIENT_ID ? 'SET' : 'MISSING',
    INSTAGRAM_CLIENT_SECRET: INSTAGRAM_CLIENT_SECRET ? 'SET' : 'MISSING',
    INSTAGRAM_REDIRECT_URI,
  });

  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('❌ Instagram OAuth error from Instagram:', error);
      return res.redirect(`${FRONTEND_URL}/landing?error=${error}`);
    }

    if (!code || !state) {
      console.error('❌ Missing code or state in callback');
      return res.redirect(`${FRONTEND_URL}/landing?error=missing_code_or_state`);
    }

    console.log('✅ Code and state received');

    // Decode state to get flow type and info
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { isLogin, workspaceId, userId } = stateData;
    console.log('State data:', { isLogin, workspaceId, userId });

    // Exchange code for access token
    console.log('🔄 Exchanging code for access token...');
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
    console.log('✅ Received short-lived access token, user_id:', user_id);

    // Exchange short-lived token for long-lived token
    console.log('🔄 Exchanging for long-lived token...');
    const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: INSTAGRAM_CLIENT_SECRET,
        access_token,
      },
    });

    const finalAccessToken = longLivedResponse.data.access_token || access_token;
    const expiresIn = longLivedResponse.data.expires_in || 3600;
    console.log(`✅ Received long-lived token (expires in ${expiresIn}s)`);

    // Get Instagram account info
    console.log('🔄 Fetching Instagram account info...');
    const accountResponse = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'user_id,id,username,account_type,media_count,followers_count,follows_count,name,profile_picture_url',
        access_token: finalAccessToken,
      },
    });

    const accountData = accountResponse.data;
    console.log('✅ Instagram account data:', {
      username: accountData.username,
      user_id: accountData.user_id,
      account_type: accountData.account_type
    });

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Handle login flow - create user + workspace if needed
    if (isLogin) {
      console.log('🔄 Login flow: Creating/finding user + workspace...');

      // Check if user exists with this Instagram ID
      console.log('🔍 Looking for user with Instagram ID:', accountData.user_id || user_id);
      let user = await User.findOne({ instagramUserId: accountData.user_id || user_id });

      if (!user) {
        // Create new user
        console.log('🔄 User not found, creating new user...');
        user = await User.create({
          instagramUserId: accountData.user_id || user_id,
          instagramUsername: accountData.username,
        });
        console.log('✅ Created new user via Instagram OAuth:', user._id);
      } else {
        console.log('✅ Found existing user:', user._id);
      }

      // Check if user has a workspace
      console.log('🔍 Looking for workspace for user:', user._id);
      let workspace = await Workspace.findOne({ userId: user._id });

      if (!workspace) {
        // Create new workspace
        console.log('🔄 Workspace not found, creating new workspace...');
        workspace = await Workspace.create({
          userId: user._id,
          name: `${accountData.username}'s Workspace`,
        });
        console.log('✅ Created new workspace:', workspace._id);
      } else {
        console.log('✅ Found existing workspace:', workspace._id);
      }

      // Check if Instagram account already connected
      console.log('🔍 Looking for Instagram account connection...');
      let instagramAccount = await InstagramAccount.findOne({
        workspaceId: workspace._id,
        $or: [
          { instagramAccountId: accountData.user_id || user_id },
          { username: accountData.username },
        ],
      });

      if (instagramAccount) {
        // Update existing account
        console.log('🔄 Instagram account found, updating...');
        instagramAccount.username = accountData.username;
        instagramAccount.name = accountData.name || accountData.username;
        instagramAccount.instagramAccountId = accountData.user_id || user_id;
        instagramAccount.instagramUserId = accountData.id;
        instagramAccount.profilePictureUrl = accountData.profile_picture_url;
        instagramAccount.followersCount = accountData.followers_count || 0;
        instagramAccount.followsCount = accountData.follows_count || 0;
        instagramAccount.mediaCount = accountData.media_count || 0;
        instagramAccount.accountType = accountData.account_type;
        instagramAccount.accessToken = finalAccessToken;
        instagramAccount.tokenExpiresAt = tokenExpiresAt;
        instagramAccount.lastSyncedAt = new Date();
        instagramAccount.status = 'connected';

        await instagramAccount.save();
        console.log('✅ Updated existing Instagram account:', instagramAccount._id);
      } else {
        // Create new Instagram account
        console.log('🔄 Instagram account not found, creating new one...');
        instagramAccount = await InstagramAccount.create({
          workspaceId: workspace._id,
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
        console.log('✅ Created new Instagram account:', instagramAccount._id);
      }

      // Subscribe to webhooks
      try {
        console.log('🔄 Subscribing to Instagram webhooks...');
        const webhookUrl = `https://graph.instagram.com/v21.0/${accountData.user_id || user_id}/subscribed_apps`;
        await axios.post(webhookUrl, new URLSearchParams({
          subscribed_fields: 'comments,messages',
          access_token: finalAccessToken,
        }));
        console.log('✅ Successfully subscribed to Instagram webhooks');
      } catch (webhookError) {
        console.error('⚠️ Failed to subscribe to webhooks (non-fatal):', webhookError);
      }

      // Generate JWT token
      console.log('🔄 Generating JWT token for user:', user._id);
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      console.log('✅ JWT token generated');

      // Redirect to frontend with token and success
      const redirectUrl = `${FRONTEND_URL}/landing?token=${token}&instagram_connected=true`;
      console.log('🎉 OAuth flow complete! Redirecting to:', redirectUrl);
      console.log('=== Instagram OAuth Callback Completed Successfully ===\n');
      return res.redirect(redirectUrl);
    }

    // Original flow - connecting Instagram to existing workspace
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
    console.log('Redirecting to frontend with success');
    res.redirect(`${FRONTEND_URL}/landing?instagram_connected=true`);
  } catch (error: any) {
    console.error('❌ Instagram callback error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    console.log('=== Instagram OAuth Callback Failed ===\n');

    const errorMessage = error.response?.data?.error_message || error.message || 'connection_failed';
    res.redirect(`${FRONTEND_URL}/landing?error=${encodeURIComponent(errorMessage)}`);
  }
});

export default router;