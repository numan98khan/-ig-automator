import express, { Response } from 'express';
import AutomationSession from '../models/AutomationSession';
import Conversation from '../models/Conversation';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

// Get active automation sessions for a conversation
router.get('/conversation/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const sessions = await AutomationSession.find({
      conversationId: conversation._id,
      status: { $in: ['active', 'paused', 'handoff'] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json(sessions);
  } catch (error) {
    console.error('Get automation sessions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
