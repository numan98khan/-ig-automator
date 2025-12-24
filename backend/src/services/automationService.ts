import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import MessageCategory from '../models/MessageCategory';
import Message, { IMessage } from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import CommentDMLog from '../models/CommentDMLog';
import FollowupTask from '../models/FollowupTask';
import Automation from '../models/Automation';
import AutomationSession from '../models/AutomationSession';
import KnowledgeItem from '../models/KnowledgeItem';
import {
  sendMessage as sendInstagramMessage,
  sendCommentReply,
  sendButtonMessage,
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
import {
  AfterHoursCaptureConfig,
  AutomationRateLimit,
  AutomationTemplateId,
  BookingConciergeConfig,
  BusinessHoursConfig,
  TemplateFlowConfig,
  TriggerConfig,
  TriggerType,
} from '../types/automation';
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

const DEFAULT_RATE_LIMIT: AutomationRateLimit = {
  maxMessages: 5,
  perMinutes: 1,
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function matchesKeywords(text: string, keywords: string[] = [], match: 'any' | 'all' = 'any'): boolean {
  if (!keywords.length) return true;
  const normalized = normalizeText(text);
  const checks = keywords.map(keyword => normalized.includes(normalizeText(keyword)));
  return match === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getTimezoneParts(timezone?: string, date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(part => {
    partMap[part.type] = part.value;
  });
  return {
    weekday: partMap.weekday,
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

function getWeekdayIndex(weekday: string | undefined): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekday && map[weekday] !== undefined ? map[weekday] : 0;
}

function isOutsideBusinessHours(config?: BusinessHoursConfig, referenceDate: Date = new Date()): boolean {
  if (!config?.startTime || !config?.endTime) {
    return false;
  }
  const start = parseTimeToMinutes(config.startTime);
  const end = parseTimeToMinutes(config.endTime);
  if (start === null || end === null) {
    return false;
  }
  const parts = getTimezoneParts(config.timezone, referenceDate);
  const weekdayIndex = getWeekdayIndex(parts.weekday);
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (!activeDays.includes(weekdayIndex)) {
    return true;
  }
  const nowMinutes = parts.hour * 60 + parts.minute;
  if (start === end) {
    return false;
  }
  if (start < end) {
    return nowMinutes < start || nowMinutes >= end;
  }
  return nowMinutes >= end && nowMinutes < start;
}

function getNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): Date {
  const startMinutes = parseTimeToMinutes(config.startTime) || 0;
  const endMinutes = parseTimeToMinutes(config.endTime) || 0;
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

  const now = new Date(referenceDate);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let candidate = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const weekdayIndex = candidate.getDay();
    const isActiveDay = activeDays.includes(weekdayIndex);

    if (isActiveDay) {
      const withinWindow = startMinutes < endMinutes
        ? nowMinutes >= startMinutes && nowMinutes < endMinutes
        : nowMinutes >= startMinutes || nowMinutes < endMinutes;

      if (withinWindow && i === 0) {
        return candidate;
      }

      candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      if (i === 0 && nowMinutes < startMinutes && startMinutes < endMinutes) {
        return candidate;
      }
      if (i > 0) {
        return candidate;
      }
    }

    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return new Date(referenceDate);
}

function formatNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): string {
  const nextOpen = getNextOpenTime(config, referenceDate);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextOpen);
  } catch (error) {
    return nextOpen.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

function matchesTriggerConfig(messageText: string, triggerConfig?: TriggerConfig): boolean {
  if (!triggerConfig) return true;
  const keywordMatch = triggerConfig.keywordMatch || 'any';
  if (triggerConfig.keywords && !matchesKeywords(messageText, triggerConfig.keywords, keywordMatch)) {
    return false;
  }
  if (triggerConfig.excludeKeywords && matchesKeywords(messageText, triggerConfig.excludeKeywords, 'any')) {
    return false;
  }
  if (triggerConfig.outsideBusinessHours && !isOutsideBusinessHours(triggerConfig.businessHours)) {
    return false;
  }
  return true;
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
    const normalizedMessage = messageText || '';
    const matchingAutomations: typeof automations = [];

    for (const candidate of automations) {
      const replyStep = candidate.replySteps[0];
      if (replyStep?.type === 'template_flow') {
        const activeSession = await AutomationSession.findOne({
          automationId: candidate._id,
          conversationId: new mongoose.Types.ObjectId(conversationId),
          status: 'active',
        });
        if (activeSession) {
          matchingAutomations.push(candidate);
          continue;
        }
      }

      if (matchesTriggerConfig(normalizedMessage, candidate.triggerConfig)) {
        matchingAutomations.push(candidate);
      }
    }

    if (matchingAutomations.length === 0) {
      console.log('⚠️  [AUTOMATION] No automations matched trigger filters');
      return { success: false, error: 'No automations matched trigger filters' };
    }

    // Execute the first matching automation (for now)
    const automation = matchingAutomations[0];
    console.log(`✅ [AUTOMATION] Executing automation: "${automation.name}" (ID: ${automation._id})`);

    const replyStep = automation.replySteps[0];

    if (!replyStep) {
      console.log('❌ [AUTOMATION] No reply step configured');
      return { success: false, error: 'No reply step configured' };
    }

    console.log(`📝 [AUTOMATION] Reply step type: ${replyStep.type}`);

    let replyText = '';

    // Generate reply based on step type
    if (replyStep.type === 'template_flow') {
      const templateResult = await executeTemplateFlow({
        automation,
        replyStep,
        conversationId,
        workspaceId,
        instagramAccountId,
        participantInstagramId,
        messageText: normalizedMessage,
        platform,
      });
      if (templateResult.success) {
        return { success: true, automationExecuted: automation.name };
      }
      return { success: false, error: templateResult.error || 'Template flow not executed' };
    }

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
    const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
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
      const sentMessage = await sendInstagramMessage(
        participantInstagramId,
        replyText,
        igAccount.accessToken
      );

      console.log(`✅ [AUTOMATION] Message sent successfully:`, {
        messageId: sentMessage?.message_id,
        recipientId: sentMessage?.recipient_id || participantInstagramId
      });

      // Save message to database
      await Message.create({
        conversationId: new mongoose.Types.ObjectId(conversationId),
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        text: replyText,
        from: 'ai',
        platform: platform || 'instagram',
        instagramMessageId: sentMessage?.message_id,
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

async function getTemplateSession(params: {
  automationId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  templateId: AutomationTemplateId;
}): Promise<any | null> {
  const latest = await AutomationSession.findOne({
    automationId: params.automationId,
    conversationId: params.conversationId,
  }).sort({ createdAt: -1 });

  if (latest && latest.status === 'paused') {
    return null;
  }

  if (latest && latest.status === 'active') {
    return latest;
  }

  return AutomationSession.create({
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    automationId: params.automationId,
    templateId: params.templateId,
    status: 'active',
    questionCount: 0,
    collectedFields: {},
  });
}

function updateRateLimit(session: any, rateLimit: AutomationRateLimit): boolean {
  const now = new Date();
  const windowMs = rateLimit.perMinutes * 60 * 1000;
  const windowStart = session.rateLimit?.windowStart ? new Date(session.rateLimit.windowStart) : null;
  const elapsed = windowStart ? now.getTime() - windowStart.getTime() : windowMs + 1;

  if (!windowStart || elapsed > windowMs) {
    session.rateLimit = { windowStart: now, count: 1 };
    return true;
  }

  if (session.rateLimit.count >= rateLimit.maxMessages) {
    return false;
  }

  session.rateLimit.count += 1;
  return true;
}

async function sendTemplateMessage(params: {
  conversation: any;
  automation: any;
  igAccount: any;
  recipientId: string;
  text: string;
  buttons?: Array<{ title: string; actionType?: 'postback'; payload?: string }>;
  platform?: string;
  tags?: string[];
}): Promise<void> {
  const { conversation, automation, igAccount, recipientId, text, buttons, platform, tags } = params;

  await pauseForTypingIfNeeded(platform);

  let result;
  if (buttons && buttons.length > 0 && igAccount.instagramAccountId) {
    result = await sendButtonMessage(
      igAccount.instagramAccountId,
      recipientId,
      text,
      buttons.map((button) => ({
        type: 'postback',
        title: button.title,
        payload: button.payload || `button_${button.title}`,
      })),
      igAccount.accessToken
    );
  } else {
    result = await sendInstagramMessage(recipientId, text, igAccount.accessToken);
  }

  if (!result || (!result.message_id && !result.recipient_id)) {
    throw new Error('Instagram API did not return a valid response.');
  }

  const sentAt = new Date();
  await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text,
    from: 'ai',
    platform: platform || 'instagram',
    instagramMessageId: result.message_id,
    automationSource: 'template_flow',
    aiTags: tags,
    metadata: buttons ? { buttons } : undefined,
    createdAt: sentAt,
  });

  conversation.lastMessage = text;
  conversation.lastMessageAt = sentAt;
  conversation.lastBusinessMessageAt = sentAt;
  await conversation.save();

  automation.stats.totalTriggered += 1;
  automation.stats.totalRepliesSent += 1;
  automation.stats.lastTriggeredAt = sentAt;
  automation.stats.lastReplySentAt = sentAt;
  await automation.save();

  const increments: Record<string, number> = {
    outboundMessages: 1,
    aiReplies: 1,
  };

  if (tags && tags.length > 0) {
    tags.forEach(tag => addCountIncrement(increments, 'tagCounts', tag));
  }

  const responseMetrics = calculateResponseTime(conversation, sentAt);
  Object.assign(increments, responseMetrics);

  await trackDailyMetric(conversation.workspaceId, sentAt, increments);
}

function detectBookingMenuChoice(text: string): 'book' | 'prices' | 'location' | 'talk' | null {
  const normalized = normalizeText(text);
  if (/(book|booking|appointment|slot|available|availability|حجز|موعد)/.test(normalized)) return 'book';
  if (/(price|prices|cost|سعر)/.test(normalized)) return 'prices';
  if (/(location|address|where|hours|map|directions)/.test(normalized)) return 'location';
  if (/(talk|staff|human|agent|reception|team)/.test(normalized)) return 'talk';
  return null;
}

function detectAfterHoursIntent(text: string): string {
  const normalized = normalizeText(text);
  if (/(book|booking|appointment|reserve)/.test(normalized)) return 'Booking';
  if (/(price|prices|cost|سعر)/.test(normalized)) return 'Prices';
  if (/(order|purchase|buy)/.test(normalized)) return 'Order';
  return 'Other';
}

async function handoffToTeam(params: {
  conversation: any;
  reason: string;
  customerMessage?: string;
}): Promise<void> {
  const { conversation, reason, customerMessage } = params;
  const ticket = await createTicket({
    conversationId: conversation._id,
    topicSummary: reason.slice(0, 140),
    reason,
    createdBy: 'system',
    customerMessage,
  });

  conversation.humanRequired = true;
  conversation.humanRequiredReason = reason;
  conversation.humanTriggeredAt = ticket.createdAt;
  conversation.humanTriggeredByMessageId = undefined;
  conversation.humanHoldUntil = new Date(Date.now() + 60 * 60 * 1000);
  await conversation.save();
}

async function handleBookingConciergeFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { automation, replyStep, session, conversation, igAccount, messageText, platform } = params;
  const config = replyStep.templateFlow.config as BookingConciergeConfig;
  const quickReplies = config.quickReplies || ['Book appointment', 'Prices', 'Location', 'Talk to staff'];
  const maxQuestions = config.maxQuestions ?? 5;
  const minPhoneLength = config.minPhoneLength ?? 8;
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_booking', 'template_booking_concierge'];

  if (!updateRateLimit(session, rateLimit)) {
    return { success: false, error: 'Rate limit exceeded' };
  }
  session.lastCustomerMessageAt = new Date();

  if (!session.step) {
    const greeting = `Hi! I can help with bookings. Choose an option: ${quickReplies.join(', ')}.`;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: greeting,
      platform,
      tags,
    });
    session.step = 'menu';
    session.questionCount += 1;
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.questionCount >= maxQuestions) {
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: "Thanks for the details. I'm handing this to our reception team to finish up.",
      platform,
      tags,
    });
    await handoffToTeam({ conversation, reason: 'Booking handoff (max questions reached)', customerMessage: messageText });
    session.status = 'handoff';
    await session.save();
    return { success: true };
  }

  if (session.step === 'menu') {
    const choice = detectBookingMenuChoice(messageText);
    if (choice === 'prices') {
      const priceMessage = config.priceRanges
        ? `Here are our price ranges:\n${config.priceRanges}\n\nReply “Book appointment” to grab a slot.`
        : "Our pricing depends on the service. Reply with the service you're interested in and I can help you book.";
      await sendTemplateMessage({
        conversation,
        automation,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: priceMessage,
        platform,
        tags,
      });
      session.lastAutomationMessageAt = new Date();
      await session.save();
      return { success: true };
    }
    if (choice === 'location') {
      const locationParts = [
        config.locationLink ? `Map: ${config.locationLink}` : null,
        config.locationHours ? `Hours: ${config.locationHours}` : null,
      ].filter(Boolean);
      const locationMessage = locationParts.length
        ? locationParts.join('\n')
        : "We can share location details - reply with your preferred branch and we'll send directions.";
      await sendTemplateMessage({
        conversation,
        automation,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: locationMessage,
        platform,
        tags,
      });
      session.lastAutomationMessageAt = new Date();
      await session.save();
      return { success: true };
    }
    if (choice === 'talk') {
      await sendTemplateMessage({
        conversation,
        automation,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: 'Connecting you to our reception team now.',
        platform,
        tags,
      });
      await handoffToTeam({ conversation, reason: 'Booking handoff requested', customerMessage: messageText });
      session.status = 'handoff';
      await session.save();
      return { success: true };
    }

    session.step = 'collect_name';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: "Great! What's your name?",
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_name') {
    session.collectedFields = { ...(session.collectedFields || {}), leadName: messageText.trim() };
    session.step = 'collect_phone';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: "Thanks! What's the best phone number to reach you?",
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_phone') {
    const digits = messageText.replace(/\D/g, '');
    if (digits.length < minPhoneLength) {
      session.questionCount += 1;
      await sendTemplateMessage({
        conversation,
        automation,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: `Could you share a valid phone number (at least ${minPhoneLength} digits)?`,
        platform,
        tags,
      });
      session.lastAutomationMessageAt = new Date();
      await session.save();
      return { success: true };
    }
    session.collectedFields = { ...(session.collectedFields || {}), phone: digits };
    session.step = 'collect_service';
    session.questionCount += 1;
    const serviceOptions = config.serviceOptions || [];
    const buttons = serviceOptions.slice(0, 2).map((option) => ({ title: option }));
    buttons.push({ title: 'Other' });
    const servicePrompt = serviceOptions.length
      ? `Which service would you like? ${serviceOptions.join(', ')}`
      : 'Which service would you like to book?';
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: servicePrompt,
      buttons: buttons.length <= 3 ? buttons : undefined,
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_service') {
    const normalized = normalizeText(messageText);
    if (normalized === 'other') {
      if (session.questionCount + 1 > maxQuestions) {
        await sendTemplateMessage({
          conversation,
          automation,
          igAccount,
          recipientId: conversation.participantInstagramId,
          text: "Thanks! I'm handing this to our reception team to finish up.",
          platform,
          tags,
        });
        await handoffToTeam({ conversation, reason: 'Booking handoff (max questions reached)', customerMessage: messageText });
        session.status = 'handoff';
        await session.save();
        return { success: true };
      }
      session.step = 'collect_service_other';
      session.questionCount += 1;
      await sendTemplateMessage({
        conversation,
        automation,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: 'Sure - what service are you interested in?',
        platform,
        tags,
      });
      session.lastAutomationMessageAt = new Date();
      await session.save();
      return { success: true };
    }

    session.collectedFields = { ...(session.collectedFields || {}), service: messageText.trim() };
    session.step = 'collect_preferred_time';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: 'Any preferred day or time? (Optional)',
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_service_other') {
    session.collectedFields = { ...(session.collectedFields || {}), service: messageText.trim() };
    session.step = 'collect_preferred_time';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: 'Any preferred day or time? (Optional)',
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_preferred_time') {
    session.collectedFields = {
      ...(session.collectedFields || {}),
      preferredDayTime: messageText.trim(),
      language: conversation.detectedLanguage,
    };
    session.step = 'confirm';
    const fields = session.collectedFields || {};
    const summary = [
      `Name: ${fields.leadName || 'n/a'}`,
      `Phone: ${fields.phone || 'n/a'}`,
      `Service: ${fields.service || 'n/a'}`,
      fields.preferredDayTime ? `Preferred: ${fields.preferredDayTime}` : null,
    ].filter(Boolean).join('\n');
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: `Got it! Here's a quick summary:\n${summary}\n\nWe'll have our reception team follow up shortly.`,
      platform,
      tags,
    });

    const existingLead = await LeadCapture.findOne({ conversationId: conversation._id, goalType: 'capture_lead' });
    if (!existingLead) {
      await LeadCapture.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        goalType: 'capture_lead',
        participantName: conversation.participantName,
        participantHandle: conversation.participantHandle,
        name: fields.leadName,
        phone: fields.phone,
        customNote: fields.service ? `Service: ${fields.service}. ${fields.preferredDayTime || ''}`.trim() : undefined,
      });
    }

    const existingBooking = await BookingRequest.findOne({ conversationId: conversation._id });
    if (!existingBooking) {
      await BookingRequest.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        serviceType: fields.service,
        summary,
      });
    }

    await handoffToTeam({ conversation, reason: 'Booking lead handoff', customerMessage: messageText });
    session.status = 'handoff';
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  return { success: false, error: 'Unhandled booking flow step' };
}

async function handleAfterHoursCaptureFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { automation, replyStep, session, conversation, igAccount, messageText, platform } = params;
  const config = replyStep.templateFlow.config as AfterHoursCaptureConfig;
  const maxQuestions = config.maxQuestions ?? 4;
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['after_hours_lead', 'template_after_hours_capture'];

  if (!updateRateLimit(session, rateLimit)) {
    return { success: false, error: 'Rate limit exceeded' };
  }
  session.lastCustomerMessageAt = new Date();

  if (!session.step) {
    const nextOpen = formatNextOpenTime(config.businessHours);
    const closedTemplate = config.closedMessageTemplate || "We're closed - leave details, we'll contact you at {next_open_time}.";
    const closedMessage = closedTemplate.replace('{next_open_time}', nextOpen);
    session.collectedFields = { ...(session.collectedFields || {}), message: messageText.trim() };
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: closedMessage,
      platform,
      tags,
    });
    if (!updateRateLimit(session, rateLimit)) {
      await session.save();
      return { success: true };
    }

    session.step = 'collect_intent';
    session.questionCount += 1;
    const intentOptions = config.intentOptions && config.intentOptions.length > 0
      ? config.intentOptions
      : ['Booking', 'Prices', 'Order', 'Other'];
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: `What can we help with? ${intentOptions.join(', ')}.`,
      buttons: intentOptions.map((option) => ({ title: option })).slice(0, 3),
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.questionCount >= maxQuestions) {
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: "Thanks for the details. You're in the queue and a teammate will follow up.",
      platform,
      tags,
    });
    session.status = 'completed';
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_intent') {
    session.collectedFields = { ...(session.collectedFields || {}), intent: detectAfterHoursIntent(messageText) };
    session.step = 'collect_name';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: 'May I have your name? (Optional)',
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_name') {
    const trimmed = messageText.trim();
    const leadName = /^(skip|no|n\/a|na|none)$/i.test(trimmed) ? undefined : trimmed;
    session.collectedFields = { ...(session.collectedFields || {}), leadName };
    session.step = 'collect_phone';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: "What's the best phone number to reach you?",
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_phone') {
    const digits = messageText.replace(/\D/g, '');
    session.collectedFields = { ...(session.collectedFields || {}), phone: digits || messageText.trim() };
    session.step = 'collect_preferred_time';
    session.questionCount += 1;
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: 'Any preferred time for a callback? (Optional)',
      platform,
      tags,
    });
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  if (session.step === 'collect_preferred_time') {
    const trimmed = messageText.trim();
    const preferredTime = /^(skip|no|n\/a|na|none)$/i.test(trimmed) ? undefined : trimmed;
    session.collectedFields = { ...(session.collectedFields || {}), preferredTime };
    session.step = 'confirm';
    const fields = session.collectedFields || {};
    const summary = [
      fields.intent ? `Intent: ${fields.intent}` : null,
      fields.leadName ? `Name: ${fields.leadName}` : null,
      fields.phone ? `Phone: ${fields.phone}` : null,
      fields.preferredTime ? `Preferred time: ${fields.preferredTime}` : null,
    ].filter(Boolean).join('\n');
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: `You're in the queue. Here's what I captured:\n${summary}`,
      platform,
      tags,
    });

    const existingLead = await LeadCapture.findOne({ conversationId: conversation._id, goalType: 'capture_lead' });
    if (!existingLead) {
      const noteParts = [
        fields.intent ? `Intent: ${fields.intent}` : null,
        fields.preferredTime ? `Preferred time: ${fields.preferredTime}` : null,
        fields.message ? `Message: ${fields.message}` : null,
      ].filter(Boolean);
      await LeadCapture.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        goalType: 'capture_lead',
        participantName: conversation.participantName,
        participantHandle: conversation.participantHandle,
        name: fields.leadName,
        phone: fields.phone,
        customNote: noteParts.length ? noteParts.join(' | ') : undefined,
      });
    }

    await handoffToTeam({ conversation, reason: 'After-hours lead capture', customerMessage: messageText });

    const nextOpen = getNextOpenTime(config.businessHours);
    const lastCustomerMessageAt = conversation.lastCustomerMessageAt || new Date();
    const windowExpiresAt = new Date(lastCustomerMessageAt.getTime() + 24 * 60 * 60 * 1000);
    if (nextOpen > new Date() && nextOpen <= windowExpiresAt) {
      const task = await FollowupTask.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        instagramAccountId: conversation.instagramAccountId,
        participantInstagramId: conversation.participantInstagramId,
        lastCustomerMessageAt,
        lastBusinessMessageAt: conversation.lastBusinessMessageAt,
        windowExpiresAt,
        scheduledFollowupAt: nextOpen,
        status: 'scheduled',
        followupType: 'after_hours',
        customMessage: config.followupMessage || "We're open now if you'd like to continue. Reply anytime.",
      });
      session.followupTaskId = task._id;
    }

    session.status = 'completed';
    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  return { success: false, error: 'Unhandled after-hours flow step' };
}

async function executeTemplateFlow(params: {
  automation: any;
  replyStep: any;
  conversationId: string;
  workspaceId: string;
  instagramAccountId: string;
  participantInstagramId: string;
  messageText: string;
  platform?: string;
}): Promise<{ success: boolean; error?: string }> {
  const {
    automation,
    replyStep,
    conversationId,
    workspaceId,
    instagramAccountId,
    participantInstagramId,
    messageText,
    platform,
  } = params;

  const templateFlow = replyStep.templateFlow as TemplateFlowConfig | undefined;
  if (!templateFlow) {
    return { success: false, error: 'Template flow configuration missing' };
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  if (conversation.humanHoldUntil && new Date(conversation.humanHoldUntil) > new Date()) {
    return { success: false, error: 'Conversation is on human hold' };
  }

  const session = await getTemplateSession({
    automationId: automation._id,
    conversationId: conversation._id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    templateId: templateFlow.templateId,
  });

  if (!session) {
    return { success: false, error: 'Automation paused for human response' };
  }

  const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
  if (!igAccount || !igAccount.accessToken) {
    return { success: false, error: 'Instagram account not found or not connected' };
  }

  if (!participantInstagramId) {
    return { success: false, error: 'Missing participant Instagram ID' };
  }

  if (templateFlow.templateId === 'booking_concierge') {
    return handleBookingConciergeFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
    });
  }

  if (templateFlow.templateId === 'after_hours_capture') {
    return handleAfterHoursCaptureFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
    });
  }

  return { success: false, error: 'Unknown template flow' };
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

        if (task.followupType === 'after_hours') {
          const businessMessageSince = await Message.findOne({
            conversationId: task.conversationId,
            from: 'user',
            createdAt: { $gt: task.lastBusinessMessageAt || task.createdAt },
          });

          if (businessMessageSince) {
            task.status = 'cancelled';
            task.errorMessage = 'Staff replied';
            await task.save();
            stats.cancelled++;
            continue;
          }
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

        const followupText = task.customMessage || settings.followupTemplate;

        // Send follow-up message
        const result = await sendInstagramMessage(
          task.participantInstagramId,
          followupText,
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
          text: followupText,
          from: 'ai',
          platform: 'instagram',
          instagramMessageId: result.message_id,
          automationSource: 'followup',
          createdAt: sentAt,
        });

        // Update conversation
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = followupText;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();

        // Update task
        task.status = 'sent';
        task.followupMessageId = result.message_id;
        task.followupText = followupText;
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
