import express, { Response } from 'express';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Create workspace
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const workspace = await Workspace.create({
      name,
      userId: req.userId,
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all workspaces for current user
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaces = await Workspace.find({ userId: req.userId });
    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get workspace by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspace = await Workspace.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
