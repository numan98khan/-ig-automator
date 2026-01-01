import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Workspace from '../models/Workspace';
import WorkspaceMember from '../models/WorkspaceMember';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

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
