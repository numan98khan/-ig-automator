import express, { Response } from 'express';
import Automation from '../models/Automation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { runAutomationTest } from '../services/automationService';

const router = express.Router();

// Get all automations for a workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const automations = await Automation.find({ workspaceId }).sort({ createdAt: -1 });
    res.json(automations);
  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single automation by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check workspace access
    const { hasAccess } = await checkWorkspaceAccess(automation.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(automation);
  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new automation
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, workspaceId, triggerType, triggerConfig, replySteps, isActive } = req.body;

    if (!name || !workspaceId || !triggerType || !replySteps || replySteps.length === 0) {
      return res.status(400).json({
        error: 'name, workspaceId, triggerType, and at least one replyStep are required'
      });
    }

    // Check if user has access to this workspace
    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can create automations' });
    }

    // Validate reply steps (templates only)
    for (const step of replySteps) {
      if (step.type !== 'template_flow' || !step.templateFlow?.templateId) {
        return res.status(400).json({ error: 'Only template_flow automations are supported' });
      }
    }

    const automation = await Automation.create({
      name,
      description,
      workspaceId,
      triggerType,
      triggerConfig: triggerConfig || {},
      replySteps,
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json(automation);
  } catch (error) {
    console.error('Create automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an automation
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, triggerType, triggerConfig, replySteps, isActive } = req.body;

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check workspace access
    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(
      automation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can update automations' });
    }

    // Validate reply steps if provided (templates only)
    if (replySteps) {
      if (replySteps.length === 0) {
        return res.status(400).json({ error: 'At least one reply step is required' });
      }

      for (const step of replySteps) {
        if (step.type !== 'template_flow' || !step.templateFlow?.templateId) {
          return res.status(400).json({ error: 'Only template_flow automations are supported' });
        }
      }
    }

    // Update fields
    if (name !== undefined) automation.name = name;
    if (description !== undefined) automation.description = description;
    if (triggerType !== undefined) automation.triggerType = triggerType;
    if (triggerConfig !== undefined) automation.triggerConfig = triggerConfig;
    if (replySteps !== undefined) automation.replySteps = replySteps;
    if (isActive !== undefined) automation.isActive = isActive;

    await automation.save();

    res.json(automation);
  } catch (error) {
    console.error('Update automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle automation active status
router.patch('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check workspace access
    const { hasAccess } = await checkWorkspaceAccess(automation.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    automation.isActive = !automation.isActive;
    await automation.save();

    res.json(automation);
  } catch (error) {
    console.error('Toggle automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an automation
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Check workspace access
    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(
      automation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can delete automations' });
    }

    await Automation.findByIdAndDelete(id);

    res.json({ message: 'Automation deleted successfully' });
  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update automation stats (internal use)
router.patch('/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { totalTriggered, totalRepliesSent, lastTriggeredAt, lastReplySentAt } = req.body;

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    // Update stats
    if (totalTriggered !== undefined) {
      automation.stats.totalTriggered += totalTriggered;
    }
    if (totalRepliesSent !== undefined) {
      automation.stats.totalRepliesSent += totalRepliesSent;
    }
    if (lastTriggeredAt) {
      automation.stats.lastTriggeredAt = new Date(lastTriggeredAt);
    }
    if (lastReplySentAt) {
      automation.stats.lastReplySentAt = new Date(lastReplySentAt);
    }

    await automation.save();

    res.json(automation);
  } catch (error) {
    console.error('Update automation stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test an automation without sending messages
router.post('/:id/test', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { messageText, state, action, context } = req.body;
    const isAction = action === 'simulate_followup';

    if (!isAction && (!messageText || typeof messageText !== 'string')) {
      return res.status(400).json({ error: 'messageText is required' });
    }

    const automation = await Automation.findById(id);
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(automation.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('🧪 [AUTOMATION TEST] Request', {
      automationId: id,
      action,
      messageTextPreview: typeof messageText === 'string' ? messageText.slice(0, 160) : undefined,
      context,
    });

    const result = await runAutomationTest({
      automationId: automation._id.toString(),
      workspaceId: automation.workspaceId.toString(),
      messageText,
      state,
      action,
      context,
    });

    res.json(result);
  } catch (error) {
    console.error('Test automation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
