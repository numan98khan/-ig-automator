import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Workspace from '../models/Workspace';
import WorkspaceMember from '../models/WorkspaceMember';
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

    // Check if user has access to this workspace (either as owner or member)
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user is owner
    const isOwner = workspace.userId.toString() === req.userId;

    // Check if user is a member
    const isMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.userId,
    });

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
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

    // Check if user has access to this workspace (either as owner or member)
    const workspace = await Workspace.findById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user is owner
    const isOwner = workspace.userId.toString() === req.userId;

    // Check if user is a member
    const isMember = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.userId,
    });

    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const accounts = await InstagramAccount.find({ workspaceId });
    res.json(accounts);
  } catch (error) {
    console.error('Get Instagram accounts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
