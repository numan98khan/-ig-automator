import express, { Response } from 'express';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Workspace from '../models/Workspace';
import InstagramAccount from '../models/InstagramAccount';
import MessageCategory from '../models/MessageCategory';
import { authenticate, AuthRequest } from '../middleware/auth';
import { fetchConversations, fetchUserDetails } from '../utils/instagram-api';

const router = express.Router();

// Get all conversations for a workspace
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

    const conversations = await Conversation.find({ workspaceId })
      .sort({ lastMessageAt: -1 })
      .populate('instagramAccountId')
      .populate('categoryId');

    // Get last message for each conversation
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .limit(1);

        return {
          ...conv.toObject(),
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

        const existingMap = new Map(conversations.map(c => [c.instagramConversationId, c]));

        // Find unsynced conversations
        const unsyncedConversations = instagramConversations
          .filter((igConv: any) => !existingMap.has(igConv.id))
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

            return {
              instagramConversationId: igConv.id,
              participantName: participant.name || participant.username || 'Instagram User',
              participantHandle: `@${participant.username || 'unknown'}`,
              participantInstagramId: participant.id,
              lastMessageAt: new Date(igConv.updated_time),
              platform: 'instagram',
              isSynced: false,
              instagramAccountId: igAccount._id,
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

// Get conversation by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

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

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
