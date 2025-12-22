import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import MessageCategory from '../models/MessageCategory';
import Message, { IMessage } from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import CommentDMLog from '../models/CommentDMLog';
import FollowupTask from '../models/FollowupTask';
import Automation from '../models/Automation';
import KnowledgeItem from '../models/KnowledgeItem';
import {
  sendMessage as sendInstagramMessage,
  sendCommentReply,
} from '../utils/instagram-api';
import {
  categorizeMessage,
  getOrCreateCategory,
  incrementCategoryCount,
} from './aiCategorization';
import { generateAIReply } from './aiReplyService';
import { getActiveTicket, createTicket, addTicketUpdate } from './escalationService';
import { addCountIncrement, mapGoalKey, trackDailyMetric } from './reportingService';
import { GoalConfigurations, GoalProgressState, GoalType } from '../types/automationGoals';
import { TriggerType } from '../types/automation';
import LeadCapture from '../models/LeadCapture';
import BookingRequest from '../models/BookingRequest';
import OrderIntent from '../models/OrderIntent';
import SupportTicketStub from '../models/SupportTicketStub';
import ChannelDriveEvent from '../models/ChannelDriveEvent';

const HUMAN_TYPING_PAUSE_MS = 3500; // Small pause to mimic human response timing
const SKIP_TYPING_PAUSE_IN_SANDBOX =
  process.env.SANDBOX_SKIP_TYPING_PAUSE === 'true' || process.env.SANDBOX_SKIP_TYPING_PAUSE === '1';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function shouldPauseForTyping(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean }
): boolean {
  const isSandboxMock = platform === 'mock';
  const skipTypingPause = isSandboxMock && (SKIP_TYPING_PAUSE_IN_SANDBOX || settings?.skipTypingPauseInSandbox);

  return HUMAN_TYPING_PAUSE_MS > 0 && !skipTypingPause;
}

export async function pauseForTypingIfNeeded(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean }
): Promise<void> {
  if (shouldPauseForTyping(platform, settings)) {
    await wait(HUMAN_TYPING_PAUSE_MS);
  }
}

const DEFAULT_GOAL_CONFIGS: GoalConfigurations = {
  leadCapture: {
    collectName: true,
    collectPhone: true,
    collectEmail: false,
    collectCustomNote: false,
  },
  booking: {
    bookingLink: '',
    collectDate: true,
    collectTime: true,
    collectServiceType: false,
  },
  order: {
    catalogUrl: '',
    collectProductName: true,
    collectQuantity: true,
    collectVariant: false,
  },
  support: {
    askForOrderId: true,
    askForPhoto: false,
  },
  drive: {
    targetType: 'website',
    targetLink: '',
  },
};

export function getGoalConfigs(settings: any): GoalConfigurations {
  return {
    leadCapture: { ...DEFAULT_GOAL_CONFIGS.leadCapture, ...(settings?.goalConfigs?.leadCapture || {}) },
    booking: { ...DEFAULT_GOAL_CONFIGS.booking, ...(settings?.goalConfigs?.booking || {}) },
    order: { ...DEFAULT_GOAL_CONFIGS.order, ...(settings?.goalConfigs?.order || {}) },
    support: { ...DEFAULT_GOAL_CONFIGS.support, ...(settings?.goalConfigs?.support || {}) },
    drive: { ...DEFAULT_GOAL_CONFIGS.drive, ...(settings?.goalConfigs?.drive || {}) },
  };
}

export function detectGoalIntent(text: string): GoalType {
  const lower = text.toLowerCase();

  if (/(book|appointment|schedule|reserve|reservation)/.test(lower)) return 'book_appointment';
  if (/(buy|price|order|purchase|checkout|cart|start order|place order)/.test(lower)) return 'start_order';
  if (/(interested|contact me|reach out|quote|more info|call me|email me)/.test(lower)) return 'capture_lead';
  if (/(late|broken|refund|problem|issue|support|help with order|cancel)/.test(lower)) return 'handle_support';
  if (/(where are you|location|address|website|site|link|whatsapp|app|store)/.test(lower)) return 'drive_to_channel';
  return 'none';
}

export function goalMatchesWorkspace(goal: GoalType, primary?: GoalType, secondary?: GoalType): boolean {
  if (!goal || goal === 'none') return false;
  return goal === primary || goal === secondary;
}

function mergeGoalFields(existing: Record<string, any> = {}, incoming?: Record<string, any>): Record<string, any> {
  if (!incoming) return existing;
  return { ...existing, ...incoming };
}

/**
 * Get or create workspace settings
 */
export async function getWorkspaceSettings(
  workspaceId: mongoose.Types.ObjectId | string
): Promise<any> {
  let settings = await WorkspaceSettings.findOne({ workspaceId });

  if (!settings) {
    settings = await WorkspaceSettings.create({ workspaceId });
  }

  return settings;
}

async function saveGoalOutcome(
  goalType: GoalType,
  conversation: any,
  fields: Record<string, any>,
  configs: GoalConfigurations,
  summary?: string,
  targetLink?: string,
): Promise<void> {
  if (goalType === 'capture_lead') {
    const existing = await LeadCapture.findOne({ conversationId: conversation._id });
    if (existing) return;

    await LeadCapture.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      goalType,
      participantName: conversation.participantName,
      participantHandle: conversation.participantHandle,
      name: fields.name || fields.fullName,
      phone: fields.phone,
      email: fields.email,
      customNote: fields.customNote || fields.note,
    });
  }

  if (goalType === 'book_appointment') {
    const existing = await BookingRequest.findOne({ conversationId: conversation._id });
    if (existing) return;

    await BookingRequest.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      bookingLink: targetLink || configs.booking.bookingLink,
      date: fields.date,
      time: fields.time,
      serviceType: fields.serviceType,
      summary,
    });
  }

  if (goalType === 'start_order') {
    const existing = await OrderIntent.findOne({ conversationId: conversation._id });
    if (existing) return;

    await OrderIntent.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      catalogUrl: targetLink || configs.order.catalogUrl,
      productName: fields.productName,
      quantity: fields.quantity,
      variant: fields.variant,
      summary,
    });
  }

  if (goalType === 'handle_support') {
    const existing = await SupportTicketStub.findOne({ conversationId: conversation._id });
    if (existing) return;

    await SupportTicketStub.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      orderId: fields.orderId || fields.ticketId,
      photoUrl: fields.photoUrl,
      summary,
    });
  }

  if (goalType === 'drive_to_channel') {
    const existing = await ChannelDriveEvent.findOne({ conversationId: conversation._id });
    if (existing) return;

    await ChannelDriveEvent.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      targetType: configs.drive.targetType,
      targetLink: targetLink || configs.drive.targetLink,
      note: summary,
    });
  }

  const completionIncrement: Record<string, number> = {};
  addCountIncrement(completionIncrement, 'goalCompletions', mapGoalKey(goalType));
  await trackDailyMetric(conversation.workspaceId, new Date(), completionIncrement);
}

/**
 * Execute an automation based on trigger type
 */
export async function executeAutomation(params: {
  workspaceId: string;
  triggerType: TriggerType;
  conversationId: string;
  participantInstagramId: string;
  messageText?: string;
  instagramAccountId: string;
  platform?: string;
}): Promise<{ success: boolean; automationExecuted?: string; error?: string }> {
  try {
    const { workspaceId, triggerType, conversationId, participantInstagramId, messageText, instagramAccountId, platform } = params;

    console.log('🤖 [AUTOMATION] Starting automation execution:', {
      workspaceId,
      triggerType,
      conversationId,
      participantInstagramId,
      instagramAccountId,
      messageTextPreview: messageText?.slice(0, 50),
      platform
    });

    // Find active automations matching this trigger type
    const automations = await Automation.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      triggerType,
      isActive: true,
    }).sort({ createdAt: 1 }); // Execute in order of creation

    console.log(`🔍 [AUTOMATION] Found ${automations.length} active automation(s) for trigger: ${triggerType}`);

    if (automations.length === 0) {
      console.log('⚠️  [AUTOMATION] No active automations found');
      return { success: false, error: 'No active automations found for this trigger' };
    }

    // Execute the first matching automation (for now)
    const automation = automations[0];
    console.log(`✅ [AUTOMATION] Executing automation: "${automation.name}" (ID: ${automation._id})`);

    const replyStep = automation.replySteps[0];

    if (!replyStep) {
      console.log('❌ [AUTOMATION] No reply step configured');
      return { success: false, error: 'No reply step configured' };
    }

    console.log(`📝 [AUTOMATION] Reply step type: ${replyStep.type}`);

    let replyText = '';

    // Generate reply based on step type
    if (replyStep.type === 'constant_reply') {
      replyText = replyStep.constantReply?.message || '';
      console.log(`💬 [AUTOMATION] Using constant reply (${replyText.length} chars)`);
    } else if (replyStep.type === 'ai_reply') {
      const { goalType, goalDescription, knowledgeItemIds } = replyStep.aiReply || {};
      console.log(`🧠 [AUTOMATION] Generating AI reply with goal: ${goalType}`);

      // Load knowledge items if specified
      let knowledgeContext = '';
      if (knowledgeItemIds && knowledgeItemIds.length > 0) {
        console.log(`📚 [AUTOMATION] Loading ${knowledgeItemIds.length} knowledge item(s)`);
        const knowledgeItems = await KnowledgeItem.find({
          _id: { $in: knowledgeItemIds.map(id => new mongoose.Types.ObjectId(id)) },
          workspaceId: new mongoose.Types.ObjectId(workspaceId),
        });

        console.log(`📚 [AUTOMATION] Found ${knowledgeItems.length} knowledge item(s)`);
        knowledgeContext = knowledgeItems.map(item => `${item.title}:\n${item.content}`).join('\n\n');
      }

      // Get conversation for context
      console.log(`🔍 [AUTOMATION] Loading conversation: ${conversationId}`);
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        console.log('❌ [AUTOMATION] Conversation not found');
        return { success: false, error: 'Conversation not found' };
      }

      // Get workspace settings
      console.log(`⚙️  [AUTOMATION] Loading workspace settings`);
      const settings = await getWorkspaceSettings(workspaceId);
      const goalConfigs = getGoalConfigs(settings);

      // Generate AI reply with the specified goal
      console.log(`🤖 [AUTOMATION] Calling generateAIReply service...`);
      const aiReplyResult = await generateAIReply({
        messageText: messageText || '',
        conversationId: conversation._id,
        workspaceId: conversation.workspaceId,
        primaryGoal: goalType,
        secondaryGoal: 'none',
        conversationGoal: conversation.activeGoalType,
        conversationGoalState: conversation.goalState,
        conversationCollectedFields: conversation.goalCollectedFields,
        settings,
        goalConfigs,
        customGoalDescription: goalDescription,
        customKnowledge: knowledgeContext,
      });

      console.log(`✅ [AUTOMATION] AI reply generated (${aiReplyResult.reply.length} chars)`);
      replyText = aiReplyResult.reply;

      // Save goal outcomes if AI completed the goal
      if (aiReplyResult.goalProgress?.shouldCreateRecord && aiReplyResult.goalProgress.goalType) {
        await saveGoalOutcome(
          aiReplyResult.goalProgress.goalType,
          conversation,
          aiReplyResult.goalProgress.collectedFields || {},
          goalConfigs,
          aiReplyResult.goalProgress.summary,
          aiReplyResult.goalProgress.targetLink
        );

        // Update conversation goal tracking
        conversation.activeGoalType = aiReplyResult.goalProgress.goalType;
        conversation.goalState = aiReplyResult.goalProgress.status || 'completed';
        conversation.goalCollectedFields = aiReplyResult.goalProgress.collectedFields;
        conversation.goalSummary = aiReplyResult.goalProgress.summary;
        conversation.goalLastInteractionAt = new Date();
        await conversation.save();
      }
    }

    if (!replyText) {
      console.log('❌ [AUTOMATION] No reply text generated');
      return { success: false, error: 'No reply text generated' };
    }

    console.log(`📤 [AUTOMATION] Preparing to send message (${replyText.length} chars)`);

    // Send the message
    console.log(`🔍 [AUTOMATION] Loading Instagram account: ${instagramAccountId}`);
    const igAccount = await InstagramAccount.findById(instagramAccountId);
    if (!igAccount) {
      console.log('❌ [AUTOMATION] Instagram account not found');
      return { success: false, error: 'Instagram account not found' };
    }

    console.log(`✅ [AUTOMATION] Instagram account loaded: @${igAccount.username}`);
    console.log(`🔑 [AUTOMATION] Access token status:`, {
      hasToken: !!igAccount.accessToken,
      tokenLength: igAccount.accessToken?.length || 0,
      tokenExpiresAt: igAccount.tokenExpiresAt,
      isExpired: igAccount.tokenExpiresAt ? new Date(igAccount.tokenExpiresAt) < new Date() : 'unknown',
      lastSyncedAt: igAccount.lastSyncedAt
    });

    if (!igAccount.accessToken) {
      console.log('❌ [AUTOMATION] No access token available for Instagram account');
      return { success: false, error: 'Instagram account has no access token' };
    }

    if (igAccount.tokenExpiresAt && new Date(igAccount.tokenExpiresAt) < new Date()) {
      console.log('⚠️  [AUTOMATION] Access token is EXPIRED');
      console.log(`⚠️  [AUTOMATION] Token expired at: ${igAccount.tokenExpiresAt}`);
      console.log(`⚠️  [AUTOMATION] Current time: ${new Date()}`);
    }

    console.log(`⏳ [AUTOMATION] Pausing for typing simulation...`);
    await pauseForTypingIfNeeded(platform);

    console.log(`📨 [AUTOMATION] Sending Instagram message to: ${participantInstagramId}`);
    console.log(`📨 [AUTOMATION] Message preview: "${replyText.slice(0, 100)}..."`);

    try {
      const sentMessage = await sendInstagramMessage({
        recipientInstagramId: participantInstagramId,
        text: replyText,
        accessToken: igAccount.accessToken,
      });

      console.log(`✅ [AUTOMATION] Message sent successfully:`, {
        messageId: sentMessage?.id,
        recipientId: sentMessage?.recipient_id || participantInstagramId
      });

      // Save message to database
      await Message.create({
        conversationId: new mongoose.Types.ObjectId(conversationId),
        text: replyText,
        sender: 'business',
        platform: platform || 'instagram',
        instagramMessageId: sentMessage?.id,
      });

      console.log(`💾 [AUTOMATION] Message saved to database`);

      // Update automation stats
      automation.stats.totalTriggered += 1;
      automation.stats.totalRepliesSent += 1;
      automation.stats.lastTriggeredAt = new Date();
      automation.stats.lastReplySentAt = new Date();
      await automation.save();

      console.log(`📊 [AUTOMATION] Automation stats updated`);
      console.log(`🎉 [AUTOMATION] Automation execution complete: "${automation.name}"`);

      return { success: true, automationExecuted: automation.name };
    } catch (sendError: any) {
      console.error('❌ [AUTOMATION] Failed to send Instagram message:', sendError);
      console.error('❌ [AUTOMATION] Error details:', {
        message: sendError.message,
        status: sendError.response?.status,
        statusText: sendError.response?.statusText,
        data: sendError.response?.data,
        stack: sendError.stack
      });
      throw sendError;
    }
  } catch (error: any) {
    console.error('❌ [AUTOMATION] Error executing automation:', error);
    console.error('❌ [AUTOMATION] Error stack:', error.stack);
    return { success: false, error: `Failed to execute automation: ${error.message}` };
  }
}

/**
 * Check and execute automations for a specific trigger type
 * This is a helper function that can be called from webhook handlers
 */
export async function checkAndExecuteAutomations(params: {
  workspaceId: string;
  triggerType: TriggerType;
  conversationId: string;
  participantInstagramId: string;
  messageText?: string;
  instagramAccountId: string;
  platform?: string;
}): Promise<{ executed: boolean; automationName?: string }> {
  const result = await executeAutomation(params);
  return {
    executed: result.success,
    automationName: result.automationExecuted,
  };
}

/**
 * Feature 1: Comment → DM Automation
 * Send DM to user who commented on a post
 */
export async function processCommentDMAutomation(
  comment: {
    commentId: string;
    commenterId: string;
    commenterUsername?: string;
    commentText: string;
    mediaId: string;
  },
  instagramAccountId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{ success: boolean; message: string; dmMessageId?: string }> {
  try {
    // Check if comment was already processed
    const existingLog = await CommentDMLog.findOne({ commentId: comment.commentId });
    if (existingLog) {
      return { success: false, message: 'Comment already processed' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);

    // Check if comment DM automation is enabled
    if (!settings.commentDmEnabled) {
      // Log as skipped
      await CommentDMLog.create({
        workspaceId,
        instagramAccountId,
        commentId: comment.commentId,
        commenterId: comment.commenterId,
        commenterUsername: comment.commenterUsername,
        commentText: comment.commentText,
        mediaId: comment.mediaId,
        status: 'skipped',
        processedAt: new Date(),
      });
      return { success: false, message: 'Comment DM automation is disabled' };
    }

    // Get Instagram account with access token
    const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      throw new Error('Instagram account not found or no access token');
    }

    // Create log entry as pending
    const logEntry = await CommentDMLog.create({
      workspaceId,
      instagramAccountId,
      commentId: comment.commentId,
      commenterId: comment.commenterId,
      commenterUsername: comment.commenterUsername,
      commentText: comment.commentText,
      mediaId: comment.mediaId,
      status: 'pending',
    });

    try {
      // Send DM using comment reply API (this works for comment DMs)
      const result = await sendCommentReply(
        igAccount.instagramAccountId!,
        comment.commentId,
        settings.commentDmTemplate,
        igAccount.accessToken!
      );

      // Update log entry with success
      logEntry.dmSent = true;
      logEntry.dmMessageId = result.message_id;
      logEntry.dmText = settings.commentDmTemplate;
      logEntry.status = 'sent';
      logEntry.processedAt = new Date();
      await logEntry.save();

      // Get or create conversation with commenter and save the DM as a message
      let conversation = await Conversation.findOne({
        instagramAccountId: igAccount._id,
        participantInstagramId: comment.commenterId,
      });

      if (!conversation) {
        conversation = await Conversation.create({
          workspaceId,
          instagramAccountId: igAccount._id,
          participantName: comment.commenterUsername || 'Unknown User',
          participantHandle: `@${comment.commenterUsername || 'unknown'}`,
          participantInstagramId: comment.commenterId,
          instagramConversationId: `${igAccount.instagramAccountId}_${comment.commenterId}`,
          platform: 'instagram',
          lastMessageAt: new Date(),
          lastMessage: settings.commentDmTemplate,
          lastBusinessMessageAt: new Date(),
        });
      } else {
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = settings.commentDmTemplate;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();
      }

      // Save the DM as a message in the conversation
      const sentAt = new Date();
      await Message.create({
        conversationId: conversation._id,
        workspaceId,
        text: settings.commentDmTemplate,
        from: 'ai',
        platform: 'instagram',
        instagramMessageId: result.message_id,
        automationSource: 'comment_dm',
        createdAt: sentAt,
      });

      await trackDailyMetric(workspaceId, sentAt, {
        outboundMessages: 1,
        aiReplies: 1,
      });

      return {
        success: true,
        message: 'DM sent successfully',
        dmMessageId: result.message_id,
      };
    } catch (sendError: any) {
      // Update log entry with failure
      logEntry.status = 'failed';
      logEntry.errorMessage = sendError.message;
      logEntry.processedAt = new Date();
      await logEntry.save();

      throw sendError;
    }
  } catch (error: any) {
    console.error('Error processing comment DM automation:', error);
    return {
      success: false,
      message: `Failed to send DM: ${error.message}`,
    };
  }
}

/**
 * Feature 2: Inbound DM Auto-Reply
 * Process incoming DM and send AI-generated reply
 */
export async function processAutoReply(
  conversationId: mongoose.Types.ObjectId | string,
  latestMessage: IMessage,
  messageText: string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{
  success: boolean;
  message: string;
  reply?: string;
  categoryId?: mongoose.Types.ObjectId;
  detectedLanguage?: string;
}> {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return { success: false, message: 'Conversation not found' };
    }

    // Check if auto-reply is disabled for this conversation
    if (conversation.autoReplyDisabled) {
      return { success: false, message: 'Auto-reply disabled for this conversation' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);
    const goalConfigs = getGoalConfigs(settings);

    const detectedGoal = detectGoalIntent(messageText || '');
    const matchesWorkspaceGoal = goalMatchesWorkspace(detectedGoal, settings.primaryGoal, settings.secondaryGoal);

    if (matchesWorkspaceGoal && (!conversation.activeGoalType || conversation.activeGoalType === detectedGoal)) {
      conversation.activeGoalType = detectedGoal;
      conversation.goalState = conversation.goalState || 'collecting';
    }

    // Check if DM auto-reply is enabled
    if (!settings.dmAutoReplyEnabled) {
      return { success: false, message: 'DM auto-reply is disabled' };
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return { success: false, message: 'Instagram account not found' };
    }

    // Wait briefly to see if the customer is still typing/adding more context
    await pauseForTypingIfNeeded(conversation.platform, settings);

    // If a newer customer message arrived during the pause, skip so the freshest message can drive the reply
    const newestCustomerMessage = await Message.findOne({
      conversationId,
      from: 'customer',
    }).sort({ createdAt: -1 });

    if (!newestCustomerMessage) {
      return { success: false, message: 'No customer messages found for auto-reply' };
    }

    if (newestCustomerMessage._id.toString() !== latestMessage._id.toString()) {
      return { success: false, message: 'A newer customer message arrived; deferring auto-reply' };
    }

    // Combine all customer messages since the last business/AI response to keep context together
    const lastBusinessMessage = await Message.findOne({
      conversationId,
      from: { $in: ['ai', 'user'] },
    }).sort({ createdAt: -1 });

    const messageWindowStart = lastBusinessMessage?.createdAt || conversation.createdAt || new Date(0);
    const recentCustomerMessages = await Message.find({
      conversationId,
      from: 'customer',
      createdAt: { $gt: messageWindowStart },
    })
      .sort({ createdAt: 1 });

    if (recentCustomerMessages.length > 0) {
      messageText = recentCustomerMessages.map(msg => msg.text).join('\n');
    }

    // Categorize the (possibly combined) message
    const categorization = await categorizeMessage(messageText, workspaceId);

    // Get or create category
    const categoryId = await getOrCreateCategory(workspaceId, categorization.categoryName);

    // Increment category count
    await incrementCategoryCount(categoryId);

    const activeTicket = await getActiveTicket(conversation._id);
    const sameTopicTicket =
      activeTicket &&
      activeTicket.categoryId &&
      categoryId &&
      activeTicket.categoryId.toString() === categoryId.toString();

    // Check if auto-reply is enabled for this category
    const category = await MessageCategory.findById(categoryId);
    if (category && !category.autoReplyEnabled) {
      return {
        success: false,
        message: 'Auto-reply disabled for this category',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    // Build AI context
    const aiReply = await generateAIReply({
      conversation,
      workspaceId,
      latestCustomerMessage: messageText,
      categoryId,
      categorization,
      historyLimit: 10,
      goalContext: {
        workspaceGoals: {
          primaryGoal: settings.primaryGoal,
          secondaryGoal: settings.secondaryGoal,
          configs: goalConfigs,
        },
        detectedGoal: matchesWorkspaceGoal ? detectedGoal : 'none',
        activeGoalType: conversation.activeGoalType,
        goalState: conversation.goalState,
        collectedFields: conversation.goalCollectedFields,
      },
    });

    if (!aiReply) {
      console.error('generateAIReply returned null', {
        conversationId: conversation._id,
        workspaceId,
        categoryId,
        detectedGoal,
      });
      return {
        success: false,
        message: 'Failed to generate reply',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    // If existing ticket for same topic, keep helping but add a light reminder without blocking the conversation
    if (sameTopicTicket) {
      aiReply.shouldEscalate = false; // avoid spamming escalation replies when a ticket is already open
      aiReply.escalationReason = aiReply.escalationReason || activeTicket.reason || 'Escalation pending';
      aiReply.replyText = appendPendingNote(aiReply.replyText);
      await addTicketUpdate(activeTicket._id, { from: 'customer', text: messageText });
    } else if (activeTicket && !sameTopicTicket) {
      // New topic while escalation pending: keep helping but remind briefly
      aiReply.replyText = appendPendingNote(aiReply.replyText);
    } else if (aiReply.shouldEscalate) {
      aiReply.replyText = buildInitialEscalationReply(aiReply.replyText);
    }

    const goalProgress = aiReply.goalProgress as GoalProgressState | undefined;
    const goalType = (goalProgress?.goalType && goalProgress.goalType !== 'none'
      ? goalProgress.goalType
      : conversation.activeGoalType || (matchesWorkspaceGoal ? detectedGoal : undefined)) as GoalType | undefined;

    const goalIncrements: Record<string, number> = {};

    if (goalType && goalType !== 'none') {
      const mergedFields = mergeGoalFields(conversation.goalCollectedFields, goalProgress?.collectedFields);
      conversation.goalCollectedFields = mergedFields;
      conversation.goalState = goalProgress?.status || conversation.goalState || 'collecting';
      conversation.goalSummary = goalProgress?.summary || conversation.goalSummary;
      conversation.goalLastInteractionAt = new Date();
      conversation.activeGoalType = goalType;

      addCountIncrement(goalIncrements, 'goalAttempts', mapGoalKey(goalType));

      if (goalProgress?.status === 'completed' || goalProgress?.shouldCreateRecord) {
        await saveGoalOutcome(goalType, conversation, mergedFields, goalConfigs, goalProgress?.summary, goalProgress?.targetLink);
        conversation.goalState = 'completed';
        addCountIncrement(goalIncrements, 'goalCompletions', mapGoalKey(goalType));
      }

      if (conversation.markModified) {
        conversation.markModified('goalCollectedFields');
      }
    }

    // If AI wants escalation and no ticket exists, create one
    let escalationId: mongoose.Types.ObjectId | undefined;
    if (aiReply.shouldEscalate && !sameTopicTicket) {
      const ticket = await createTicket({
        conversationId: conversation._id,
        categoryId,
        topicSummary: (aiReply.escalationReason || messageText).slice(0, 140),
        reason: aiReply.escalationReason || 'Escalated by AI',
        createdBy: 'ai',
        customerMessage: messageText,
      });
      escalationId = ticket._id as mongoose.Types.ObjectId;
      conversation.humanRequired = true;
      conversation.humanRequiredReason = ticket.reason;
      conversation.humanTriggeredAt = ticket.createdAt;
      conversation.humanTriggeredByMessageId = undefined;
      conversation.humanHoldUntil = settings.humanEscalationBehavior === 'ai_silent'
        ? new Date(Date.now() + (settings.humanHoldMinutes || 60) * 60 * 1000)
        : undefined;
    }

    // Send the reply via Instagram API
    console.info('Sending AI Instagram reply', {
      conversationId: conversation._id,
      workspaceId,
      categoryId,
      goalType,
      goalStatus: aiReply.goalProgress?.status,
      shouldEscalate: aiReply.shouldEscalate,
      replyPreview: aiReply.replyText?.slice(0, 140),
    });

    const result = await sendInstagramMessage(
      conversation.participantInstagramId!,
      aiReply.replyText,
      igAccount.accessToken
    );

    if (!result || (!result.message_id && !result.recipient_id)) {
      console.error('Failed to send Instagram reply', {
        conversationId: conversation._id,
        result,
      });
      return {
        success: false,
        message: 'Failed to send reply to Instagram',
        categoryId,
        detectedLanguage: categorization.detectedLanguage,
      };
    }

    console.info('Instagram reply sent', {
      conversationId: conversation._id,
      messageId: result.message_id,
      recipientId: result.recipient_id,
      goalType,
      shouldEscalate: aiReply.shouldEscalate,
    });

    // Save the reply as a message
    const kbItemIdsUsed = (aiReply.knowledgeItemsUsed || []).map(item => item.id);
    const sentAt = new Date();
    const savedMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId,
      text: aiReply.replyText,
      from: 'ai',
      platform: 'instagram',
      instagramMessageId: result.message_id,
      automationSource: 'auto_reply',
      aiTags: aiReply.tags,
      aiShouldEscalate: aiReply.shouldEscalate,
      aiEscalationReason: aiReply.escalationReason,
      kbItemIdsUsed,
      createdAt: sentAt,
    });

    if (sameTopicTicket && activeTicket) {
      await addTicketUpdate(activeTicket._id, { from: 'ai', text: aiReply.replyText, messageId: savedMessage._id });
    } else if (escalationId) {
      await addTicketUpdate(escalationId, { from: 'ai', text: aiReply.replyText, messageId: savedMessage._id });
    }

    // Update conversation
    conversation.lastMessageAt = new Date();
    conversation.lastMessage = aiReply.replyText;
    conversation.lastBusinessMessageAt = new Date();
    if (aiReply.shouldEscalate) {
      const holdMinutes = settings.humanHoldMinutes || 60;
      conversation.humanRequired = true;
      conversation.humanRequiredReason = aiReply.escalationReason || 'Escalation requested by AI';
      conversation.humanTriggeredAt = new Date();
      conversation.humanTriggeredByMessageId = savedMessage._id;
      conversation.humanHoldUntil =
        settings.humanEscalationBehavior === 'ai_silent'
          ? new Date(Date.now() + holdMinutes * 60 * 1000)
          : undefined;
    }
    await conversation.save();

    const increments: Record<string, number> = { outboundMessages: 1, aiReplies: 1, ...goalIncrements };
    if (aiReply.tags && aiReply.tags.length > 0) {
      aiReply.tags.forEach(tag => addCountIncrement(increments, 'tagCounts', tag));
    }
    if (aiReply.escalationReason) {
      addCountIncrement(increments, 'escalationReasonCounts', aiReply.escalationReason);
    }
    if (kbItemIdsUsed.length > 0) {
      increments.kbBackedReplies = 1;
      kbItemIdsUsed.forEach(itemId => addCountIncrement(increments, 'kbArticleCounts', itemId));
    }

    const responseMetrics = calculateResponseTime(conversation, sentAt);
    Object.assign(increments, responseMetrics);

    await trackDailyMetric(workspaceId, sentAt, increments);

    return {
      success: true,
      message: 'Auto-reply sent successfully',
      reply: aiReply.replyText,
      categoryId,
      detectedLanguage: categorization.detectedLanguage,
    };
  } catch (error: any) {
    console.error('Error processing auto-reply:', error);
    return {
      success: false,
      message: `Auto-reply failed: ${error.message}`,
    };
  }
}

/**
 * Feature 3: 24h Follow-up Automation
 * Schedule or send follow-up messages
 */
export async function scheduleFollowup(
  conversationId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{ success: boolean; message: string; taskId?: mongoose.Types.ObjectId }> {
  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return { success: false, message: 'Conversation not found' };
    }

    // Get workspace settings
    const settings = await getWorkspaceSettings(workspaceId);

    if (!settings.followupEnabled) {
      return { success: false, message: 'Follow-up automation is disabled' };
    }

    // Cancel any existing scheduled follow-ups for this conversation
    await FollowupTask.updateMany(
      {
        conversationId,
        status: 'scheduled',
      },
      { status: 'cancelled' }
    );

    // Calculate timing
    const lastCustomerMessageAt = conversation.lastCustomerMessageAt || conversation.createdAt;
    const windowExpiresAt = new Date(lastCustomerMessageAt.getTime() + 24 * 60 * 60 * 1000);
    const hoursBeforeExpiry = settings.followupHoursBeforeExpiry || 2;
    const scheduledFollowupAt = new Date(windowExpiresAt.getTime() - hoursBeforeExpiry * 60 * 60 * 1000);

    // Don't schedule if follow-up time is in the past
    if (scheduledFollowupAt <= new Date()) {
      return { success: false, message: 'Follow-up time would be in the past' };
    }

    // Create follow-up task
    const task = await FollowupTask.create({
      workspaceId,
      conversationId: conversation._id,
      instagramAccountId: conversation.instagramAccountId,
      participantInstagramId: conversation.participantInstagramId,
      lastCustomerMessageAt,
      lastBusinessMessageAt: conversation.lastBusinessMessageAt,
      windowExpiresAt,
      scheduledFollowupAt,
      status: 'scheduled',
    });

    return {
      success: true,
      message: `Follow-up scheduled for ${scheduledFollowupAt.toISOString()}`,
      taskId: task._id as mongoose.Types.ObjectId,
    };
  } catch (error: any) {
    console.error('Error scheduling follow-up:', error);
    return { success: false, message: `Failed to schedule follow-up: ${error.message}` };
  }
}

/**
 * Process due follow-up tasks
 * This should be called by a background job
 */
export async function processDueFollowups(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, cancelled: 0 };

  try {
    // Find all scheduled follow-ups that are due
    const dueTasks = await FollowupTask.find({
      status: 'scheduled',
      scheduledFollowupAt: { $lte: new Date() },
    });

    for (const task of dueTasks) {
      stats.processed++;

      try {
        // Get conversation to check if customer replied
        const conversation = await Conversation.findById(task.conversationId);
        if (!conversation) {
          task.status = 'cancelled';
          task.errorMessage = 'Conversation not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Check if customer replied since we scheduled
        const customerMessageSince = await Message.findOne({
          conversationId: task.conversationId,
          from: 'customer',
          createdAt: { $gt: task.lastCustomerMessageAt },
        });

        if (customerMessageSince) {
          task.status = 'customer_replied';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Check if window expired
        if (new Date() > task.windowExpiresAt) {
          task.status = 'expired';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Get workspace settings for template
        const settings = await getWorkspaceSettings(task.workspaceId);

        // Get Instagram account
        const igAccount = await InstagramAccount.findById(task.instagramAccountId).select('+accessToken');
        if (!igAccount || !igAccount.accessToken) {
          task.status = 'cancelled';
          task.errorMessage = 'Instagram account not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        // Send follow-up message
        const result = await sendInstagramMessage(
          task.participantInstagramId,
          settings.followupTemplate,
          igAccount.accessToken
        );

        if (!result || (!result.message_id && !result.recipient_id)) {
          task.status = 'cancelled';
          task.errorMessage = 'Failed to send message';
          await task.save();
          stats.failed++;
          continue;
        }

        // Save the follow-up as a message
        const sentAt = new Date();
        await Message.create({
          conversationId: conversation._id,
          workspaceId: conversation.workspaceId,
          text: settings.followupTemplate,
          from: 'ai',
          platform: 'instagram',
          instagramMessageId: result.message_id,
          automationSource: 'followup',
          createdAt: sentAt,
        });

        // Update conversation
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = settings.followupTemplate;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();

        // Update task
        task.status = 'sent';
        task.followupMessageId = result.message_id;
        task.followupText = settings.followupTemplate;
        task.sentAt = new Date();
        await task.save();

        stats.sent++;

        await trackDailyMetric(task.workspaceId, sentAt, {
          outboundMessages: 1,
          aiReplies: 1,
          followupsSent: 1,
        });
      } catch (taskError: any) {
        console.error(`Error processing follow-up task ${task._id}:`, taskError);
        task.status = 'cancelled';
        task.errorMessage = taskError.message;
        await task.save();
        stats.failed++;
      }
    }

    console.log(`Follow-up processing complete: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error('Error processing due follow-ups:', error);
    return stats;
  }
}

/**
 * Cancel follow-up when customer replies
 */
export async function cancelFollowupOnCustomerReply(
  conversationId: mongoose.Types.ObjectId | string
): Promise<void> {
  await FollowupTask.updateMany(
    {
      conversationId,
      status: 'scheduled',
    },
    { status: 'customer_replied' }
  );
}

/**
 * Generate varied responses for follow-up messages on the same escalated topic
 * Uses different phrasing each time to avoid sounding robotic
 */
function buildFollowupResponse(followUpCount: number, base: string): string {
  // If the AI generated a specific response, use it
  if (base && base.trim().length > 20) {
    return base;
  }

  // Otherwise, use varied templates that acknowledge the wait without making commitments
  const templates = [
    'I understand you\'re waiting on this. The request is with the team and they\'ll respond with the specific details. In the meantime, I can help clarify anything or answer other questions.',
    'Your request is still being reviewed by the team. They\'re the ones who can give you a definitive answer on this. Is there any additional information I can note for them?',
    'The team has this flagged and will get back to you. I can\'t make commitments on their behalf, but I\'m here if you have other questions or want to add more details for them to consider.',
    'Still with the team for review. They\'ll reach out directly about this specific matter. Let me know if there\'s anything else I can help with in the meantime.',
  ];

  // Rotate through templates based on follow-up count
  const variant = templates[followUpCount % templates.length];
  return variant;
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

/**
 * Generate initial escalation message - varies based on context
 */
function buildInitialEscalationReply(base: string): string {
  // If AI generated a good escalation response, use it
  if (base && base.trim().length > 20) {
    return base;
  }

  // Generic fallback if AI didn't provide one
  const templates = [
    'This is something a team member needs to review personally, so I\'ve flagged it for them. They\'ll get back to you with the exact details. I\'m here to help with any general questions in the meantime.',
    'I\'ve forwarded this to the team for review. They\'ll be able to give you a proper answer on this. Feel free to ask me anything else while you wait.',
    'A team member will handle this one directly and follow up with you. I can\'t make decisions on this, but I can help with other questions if you have any.',
  ];

  // Random selection for variety
  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

/**
 * Append a brief note about pending escalation when customer asks about a different topic
 */
function appendPendingNote(reply: string): string {
  const notes = [
    'Your earlier request is still with the team and they\'ll respond separately.',
    'By the way, the team is still reviewing your other question and will get back to you.',
    'Just so you know, your previous request is with a team member who will follow up.',
  ];

  // Check if reply already mentions the pending item
  const mentionsPending = reply.toLowerCase().includes('earlier') ||
                         reply.toLowerCase().includes('previous') ||
                         reply.toLowerCase().includes('other question') ||
                         reply.toLowerCase().includes('team');

  if (mentionsPending) {
    return reply; // Don't add redundant note
  }

  // Add a brief note
  const note = notes[0]; // Use first variant for consistency
  return `${reply} ${note}`.trim();
}
