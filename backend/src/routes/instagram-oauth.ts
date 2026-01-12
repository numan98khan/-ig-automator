import express, { Request, Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { authenticate, AuthRequest } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import {
  createUser,
  getUserByInstagramUserId,
  updateUser,
} from '../repositories/core/userRepository';
import { createWorkspace, getWorkspaceById } from '../repositories/core/workspaceRepository';
import { createWorkspaceMember, getWorkspaceMember } from '../repositories/core/workspaceMemberRepository';
import { assertWorkspaceLimit } from '../services/tierService';
import { requireEnv } from '../utils/requireEnv';

const router = express.Router();
const JWT_SECRET = requireEnv('JWT_SECRET');

const INSTAGRAM_CLIENT_ID = requireEnv('INSTAGRAM_CLIENT_ID');
const INSTAGRAM_CLIENT_SECRET = requireEnv('INSTAGRAM_CLIENT_SECRET');
const INSTAGRAM_REDIRECT_URI = requireEnv('INSTAGRAM_REDIRECT_URI');

const assertInstagramAccountLimit = async (workspaceId: string) => {
  const currentCount = await InstagramAccount.countDocuments({ workspaceId });
  return assertWorkspaceLimit(workspaceId, 'instagramAccounts', currentCount + 1);
};

router.get('/auth-login', async (req: Request, res: Response) => {
  try {
    const state = Buffer.from(JSON.stringify({
      isLogin: true,
      timestamp: Date.now(),
    })).toString('base64');

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

router.get('/auth', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, reconnect } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await getWorkspaceById(workspaceId as string);

    if (!workspace || workspace.userId !== req.userId) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (reconnect !== 'true') {
      const limitCheck = await assertInstagramAccountLimit(workspaceId as string);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          error: `Instagram account limit reached for this workspace (limit: ${limitCheck.limit})`,
        });
      }
    }

    const state = Buffer.from(JSON.stringify({
      workspaceId,
      userId: req.userId,
      timestamp: Date.now(),
    })).toString('base64');

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

router.get('/callback', async (req: Request, res: Response) => {
  const FRONTEND_URL = requireEnv('FRONTEND_URL');

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

    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { isLogin, workspaceId, userId } = stateData;
    console.log('State data:', { isLogin, workspaceId, userId });

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
      account_type: accountData.account_type,
    });

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    if (isLogin) {
      console.log('🔄 Login flow: Creating/finding user + workspace...');

      console.log('🔍 Looking for user with Instagram ID:', accountData.user_id || user_id);
      let user = await getUserByInstagramUserId(accountData.user_id || user_id);

      if (user && !user.isProvisional && user.email) {
        console.log('⚠️  User has secured account, redirecting to email login');
        return res.redirect(`${FRONTEND_URL}/landing?error=account_secured&message=You have already secured your account. Please log in with your email and password.`);
      }

      if (!user) {
        console.log('🔄 User not found, creating new user...');
        user = await createUser({
          instagramUserId: accountData.user_id || user_id,
          instagramUsername: accountData.username,
          isProvisional: true,
          emailVerified: false,
        });
        console.log('✅ Created new user via Instagram OAuth:', user._id);
      } else {
        console.log('✅ Found existing user:', user._id);
      }

      console.log('🔍 Looking for existing Instagram account to find workspace...');
      const existingIgAccount = await InstagramAccount.findOne({
        $or: [
          { instagramAccountId: accountData.user_id || user_id },
          { username: accountData.username },
        ],
      });

      let workspace;
      let isNewWorkspace = false;

      if (existingIgAccount) {
        console.log('✅ Found existing Instagram account, using workspace:', existingIgAccount.workspaceId);
        workspace = await getWorkspaceById(existingIgAccount.workspaceId.toString());

        if (!workspace) {
          throw new Error('Instagram account exists but workspace not found');
        }
      } else {
        console.log('🔄 No existing Instagram account, creating new workspace...');
        workspace = await createWorkspace({
          userId: user._id,
          name: `@${accountData.username}`,
        });
        isNewWorkspace = true;
        console.log('✅ Created new workspace:', workspace._id);
      }

      console.log('🔍 Checking workspace membership...');
      let membership = await getWorkspaceMember(workspace._id, user._id);

      if (!membership) {
        console.log('🔄 Creating workspace membership...');
        membership = await createWorkspaceMember({
          workspaceId: workspace._id,
          userId: user._id,
          role: isNewWorkspace ? 'owner' : 'admin',
        });
        console.log('✅ Created workspace membership:', membership.id, 'with role:', membership.role);
      } else {
        console.log('✅ Found existing workspace membership:', membership.id, 'with role:', membership.role);
      }

      if (!user.defaultWorkspaceId) {
        console.log('🔄 Setting default workspace for user...');
        await updateUser(user._id, { defaultWorkspaceId: workspace._id });
        console.log('✅ Set default workspace:', workspace._id);
      }

      console.log('🔍 Looking for Instagram account connection...');
      let instagramAccount = await InstagramAccount.findOne({
        workspaceId: workspace._id,
        $or: [
          { instagramAccountId: accountData.user_id || user_id },
          { username: accountData.username },
        ],
      });

      if (instagramAccount) {
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
        const limitCheck = await assertInstagramAccountLimit(workspace._id.toString());
        if (!limitCheck.allowed) {
          return res.redirect(`${FRONTEND_URL}/landing?error=instagram_limit_reached&message=${encodeURIComponent(
            `Instagram account limit reached (limit: ${limitCheck.limit})`,
          )}`);
        }
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

      await WorkspaceSettings.findOneAndUpdate(
        { workspaceId: workspace._id },
        { $set: { 'onboarding.connectCompletedAt': new Date() } },
        { new: true, upsert: true },
      );

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

      console.log('🔄 Generating JWT token for user:', user._id);
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
      console.log('✅ JWT token generated');

      const redirectUrl = `${FRONTEND_URL}/landing?token=${token}&instagram_connected=true`;
      console.log('🎉 OAuth flow complete! Redirecting to:', redirectUrl);
      console.log('=== Instagram OAuth Callback Completed Successfully ===\n');
      return res.redirect(redirectUrl);
    }

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== userId) {
      return res.redirect(`${FRONTEND_URL}/landing?error=workspace_not_found`);
    }

    const existingAccount = await InstagramAccount.findOne({
      workspaceId,
      $or: [
        { instagramAccountId: accountData.user_id || user_id },
        { username: accountData.username },
      ],
    });

    if (existingAccount) {
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
      const limitCheck = await assertInstagramAccountLimit(workspaceId);
      if (!limitCheck.allowed) {
        return res.redirect(`${FRONTEND_URL}/landing?error=instagram_limit_reached&message=${encodeURIComponent(
          `Instagram account limit reached (limit: ${limitCheck.limit})`,
        )}`);
      }
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

    console.log('Redirecting to frontend with success');
    res.redirect(`${FRONTEND_URL}/landing?instagram_connected=true`);
  } catch (error: any) {
    console.error('❌ Instagram callback error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });
    console.log('=== Instagram OAuth Callback Failed ===\n');

    const errorMessage = error.response?.data?.error_message || error.message || 'connection_failed';
    res.redirect(`${FRONTEND_URL}/landing?error=${encodeURIComponent(errorMessage)}`);
  }
});

export default router;
