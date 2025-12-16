import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import SandboxScenario from '../models/SandboxScenario';
import { runSandboxScenario } from '../services/sandboxService';

const router = express.Router();

router.get('/scenarios', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.query.workspaceId as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const scenarios = await SandboxScenario.find({ workspaceId }).sort({ updatedAt: -1 });
    res.json(scenarios);
  } catch (error) {
    console.error('List sandbox scenarios error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/scenarios', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, name, description, messages } = req.body;

    if (!workspaceId || !name) {
      return res.status(400).json({ error: 'workspaceId and name are required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const scenario = await SandboxScenario.create({
      workspaceId,
      name,
      description,
      messages: messages || [],
    });

    res.status(201).json(scenario);
  } catch (error) {
    console.error('Create sandbox scenario error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/scenarios/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, messages } = req.body;

    const scenario = await SandboxScenario.findById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(scenario.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    scenario.name = name ?? scenario.name;
    scenario.description = description ?? scenario.description;
    scenario.messages = Array.isArray(messages) ? messages : scenario.messages;
    await scenario.save();

    res.json(scenario);
  } catch (error) {
    console.error('Update sandbox scenario error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/scenarios/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const scenario = await SandboxScenario.findById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(scenario.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    await scenario.deleteOne();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete sandbox scenario error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/scenarios/:id/run', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const scenario = await SandboxScenario.findById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(scenario.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const run = await runSandboxScenario(scenario.workspaceId.toString(), scenario._id.toString());
    res.json(run);
  } catch (error) {
    console.error('Run sandbox scenario error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
