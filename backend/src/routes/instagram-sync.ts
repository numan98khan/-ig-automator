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

import {
  categorizeMessage,
  getOrCreateCategory,
  incrementCategoryCount
} from '../services/aiCategorization';

const router = express.Router();

/**
 * Get available conversations from Instagram for syncing
 */
router.get('/available-conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findOne({
      workspaceId: workspaceId as string,
      status: 'connected',
    }).select('+accessToken');

    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'No connected Instagram account found' });
    }

    // Fetch conversations from Instagram
    const instagramConversations = await fetchConversations(igAccount.accessToken);

    // Fetch confirmed "me" details from API to ensure correct filtering
    const me = await fetchUserDetails('me', igAccount.accessToken);
    const myId = me.id;
    const myUsername = me.username;

    // Get existing conversations from DB
    const existingConversations = await Conversation.find({
      workspaceId,
      platform: 'instagram',
    });

    const existingMap = new Map(existingConversations.map(c => [c.instagramConversationId, c]));

    // detailed list with status
    const results = await Promise.all(instagramConversations.map(async (igConv: any) => {
      const participants = igConv.participants?.data || [];

      // Robust filtering: Exclude the business account using confirmed API details
      let participant = participants.find((p: any) => {
        const isMeById = p.id === myId;
        const isMeByUsername = p.username && myUsername && p.username.toLowerCase() === myUsername.toLowerCase();
        return !isMeById && !isMeByUsername;
      });

      // Fallback: If filtering failed (all excluded, or list empty), take the one that is NOT the username if possible
      if (!participant && participants.length > 0) {
        // Try finding one that doesn't match username (if ID check failed previously)
        participant = participants.find((p: any) => p.username !== myUsername) || participants[0];
      }

      if (!participant) return null;

      const existing = existingMap.get(igConv.id);

      // Use name from API if available, otherwise existing name, otherwise generic
      let name = participant.name || participant.username || 'Instagram User';
      if (existing) {
        name = existing.participantName;
      }

      return {
        instagramConversationId: igConv.id,
        participantName: name, // Will be updated on sync
        participantId: participant.id,
        updatedAt: igConv.updated_time,
        lastMessage: existing?.lastMessage,
        isSynced: !!existing,
        categoryId: existing?.categoryId,
        categoryName: existing?.categoryId ? 'Categorized' : 'Uncategorized', // We'd need to populate to get name
      };
    }));

    res.json(results.filter(Boolean));

  } catch (error: any) {
    console.error('Error fetching available conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * Sync Instagram messages - Fetch all or specific conversation
 */
router.post('/sync-messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, conversationId: specificConversationId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    console.log('🔄 Starting Instagram message sync for workspace:', workspaceId);

    // Get Instagram account for this workspace
    const igAccount = await InstagramAccount.findOne({
      workspaceId,
      status: 'connected',
    }).select('+accessToken');

    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'No connected Instagram account found for this workspace' });
    }

    console.log('✅ Found Instagram account:', igAccount.username);

    // Fetch confirmed "me" details from API
    const me = await fetchUserDetails('me', igAccount.accessToken);
    const myId = me.id;
    const myUsername = me.username;
    console.log(`✅ Confirmed Business Identity: ${myUsername} (${myId})`);

    let conversationsToProcess: any[] = [];

    if (specificConversationId) {
      // Sync single conversation
      console.log(`🔄 Syncing specific conversation: ${specificConversationId}`);
      // We need to fetch just this one or filter from list. 
      // Graph API: /{conversation_id}
      // For now, simpler to fetch all and filter, or fetch messages directly if we knew participant.
      // We need conversation metadata (participants) which comes from conversation endpoint.
      // Let's fetch all for now to be safe and simple
      const allConversations = await fetchConversations(igAccount.accessToken);
      const found = allConversations.find((c: any) => c.id === specificConversationId);
      if (found) conversationsToProcess = [found];
    } else {
      // Sync all
      console.log('🔄 Fetching all conversations from Instagram...');
      conversationsToProcess = await fetchConversations(igAccount.accessToken);
    }

    console.log(`✅ Processing ${conversationsToProcess.length} conversations`);

    let conversationsSynced = 0;
    let messagesSynced = 0;

    // Process each conversation
    for (const igConv of conversationsToProcess) {
      try {
        // Get participant
        const participants = igConv.participants?.data || [];

        // Robust filtering: Exclude using confirmed API details
        let participant = participants.find((p: any) => {
          const isMeById = p.id === myId;
          const isMeByUsername = p.username && myUsername && p.username.toLowerCase() === myUsername.toLowerCase();
          return !isMeById && !isMeByUsername;
        });

        // Fallback
        if (!participant && participants.length > 0) {
          participant = participants.find((p: any) => p.username !== myUsername) || participants[0];
        }

        if (!participant) {
          continue;
        }

        // Fetch participant details
        let participantDetails = await fetchUserDetails(participant.id, igAccount.accessToken);

        // If fetchUserDetails failed (returns unknown), try to use data from participant object itself if available
        if (participantDetails.username === 'unknown' && participant.username) {
          participantDetails = {
            id: participant.id,
            username: participant.username,
            name: participant.name || participant.username || 'Instagram User'
          };
        }

        // Create or update conversation in database
        let conversation = await Conversation.findOne({
          instagramConversationId: igConv.id,
          instagramAccountId: igAccount._id,
        });

        if (conversation) {
          conversation.participantName = participantDetails.name || participantDetails.username || 'Unknown';
          conversation.participantHandle = `@${participantDetails.username || 'unknown'}`;
          conversation.participantInstagramId = participant.id;
          conversation.lastMessageAt = new Date(igConv.updated_time);
          conversation.platform = 'instagram';

          await conversation.save();
        } else {
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
        }

        conversationsSynced++;

        // Fetch messages (historically, so fetchAll = true)
        const messages = await fetchConversationMessages(igConv.id, igAccount.accessToken, 100, true);

        // Process messages
        for (const igMsg of messages) {
          const existingMessage = await Message.findOne({ instagramMessageId: igMsg.id });
          if (existingMessage) continue;

          const isFromCustomer = igMsg.from.id !== igAccount.instagramUserId;

          // Extract attachments (same logic as before)
          const attachments = [];
          if (igMsg.attachments?.data) {
            for (const att of igMsg.attachments.data) {
              if (att.image_url) attachments.push({ type: 'image', url: att.image_url });
              else if (att.video_url) attachments.push({ type: 'video', url: att.video_url });
              else if (att.audio_url) attachments.push({ type: 'audio', url: att.audio_url });
              else if (att.file_url) attachments.push({ type: 'file', url: att.file_url });
            }
          }

          // Safe date parsing
          let messageDate = new Date(igMsg.timestamp);
          if (isNaN(messageDate.getTime())) {
            console.warn(`⚠️ Invalid timestamp for message ${igMsg.id}: ${igMsg.timestamp}. Using current time.`);
            messageDate = new Date();
          }

          await Message.create({
            conversationId: conversation._id,
            text: igMsg.message || '[Attachment]',
            from: isFromCustomer ? 'customer' : 'user',
            instagramMessageId: igMsg.id,
            platform: 'instagram',
            attachments: attachments.length > 0 ? attachments : undefined,
            createdAt: messageDate,
          });
          messagesSynced++;
        }

        // Finalize Conversation & Run AI Categorization
        if (messages.length > 0) {
          const lastMsg = messages[0]; // Newest first
          conversation.lastMessage = lastMsg.message || '[Attachment]';

          // If last message is from customer, categorize it
          if (lastMsg.from.id !== igAccount.instagramUserId && lastMsg.message) {
            console.log(`🤖 Categorizing conversation ${conversation._id}...`);
            const catResult = await categorizeMessage(lastMsg.message, workspaceId);

            const categoryId = await getOrCreateCategory(workspaceId, catResult.categoryName);

            conversation.categoryId = categoryId;
            conversation.detectedLanguage = catResult.detectedLanguage;
            conversation.categoryConfidence = catResult.confidence;

            // Increment stats
            await incrementCategoryCount(categoryId);
            console.log(`✅ Conversation categorized as: ${catResult.categoryName}`);
          }

          await conversation.save();
        }

      } catch (convError) {
        console.error(`❌ Error processing conversation ${igConv.id}:`, convError);
      }
    }

    // Update last sync time
    igAccount.lastSyncedAt = new Date();
    await igAccount.save();

    res.json({
      success: true,
      conversationsSynced,
      messagesSynced,
      lastSyncedAt: igAccount.lastSyncedAt,
    });

  } catch (error: any) {
    console.error('❌ Instagram sync error:', error);
    res.status(500).json({ error: 'Failed to sync Instagram messages', details: error.message });
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

