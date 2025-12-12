import express, { Request, Response } from 'express';
import { webhookLogger } from '../utils/webhook-logger';

const router = express.Router();

/**
 * View recent webhook logs
 * GET /api/instagram/logs?count=50
 */
router.get('/logs', (req: Request, res: Response) => {
  try {
    const count = parseInt(req.query.count as string) || 50;
    const logs = webhookLogger.getRecentLogs(count);

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Rotate logs (keep last N entries)
 * POST /api/instagram/logs/rotate?keep=1000
 */
router.post('/logs/rotate', (req: Request, res: Response) => {
  try {
    const keepCount = parseInt(req.query.keep as string) || 1000;
    webhookLogger.rotateLogs(keepCount);

    res.json({
      success: true,
      message: `Logs rotated, kept last ${keepCount} entries`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
