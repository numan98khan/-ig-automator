import express, { Response } from 'express';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import Workspace from '../models/Workspace';
import InstagramAccount from '../models/InstagramAccount';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendMessage as sendInstagramMessage } from '../utils/instagram-api';
import { generateAIReply } from '../services/aiReplyService';
import { getActiveTicket, createTicket, addTicketUpdate } from '../services/escalationService';

const router = express.Router();

// Get all messages for a conversation
router.get('/conversation/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .populate('categoryId');
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update message category
router.patch('/:messageId/category', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { categoryId } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Track old category for count updates
    const oldCategoryId = message.categoryId;

    // Update message category
    message.categoryId = categoryId;
    await message.save();

    // Update category counts
    const MessageCategory = (await import('../models/MessageCategory')).default;

    // Decrement old category count if it exists
    if (oldCategoryId) {
      await MessageCategory.findByIdAndUpdate(
        oldCategoryId,
        { $inc: { messageCount: -1 } }
      );
    }

    // Increment new category count
    if (categoryId) {
      await MessageCategory.findByIdAndUpdate(
        categoryId,
        { $inc: { messageCount: 1 } }
      );
    }

    // Also update conversation category if this is the last customer message
    const lastCustomerMessage = await Message.findOne({
      conversationId: conversation._id,
      from: 'customer'
    }).sort({ createdAt: -1 }).limit(1);

    if (lastCustomerMessage && lastCustomerMessage._id.toString() === message._id.toString()) {
      conversation.categoryId = categoryId;
      await conversation.save();
    }

    const updatedMessage = await Message.findById(messageId).populate('categoryId');
    res.json(updatedMessage);
  } catch (error) {
    console.error('Update message category error:', error);
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

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Create message
    const message = await Message.create({
      conversationId,
      text,
      from: 'user',
    });

    // Update conversation's lastMessageAt
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
    });

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

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    const aiResponse = await generateAIReply({
      conversation,
      workspaceId: conversation.workspaceId,
      historyLimit: 20,
    });
    const settings = await WorkspaceSettings.findOne({ workspaceId: conversation.workspaceId });
    const activeTicket = await getActiveTicket(conversation._id);

    if (activeTicket) {
      aiResponse.shouldEscalate = true;
      aiResponse.escalationReason = aiResponse.escalationReason || activeTicket.reason || 'Escalation pending';
      aiResponse.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiResponse.replyText);
    } else if (!aiResponse.shouldEscalate && activeTicket) {
      aiResponse.replyText = `${aiResponse.replyText} Your earlier request is with a human teammate and they will confirm that separately.`;
    } else if (aiResponse.shouldEscalate) {
      aiResponse.replyText = buildInitialEscalationReply(aiResponse.replyText);
    }

    console.log('🤖 AI generated response:', aiResponse.replyText, 'escalate:', aiResponse.shouldEscalate);

    // Send message via Instagram API first with HUMAN_AGENT tag to ensure notifications
    const enableHumanAgentTag = process.env.USE_HUMAN_AGENT_TAG === 'true';
    console.log('📤 Sending AI-generated message to Instagram', enableHumanAgentTag ? 'with HUMAN_AGENT tag...' : 'without message tag...');

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

    console.log('✅ Instagram API confirmed AI message sent');

    // Only save to database AFTER successful send to Instagram
    let message;
    try {
      message = await Message.create({
        conversationId,
        text: aiResponse.replyText,
        from: 'ai',
        platform: 'instagram',
        instagramMessageId: result.message_id || undefined,
        aiTags: aiResponse.tags,
        aiShouldEscalate: aiResponse.shouldEscalate,
        aiEscalationReason: aiResponse.escalationReason,
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

      console.log('✅ AI message saved to database');
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

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
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
