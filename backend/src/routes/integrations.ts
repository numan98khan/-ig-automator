import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import Workspace from '../models/Workspace';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { getGoogleSheetPreview } from '../services/googleSheetsService';

const router = express.Router();

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

    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

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

    if (!resolvedConfig.spreadsheetId || !resolvedConfig.serviceAccountJson) {
      return res.status(400).json({ error: 'Spreadsheet ID and service account JSON are required' });
    }

    const preview = await getGoogleSheetPreview(
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

export default router;
