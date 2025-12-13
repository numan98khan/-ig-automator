import express, { Response } from 'express';
import mongoose from 'mongoose';
import Escalation from '../models/Escalation';
import Conversation from '../models/Conversation';
import Workspace from '../models/Workspace';
import Message from '../models/Message';
import { authenticate, AuthRequest } from '../middleware/auth';
import { resolveTicket } from '../services/escalationService';

const router = express.Router();

// List escalations for a workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await Workspace.findOne({ _id: workspaceId, userId: req.userId });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const conversations = await Conversation.find({ workspaceId }).select('_id participantName participantHandle workspaceId').lean();
    const convoIds = conversations.map(c => c._id);
    const convoMap = new Map(conversations.map(c => [c._id.toString(), c]));

    const escalations = await Escalation.find({
      status: { $in: ['pending', 'in_progress'] },
      conversationId: { $in: convoIds },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('categoryId')
      .lean();

    const payload = await Promise.all(
      escalations.map(async (e) => {
        const recentMessages = await Message.find({ conversationId: e.conversationId })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        const lastEscalation = await Message.findOne({
          conversationId: e.conversationId,
          aiShouldEscalate: true,
        })
          .sort({ createdAt: -1 })
          .lean();

        return {
          escalation: e,
          conversation: convoMap.get(e.conversationId.toString()),
          recentMessages: recentMessages.reverse(),
          lastEscalation,
        };
      })
    );

    res.json(payload);
  } catch (error) {
    console.error('List escalations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve escalation
router.post('/:id/resolve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const escalation = await Escalation.findById(req.params.id);
    if (!escalation) {
      return res.status(404).json({ error: 'Escalation not found' });
    }

    const conversation = await Conversation.findById(escalation.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    escalation.status = 'resolved';
    escalation.updatedAt = new Date();
    await escalation.save();

    conversation.humanRequired = false;
    conversation.humanRequiredReason = undefined;
    conversation.humanTriggeredAt = undefined;
    conversation.humanTriggeredByMessageId = undefined;
    conversation.humanHoldUntil = undefined;
    await conversation.save();

    res.json({ success: true, escalation, conversation });
  } catch (error) {
    console.error('Resolve escalation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
