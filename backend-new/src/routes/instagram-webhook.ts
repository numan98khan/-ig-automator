import express, { Request, Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import { fetchUserDetails } from '../utils/instagram-api';
import { webhookLogger } from '../utils/webhook-logger';

const router = express.Router();

const WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'your-verify-token';

/**
 * Webhook verification endpoint (GET)
 * Instagram calls this to verify your webhook URL
 */
router.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Log verification attempt
  webhookLogger.logWebhookVerification(req.query);

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    return res.status(403).send('Forbidden');
  }
});

/**
 * Webhook event receiver (POST)
 * Instagram sends real-time events here
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Log incoming webhook
    webhookLogger.logWebhookReceived(req.headers, payload);

    console.log('📥 Instagram webhook received');
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));

    // Acknowledge receipt immediately
    res.status(200).json({ received: true });

    // Process webhook asynchronously
    processWebhookPayload(payload).catch(error => {
      console.error('❌ Error processing webhook:', error);
      webhookLogger.logWebhookError(error, { payload });
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    webhookLogger.logWebhookError(error, { source: 'webhook_post_endpoint' });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Process Instagram webhook payload
 */
async function processWebhookPayload(payload: any) {
  if (payload.object !== 'instagram') {
    console.log('⏭️ Skipping non-Instagram webhook');
    return;
  }

  for (const entry of payload.entry || []) {
    // Handle messaging events (DMs)
    if (entry.messaging) {
      for (const messaging of entry.messaging) {
        await handleMessagingEvent(messaging);
      }
    }

    // Handle comment events
    if (entry.changes) {
      for (const change of entry.changes) {
        if (change.field === 'comments' && change.value) {
          await handleCommentEvent(change.value, entry.id);
        }
      }
    }
  }
}

/**
 * Handle incoming message events
 */
async function handleMessagingEvent(messaging: any) {
  try {
    if (!messaging.message) return;

    // Check if this is an echo (outbound message)
    const isEcho = messaging.message.is_echo === true;
    if (isEcho) {
      console.log('📤 Skipping outbound message echo');
      return; // Don't process our own sent messages
    }

    const senderId = messaging.sender.id;
    const recipientId = messaging.recipient.id; // Your Instagram business account ID
    const messageText = messaging.message.text || '[Media message]';
    const messageId = messaging.message.mid;
    const timestamp = new Date(messaging.timestamp);

    console.log(`📨 Processing message from ${senderId} to ${recipientId}`);

    // Find Instagram account by business account ID
    const igAccount = await InstagramAccount.findOne({
      instagramAccountId: recipientId,
      status: 'connected',
    }).select('+accessToken');

    if (!igAccount) {
      console.log(`⚠️ No Instagram account found for ${recipientId}`);
      return;
    }

    console.log(`✅ Found Instagram account: @${igAccount.username}`);

    // Check if message already exists (prevent duplicates)
    const existingMessage = await Message.findOne({ instagramMessageId: messageId });
    if (existingMessage) {
      console.log(`⏭️ Message ${messageId} already processed`);
      return;
    }

    // Get or create conversation
    let conversation = await Conversation.findOne({
      instagramAccountId: igAccount._id,
      participantInstagramId: senderId,
      platform: 'instagram',
    });

    if (!conversation) {
      // Fetch sender details from Instagram API
      webhookLogger.logApiCall(`User ${senderId}`, 'GET', { fields: 'id,username,name' });
      const senderDetails = await fetchUserDetails(senderId, igAccount.accessToken!);
      webhookLogger.logApiResponse(`User ${senderId}`, 200, senderDetails);

      conversation = await Conversation.create({
        workspaceId: igAccount.workspaceId,
        instagramAccountId: igAccount._id,
        participantName: senderDetails.name || senderDetails.username || 'Unknown User',
        participantHandle: `@${senderDetails.username || 'unknown'}`,
        participantInstagramId: senderId,
        instagramConversationId: `${recipientId}_${senderId}`, // Create unique conversation ID
        platform: 'instagram',
        lastMessageAt: timestamp,
        lastMessage: messageText,
      });

      console.log(`✨ Created new conversation with ${conversation.participantHandle}`);
    } else {
      // Update existing conversation
      conversation.lastMessageAt = timestamp;
      conversation.lastMessage = messageText;
      await conversation.save();
      console.log(`🔄 Updated conversation with ${conversation.participantHandle}`);
    }

    // Handle attachments
    const attachments = [];
    if (messaging.message.attachments) {
      for (const attachment of messaging.message.attachments) {
        if (attachment.payload?.url) {
          attachments.push({
            type: attachment.type || 'file',
            url: attachment.payload.url,
          });
        }
      }
    }

    // Create message
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      text: messageText,
      from: 'customer',
      instagramMessageId: messageId,
      platform: 'instagram',
      attachments: attachments.length > 0 ? attachments : undefined,
      createdAt: timestamp,
    });

    console.log(`💾 Saved message to conversation ${conversation._id}`);

    // Log successful processing
    webhookLogger.logWebhookProcessed('messaging', messaging, {
      conversationId: conversation._id,
      messageId: savedMessage._id,
      participantHandle: conversation.participantHandle,
    });

  } catch (error) {
    console.error('❌ Error handling messaging event:', error);
    webhookLogger.logWebhookError(error, { eventType: 'messaging', messaging });
  }
}

/**
 * Handle comment events
 */
async function handleCommentEvent(comment: any, instagramAccountId: string) {
  try {
    const commenterId = comment.from?.id;
    const commentText = comment.text;
    const commentId = comment.id;
    const mediaId = comment.media?.id;

    console.log(`💬 Processing comment from ${comment.from?.username} on media ${mediaId}`);

    // Find Instagram account
    const igAccount = await InstagramAccount.findOne({
      instagramAccountId: instagramAccountId,
      status: 'connected',
    }).select('+accessToken');

    if (!igAccount) {
      console.log(`⚠️ No Instagram account found for ${instagramAccountId}`);
      return;
    }

    // Check if comment already exists
    const existingMessage = await Message.findOne({ instagramMessageId: commentId });
    if (existingMessage) {
      console.log(`⏭️ Comment ${commentId} already processed`);
      return;
    }

    // Get or create conversation for this commenter
    let conversation = await Conversation.findOne({
      instagramAccountId: igAccount._id,
      participantInstagramId: commenterId,
      platform: 'instagram',
    });

    if (!conversation) {
      conversation = await Conversation.create({
        workspaceId: igAccount.workspaceId,
        instagramAccountId: igAccount._id,
        participantName: comment.from?.username || 'Unknown User',
        participantHandle: `@${comment.from?.username || 'unknown'}`,
        participantInstagramId: commenterId,
        instagramConversationId: `${instagramAccountId}_${commenterId}`,
        platform: 'instagram',
        lastMessageAt: new Date(),
        lastMessage: commentText,
      });

      console.log(`✨ Created conversation for commenter ${conversation.participantHandle}`);
    }

    // Store comment as a message
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      text: commentText,
      from: 'customer',
      instagramMessageId: commentId,
      platform: 'instagram',
      metadata: {
        type: 'comment',
        mediaId: mediaId,
      },
    });

    console.log(`💾 Saved comment to conversation ${conversation._id}`);

    // Log successful processing
    webhookLogger.logWebhookProcessed('comment', comment, {
      conversationId: conversation._id,
      messageId: savedMessage._id,
      participantHandle: conversation.participantHandle,
      mediaId,
    });

  } catch (error) {
    console.error('❌ Error handling comment event:', error);
    webhookLogger.logWebhookError(error, { eventType: 'comment', comment });
  }
}



export default router;
