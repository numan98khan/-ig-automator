import express, { Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  fetchConversations,
  fetchConversationMessages,
  fetchUserDetails,
  sendMessage as sendInstagramMessage,
} from '../utils/instagram-api';

const router = express.Router();

/**
 * Sync Instagram messages - Fetch all conversations and messages from Instagram Graph API
 */
router.post('/sync-messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    console.log('🔄 Starting Instagram message sync for workspace:', workspaceId);

    // Get Instagram account for this workspace
    const igAccount = await InstagramAccount.findOne({
      workspaceId,
      status: 'connected',
    }).select('+accessToken'); // Include accessToken field

    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'No connected Instagram account found for this workspace' });
    }

    console.log('✅ Found Instagram account:', igAccount.username);

    // Fetch conversations from Instagram
    console.log('🔄 Fetching conversations from Instagram...');
    const instagramConversations = await fetchConversations(igAccount.accessToken);
    console.log(`✅ Found ${instagramConversations.length} Instagram conversations`);

    let conversationsSynced = 0;
    let messagesSynced = 0;

    // Process each conversation
    for (const igConv of instagramConversations) {
      try {
        // Get participant (the other person in the conversation)
        const participants = igConv.participants?.data || [];
        const participant = participants.find(p => p.id !== igAccount.instagramUserId);

        if (!participant) {
          console.log(`⚠️ Skipping conversation ${igConv.id} - no valid participant found`);
          continue;
        }

        // Fetch participant details
        const participantDetails = await fetchUserDetails(participant.id, igAccount.accessToken);

        // Create or update conversation in database
        let conversation = await Conversation.findOne({
          instagramConversationId: igConv.id,
          instagramAccountId: igAccount._id,
        });

        if (conversation) {
          // Update existing conversation
          conversation.participantName = participantDetails.name || participantDetails.username || 'Unknown';
          conversation.participantHandle = `@${participantDetails.username || 'unknown'}`;
          conversation.participantInstagramId = participant.id;
          conversation.lastMessageAt = new Date(igConv.updated_time);
          conversation.platform = 'instagram';
          await conversation.save();
          console.log(`📝 Updated conversation with ${participantDetails.username}`);
        } else {
          // Create new conversation
          conversation = await Conversation.create({
            workspaceId,
            instagramAccountId: igAccount._id,
            participantName: participantDetails.name || participantDetails.username || 'Unknown',
            participantHandle: `@${participantDetails.username || 'unknown'}`,
            participantInstagramId: participant.id,
            instagramConversationId: igConv.id,
            platform: 'instagram',
            lastMessageAt: new Date(igConv.updated_time),
          });
          console.log(`✨ Created new conversation with ${participantDetails.username}`);
        }

        conversationsSynced++;

        // Fetch messages for this conversation
        console.log(`🔄 Fetching messages for conversation with ${participantDetails.username}...`);
        const messages = await fetchConversationMessages(igConv.id, igAccount.accessToken);
        console.log(`✅ Found ${messages.length} messages`);

        // Process each message
        for (const igMsg of messages) {
          // Check if message already exists
          const existingMessage = await Message.findOne({
            instagramMessageId: igMsg.id,
          });

          if (existingMessage) {
            continue; // Skip duplicate messages
          }

          // Determine message sender
          const isFromCustomer = igMsg.from.id !== igAccount.instagramUserId;

          // Extract attachments
          const attachments = [];
          if (igMsg.attachments?.data) {
            for (const att of igMsg.attachments.data) {
              if (att.image_url) {
                attachments.push({ type: 'image', url: att.image_url });
              } else if (att.video_url) {
                attachments.push({ type: 'video', url: att.video_url });
              } else if (att.audio_url) {
                attachments.push({ type: 'audio', url: att.audio_url });
              } else if (att.file_url) {
                attachments.push({ type: 'file', url: att.file_url });
              }
            }
          }

          // Create message
          await Message.create({
            conversationId: conversation._id,
            text: igMsg.message || '[Attachment]',
            from: isFromCustomer ? 'customer' : 'user',
            instagramMessageId: igMsg.id,
            platform: 'instagram',
            attachments: attachments.length > 0 ? attachments : undefined,
            createdAt: new Date(igMsg.timestamp),
          });

          messagesSynced++;
        }

        // Update conversation's last message
        if (messages.length > 0) {
          const lastMessage = messages[0]; // Instagram returns messages in reverse chronological order
          conversation.lastMessage = lastMessage.message || '[Attachment]';
          await conversation.save();
        }

      } catch (convError) {
        console.error(`❌ Error processing conversation ${igConv.id}:`, convError);
        // Continue with next conversation
      }
    }

    // Update last sync time
    igAccount.lastSyncedAt = new Date();
    await igAccount.save();

    console.log(`🎉 Sync complete! Conversations: ${conversationsSynced}, Messages: ${messagesSynced}`);

    res.json({
      success: true,
      conversationsSynced,
      messagesSynced,
      lastSyncedAt: igAccount.lastSyncedAt,
    });

  } catch (error: any) {
    console.error('❌ Instagram sync error:', error);
    res.status(500).json({
      error: 'Failed to sync Instagram messages',
      details: error.message,
    });
  }
});

/**
 * Send a message via Instagram
 */
router.post('/send-message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, text } = req.body;

    if (!conversationId || !text) {
      return res.status(400).json({ error: 'conversationId and text are required' });
    }

    // Get conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.platform !== 'instagram' || !conversation.participantInstagramId) {
      return res.status(400).json({ error: 'Can only send Instagram messages to Instagram conversations' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    // Send message via Instagram API
    console.log('📤 Sending Instagram message to:', conversation.participantHandle);
    const result = await sendInstagramMessage(
      conversation.participantInstagramId,
      text,
      igAccount.accessToken
    );

    // Save message to database
    const message = await Message.create({
      conversationId: conversation._id,
      text,
      from: 'user',
      platform: 'instagram',
      instagramMessageId: result.message_id || undefined,
    });

    // Update conversation's last message
    conversation.lastMessage = text;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    console.log('✅ Message sent successfully');

    res.json(message);

  } catch (error: any) {
    console.error('❌ Error sending Instagram message:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.message,
    });
  }
});

export default router;
