import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';
import { seedConversations } from '../utils/seed';

const router = express.Router();

// Connect Instagram account (mock)
router.post('/connect', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { username, workspaceId } = req.body;

    if (!username || !workspaceId) {
      return res.status(400).json({ error: 'Username and workspaceId are required' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Create Instagram account
    const igAccount = await InstagramAccount.create({
      username,
      workspaceId,
      status: 'mock',
    });

    // Seed demo conversations for this account
    await seedConversations(workspaceId, igAccount._id.toString());

    res.status(201).json(igAccount);
  } catch (error) {
    console.error('Connect Instagram error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Instagram accounts for workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const accounts = await InstagramAccount.find({ workspaceId });
    res.json(accounts);
  } catch (error) {
    console.error('Get Instagram accounts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
