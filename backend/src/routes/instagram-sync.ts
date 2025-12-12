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
  sendMediaMessage,
  sendButtonMessage,
  sendCommentReply,
  markMessageAsRead,
  fetchMessageDetails,
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
 * Send a message via Instagram (supports text, media, buttons, and comment replies)
 */
router.post('/send-message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      conversationId,
      text,
      messageType = 'text',
      mediaUrl,
      buttons,
      isCommentReply,
      commentId,
    } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
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
    if (!igAccount || !igAccount.accessToken || !igAccount.instagramAccountId) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    let result;
    let messageText = text;
    let messageAttachments: any[] = [];

    console.log(`📤 Sending ${messageType} message to:`, conversation.participantHandle);

    // Route to appropriate API function based on message type
    if (isCommentReply && commentId) {
      // Send private reply to comment
      console.log('📝 Sending comment reply using comment_id:', commentId);
      result = await sendCommentReply(
        igAccount.instagramAccountId,
        commentId,
        text,
        igAccount.accessToken
      );
    } else if (messageType === 'image' && mediaUrl) {
      // Send image message
      console.log('📸 Sending image message');
      result = await sendMediaMessage(
        igAccount.instagramAccountId,
        conversation.participantInstagramId,
        'image',
        mediaUrl,
        igAccount.accessToken
      );
      messageAttachments = [{ type: 'image', url: mediaUrl }];
      messageText = text || '[Image]';
    } else if (messageType === 'video' && mediaUrl) {
      // Send video message
      console.log('🎥 Sending video message');
      result = await sendMediaMessage(
        igAccount.instagramAccountId,
        conversation.participantInstagramId,
        'video',
        mediaUrl,
        igAccount.accessToken
      );
      messageAttachments = [{ type: 'video', url: mediaUrl }];
      messageText = text || '[Video]';
    } else if (messageType === 'audio' && mediaUrl) {
      // Send audio message
      console.log('🎧 Sending audio message');
      result = await sendMediaMessage(
        igAccount.instagramAccountId,
        conversation.participantInstagramId,
        'audio',
        mediaUrl,
        igAccount.accessToken
      );
      messageAttachments = [{ type: 'audio', url: mediaUrl }];
      messageText = text || '[Audio]';
    } else if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      // Send button template message
      console.log('🔘 Sending button template with', buttons.length, 'buttons');

      // Transform frontend button format to Instagram API format
      const transformedButtons = buttons.slice(0, 3).map((button: any) => {
        if (button.actionType === 'url' && button.url) {
          return {
            type: 'web_url' as const,
            title: button.title,
            url: button.url,
          };
        } else {
          // Default to postback for all other action types
          let payload = '';

          if (button.tag) {
            payload = `tag:${button.tag}`;
          } else if (button.actionType === 'next_step' && button.nextStepId) {
            payload = `next_step:${button.nextStepId}`;
          } else if (button.payload) {
            payload = button.payload;
          } else {
            payload = `button_${button.title}`;
          }

          return {
            type: 'postback' as const,
            title: button.title || 'Button',
            payload: payload,
          };
        }
      }).filter(Boolean);

      console.log('📤 Transformed buttons:', JSON.stringify(transformedButtons, null, 2));

      result = await sendButtonMessage(
        igAccount.instagramAccountId,
        conversation.participantInstagramId,
        text,
        transformedButtons,
        igAccount.accessToken
      );
    } else {
      // Send regular text message
      console.log('📤 Sending text message');

      if (!text) {
        return res.status(400).json({ error: 'text is required for text messages' });
      }

      result = await sendInstagramMessage(
        conversation.participantInstagramId,
        text,
        igAccount.accessToken
      );
    }

    // Verify Instagram API returned success
    if (!result || (!result.message_id && !result.recipient_id)) {
      throw new Error('Instagram API did not return a valid response. Message may not have been sent.');
    }

    console.log('✅ Instagram API confirmed message sent');

    // Only save to database AFTER successful send to Instagram
    let message;
    try {
      message = await Message.create({
        conversationId: conversation._id,
        text: messageText,
        from: 'user',
        platform: 'instagram',
        instagramMessageId: result.message_id || undefined,
        attachments: messageAttachments.length > 0 ? messageAttachments : undefined,
        metadata: buttons ? { buttons } : undefined,
      });

      // Update conversation's last message
      conversation.lastMessage = messageText;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      console.log('✅ Message saved to database');
    } catch (dbError: any) {
      // Message was sent to Instagram but failed to save to DB
      console.error('⚠️ Message sent to Instagram but failed to save to database:', dbError);
      // Return success since message was delivered, but include warning
      return res.status(200).json({
        success: true,
        warning: 'Message sent successfully but database save failed',
        instagramMessageId: result.message_id,
        error: dbError.message,
      });
    }

    res.json(message);

  } catch (error: any) {
    console.error('❌ Error sending Instagram message:', error);

    // Check if error is from Instagram API or database
    const isInstagramError = error.message.includes('Failed to send') ||
      error.response?.data?.error;

    res.status(500).json({
      error: isInstagramError ? 'Failed to send message to Instagram' : 'Failed to process message',
      details: error.message,
      instagramError: isInstagramError,
    });
  }
});

/**
 * Mark a message/conversation as read
 */
router.post('/mark-as-read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    // Get conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.platform !== 'instagram' || !conversation.participantInstagramId) {
      return res.status(400).json({ error: 'Can only mark Instagram conversations as read' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken || !igAccount.instagramAccountId) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    // Mark as read via Instagram API
    const success = await markMessageAsRead(
      igAccount.instagramAccountId,
      conversation.participantInstagramId,
      igAccount.accessToken
    );

    res.json({ success });

  } catch (error: any) {
    console.error('❌ Error marking message as read:', error);
    res.status(500).json({
      error: 'Failed to mark as read',
      details: error.message,
    });
  }
});

/**
 * Get message details by ID
 */
router.get('/message/:messageId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;

    // Find message in database
    const message = await Message.findOne({ instagramMessageId: messageId });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get conversation to find Instagram account
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'Instagram account not found' });
    }

    // Fetch details from Instagram API
    const details = await fetchMessageDetails(messageId, igAccount.accessToken);

    res.json({
      ...message.toObject(),
      instagramDetails: details,
    });

  } catch (error: any) {
    console.error('❌ Error fetching message details:', error);
    res.status(500).json({
      error: 'Failed to fetch message details',
      details: error.message,
    });
  }
});

export default router;

