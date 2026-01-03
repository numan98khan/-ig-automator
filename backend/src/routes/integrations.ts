import express, { Response } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth';
import WorkspaceSettings from '../models/WorkspaceSettings';
import {
  getGoogleSheetPreview,
  getOAuthAccessToken,
  listGoogleSpreadsheetTabs,
  listGoogleSpreadsheets,
} from '../services/googleSheetsService';
import { analyzeInventoryMapping } from '../services/googleSheetsMappingService';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'https://cowlike-silvia-criterional.ngrok-free.dev/api/integrations/google-sheets/oauth/callback';

function buildGoogleAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID is missing');
  }
  const scope = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'openid',
    'email',
  ].join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function decodeJwt(token: string): any | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

const loadWorkspaceForUser = async (workspaceId: string, userId: string) => {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace || workspace.userId !== userId) {
    return null;
  }
  return workspace;
};

router.get('/google-sheets/oauth/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const state = jwt.sign(
      { workspaceId, userId: req.userId },
      JWT_SECRET,
      { expiresIn: '10m' },
    );

    const authUrl = buildGoogleAuthUrl(state);
    res.json({ url: authUrl });
  } catch (error: any) {
    console.error('Google OAuth start error:', error);
    res.status(500).json({ error: error?.message || 'Failed to start Google OAuth' });
  }
});

router.get('/google-sheets/oauth/callback', async (req: AuthRequest, res: Response) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/automations?section=integrations&googleSheets=error`);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(state, JWT_SECRET);
    } catch (error) {
      return res.redirect(`${FRONTEND_URL}/automations?section=integrations&googleSheets=error`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect(`${FRONTEND_URL}/automations?section=integrations&googleSheets=error`);
    }

    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const refreshToken = tokenResponse.data?.refresh_token as string | undefined;
    const idToken = tokenResponse.data?.id_token as string | undefined;
    const idPayload = idToken ? decodeJwt(idToken) : null;
    const oauthEmail = idPayload?.email;

    const updateData: Record<string, any> = {
      'googleSheets.oauthConnected': true,
      'googleSheets.oauthConnectedAt': new Date(),
      'googleSheets.oauthEmail': oauthEmail,
    };
    if (refreshToken) {
      updateData['googleSheets.oauthRefreshToken'] = refreshToken;
    }

    await WorkspaceSettings.findOneAndUpdate(
      { workspaceId: decoded.workspaceId },
      { $set: updateData },
      { new: true, upsert: true },
    );

    res.redirect(`${FRONTEND_URL}/automations?section=integrations&googleSheets=connected`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.redirect(`${FRONTEND_URL}/automations?section=integrations&googleSheets=error`);
  }
});

router.post('/google-sheets/oauth/disconnect', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.body as { workspaceId?: string };
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      {
        $set: {
          'googleSheets.oauthConnected': false,
          'googleSheets.oauthConnectedAt': undefined,
          'googleSheets.oauthEmail': undefined,
          'googleSheets.oauthRefreshToken': undefined,
        },
      },
      { new: true, upsert: true },
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Google OAuth disconnect error:', error);
    res.status(500).json({ error: error?.message || 'Failed to disconnect' });
  }
});

router.get('/google-sheets/files', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const settings = await WorkspaceSettings.findOne({ workspaceId });
    const refreshToken = settings?.googleSheets?.oauthRefreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Google Sheets is not connected' });
    }

    const token = await getOAuthAccessToken({ refreshToken });
    const files = await listGoogleSpreadsheets({ accessToken: token.accessToken });
    res.json({ files });
  } catch (error: any) {
    console.error('Google Sheets list files error:', error);
    res.status(500).json({ error: error?.message || 'Failed to list Google Sheets' });
  }
});

router.get('/google-sheets/tabs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const spreadsheetId = req.query.spreadsheetId as string | undefined;
    if (!workspaceId || !spreadsheetId) {
      return res.status(400).json({ error: 'workspaceId and spreadsheetId are required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const settings = await WorkspaceSettings.findOne({ workspaceId });
    const refreshToken = settings?.googleSheets?.oauthRefreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Google Sheets is not connected' });
    }

    const token = await getOAuthAccessToken({ refreshToken });
    const tabs = await listGoogleSpreadsheetTabs({ accessToken: token.accessToken }, spreadsheetId);
    res.json({ tabs });
  } catch (error: any) {
    console.error('Google Sheets list tabs error:', error);
    res.status(500).json({ error: error?.message || 'Failed to list sheet tabs' });
  }
});

router.post('/google-sheets/test', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, config } = req.body as {
      workspaceId: string;
      config?: {
        spreadsheetId?: string;
        sheetName?: string;
        serviceAccountJson?: string;
        headerRow?: number;
      };
    };

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const settings = await WorkspaceSettings.findOne({ workspaceId });
    const savedConfig = settings?.googleSheets;
    const resolvedConfig = {
      spreadsheetId: config?.spreadsheetId || savedConfig?.spreadsheetId,
      sheetName: config?.sheetName || savedConfig?.sheetName || 'Sheet1',
      serviceAccountJson: config?.serviceAccountJson || savedConfig?.serviceAccountJson,
      headerRow: config?.headerRow || savedConfig?.headerRow || 1,
    };

    if (!resolvedConfig.spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID is required' });
    }

    const refreshToken = savedConfig?.oauthRefreshToken;
    if (!resolvedConfig.serviceAccountJson && !refreshToken) {
      return res.status(400).json({ error: 'Spreadsheet ID and service account JSON are required' });
    }

    const preview = refreshToken
      ? await getGoogleSheetPreview(
          {
            spreadsheetId: resolvedConfig.spreadsheetId,
            sheetName: resolvedConfig.sheetName,
            accessToken: (await getOAuthAccessToken({ refreshToken })).accessToken,
          },
          { headerRow: resolvedConfig.headerRow, sampleRows: 5 },
        )
      : await getGoogleSheetPreview(
          {
            spreadsheetId: resolvedConfig.spreadsheetId,
            sheetName: resolvedConfig.sheetName,
            serviceAccountJson: resolvedConfig.serviceAccountJson,
          },
          { headerRow: resolvedConfig.headerRow, sampleRows: 5 },
        );

    await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      {
        $set: {
          'googleSheets.lastTestedAt': new Date(),
          'googleSheets.lastTestStatus': 'success',
          'googleSheets.lastTestMessage': `Fetched ${preview.headers.length} header(s) from ${preview.range}`,
        },
      },
      { new: true },
    );

    res.json({ success: true, preview });
  } catch (error: any) {
    console.error('Google Sheets test error:', error);
    if (req.body?.workspaceId) {
      await WorkspaceSettings.findOneAndUpdate(
        { workspaceId: req.body.workspaceId },
        {
          $set: {
            'googleSheets.lastTestedAt': new Date(),
            'googleSheets.lastTestStatus': 'failed',
            'googleSheets.lastTestMessage': error?.message || 'Failed to append test row',
          },
        },
        { new: true },
      );
    }
    res.status(500).json({ error: error?.message || 'Failed to test Google Sheets integration' });
  }
});

router.post('/google-sheets/analyze', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, config } = req.body as {
      workspaceId: string;
      config?: {
        spreadsheetId?: string;
        sheetName?: string;
        serviceAccountJson?: string;
        headerRow?: number;
      };
    };

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const workspace = await loadWorkspaceForUser(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const settings = await WorkspaceSettings.findOne({ workspaceId });
    const savedConfig = settings?.googleSheets;
    const resolvedConfig = {
      spreadsheetId: config?.spreadsheetId || savedConfig?.spreadsheetId,
      sheetName: config?.sheetName || savedConfig?.sheetName || 'Sheet1',
      serviceAccountJson: config?.serviceAccountJson || savedConfig?.serviceAccountJson,
      headerRow: config?.headerRow || savedConfig?.headerRow || 1,
    };

    if (!resolvedConfig.spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID is required' });
    }

    const refreshToken = savedConfig?.oauthRefreshToken;
    if (!resolvedConfig.serviceAccountJson && !refreshToken) {
      return res.status(400).json({ error: 'Google Sheets is not connected' });
    }

    const preview = refreshToken
      ? await getGoogleSheetPreview(
          {
            spreadsheetId: resolvedConfig.spreadsheetId,
            sheetName: resolvedConfig.sheetName,
            accessToken: (await getOAuthAccessToken({ refreshToken })).accessToken,
          },
          { headerRow: resolvedConfig.headerRow, sampleRows: 8 },
        )
      : await getGoogleSheetPreview(
          {
            spreadsheetId: resolvedConfig.spreadsheetId,
            sheetName: resolvedConfig.sheetName,
            serviceAccountJson: resolvedConfig.serviceAccountJson,
          },
          { headerRow: resolvedConfig.headerRow, sampleRows: 8 },
        );

    const analysis = await analyzeInventoryMapping(preview.headers, preview.rows);
    const mapping = {
      fields: analysis.fields,
      summary: analysis.summary,
      updatedAt: new Date(),
      sourceRange: preview.range,
      sourceHeaders: preview.headers,
    };
    console.log('[GoogleSheets] Inventory mapping generated', {
      workspaceId,
      spreadsheetId: resolvedConfig.spreadsheetId,
      sheetName: resolvedConfig.sheetName,
      headerCount: preview.headers.length,
      mappedFields: Object.entries(mapping.fields)
        .filter(([, value]) => value?.header)
        .map(([key, value]) => `${key}:${value?.header}`),
    });

    await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      { $set: { 'googleSheets.inventoryMapping': mapping } },
      { new: true },
    );

    res.json({ success: true, preview, mapping });
  } catch (error: any) {
    console.error('Google Sheets analyze error:', error);
    const message = error?.message || 'Failed to analyze Google Sheets';
    const status = message.includes('OpenAI API key') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
