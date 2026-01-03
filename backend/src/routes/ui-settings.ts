import express from 'express';
import GlobalUiSettings, { IGlobalUiSettings } from '../models/GlobalUiSettings';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const settings = await GlobalUiSettings.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { key: 'global', uiTheme: 'legacy' } },
      { new: true, upsert: true },
    ).lean<IGlobalUiSettings>();

    res.json({
      data: {
        uiTheme: settings?.uiTheme || 'legacy',
      },
    });
  } catch (error) {
    console.error('UI settings get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
