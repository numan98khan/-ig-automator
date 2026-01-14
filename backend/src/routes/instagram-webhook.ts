import express, { Request, Response } from 'express';
import InstagramAccount from '../models/InstagramAccount';
import Contact from '../models/Contact';
import Conversation from '../models/Conversation';
import ContactNote from '../models/ContactNote';
import CrmTask from '../models/CrmTask';
import Escalation from '../models/Escalation';
import FollowupTask from '../models/FollowupTask';
import Message from '../models/Message';
import AutomationSession from '../models/AutomationSession';
import AutomationMessageBuffer from '../models/AutomationMessageBuffer';
import { fetchMessagingUserProfile } from '../utils/instagram-api';
import { webhookLogger } from '../utils/webhook-logger';
import {
  cancelFollowupOnCustomerReply,
  checkAndExecuteAutomations,
  maybeBufferAutomationMessage,
} from '../services/automationService';
import { transcribeAudioFromUrl } from '../services/transcriptionService';
import { trackDailyMetric } from '../services/reportingService';
import { getLogSettingsSnapshot } from '../services/adminLogSettingsService';
import { getWorkspaceSettings } from '../services/workspaceSettingsService';
import { requireEnv } from '../utils/requireEnv';
import type { TriggerType } from '../types/automation';

const router = express.Router();

const logAutomation = (message: string, details?: Record<string, unknown>) => {
  if (!getLogSettingsSnapshot().automationLogsEnabled) return;
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
};

type StoryTriggerInfo = {
  triggerType: TriggerType;
  payload?: any;
};

const extractStoryTriggerInfo = (messaging: any): StoryTriggerInfo | null => {
  const message = messaging?.message;
  if (!message) return null;

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const attachmentPayloads = attachments.map((attachment: any) => attachment?.payload).filter(Boolean);
  const findPayload = (predicate: (payload: any) => boolean) =>
    attachmentPayloads.find((payload: any) => predicate(payload));

  const storyMentionPayload = message.story_mention
    || message.mention
    || message.story?.mention
    || findPayload((payload) => payload?.story_mention || payload?.mention)?.story_mention
    || findPayload((payload) => payload?.mention)?.mention;

  if (storyMentionPayload) {
    return { triggerType: 'story_mention', payload: storyMentionPayload };
  }

  const storyReplyPayload = message.reply_to?.story
    || message.story_reply
    || message.story
    || findPayload((payload) => payload?.story_reply || payload?.story)?.story_reply
    || findPayload((payload) => payload?.story)?.story;

  if (storyReplyPayload || message.reply_to?.story || message.story) {
    return { triggerType: 'story_reply', payload: storyReplyPayload || message.reply_to?.story || message.story };
  }

  return null;
};

const resolveMessagingTriggerTypes = (storyTrigger: StoryTriggerInfo | null): TriggerType[] => {
  if (!storyTrigger) return ['dm_message'];
  if (storyTrigger.triggerType === 'story_mention') return ['story_mention', 'dm_message'];
  return ['story_reply', 'dm_message'];
};

const mergeDuplicateConversations = async (conversations: any[]) => {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return null;
  }
  if (conversations.length === 1) return conversations[0];

  const sorted = [...conversations].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  const [primary, ...duplicates] = sorted;
  const duplicateIds = duplicates.map((conversation) => conversation._id);

  const latestConversation = sorted.reduce((latest, current) => {
    const latestTime = new Date(latest.lastMessageAt || latest.updatedAt || 0).getTime();
    const currentTime = new Date(current.lastMessageAt || current.updatedAt || 0).getTime();
    return currentTime > latestTime ? current : latest;
  }, primary);

  if (!primary.contactId) {
    const fallbackContact = duplicates.find((conversation) => conversation.contactId)?.contactId;
    if (fallbackContact) {
      primary.contactId = fallbackContact;
    }
  }
  if (!primary.participantName && latestConversation.participantName) {
    primary.participantName = latestConversation.participantName;
  }
  if (!primary.participantHandle && latestConversation.participantHandle) {
    primary.participantHandle = latestConversation.participantHandle;
  }
  if (!primary.participantProfilePictureUrl && latestConversation.participantProfilePictureUrl) {
    primary.participantProfilePictureUrl = latestConversation.participantProfilePictureUrl;
  }
  if (latestConversation.lastMessageAt) {
    primary.lastMessageAt = latestConversation.lastMessageAt;
    primary.lastMessage = latestConversation.lastMessage;
  }
  if (latestConversation.lastCustomerMessageAt) {
    primary.lastCustomerMessageAt = latestConversation.lastCustomerMessageAt;
  }
  if (latestConversation.lastBusinessMessageAt) {
    primary.lastBusinessMessageAt = latestConversation.lastBusinessMessageAt;
  }

  await primary.save();

  await Promise.all([
    Message.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    AutomationSession.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    FollowupTask.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    Escalation.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    CrmTask.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    ContactNote.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
    AutomationMessageBuffer.updateMany({ conversationId: { $in: duplicateIds } }, { $set: { conversationId: primary._id } }),
  ]);

  await Conversation.deleteMany({ _id: { $in: duplicateIds } });

  return primary;
};

const WEBHOOK_VERIFY_TOKEN = requireEnv('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');

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
    const hasMessage = Boolean(messaging.message);
    const hasPostback = Boolean(messaging.postback);

    if (!hasMessage && !hasPostback) return;

    // Check if this is an echo (outbound message)
    const isEcho = messaging.message?.is_echo === true;
    if (isEcho) {
      console.log('📤 Skipping outbound message echo');
      return; // Don't process our own sent messages
    }

    const senderId = messaging.sender.id;
    const recipientId = messaging.recipient.id; // Your Instagram business account ID
    const messageText = messaging.message?.text
      || messaging.postback?.title
      || '[Postback]';
    const messageId = messaging.message?.mid || messaging.postback?.mid;
    const timestamp = new Date(messaging.timestamp);
    const storyTrigger = extractStoryTriggerInfo(messaging);

    console.log(`📨 Processing message from ${senderId} to ${recipientId}`);

    // Find Instagram account by business account ID
    const igAccount = await InstagramAccount.findOne({
      instagramAccountId: recipientId,
      status: 'connected',
    }).select('+accessToken +pageAccessToken');

    if (!igAccount) {
      console.log(`⚠️ No Instagram account found for ${recipientId}`);
      return;
    }

    console.log(`✅ Found Instagram account: @${igAccount.username}`);
    const profileToken = igAccount.pageAccessToken || igAccount.accessToken;

    // Check if message already exists (prevent duplicates)
    if (messageId) {
      const existingMessage = await Message.findOne({ instagramMessageId: messageId });
      if (existingMessage) {
        console.log(`⏭️ Message ${messageId} already processed`);
        return;
      }
    }

    // Get or create conversation
    let conversation = null;
    const existingConversations = await Conversation.find({
      instagramAccountId: igAccount._id,
      participantInstagramId: senderId,
      platform: 'instagram',
    });
    if (existingConversations.length > 0) {
      conversation = await mergeDuplicateConversations(existingConversations);
    }

    const fetchSenderDetails = async () => {
      if (!profileToken) {
        console.warn('Missing access token; skipping sender profile lookup.');
        return null;
      }
      webhookLogger.logApiCall(`User ${senderId}`, 'GET', { fields: 'id,username,name,profile_pic' });
      const senderDetails = await fetchMessagingUserProfile(senderId, profileToken);
      webhookLogger.logApiResponse(`User ${senderId}`, 200, senderDetails);
      return senderDetails;
    };

    const formatProfileDetails = (details: any) => {
      const resolvedName = details?.name || details?.username || 'Instagram User';
      const resolvedUsername = details?.username || senderId;
      const resolvedHandle = resolvedUsername.startsWith('@')
        ? resolvedUsername
        : `@${resolvedUsername}`;
      const profilePictureUrl = details?.profile_pic
        || details?.profile_picture_url
        || details?.profilePictureUrl;
      return {
        name: resolvedName,
        handle: resolvedHandle,
        profilePictureUrl,
      };
    };

    let isNewConversation = false;
    if (!conversation) {
      // Fetch sender details from Instagram API
      const senderDetails = await fetchSenderDetails();
      const profile = formatProfileDetails(senderDetails);
      const contact = await Contact.create({
        workspaceId: igAccount.workspaceId,
        participantName: profile.name,
        participantHandle: profile.handle,
        profilePictureUrl: profile.profilePictureUrl,
      });
      conversation = await Conversation.create({
        workspaceId: igAccount.workspaceId,
        instagramAccountId: igAccount._id,
        participantName: profile.name,
        participantHandle: profile.handle,
        participantProfilePictureUrl: profile.profilePictureUrl,
        participantInstagramId: senderId,
        instagramConversationId: `${recipientId}_${senderId}`, // Create unique conversation ID
        platform: 'instagram',
        lastMessageAt: timestamp,
        lastMessage: messageText,
        lastCustomerMessageAt: timestamp, // Track for 24h follow-up
        contactId: contact._id,
      });

      isNewConversation = true;
      const mergedConversation = await mergeDuplicateConversations(
        await Conversation.find({
          instagramAccountId: igAccount._id,
          participantInstagramId: senderId,
          platform: 'instagram',
        }),
      );
      if (mergedConversation) {
        conversation = mergedConversation;
      }
      console.log(`✨ Created new conversation with ${conversation.participantHandle}`);
    } else {
      // Update existing conversation
      const shouldRefreshProfile = Boolean(profileToken)
        && (!conversation.participantName
          || !conversation.participantHandle
          || conversation.participantHandle === '@unknown'
          || conversation.participantName === 'Unknown User'
          || !conversation.participantProfilePictureUrl);
      if (shouldRefreshProfile) {
        const senderDetails = await fetchSenderDetails();
        const profile = formatProfileDetails(senderDetails);
        conversation.participantName = profile.name;
        conversation.participantHandle = profile.handle;
        conversation.participantProfilePictureUrl = profile.profilePictureUrl;
        if (conversation.contactId) {
          await Contact.findByIdAndUpdate(conversation.contactId, {
            participantName: profile.name,
            participantHandle: profile.handle,
            profilePictureUrl: profile.profilePictureUrl,
          });
        } else {
          const contact = await Contact.create({
            workspaceId: igAccount.workspaceId,
            participantName: profile.name,
            participantHandle: profile.handle,
            profilePictureUrl: profile.profilePictureUrl,
          });
          conversation.contactId = contact._id;
        }
      } else if (!conversation.contactId) {
        const contact = await Contact.create({
          workspaceId: igAccount.workspaceId,
          participantName: conversation.participantName,
          participantHandle: conversation.participantHandle,
          profilePictureUrl: conversation.participantProfilePictureUrl,
        });
        conversation.contactId = contact._id;
      }
      conversation.lastMessageAt = timestamp;
      conversation.lastMessage = messageText;
      conversation.lastCustomerMessageAt = timestamp; // Track for 24h follow-up
      await conversation.save();
      console.log(`🔄 Updated conversation with ${conversation.participantHandle}`);

      // Cancel any pending follow-ups since customer replied
      await cancelFollowupOnCustomerReply(conversation._id);
    }

    // Handle attachments with rich metadata
    const attachments = [];
    if (messaging.message?.attachments) {
      for (const attachment of messaging.message.attachments) {
        if (attachment.payload?.url) {
          const attachmentData: any = {
            type: attachment.type || 'file', // image, video, audio, file
            url: attachment.payload.url,
          };

          // Add preview/thumbnail URL if available
          if (attachment.payload.preview_url) {
            attachmentData.previewUrl = attachment.payload.preview_url;
          }
          if (attachment.payload.thumbnail_url) {
            attachmentData.thumbnailUrl = attachment.payload.thumbnail_url;
          }

          // Add media metadata
          if (attachment.payload.mime_type) {
            attachmentData.mimeType = attachment.payload.mime_type;
          }
          if (attachment.payload.file_size) {
            attachmentData.fileSize = attachment.payload.file_size;
          }

          // Add dimensions for images/videos
          if (attachment.payload.width) {
            attachmentData.width = attachment.payload.width;
          }
          if (attachment.payload.height) {
            attachmentData.height = attachment.payload.height;
          }

          // Add duration for videos/audio
          if (attachment.payload.duration) {
            attachmentData.duration = attachment.payload.duration;
          }

          // Add filename if available
          if (attachment.payload.name) {
            attachmentData.fileName = attachment.payload.name;
          }

          // Special handling for voice messages
          if (attachment.type === 'audio' && attachment.payload.is_voice_message) {
            attachmentData.type = 'voice';
          }

          attachments.push(attachmentData);
        }
      }
    }

    const messageMetadata: Record<string, any> = {};
    if (messaging.postback) {
      messageMetadata.type = 'postback';
      messageMetadata.title = messaging.postback.title;
      messageMetadata.payload = messaging.postback.payload;
    }
    if (storyTrigger) {
      messageMetadata.story = {
        type: storyTrigger.triggerType,
        payload: storyTrigger.payload,
      };
    }

    // Create message (we'll update with categorization data)
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId: conversation.workspaceId,
      text: messageText,
      from: 'customer',
      instagramMessageId: messageId,
      platform: 'instagram',
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : undefined,
      createdAt: timestamp,
    });

    console.log(`💾 Saved message to conversation ${conversation._id}`);

    // === VOICE NOTE TRANSCRIPTION ===
    // Transcribe voice notes BEFORE automation (critical for AI to read transcription)
    const hasVoiceNote = attachments.some((att: any) => att.type === 'voice' || att.type === 'audio');
    let finalMessageText = messageText;

    if (hasVoiceNote) {
      try {
        console.log('🎤 Voice note detected - transcribing before automation...');
        await transcribeVoiceNotes(savedMessage);

        // Reload the message to get the updated text with transcription
        const updatedMessage = await Message.findById(savedMessage._id);
        if (updatedMessage) {
          finalMessageText = updatedMessage.text;
          console.log(`✅ Using transcribed text for automation: "${finalMessageText.substring(0, 100)}..."`);
        }
      } catch (error) {
        console.error('❌ Error transcribing voice note:', error);
        webhookLogger.logWebhookError(error, {
          eventType: 'transcription',
          messageId: savedMessage._id
        });
        // Continue with original text if transcription fails
      }
    }

    // Mark our previous messages as seen (customer is replying, so they've seen our messages)
    await Message.updateMany(
      {
        conversationId: conversation._id,
        from: { $in: ['user', 'ai'] },
        seenAt: null,
      },
      {
        $set: { seenAt: new Date() },
      }
    );

    // Log successful processing
    webhookLogger.logWebhookProcessed('messaging', messaging, {
      conversationId: conversation._id,
      messageId: savedMessage._id,
      participantHandle: conversation.participantHandle,
    });

    const inboundIncrements: Record<string, number> = { inboundMessages: 1 };
    if (isNewConversation) {
      inboundIncrements.newConversations = 1;
    }
    await trackDailyMetric(conversation.workspaceId, timestamp, inboundIncrements);

    // === PHASE 2: AUTOMATION PROCESSING ===
    // Process automations asynchronously to not block webhook response
    // Use finalMessageText which includes transcription if it was a voice note
    const triggerTypes = resolveMessagingTriggerTypes(storyTrigger);
    processMessageAutomations(
      conversation,
      savedMessage,
      finalMessageText,
      igAccount.workspaceId.toString(),
      triggerTypes,
    ).catch(error => {
      console.error('❌ Error processing message automations:', error);
      webhookLogger.logWebhookError(error, { eventType: 'automation', conversationId: conversation._id });
    });

  } catch (error) {
    console.error('❌ Error handling messaging event:', error);
    webhookLogger.logWebhookError(error, { eventType: 'messaging', messaging });
  }
}

/**
 * Transcribe voice notes in a message and update the message with transcriptions
 */
async function transcribeVoiceNotes(message: any): Promise<void> {
  try {
    if (!message.attachments || message.attachments.length === 0) {
      return;
    }

    let hasTranscriptions = false;
    let transcribedText = message.text || '';

    for (const attachment of message.attachments) {
      // Only transcribe voice and audio attachments
      if (attachment.type === 'voice' || attachment.type === 'audio') {
        console.log(`🎤 Transcribing ${attachment.type} message...`);

        try {
          const transcription = await transcribeAudioFromUrl(attachment.url, {
            model: 'gpt-4o-mini-transcribe',
            prompt: 'This audio may contain multiple languages including English, Arabic, Urdu, Hindi, Spanish, French, and others. Please transcribe exactly as spoken, preserving all languages.',
          });

          // Update the attachment with the transcription
          attachment.transcription = transcription;
          hasTranscriptions = true;

          console.log(`✅ Transcribed ${attachment.type}: "${transcription.substring(0, 100)}..."`);

          // If message text is just a placeholder, replace it with transcription
          if (!message.text || message.text === '[Voice Note]' || message.text === '[Audio]') {
            transcribedText = transcription;
          } else {
            // Append transcription to existing text
            transcribedText += `\n\n[Voice transcription: ${transcription}]`;
          }
        } catch (error: any) {
          console.error(`❌ Failed to transcribe ${attachment.type}:`, error.message);
          // Don't fail the whole process if one transcription fails
          attachment.transcription = '[Transcription failed]';
        }
      }
    }

    // Save updated message if we have transcriptions
    if (hasTranscriptions) {
      message.text = transcribedText;
      await message.save();
      console.log(`💾 Updated message with transcriptions`);
    }
  } catch (error) {
    console.error('Error in transcribeVoiceNotes:', error);
    throw error;
  }
}

/**
 * Process message automations
 */
async function processMessageAutomations(
  conversation: any,
  savedMessage: any,
  messageText: string,
  workspaceId: string,
  triggerTypes: TriggerType[] = ['dm_message'],
) {
  try {
    logAutomation(`🤖 Processing automations for conversation ${conversation._id}`);

    const workspaceSettings = await getWorkspaceSettings(workspaceId);
    if (workspaceSettings?.demoModeEnabled) {
      logAutomation('ℹ️ Demo mode enabled - skipping automations', {
        workspaceId,
        conversationId: conversation._id?.toString(),
      });
      return;
    }

    const messageContext = {
      hasLink: Boolean(savedMessage.linkPreview?.url || /https?:\/\/\S+/i.test(messageText)),
      hasAttachment: Array.isArray(savedMessage.attachments) && savedMessage.attachments.length > 0,
      linkUrl: savedMessage.linkPreview?.url,
      attachmentUrls: Array.isArray(savedMessage.attachments)
        ? savedMessage.attachments.map((attachment: any) => attachment.url).filter(Boolean)
        : undefined,
    };

    const shouldBufferDm = triggerTypes.length === 1 && triggerTypes[0] === 'dm_message';
    if (shouldBufferDm) {
      const bufferResult = await maybeBufferAutomationMessage({
        workspaceId,
        conversationId: conversation._id.toString(),
        instagramAccountId: conversation.instagramAccountId.toString(),
        triggerType: 'dm_message',
        messageText,
        platform: conversation.platform || 'instagram',
        messageContext,
        source: 'live',
      });
      if (bufferResult.buffered) {
        logAutomation('🧺 Buffered DM burst message', {
          conversationId: conversation._id?.toString(),
          bufferId: bufferResult.bufferId,
          bufferSeconds: bufferResult.bufferSeconds,
        });
        return;
      }
    }

    const fallbackErrors = new Set([
      'No active automations found for this trigger',
      'No automations matched trigger filters',
    ]);
    let lastError: string | undefined;

    for (const triggerType of triggerTypes) {
      const automationResult = await checkAndExecuteAutomations({
        workspaceId,
        triggerType,
        conversationId: conversation._id.toString(),
        messageText,
        instagramAccountId: conversation.instagramAccountId.toString(),
        platform: conversation.platform || 'instagram',
        messageContext,
      });

      if (automationResult.executed) {
        logAutomation(`✅ Automation executed: ${automationResult.automationName}`);
        return;
      }

      if (automationResult.error && !fallbackErrors.has(automationResult.error)) {
        logAutomation('⚠️  [AUTOMATION] Execution failed', { error: automationResult.error, triggerType });
        return;
      }

      lastError = automationResult.error;
    }

    if (lastError && !fallbackErrors.has(lastError)) {
      logAutomation('⚠️  [AUTOMATION] Execution failed', { error: lastError });
    } else {
      logAutomation('ℹ️ No automations matched trigger filters');
    }

  } catch (error) {
    console.error('❌ Error in processMessageAutomations:', error);
    throw error;
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
    }).select('+accessToken +pageAccessToken');

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

    let isNewConversation = false;

    if (!conversation) {
      let commenterProfileUrl: string | undefined;
      if (commenterId && igAccount.pageAccessToken) {
        const commenterDetails = await fetchMessagingUserProfile(commenterId, igAccount.pageAccessToken);
        commenterProfileUrl = commenterDetails.profile_pic
          || commenterDetails.profile_picture_url
          || commenterDetails.profilePictureUrl;
      } else if (commenterId) {
        console.warn('Missing page access token; skipping commenter profile lookup.');
      }

      const contact = await Contact.create({
        workspaceId: igAccount.workspaceId,
        participantName: comment.from?.username || 'Unknown User',
        participantHandle: `@${comment.from?.username || 'unknown'}`,
        profilePictureUrl: commenterProfileUrl,
      });
      conversation = await Conversation.create({
        workspaceId: igAccount.workspaceId,
        instagramAccountId: igAccount._id,
        participantName: comment.from?.username || 'Unknown User',
        participantHandle: `@${comment.from?.username || 'unknown'}`,
        participantProfilePictureUrl: commenterProfileUrl,
        participantInstagramId: commenterId,
        instagramConversationId: `${instagramAccountId}_${commenterId}`,
        platform: 'instagram',
        lastMessageAt: new Date(),
        lastMessage: commentText,
        lastCustomerMessageAt: new Date(), // Track for 24h follow-up
        contactId: contact._id,
      });

      console.log(`✨ Created conversation for commenter ${conversation.participantHandle}`);
      isNewConversation = true;
    } else {
      // Update existing conversation
      if (!conversation.contactId) {
        const contact = await Contact.create({
          workspaceId: igAccount.workspaceId,
          participantName: conversation.participantName,
          participantHandle: conversation.participantHandle,
          profilePictureUrl: conversation.participantProfilePictureUrl,
        });
        conversation.contactId = contact._id;
      }
      conversation.lastMessageAt = new Date();
      conversation.lastMessage = commentText;
      conversation.lastCustomerMessageAt = new Date();
      await conversation.save();
    }

    // Store comment as a message
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId: conversation.workspaceId,
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

    const commentDate = new Date();
    await trackDailyMetric(conversation.workspaceId, commentDate, {
      inboundMessages: 1,
      ...(isNewConversation ? { newConversations: 1 } : {}),
    });

    processMessageAutomations(
      conversation,
      savedMessage,
      commentText || '',
      igAccount.workspaceId.toString(),
      ['post_comment'],
    ).catch(error => {
      console.error('❌ Error processing comment automations:', error);
      webhookLogger.logWebhookError(error, { eventType: 'automation', conversationId: conversation._id });
    });

  } catch (error) {
    console.error('❌ Error handling comment event:', error);
    webhookLogger.logWebhookError(error, { eventType: 'comment', comment });
  }
}



export default router;
