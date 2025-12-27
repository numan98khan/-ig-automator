import mongoose from 'mongoose';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import FollowupTask from '../models/FollowupTask';
import Automation from '../models/Automation';
import AutomationSession from '../models/AutomationSession';
import LeadCapture from '../models/LeadCapture';
import BookingRequest from '../models/BookingRequest';
import OrderDraft from '../models/OrderDraft';
import {
  sendMessage as sendInstagramMessage,
  sendButtonMessage,
} from '../utils/instagram-api';
import {
  categorizeMessage,
  getOrCreateCategory,
  incrementCategoryCount,
} from './aiCategorization';
import { createTicket } from './escalationService';
import { addCountIncrement, trackDailyMetric } from './reportingService';
import { pauseForTypingIfNeeded } from './automation/typing';
import { matchesTriggerConfig } from './automation/triggerMatcher';
import { getNextOpenTime } from './automation/utils';
import {
  advanceAfterHoursCaptureState,
  advanceBookingConciergeState,
  advanceSalesConciergeState,
  buildAfterHoursSummary,
  buildBookingSummary,
  normalizeFlowState,
  resolveSalesConciergeConfig,
} from './automation/templateFlows';
import {
  AutomationTestContext,
  AutomationTestHistoryItem,
  AutomationTestState,
} from './automation/types';
import {
  AfterHoursCaptureConfig,
  AutomationRateLimit,
  AutomationTemplateId,
  BookingConciergeConfig,
  SalesConciergeConfig,
  TemplateFlowConfig,
  TriggerType,
} from '../types/automation';

const DEFAULT_RATE_LIMIT: AutomationRateLimit = {
  maxMessages: 5,
  perMinutes: 1,
};

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
      igAccount.accessToken,
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

async function handoffSalesConcierge(params: {
  conversation: any;
  topic: string;
  summary: string;
  recommendedNextAction?: string;
  customerMessage?: string;
}): Promise<void> {
  const { conversation, topic, summary, recommendedNextAction, customerMessage } = params;
  const details = [summary, recommendedNextAction ? `Next: ${recommendedNextAction}` : null]
    .filter(Boolean)
    .join('\n');

  await createTicket({
    conversationId: conversation._id,
    topicSummary: topic.slice(0, 140),
    reason: details,
    createdBy: 'system',
    customerMessage,
  });

  conversation.humanRequired = true;
  conversation.humanRequiredReason = topic;
  conversation.humanTriggeredAt = new Date();
  conversation.humanTriggeredByMessageId = undefined;
  conversation.humanHoldUntil = new Date(Date.now() + 60 * 60 * 1000);
  await conversation.save();
}

async function createSalesOrderDraft(params: {
  conversation: any;
  fields: Record<string, any>;
}): Promise<any> {
  const { conversation, fields } = params;
  const existingDraft = await OrderDraft.findOne({
    conversationId: conversation._id,
    status: { $in: ['draft', 'queued', 'payment_sent', 'needs_confirmation'] },
  }).sort({ createdAt: -1 });

  if (existingDraft) {
    return existingDraft;
  }

  return OrderDraft.create({
    workspaceId: conversation.workspaceId,
    conversationId: conversation._id,
    productRef: fields.productRef,
    sku: fields.sku,
    productName: fields.productName,
    variant: fields.variant,
    quantity: fields.quantity,
    city: fields.city,
    address: fields.address,
    phone: fields.phone,
    paymentMethod: fields.paymentMethod,
    quote: {
      price: fields.quote?.priceText,
      stock: fields.quote?.stockText,
      shippingFee: fields.quote?.shippingFee,
      eta: fields.quote?.eta,
      currency: fields.quote?.currency,
    },
    status: fields.paymentMethod === 'online' ? 'payment_sent' : 'queued',
  });
}

function createPaymentLink(params: { amountText?: string; draftId: string }) {
  const base = process.env.PAYMENTS_BASE_URL || process.env.APP_BASE_URL || 'https://pay.sendfx.ai';
  const safeBase = base.replace(/\/$/, '');
  const amountParam = params.amountText ? `?amount=${encodeURIComponent(params.amountText)}` : '';
  return `${safeBase}/pay/${params.draftId}${amountParam}`;
}

function hydratePaymentLink(text: string, paymentLink?: string): string {
  if (!paymentLink) return text;
  return text.replace('{payment_link}', paymentLink);
}

async function trackSalesStep(workspaceId: mongoose.Types.ObjectId, step?: string) {
  if (!step) return;
  await trackDailyMetric(workspaceId, new Date(), { [`salesConciergeStepCounts.${step}`]: 1 });
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
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_booking', 'template_booking_concierge'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceBookingConciergeState({
    state: currentState,
    messageText,
    config,
  });

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: reply.text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.createLead || actions?.createBooking) {
    const fields = nextState.collectedFields || {};
    const summary = buildBookingSummary(fields);
    if (actions.createLead) {
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
    }
    if (actions.createBooking) {
      const existingBooking = await BookingRequest.findOne({ conversationId: conversation._id });
      if (!existingBooking) {
        await BookingRequest.create({
          workspaceId: conversation.workspaceId,
          conversationId: conversation._id,
          serviceType: fields.service,
          summary,
        });
      }
    }
  }

  if (actions?.handoffReason) {
    await handoffToTeam({ conversation, reason: actions.handoffReason, customerMessage: messageText });
  }

  await session.save();
  return { success: true };
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
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['after_hours_lead', 'template_after_hours_capture'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceAfterHoursCaptureState({
    state: currentState,
    messageText,
    config,
  });

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: reply.text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.createLead) {
    const fields = nextState.collectedFields || {};
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
  }

  if (actions?.handoffReason) {
    await handoffToTeam({ conversation, reason: actions.handoffReason, customerMessage: messageText });
  }

  if (actions?.scheduleFollowup) {
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
  }

  await session.save();
  return { success: true };
}

async function handleSalesConciergeFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const {
    automation,
    replyStep,
    session,
    conversation,
    igAccount,
    messageText,
    platform,
    messageContext,
  } = params;
  const baseConfig = replyStep.templateFlow.config as SalesConciergeConfig;
  const config = await resolveSalesConciergeConfig(conversation.workspaceId, baseConfig);
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_purchase', 'template_sales_concierge'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });

  const { replies, state: nextState, actions } = advanceSalesConciergeState({
    state: currentState,
    messageText,
    config,
    context: messageContext,
  });

  let draftId = nextState.collectedFields?.draftId;
  let paymentLink: string | undefined;

  if (actions?.createDraft) {
    const draft = await createSalesOrderDraft({
      conversation,
      fields: nextState.collectedFields || {},
    });
    draftId = draft?._id?.toString();
    if (draftId) {
      nextState.collectedFields = {
        ...nextState.collectedFields,
        draftId,
      };
    }
  }

  if (actions?.paymentLinkRequired && draftId) {
    paymentLink = createPaymentLink({
      amountText: nextState.collectedFields?.quote?.priceText,
      draftId,
    });
    nextState.collectedFields = {
      ...nextState.collectedFields,
      paymentLink,
    };
  }

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    const text = hydratePaymentLink(reply.text, paymentLink);
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.handoffReason && actions?.handoffSummary) {
    await handoffSalesConcierge({
      conversation,
      topic: actions.handoffTopic || actions.handoffReason,
      summary: actions.handoffSummary,
      recommendedNextAction: actions.recommendedNextAction,
      customerMessage: messageText,
    });
  }

  await trackSalesStep(conversation.workspaceId, nextState.step);
  await session.save();
  return { success: true };
}

async function executeTemplateFlow(params: {
  automation: any;
  replyStep: any;
  conversationId: string;
  workspaceId: string;
  instagramAccountId: string;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const {
    automation,
    replyStep,
    conversationId,
    workspaceId,
    instagramAccountId,
    messageText,
    platform,
    messageContext,
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

  if (!conversation.participantInstagramId) {
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

  if (templateFlow.templateId === 'sales_concierge') {
    return handleSalesConciergeFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
      messageContext,
    });
  }

  return { success: false, error: 'Unknown template flow' };
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
  messageContext?: AutomationTestContext;
  automationId?: string;
}): Promise<{ success: boolean; automationExecuted?: string; error?: string }> {
  try {
    const {
      workspaceId,
      triggerType,
      conversationId,
      participantInstagramId,
      messageText,
      instagramAccountId,
      platform,
      messageContext,
      automationId,
    } = params;

    console.log('🤖 [AUTOMATION] Starting automation execution:', {
      workspaceId,
      triggerType,
      conversationId,
      participantInstagramId,
      instagramAccountId,
      messageTextPreview: messageText?.slice(0, 50),
      platform,
    });

    const automationQuery: Record<string, any> = {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      triggerType,
      isActive: true,
    };
    if (automationId) {
      automationQuery._id = new mongoose.Types.ObjectId(automationId);
    }

    const automations = await Automation.find(automationQuery).sort({ createdAt: 1 });

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

      if (matchesTriggerConfig(normalizedMessage, candidate.triggerConfig, messageContext)) {
        matchingAutomations.push(candidate);
      }
    }

    if (matchingAutomations.length === 0) {
      console.log('⚠️  [AUTOMATION] No automations matched trigger filters');
      return { success: false, error: 'No automations matched trigger filters' };
    }

    const automation = matchingAutomations[0];
    console.log(`✅ [AUTOMATION] Executing automation: "${automation.name}" (ID: ${automation._id})`);

    const replyStep = automation.replySteps[0];

    if (!replyStep || replyStep.type !== 'template_flow') {
      console.log('❌ [AUTOMATION] Only template_flow automations are supported');
      return { success: false, error: 'Only template_flow automations are supported' };
    }

    const templateResult = await executeTemplateFlow({
      automation,
      replyStep,
      conversationId,
      workspaceId,
      instagramAccountId,
      messageText: normalizedMessage,
      platform,
      messageContext,
    });

    if (templateResult.success) {
      return { success: true, automationExecuted: automation.name };
    }

    return { success: false, error: templateResult.error || 'Template flow not executed' };
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
  messageContext?: AutomationTestContext;
}): Promise<{ executed: boolean; automationName?: string }> {
  const result = await executeAutomation(params);
  return {
    executed: result.success,
    automationName: result.automationExecuted,
  };
}

function appendTestHistory(history: AutomationTestHistoryItem[], from: 'customer' | 'ai', text: string) {
  history.push({
    from,
    text,
    createdAt: new Date().toISOString(),
  });
}

type AutomationTestMode = 'self_chat' | 'test_user';

const TEST_ACCESS_TOKEN = 'test_preview';
const TEST_ACCOUNT_NAME = 'Preview Test Account';
const TEST_ACCOUNT_HANDLE = 'preview.test';

function resolveTestMode(
  mode?: AutomationTestContext['testMode'],
  fallback?: AutomationTestState['testMode'],
): AutomationTestMode {
  if (mode === 'self_chat' || mode === 'test_user') {
    return mode;
  }
  if (fallback === 'self_chat' || fallback === 'test_user') {
    return fallback;
  }
  return 'test_user';
}

async function ensureTestInstagramAccount(
  workspaceId: string,
  existingAccountId?: string,
): Promise<any> {
  let account: any | null = null;
  if (existingAccountId) {
    account = await InstagramAccount.findById(existingAccountId).select('+accessToken');
    if (account?.status !== 'mock') {
      account = null;
    }
  }

  const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
  const username = `${TEST_ACCOUNT_HANDLE}-${workspaceId}`;
  if (!account) {
    account = await InstagramAccount.findOne({
      workspaceId: workspaceObjectId,
      status: 'mock',
      username,
    }).select('+accessToken');
  }

  if (!account) {
    account = await InstagramAccount.create({
      username,
      workspaceId: workspaceObjectId,
      status: 'mock',
      instagramAccountId: `test_ig_${workspaceId}`,
      instagramUserId: `test_user_${workspaceId}`,
      name: TEST_ACCOUNT_NAME,
      accessToken: TEST_ACCESS_TOKEN,
      accountType: 'test',
    });
  }

  if (!account.instagramAccountId) {
    account.instagramAccountId = `test_ig_${workspaceId}`;
  }
  if (!account.instagramUserId) {
    account.instagramUserId = `test_user_${workspaceId}`;
  }

  if (!account.accessToken || !account.accessToken.startsWith('test_')) {
    account.accessToken = TEST_ACCESS_TOKEN;
  }

  if (account.isModified()) {
    await account.save();
    account = await InstagramAccount.findById(account._id).select('+accessToken');
  }

  return account;
}

async function ensureTestConversation(params: {
  automationId: string;
  workspaceId: string;
  instagramAccount: any;
  state: AutomationTestState;
  testMode: AutomationTestMode;
}): Promise<any> {
  const { automationId, workspaceId, instagramAccount, state, testMode } = params;

  if (state.testConversationId && state.testMode === testMode) {
    const existing = await Conversation.findById(state.testConversationId);
    if (
      existing
      && existing.workspaceId.toString() === workspaceId
      && existing.instagramAccountId.toString() === instagramAccount._id.toString()
    ) {
      if (!existing.participantInstagramId) {
        existing.participantInstagramId = testMode === 'self_chat'
          ? instagramAccount.instagramAccountId || `test_ig_${workspaceId}`
          : state.testParticipantInstagramId || `test_user_${automationId}`;
        existing.platform = 'instagram';
        await existing.save();
      }
      return existing;
    }
  }

  const participantInstagramId = testMode === 'self_chat'
    ? instagramAccount.instagramAccountId || `test_ig_${workspaceId}`
    : state.testParticipantInstagramId || `test_user_${automationId}`;
  const participantHandle = testMode === 'self_chat'
    ? instagramAccount.username || TEST_ACCOUNT_HANDLE
    : 'preview.test.user';
  const participantName = testMode === 'self_chat'
    ? instagramAccount.name || instagramAccount.username || TEST_ACCOUNT_NAME
    : 'Preview Test User';

  return Conversation.create({
    participantName,
    participantHandle,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    instagramAccountId: instagramAccount._id,
    platform: 'instagram',
    instagramConversationId: `preview_${automationId}`,
    participantInstagramId,
  });
}

async function recordTestCustomerMessage(
  conversation: any,
  messageText: string,
): Promise<{ message: any; sentAt: Date }> {
  const sentAt = new Date();
  const message = await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text: messageText,
    from: 'customer',
    platform: 'instagram',
    createdAt: sentAt,
  });

  conversation.lastMessage = messageText;
  conversation.lastMessageAt = sentAt;
  conversation.lastCustomerMessageAt = sentAt;
  await conversation.save();

  return { message, sentAt };
}

async function applyMessageCategorization(params: {
  workspaceId: string;
  conversation: any;
  message: any;
  messageText: string;
}): Promise<{ categoryId: string; categoryName: string }> {
  const { workspaceId, conversation, message, messageText } = params;
  const categorization = await categorizeMessage(messageText, workspaceId);
  const categoryId = await getOrCreateCategory(workspaceId, categorization.categoryName);
  await incrementCategoryCount(categoryId);

  message.categoryId = categoryId;
  message.detectedLanguage = categorization.detectedLanguage;
  if (categorization.translatedText) {
    message.translatedText = categorization.translatedText;
  }
  await message.save();

  conversation.categoryId = categoryId;
  conversation.categoryConfidence = categorization.confidence;
  await conversation.save();

  return { categoryId: categoryId.toString(), categoryName: categorization.categoryName };
}

async function buildTestTemplateState(
  automationId: mongoose.Types.ObjectId,
  conversationId: mongoose.Types.ObjectId,
): Promise<AutomationTestState['template'] | undefined> {
  const session = await AutomationSession.findOne({
    automationId,
    conversationId,
  }).sort({ createdAt: -1 });

  if (!session) {
    return undefined;
  }

  let followup;
  if (session.followupTaskId) {
    const task = await FollowupTask.findById(session.followupTaskId);
    if (task) {
      const followupStatus = ['scheduled', 'sent', 'cancelled'].includes(task.status)
        ? (task.status as 'scheduled' | 'sent' | 'cancelled')
        : 'cancelled';
      followup = {
        status: followupStatus,
        scheduledAt: task.scheduledFollowupAt?.toISOString(),
        message: task.customMessage || task.followupText,
      };
    }
  }

  return {
    templateId: session.templateId,
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
    followup,
    lastCustomerMessageAt: session.lastCustomerMessageAt?.toISOString(),
    lastBusinessMessageAt: session.lastAutomationMessageAt?.toISOString(),
  };
}

async function fetchTestReplies(conversationId: mongoose.Types.ObjectId, since: Date): Promise<string[]> {
  const messages = await Message.find({
    conversationId,
    from: 'ai',
    createdAt: { $gte: since },
  }).sort({ createdAt: 1 });

  return messages.map((message) => message.text);
}

export async function runAutomationTest(params: {
  automationId: string;
  workspaceId: string;
  messageText?: string;
  state?: AutomationTestState;
  action?: 'simulate_followup';
  context?: AutomationTestContext;
}): Promise<{
  replies: string[];
  state: AutomationTestState;
  meta?: Record<string, any>;
}> {
  const { automationId, workspaceId, messageText, action, context } = params;
  const automation = await Automation.findById(automationId);
  if (!automation) {
    throw new Error('Automation not found');
  }

  console.log('🧪 [AUTOMATION TEST] Run', {
    automationId,
    workspaceId,
    action,
    messageTextPreview: messageText?.slice(0, 160),
    triggerConfig: automation.triggerConfig,
    context,
  });

  const nextState: AutomationTestState = params.state ? { ...params.state } : {};
  const history = nextState.history ? [...nextState.history] : [];
  const testMode = resolveTestMode(context?.testMode, nextState.testMode);
  const instagramAccount = await ensureTestInstagramAccount(workspaceId, nextState.testInstagramAccountId);
  const conversation = await ensureTestConversation({
    automationId,
    workspaceId,
    instagramAccount,
    state: nextState,
    testMode,
  });

  nextState.testConversationId = conversation._id.toString();
  nextState.testInstagramAccountId = instagramAccount._id.toString();
  nextState.testParticipantInstagramId = conversation.participantInstagramId;
  nextState.testMode = testMode;

  if (action === 'simulate_followup') {
    const followupTask = await FollowupTask.findOne({
      conversationId: conversation._id,
      status: 'scheduled',
    }).sort({ scheduledFollowupAt: 1 });

    if (!followupTask) {
      return {
        replies: [],
        state: {
          ...nextState,
          history,
        },
        meta: { error: 'No follow-up scheduled' },
      };
    }

    followupTask.scheduledFollowupAt = new Date();
    await followupTask.save();

    const startedAt = new Date();
    await processDueFollowups({
      conversationId: conversation._id,
      now: startedAt,
    });

    const replies = await fetchTestReplies(conversation._id, startedAt);
    replies.forEach((reply) => appendTestHistory(history, 'ai', reply));

    const template = await buildTestTemplateState(automation._id, conversation._id);
    return {
      replies,
      state: {
        ...nextState,
        history,
        template,
      },
      meta: { action: 'simulate_followup' },
    };
  }

  if (!messageText) {
    throw new Error('messageText is required');
  }

  appendTestHistory(history, 'customer', messageText);

  await cancelFollowupOnCustomerReply(conversation._id);
  const { message } = await recordTestCustomerMessage(conversation, messageText);
  const { categoryId, categoryName } = await applyMessageCategorization({
    workspaceId,
    conversation,
    message,
    messageText,
  });

  const linkMatch = messageText.match(/https?:\/\/\S+/i);
  const messageContext: AutomationTestContext = {
    ...context,
    categoryId,
    categoryName,
    hasLink: Boolean(linkMatch),
    linkUrl: linkMatch ? linkMatch[0] : undefined,
  };
  const triggerMatched = matchesTriggerConfig(messageText, automation.triggerConfig, messageContext);

  console.log('🧪 [AUTOMATION TEST] Trigger match', {
    automationId,
    triggerMatched,
    context: messageContext,
  });

  if (!conversation.participantInstagramId) {
    throw new Error('Missing participant Instagram ID for test conversation');
  }

  const startedAt = new Date();
  const executionResult = await executeAutomation({
    workspaceId,
    triggerType: automation.triggerType,
    conversationId: conversation._id.toString(),
    participantInstagramId: conversation.participantInstagramId,
    messageText,
    instagramAccountId: conversation.instagramAccountId.toString(),
    platform: conversation.platform || 'instagram',
    messageContext,
    automationId,
  });

  const replies = await fetchTestReplies(conversation._id, startedAt);
  replies.forEach((reply) => appendTestHistory(history, 'ai', reply));
  const template = await buildTestTemplateState(automation._id, conversation._id);

  return {
    replies,
    state: {
      ...nextState,
      history,
      template,
    },
    meta: {
      triggerMatched,
      error: executionResult.success ? undefined : executionResult.error,
    },
  };
}

/**
 * Process due follow-up tasks
 * This should be called by a background job
 */
export async function processDueFollowups(params?: {
  conversationId?: mongoose.Types.ObjectId | string;
  now?: Date;
}): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, cancelled: 0 };
  const now = params?.now || new Date();

  try {
    const query: Record<string, any> = {
      status: 'scheduled',
      scheduledFollowupAt: { $lte: now },
    };
    if (params?.conversationId) {
      query.conversationId = new mongoose.Types.ObjectId(params.conversationId);
    }

    const dueTasks = await FollowupTask.find(query);

    for (const task of dueTasks) {
      stats.processed++;

      if (task.followupType !== 'after_hours') {
        task.status = 'cancelled';
        task.errorMessage = 'Deprecated follow-up type';
        await task.save();
        stats.cancelled++;
        continue;
      }

      try {
        const conversation = await Conversation.findById(task.conversationId);
        if (!conversation) {
          task.status = 'cancelled';
          task.errorMessage = 'Conversation not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

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

        if (new Date() > task.windowExpiresAt) {
          task.status = 'expired';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const igAccount = await InstagramAccount.findById(task.instagramAccountId).select('+accessToken');
        if (!igAccount || !igAccount.accessToken) {
          task.status = 'cancelled';
          task.errorMessage = 'Instagram account not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const followupText = task.customMessage || "We're open now if you'd like to continue. Reply anytime.";

        const result = await sendInstagramMessage(
          task.participantInstagramId,
          followupText,
          igAccount.accessToken,
        );

        if (!result || (!result.message_id && !result.recipient_id)) {
          task.status = 'cancelled';
          task.errorMessage = 'Failed to send message';
          await task.save();
          stats.failed++;
          continue;
        }

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

        conversation.lastMessageAt = new Date();
        conversation.lastMessage = followupText;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();

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
  conversationId: mongoose.Types.ObjectId | string,
): Promise<void> {
  await FollowupTask.updateMany(
    {
      conversationId,
      status: 'scheduled',
    },
    { status: 'customer_replied' },
  );
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
