import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import WorkspaceAutomationIntent from '../models/WorkspaceAutomationIntent';
import { listAutomationIntents } from '../services/automationIntentService';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

// List automation intent labels (shared global list)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const [systemIntents, customIntents] = await Promise.all([
      listAutomationIntents(),
      WorkspaceAutomationIntent.find({ workspaceId }).sort({ value: 1 }).lean(),
    ]);

    res.json({ systemIntents, customIntents });
  } catch (error) {
    console.error('Automation intents list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new automation intent label
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId.trim() : '';
    const value = typeof req.body?.value === 'string' ? req.body.value.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (!workspaceId || !value || !description) {
      return res.status(400).json({ error: 'workspaceId, value, and description are required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const systemExists = await listAutomationIntents()
      .then((intents) => intents.some((intent) => intent.value === value));
    if (systemExists) {
      return res.status(409).json({ error: 'Intent value already exists in system intents' });
    }

    const exists = await WorkspaceAutomationIntent.findOne({ workspaceId, value }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Intent value already exists for this workspace' });
    }

    const intent = await WorkspaceAutomationIntent.create({ workspaceId, value, description });
    res.status(201).json(intent);
  } catch (error: any) {
    console.error('Automation intent create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create automation intent' });
  }
});

// Update an existing automation intent label
router.put('/:intentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const intentId = req.params.intentId;
    const valueInput = req.body?.value;
    const descriptionInput = req.body?.description;
    const value = typeof valueInput === 'string' ? valueInput.trim() : undefined;
    const description = typeof descriptionInput === 'string' ? descriptionInput.trim() : undefined;

    if (typeof valueInput === 'string' && !value) {
      return res.status(400).json({ error: 'value cannot be empty' });
    }
    if (typeof descriptionInput === 'string' && !description) {
      return res.status(400).json({ error: 'description cannot be empty' });
    }
    if (value === undefined && description === undefined) {
      return res.status(400).json({ error: 'value or description is required' });
    }

    const intent = await WorkspaceAutomationIntent.findById(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Automation intent not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(intent.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    if (value && value !== intent.value) {
      const systemExists = await listAutomationIntents()
        .then((intents) => intents.some((systemIntent) => systemIntent.value === value));
      if (systemExists) {
        return res.status(409).json({ error: 'Intent value already exists in system intents' });
      }

      const exists = await WorkspaceAutomationIntent.findOne({
        workspaceId: intent.workspaceId,
        value,
        _id: { $ne: intent._id },
      }).lean();
      if (exists) {
        return res.status(409).json({ error: 'Intent value already exists for this workspace' });
      }
    }

    if (value) {
      intent.value = value;
    }
    if (description) {
      intent.description = description;
    }

    await intent.save();
    res.json(intent);
  } catch (error: any) {
    console.error('Automation intent update error:', error);
    res.status(400).json({ error: error.message || 'Failed to update automation intent' });
  }
});

// Delete an existing automation intent label
router.delete('/:intentId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const intentId = req.params.intentId;
    const intent = await WorkspaceAutomationIntent.findById(intentId);
    if (!intent) {
      return res.status(404).json({ error: 'Automation intent not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(intent.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    await intent.deleteOne();
    res.status(204).send();
  } catch (error) {
    console.error('Automation intent delete error:', error);
    res.status(500).json({ error: 'Failed to delete automation intent' });
  }
});

export default router;
