import express, { Response } from 'express';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Workspace from '../models/Workspace';
import InstagramAccount from '../models/InstagramAccount';
import MessageCategory from '../models/MessageCategory';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { fetchConversations, fetchUserDetails } from '../utils/instagram-api';

const router = express.Router();

// Get all conversations for a workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace (owner or member)
    const { hasAccess, workspace } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess || !workspace) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const conversations = await Conversation.find({ workspaceId })
      .sort({ lastMessageAt: -1 })
      .populate('categoryId');

    const normalizeId = (value: unknown): string | undefined => {
      if (!value) return undefined;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        const obj = value as { _id?: unknown };
        if (obj && obj._id) return obj._id.toString();
        if ('toString' in (obj || {}) && typeof (obj as any).toString === 'function') {
          return (obj as any).toString();
        }
      }
      if (typeof value === 'number' || typeof value === 'bigint') return String(value);
      return undefined;
    };

    // Get last message for each conversation
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .limit(1);

        const convObj = conv.toObject();
        return {
          ...convObj,
          instagramAccountId: normalizeId(convObj.instagramAccountId),
          lastMessage: lastMessage ? lastMessage.text : '',
          isSynced: true, // Local conversations are synced
          categoryName: conv.categoryId ? (conv.categoryId as any).name : undefined,
        };
      })
    );

    // Try to fetch unsynced conversations from Instagram
    try {
      const igAccount = await InstagramAccount.findOne({
        workspaceId: workspaceId as string,
        status: 'connected',
      }).select('+accessToken');

      if (igAccount && igAccount.accessToken) {
        const instagramConversations = await fetchConversations(igAccount.accessToken);
        const me = await fetchUserDetails('me', igAccount.accessToken);
        const myId = me.id;
        const myUsername = me.username;

        const existingConversationIds = new Set(
          conversations
            .map(c => c.instagramConversationId)
            .filter((id): id is string => Boolean(id)),
        );
        const existingParticipantIds = new Set(
          conversations
            .map(c => c.participantInstagramId)
            .filter((id): id is string => Boolean(id)),
        );

        // Find unsynced conversations
        const unsyncedConversations = instagramConversations
          .map((igConv: any) => {
            const participants = igConv.participants?.data || [];
            let participant = participants.find((p: any) => {
              const isMeById = p.id === myId;
              const isMeByUsername = p.username && myUsername && p.username.toLowerCase() === myUsername.toLowerCase();
              return !isMeById && !isMeByUsername;
            });

            if (!participant && participants.length > 0) {
              participant = participants.find((p: any) => p.username !== myUsername) || participants[0];
            }

            if (!participant) return null;

            if (existingConversationIds.has(igConv.id) || existingParticipantIds.has(participant.id)) {
              return null;
            }

            return {
              instagramConversationId: igConv.id,
              participantName: participant.name || participant.username || 'Instagram User',
              participantHandle: `@${participant.username || 'unknown'}`,
              participantInstagramId: participant.id,
              lastMessageAt: new Date(igConv.updated_time),
              platform: 'instagram',
              isSynced: false,
              instagramAccountId: igAccount._id.toString(),
              workspaceId: workspaceId,
            };
          })
          .filter((conv): conv is NonNullable<typeof conv> => conv !== null);

        // Merge synced and unsynced conversations
        const allConversations = [...conversationsWithLastMessage, ...unsyncedConversations];
        allConversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

        return res.json(allConversations);
      }
    } catch (igError) {
      console.error('Error fetching Instagram conversations:', igError);
      // Continue with just local conversations if Instagram fetch fails
    }

    res.json(conversationsWithLastMessage);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve / clear human escalation for a conversation
router.post('/:id/resolve-escalation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

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

    conversation.humanRequired = false;
    conversation.humanRequiredReason = undefined;
    conversation.humanTriggeredAt = undefined;
    conversation.humanTriggeredByMessageId = undefined;
    conversation.humanHoldUntil = undefined;
    await conversation.save();

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Resolve escalation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get human-required conversations for a workspace
router.get('/escalations/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const conversations = await Conversation.find({
      workspaceId,
      humanRequired: true,
    })
      .sort({ humanTriggeredAt: -1 })
      .limit(50);

    const payload = await Promise.all(conversations.map(async (conv) => {
      const recentMessages = await Message.find({ conversationId: conv._id })
        .sort({ createdAt: -1 })
        .limit(10);

      const lastEscalation = await Message.findOne({
        conversationId: conv._id,
        aiShouldEscalate: true,
      }).sort({ createdAt: -1 });

      return {
        conversation: conv,
        recentMessages: recentMessages.reverse(),
        lastEscalation,
        humanRequiredReason: conv.humanRequiredReason,
        humanHoldUntil: conv.humanHoldUntil,
        humanTriggeredAt: conv.humanTriggeredAt,
      };
    }));

    res.json(payload);
  } catch (error) {
    console.error('Get escalations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get conversation by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

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

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
