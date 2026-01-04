import express, { Response } from 'express';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import WorkspaceSettings from '../models/WorkspaceSettings';
import AutomationSession from '../models/AutomationSession';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { sendMessage as sendInstagramMessage } from '../utils/instagram-api';
import { generateAIReply } from '../services/aiReplyService';
import { getActiveTicket, createTicket, addTicketUpdate } from '../services/escalationService';
import { addCountIncrement, trackDailyMetric } from '../services/reportingService';
import { assertUsageLimit } from '../services/tierService';

const router = express.Router();

// Get all messages for a conversation
router.get('/conversation/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, text } = req.body;

    if (!conversationId || !text) {
      return res.status(400).json({ error: 'conversationId and text are required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Create message
    const sentAt = new Date();
    const message = await Message.create({
      conversationId,
      workspaceId: conversation.workspaceId,
      text,
      from: 'user',
      createdAt: sentAt,
    });

    // Update conversation's lastMessageAt
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: sentAt,
      lastBusinessMessageAt: sentAt,
    });

    const responseMetrics = calculateResponseTime(conversation, sentAt);
    const increments: Record<string, number> = {
      outboundMessages: 1,
      humanReplies: 1,
      ...responseMetrics,
    };
    await trackDailyMetric(conversation.workspaceId, sentAt, increments);

    await AutomationSession.updateMany(
      { conversationId: conversation._id, status: 'active' },
      { status: 'paused', pausedAt: sentAt, pauseReason: 'human_reply' }
    );

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate AI reply
router.post('/generate-ai-reply', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if this is an Instagram conversation
    if (conversation.platform !== 'instagram' || !conversation.participantInstagramId) {
      return res.status(400).json({ error: 'AI reply only supported for Instagram conversations' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    const usageCheck = await assertUsageLimit(
      req.userId!,
      'aiMessages',
      1,
      conversation.workspaceId.toString(),
      { increment: false }
    );
    if (!usageCheck.allowed) {
      return res.status(429).json({
        error: 'AI message limit reached for your tier',
        limit: usageCheck.limit,
        used: usageCheck.current,
      });
    }

    const aiResponse = await generateAIReply({
      conversation,
      workspaceId: conversation.workspaceId,
      historyLimit: 20,
    });
    const settings = await WorkspaceSettings.findOne({ workspaceId: conversation.workspaceId });
    const activeTicket = await getActiveTicket(conversation._id);

    if (activeTicket && aiResponse.shouldEscalate) {
      aiResponse.escalationReason = aiResponse.escalationReason || activeTicket.reason || 'Escalation pending';
      aiResponse.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiResponse.replyText);
    } else if (activeTicket && !aiResponse.shouldEscalate) {
      aiResponse.replyText = `${aiResponse.replyText} Your earlier request is with a human teammate and they will confirm that separately.`;
    } else if (aiResponse.shouldEscalate) {
      aiResponse.replyText = buildInitialEscalationReply(aiResponse.replyText);
    }

    // Send message via Instagram API first with HUMAN_AGENT tag to ensure notifications
    const enableHumanAgentTag = process.env.USE_HUMAN_AGENT_TAG === 'true';

    let result;
    try {
      result = await sendInstagramMessage(
        conversation.participantInstagramId,
        aiResponse.replyText,
        igAccount.accessToken,
        enableHumanAgentTag
          ? {
              useMessageTag: true,
              tag: 'HUMAN_AGENT', // Requires app review; may be blocked
            }
          : undefined
      );
    } catch (sendError: any) {
      const errMsg = sendError?.message || '';
      const igErrorMsg = sendError?.response?.data?.error?.message || '';
      const tagBlocked = errMsg.includes('Human Agent') || igErrorMsg.includes('Human Agent');

      if (enableHumanAgentTag && tagBlocked) {
        console.warn('⚠️ HUMAN_AGENT tag rejected; retrying without tag...');
        result = await sendInstagramMessage(conversation.participantInstagramId, aiResponse.replyText, igAccount.accessToken);
      } else {
        throw sendError;
      }
    }

    // Verify Instagram API returned success
    if (!result || (!result.message_id && !result.recipient_id)) {
      throw new Error('Instagram API did not return a valid response. Message may not have been sent.');
    }

    // Only save to database AFTER successful send to Instagram
    let message;
    try {
      const kbItemIdsUsed = (aiResponse.knowledgeItemsUsed || []).map(item => item.id);

      message = await Message.create({
        conversationId,
        workspaceId: conversation.workspaceId,
        text: aiResponse.replyText,
        from: 'ai',
        platform: 'instagram',
        instagramMessageId: result.message_id || undefined,
        aiTags: aiResponse.tags,
        aiShouldEscalate: aiResponse.shouldEscalate,
        aiEscalationReason: aiResponse.escalationReason,
        kbItemIdsUsed,
      });

      // Escalation ticket handling
      let ticketId = activeTicket?._id;
      if (aiResponse.shouldEscalate && !ticketId) {
        const ticket = await createTicket({
          conversationId,
          topicSummary: (aiResponse.escalationReason || aiResponse.replyText).slice(0, 140),
          reason: aiResponse.escalationReason || 'Escalated by AI',
          createdBy: 'ai',
        });
        ticketId = ticket._id;
        conversation.humanRequired = true;
        conversation.humanRequiredReason = ticket.reason;
        conversation.humanTriggeredAt = ticket.createdAt;
        conversation.humanTriggeredByMessageId = message._id;
        conversation.humanHoldUntil = settings?.humanEscalationBehavior === 'ai_silent'
          ? new Date(Date.now() + (settings?.humanHoldMinutes || 60) * 60 * 1000)
          : undefined;
      }

      if (ticketId) {
        await addTicketUpdate(ticketId, { from: 'ai', text: aiResponse.replyText, messageId: message._id });
      }

      // Update conversation's lastMessageAt
      conversation.lastMessage = aiResponse.replyText;
      conversation.lastMessageAt = new Date();
      conversation.lastBusinessMessageAt = new Date();
      if (aiResponse.shouldEscalate) {
        const holdMinutes = settings?.humanHoldMinutes || 60;
        const behavior = settings?.humanEscalationBehavior || 'ai_silent';
        conversation.humanRequired = true;
        conversation.humanRequiredReason = aiResponse.escalationReason || 'Escalation requested by AI';
        conversation.humanTriggeredAt = new Date();
        conversation.humanTriggeredByMessageId = message._id;
        conversation.humanHoldUntil = behavior === 'ai_silent'
          ? new Date(Date.now() + holdMinutes * 60 * 1000)
          : undefined;
      }
      await conversation.save();
    } catch (dbError: any) {
      // Message was sent to Instagram but failed to save to DB
      console.error('⚠️ AI message sent to Instagram but failed to save to database:', dbError);
      return res.status(200).json({
        success: true,
        warning: 'Message sent successfully but database save failed',
        instagramMessageId: result.message_id,
        text: aiResponse.replyText,
        aiMeta: {
          tags: aiResponse.tags,
          shouldEscalate: aiResponse.shouldEscalate,
          escalationReason: aiResponse.escalationReason,
        },
        error: dbError.message,
      });
    }

    const sentAt = message.createdAt || new Date();
    const increments: Record<string, number> = { outboundMessages: 1, aiReplies: 1 };
    if (aiResponse.tags && aiResponse.tags.length > 0) {
      aiResponse.tags.forEach(tag => addCountIncrement(increments, 'tagCounts', tag));
    }
    if (aiResponse.escalationReason) {
      addCountIncrement(increments, 'escalationReasonCounts', aiResponse.escalationReason);
    }
    if (message.kbItemIdsUsed && message.kbItemIdsUsed.length > 0) {
      increments.kbBackedReplies = 1;
      message.kbItemIdsUsed.forEach(itemId => addCountIncrement(increments, 'kbArticleCounts', itemId));
    }

    const responseMetrics = calculateResponseTime(conversation, new Date(sentAt));
    Object.assign(increments, responseMetrics);

    await trackDailyMetric(conversation.workspaceId, new Date(sentAt), increments);
    await assertUsageLimit(req.userId!, 'aiMessages', 1, conversation.workspaceId.toString());

    res.status(201).json({
      ...message.toObject(),
      aiMeta: {
        tags: aiResponse.tags,
        shouldEscalate: aiResponse.shouldEscalate,
        escalationReason: aiResponse.escalationReason,
      },
    });
  } catch (error: any) {
    console.error('Generate AI reply error:', error);

    // Check if error is from Instagram API or AI generation
    const isInstagramError = error.message?.includes('Failed to send') || error.response?.data?.error;

    res.status(500).json({
      error: isInstagramError ? 'Generated reply but failed to send to Instagram' : 'Failed to generate AI reply',
      details: error.message,
    });
  }
});

// Mark messages as seen
router.post('/mark-seen', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Mark all customer messages in this conversation as seen
    const result = await Message.updateMany(
      {
        conversationId,
        from: 'customer',
        seenAt: null,
      },
      {
        $set: { seenAt: new Date() },
      }
    );

    res.json({ success: true, markedCount: result.modifiedCount });
  } catch (error) {
    console.error('Mark messages as seen error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

function buildFollowupResponse(followUpCount: number, base: string): string {
  const templates = [
    'I’ve flagged this to the team and they’ll handle it directly. I can’t confirm on their behalf, but I can gather any details they need.',
    'Your request is with the team. I cannot make promises here, but I can note your urgency and pass along details.',
    'Thanks for your patience. This needs a human to finalize. I’m here to help with any other questions meanwhile.',
  ];
  const variant = templates[followUpCount % templates.length];
  return base && base.trim().length > 0 ? base : variant;
}

function buildInitialEscalationReply(base: string): string {
  if (base && base.trim().length > 0) return base;
  return 'This needs a teammate to review personally, so I’ve flagged it for them. I won’t make commitments here, but I can help with other questions meanwhile.';
}

function calculateResponseTime(conversation: any, sentAt: Date): Record<string, number> {
  if (
    conversation.lastCustomerMessageAt &&
    (!conversation.lastBusinessMessageAt || new Date(conversation.lastBusinessMessageAt) < new Date(conversation.lastCustomerMessageAt))
  ) {
    const diff = sentAt.getTime() - new Date(conversation.lastCustomerMessageAt).getTime();
    if (diff > 0) {
      return {
        firstResponseTimeSumMs: diff,
        firstResponseTimeCount: 1,
      };
    }
  }

  return {};
}
