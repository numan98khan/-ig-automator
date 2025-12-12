import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import { authenticate, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router = express.Router();

/**
 * Debug endpoint to test Instagram API and see what's being returned
 */
router.get('/debug', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findOne({
      workspaceId,
      status: 'connected',
    }).select('+accessToken');

    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'No connected Instagram account found' });
    }

    console.log('🔍 Testing Instagram API for account:', igAccount.username);

    const results: any = {
      account: {
        username: igAccount.username,
        accountType: igAccount.accountType,
        instagramAccountId: igAccount.instagramAccountId,
        instagramUserId: igAccount.instagramUserId,
      },
      apiTests: {},
    };

    // Test 1: Try /me endpoint
    try {
      const meResponse = await axios.get(`https://graph.instagram.com/v24.0/me`, {
        params: {
          access_token: igAccount.accessToken,
          fields: 'id,username,account_type',
        },
      });
      results.apiTests.me = {
        success: true,
        data: meResponse.data,
      };
    } catch (error: any) {
      results.apiTests.me = {
        success: false,
        error: error.response?.data || error.message,
      };
    }

    // Test 2: Try /me/conversations endpoint
    try {
      const conversationsResponse = await axios.get(`https://graph.instagram.com/v24.0/me/conversations`, {
        params: {
          access_token: igAccount.accessToken,
          fields: 'id,participants,updated_time',
          limit: 100,
        },
      });
      results.apiTests.conversations = {
        success: true,
        data: conversationsResponse.data,
        count: conversationsResponse.data.data?.length || 0,
      };
    } catch (error: any) {
      results.apiTests.conversations = {
        success: false,
        error: error.response?.data || error.message,
      };
    }

    // Test 3: Try with Instagram User ID instead of 'me'
    if (igAccount.instagramUserId) {
      try {
        const userConversationsResponse = await axios.get(
          `https://graph.instagram.com/v24.0/${igAccount.instagramUserId}/conversations`,
          {
            params: {
              access_token: igAccount.accessToken,
              fields: 'id,participants,updated_time',
              limit: 100,
            },
          }
        );
        results.apiTests.userConversations = {
          success: true,
          data: userConversationsResponse.data,
          count: userConversationsResponse.data.data?.length || 0,
        };
      } catch (error: any) {
        results.apiTests.userConversations = {
          success: false,
          error: error.response?.data || error.message,
        };
      }
    }

    // Test 4: Try with Instagram Account ID (Business Account)
    if (igAccount.instagramAccountId) {
      try {
        const accountConversationsResponse = await axios.get(
          `https://graph.instagram.com/v24.0/${igAccount.instagramAccountId}/conversations`,
          {
            params: {
              access_token: igAccount.accessToken,
              fields: 'id,participants,updated_time',
              limit: 100,
            },
          }
        );
        results.apiTests.accountConversations = {
          success: true,
          data: accountConversationsResponse.data,
          count: accountConversationsResponse.data.data?.length || 0,
        };
      } catch (error: any) {
        results.apiTests.accountConversations = {
          success: false,
          error: error.response?.data || error.message,
        };
      }
    }

    // Test 5: Check token info
    try {
      const tokenInfoResponse = await axios.get(`https://graph.instagram.com/v24.0/debug_token`, {
        params: {
          input_token: igAccount.accessToken,
          access_token: igAccount.accessToken,
        },
      });
      results.apiTests.tokenInfo = {
        success: true,
        data: tokenInfoResponse.data,
      };
    } catch (error: any) {
      results.apiTests.tokenInfo = {
        success: false,
        error: error.response?.data || error.message,
      };
    }

    res.json(results);
  } catch (error: any) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug failed',
      details: error.message,
    });
  }
});

export default router;
