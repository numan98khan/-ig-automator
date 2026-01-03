import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';
import { getWorkspaceMember } from '../repositories/core/workspaceMemberRepository';

const router = express.Router();

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await getWorkspaceById(workspaceId);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const isOwner = workspace.userId === req.userId;

    const isMember = await getWorkspaceMember(workspaceId, req.userId!);

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
