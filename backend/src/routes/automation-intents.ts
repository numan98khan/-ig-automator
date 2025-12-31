import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import AutomationIntent from '../models/AutomationIntent';
import { listAutomationIntents } from '../services/automationIntentService';

const router = express.Router();

// List automation intent labels (shared global list)
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const intents = await listAutomationIntents();
    res.json(intents);
  } catch (error) {
    console.error('Automation intents list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new automation intent label
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!value || !description) {
      return res.status(400).json({ error: 'value and description are required' });
    }

    const exists = await AutomationIntent.findOne({ value }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Intent value already exists' });
    }

    const intent = await AutomationIntent.create({ value, description });
    res.status(201).json(intent);
  } catch (error: any) {
    console.error('Automation intent create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create automation intent' });
  }
});

export default router;
