import mongoose from 'mongoose';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import FollowupTask from '../models/FollowupTask';
import Automation from '../models/Automation';
import AutomationSession from '../models/AutomationSession';
import { generateAIReply } from './aiReplyService';
import { getAutomationTemplateConfig } from './automationTemplateService';
import {
  sendMessage as sendInstagramMessage,
  sendButtonMessage,
} from '../utils/instagram-api';
import { addTicketUpdate, createTicket, getActiveTicket } from './escalationService';
import { addCountIncrement, trackDailyMetric } from './reportingService';
import {
  detectGoalIntent,
  getGoalConfigs,
  getWorkspaceSettings,
  goalMatchesWorkspace,
} from './workspaceSettingsService';
import { pauseForTypingIfNeeded } from './automation/typing';
import { matchesTriggerConfig } from './automation/triggerMatcher';
import {
  advanceSalesConciergeState,
  normalizeFlowState,
  resolveSalesConciergeConfig,
} from './automation/templateFlows';
import { AutomationTestContext } from './automation/types';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { getAutomationDefaults } from './adminAutomationDefaultsService';
import { normalizeText } from './automation/utils';
import {
  AutomationRateLimit,
  AutomationAiSettings,
  AutomationTemplateId,
  SalesConciergeConfig,
  TemplateFlowConfig,
  TriggerType,
} from '../types/automation';

const DEFAULT_RATE_LIMIT: AutomationRateLimit = {
  maxMessages: 5,
  perMinutes: 1,
};

const nowMs = () => Date.now();

const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const shouldLogAutomationSteps = () => getLogSettingsSnapshot().automationStepsEnabled;

const logAutomation = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
};

const logAutomationStep = (step: string, startMs: number, details?: Record<string, any>) => {
  if (!shouldLogAutomationSteps()) return;
  const ms = Math.max(0, Math.round(nowMs() - startMs));
  console.log('⏱️ [AUTOMATION] Step', { step, ms, ...(details || {}) });
};

const normalizeKeywordList = (values?: string[]): string[] => (
  (values || [])
    .map((value) => normalizeText(String(value || '')))
    .filter(Boolean)
);

const messageHasKeyword = (messageText: string, keywords: string[]): boolean => {
  if (!keywords.length) return false;
  const normalized = normalizeText(messageText);
  return keywords.some((keyword) => normalized.includes(keyword));
};

const isSessionExpired = (session: any, ttlMinutes?: number): boolean => {
  if (!ttlMinutes || ttlMinutes <= 0) return false;
  const lastMessageAt = session.lastCustomerMessageAt || session.updatedAt;
  if (!lastMessageAt) return false;
  const elapsedMs = Date.now() - new Date(lastMessageAt).getTime();
  return elapsedMs > ttlMinutes * 60 * 1000;
};

const shouldHandleFaqInterrupt = (messageText: string, config: SalesConciergeConfig): boolean => {
  if (config.faqInterruptEnabled === false) return false;
  const keywords = normalizeKeywordList(config.faqIntentKeywords);
  if (!keywords.length) return false;
  const normalized = normalizeText(messageText);
  const hasQuestion = normalized.startsWith('what ')
    || normalized.startsWith('when ')
    || normalized.startsWith('where ')
    || normalized.startsWith('how ')
    || messageText.includes('?');
  return hasQuestion && messageHasKeyword(messageText, keywords);
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
  aiMeta?: {
    shouldEscalate?: boolean;
    escalationReason?: string;
    knowledgeItemIds?: string[];
  };
}): Promise<void> {
  const { conversation, automation, igAccount, recipientId, text, buttons, platform, tags, aiMeta } = params;

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
    aiShouldEscalate: aiMeta?.shouldEscalate,
    aiEscalationReason: aiMeta?.escalationReason,
    kbItemIdsUsed: aiMeta?.knowledgeItemIds,
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

async function sendAiReplyMessage(params: {
  conversation: any;
  automation: any;
  igAccount: any;
  recipientId: string;
  text: string;
  platform?: string;
  tags?: string[];
  aiMeta?: {
    shouldEscalate?: boolean;
    escalationReason?: string;
    knowledgeItemIds?: string[];
  };
}): Promise<any> {
  const { conversation, automation, igAccount, recipientId, text, platform, tags, aiMeta } = params;

  await pauseForTypingIfNeeded(platform);

  const result = await sendInstagramMessage(recipientId, text, igAccount.accessToken);
  if (!result || (!result.message_id && !result.recipient_id)) {
    throw new Error('Instagram API did not return a valid response.');
  }

  const sentAt = new Date();
  const message = await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text,
    from: 'ai',
    platform: platform || 'instagram',
    instagramMessageId: result.message_id,
    automationSource: 'ai_reply',
    aiTags: tags,
    aiShouldEscalate: aiMeta?.shouldEscalate,
    aiEscalationReason: aiMeta?.escalationReason,
    kbItemIdsUsed: aiMeta?.knowledgeItemIds,
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

  return message;
}

async function buildAutomationAiReply(params: {
  conversation: any;
  messageText: string;
  messageContext?: AutomationTestContext;
  aiSettings?: AutomationAiSettings;
  knowledgeItemIds?: string[];
}) {
  const { conversation, messageText, messageContext, aiSettings, knowledgeItemIds } = params;
  const settings = await getWorkspaceSettings(conversation.workspaceId);
  const goalConfigs = getGoalConfigs(settings);
  const detectedGoal = detectGoalIntent(messageText || '');
  const goalMatched = goalMatchesWorkspace(
    detectedGoal,
    settings?.primaryGoal,
    settings?.secondaryGoal,
  )
    ? detectedGoal
    : 'none';

  return generateAIReply({
    conversation,
    workspaceId: conversation.workspaceId,
    latestCustomerMessage: messageText,
    categoryId: messageContext?.categoryId,
    categorization: messageContext?.categoryName
      ? { categoryName: messageContext.categoryName }
      : undefined,
    historyLimit: 20,
    goalContext: {
      workspaceGoals: {
        primaryGoal: settings?.primaryGoal,
        secondaryGoal: settings?.secondaryGoal,
        configs: goalConfigs,
      },
      detectedGoal: goalMatched !== 'none' ? goalMatched : 'none',
      activeGoalType: goalMatched !== 'none' ? goalMatched : undefined,
      goalState: goalMatched !== 'none' ? 'collecting' : 'idle',
      collectedFields: conversation.goalCollectedFields || {},
    },
    workspaceSettingsOverride: settings,
    tone: aiSettings?.tone,
    maxReplySentences: aiSettings?.maxReplySentences,
    model: aiSettings?.model,
    temperature: aiSettings?.temperature,
    maxOutputTokens: aiSettings?.maxOutputTokens,
    knowledgeItemIds,
  });
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

async function trackSalesStep(workspaceId: mongoose.Types.ObjectId, step?: string) {
  if (!step) return;
  await trackDailyMetric(workspaceId, new Date(), { [`salesConciergeStepCounts.${step}`]: 1 });
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
  const configStart = nowMs();
  const adminDefaults = await getAutomationDefaults('sales_concierge');
  const baseConfig = {
    ...adminDefaults,
    ...(replyStep.templateFlow.config as SalesConciergeConfig),
  };
  const config = await resolveSalesConciergeConfig(conversation.workspaceId, baseConfig);
  const templateConfig = await getAutomationTemplateConfig('sales_concierge');
  logAutomationStep('sales_config', configStart, { templateId: 'sales_concierge' });
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_purchase', 'template_sales_concierge'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });

  if (shouldHandleFaqInterrupt(messageText, config)) {
    const faqStart = nowMs();
    const aiSettings = {
      ...(config.aiSettings || {}),
      ...templateConfig.aiReply,
    };
    const faqResponse = await buildAutomationAiReply({
      conversation,
      messageText,
      messageContext,
      aiSettings,
      knowledgeItemIds: config.knowledgeItemIds,
    });
    logAutomationStep('sales_faq_interrupt', faqStart, { answered: Boolean(faqResponse) });

    const suffix = (config.faqResponseSuffix || '').trim();
    const replyText = suffix ? `${faqResponse.replyText} ${suffix}` : faqResponse.replyText;

    if (!updateRateLimit(session, rateLimit)) {
      return { success: false, error: 'Rate limit exceeded' };
    }

    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: replyText,
      platform,
      tags: [...tags, ...(faqResponse.tags || [])],
      aiMeta: {
        shouldEscalate: faqResponse.shouldEscalate,
        escalationReason: faqResponse.escalationReason,
        knowledgeItemIds: faqResponse.knowledgeItemsUsed?.map((item) => item.id),
      },
    });

    session.lastAutomationMessageAt = new Date();
    await session.save();
    return { success: true };
  }

  const stateStart = nowMs();
  const { replies, state: nextState, actions } = advanceSalesConciergeState({
    state: currentState,
    messageText,
    config,
    context: messageContext,
  });
  logAutomationStep('sales_state', stateStart, { replies: replies.length, step: nextState.step });
  const aiSettings = {
    ...(config.aiSettings || {}),
    ...templateConfig.aiReply,
  };
  const aiStart = nowMs();
  const aiResponse = replies.length
    ? await buildAutomationAiReply({
        conversation,
        messageText,
        messageContext,
        aiSettings,
      })
    : null;
  logAutomationStep('sales_ai_reply', aiStart, { generated: Boolean(aiResponse) });
  const combinedTags = [...tags, ...(aiResponse?.tags || [])];
  const repliesToSend = aiResponse
    ? [{ ...replies[0], text: aiResponse.replyText }]
    : replies;

  let sentAny = false;
  let sentCount = 0;
  const sendStart = nowMs();
  for (const reply of repliesToSend) {
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
      tags: combinedTags,
      aiMeta: aiResponse
        ? {
            shouldEscalate: aiResponse.shouldEscalate,
            escalationReason: aiResponse.escalationReason,
            knowledgeItemIds: aiResponse.knowledgeItemsUsed?.map((item) => item.id),
          }
        : undefined,
    });
    sentAny = true;
    sentCount += 1;
  }
  logAutomationStep('sales_send_replies', sendStart, {
    attempted: repliesToSend.length,
    sent: sentCount,
    rateLimited: sentCount < repliesToSend.length,
  });

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.handoffReason && actions?.handoffSummary) {
    const handoffStart = nowMs();
    await handoffSalesConcierge({
      conversation,
      topic: actions.handoffTopic || actions.handoffReason,
      summary: actions.handoffSummary,
      recommendedNextAction: actions.recommendedNextAction,
      customerMessage: messageText,
    });
    logAutomationStep('sales_handoff', handoffStart);
  }

  const trackStart = nowMs();
  await trackSalesStep(conversation.workspaceId, nextState.step);
  logAutomationStep('sales_track_step', trackStart, { step: nextState.step });
  const saveStart = nowMs();
  await session.save();
  logAutomationStep('sales_session_save', saveStart);
  return { success: true };
}

async function handleAiReplyFlow(params: {
  automation: any;
  replyStep: { aiReply: { goalType: string; tone?: string; maxReplySentences?: number } };
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const { automation, replyStep, conversation, igAccount, messageText, platform, messageContext } = params;
  const settingsStart = nowMs();
  const settings = await getWorkspaceSettings(conversation.workspaceId);
  const goalConfigs = getGoalConfigs(settings);
  logAutomationStep('ai_settings', settingsStart);
  const explicitGoal = replyStep.aiReply?.goalType;
  const detectedGoal = explicitGoal && explicitGoal !== 'none'
    ? explicitGoal
    : detectGoalIntent(messageText || '');
  const goalMatched = goalMatchesWorkspace(
    detectedGoal as any,
    settings?.primaryGoal,
    settings?.secondaryGoal,
  )
    ? detectedGoal
    : 'none';

  const replyStart = nowMs();
  const aiResponse = await generateAIReply({
    conversation,
    workspaceId: conversation.workspaceId,
    latestCustomerMessage: messageText,
    categoryId: messageContext?.categoryId,
    categorization: messageContext?.categoryName
      ? { categoryName: messageContext.categoryName }
      : undefined,
    historyLimit: 20,
    goalContext: {
      workspaceGoals: {
        primaryGoal: settings?.primaryGoal,
        secondaryGoal: settings?.secondaryGoal,
        configs: goalConfigs,
      },
      detectedGoal: goalMatched !== 'none' ? goalMatched : 'none',
      activeGoalType: goalMatched !== 'none' ? goalMatched : undefined,
      goalState: goalMatched !== 'none' ? 'collecting' : 'idle',
      collectedFields: conversation.goalCollectedFields || {},
    },
    workspaceSettingsOverride: settings,
    tone: replyStep.aiReply?.tone,
    maxReplySentences: replyStep.aiReply?.maxReplySentences,
  });
  logAutomationStep('ai_reply_generate', replyStart);

  const activeTicket = await getActiveTicket(conversation._id);
  if (activeTicket && aiResponse.shouldEscalate) {
    aiResponse.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiResponse.replyText);
  } else if (activeTicket && !aiResponse.shouldEscalate) {
    aiResponse.replyText = `${aiResponse.replyText} Your earlier request is with a human teammate and they will confirm that separately.`;
  } else if (aiResponse.shouldEscalate) {
    aiResponse.replyText = buildInitialEscalationReply(aiResponse.replyText);
  }

  const sendStart = nowMs();
  const message = await sendAiReplyMessage({
    conversation,
    automation,
    igAccount,
    recipientId: conversation.participantInstagramId,
    text: aiResponse.replyText,
    platform,
    tags: aiResponse.tags,
    aiMeta: {
      shouldEscalate: aiResponse.shouldEscalate,
      escalationReason: aiResponse.escalationReason,
      knowledgeItemIds: aiResponse.knowledgeItemsUsed?.map((item) => item.id),
    },
  });
  logAutomationStep('ai_reply_send', sendStart);

  let ticketId = activeTicket?._id;
  if (aiResponse.shouldEscalate && !ticketId) {
    const ticketStart = nowMs();
    const ticket = await createTicket({
      conversationId: conversation._id,
      topicSummary: (aiResponse.escalationReason || aiResponse.replyText).slice(0, 140),
      reason: aiResponse.escalationReason || 'Escalated by AI',
      createdBy: 'ai',
    });
    logAutomationStep('ai_create_ticket', ticketStart, { ticketId: ticket._id?.toString() });
    ticketId = ticket._id;
    conversation.humanRequired = true;
    conversation.humanRequiredReason = ticket.reason;
    conversation.humanTriggeredAt = ticket.createdAt;
    conversation.humanTriggeredByMessageId = message._id;
    conversation.humanHoldUntil = settings?.humanEscalationBehavior === 'ai_silent'
      ? new Date(Date.now() + (settings?.humanHoldMinutes || 60) * 60 * 1000)
      : undefined;
  }

  if (ticketId) {
    const updateStart = nowMs();
    await addTicketUpdate(ticketId, { from: 'ai', text: aiResponse.replyText, messageId: message._id });
    logAutomationStep('ai_ticket_update', updateStart, { ticketId: ticketId.toString() });
  }

  if (aiResponse.shouldEscalate) {
    const holdMinutes = settings?.humanHoldMinutes || 60;
    const behavior = settings?.humanEscalationBehavior || 'ai_silent';
    conversation.humanRequired = true;
    conversation.humanRequiredReason = aiResponse.escalationReason || 'Escalation requested by AI';
    conversation.humanTriggeredAt = new Date();
    conversation.humanTriggeredByMessageId = message._id;
    conversation.humanHoldUntil = behavior === 'ai_silent'
      ? new Date(Date.now() + holdMinutes * 60 * 1000)
      : undefined;
    const saveStart = nowMs();
    await conversation.save();
    logAutomationStep('ai_conversation_save', saveStart);
  }

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

  const conversationStart = nowMs();
  const conversation = await Conversation.findById(conversationId);
  logAutomationStep('template_load_conversation', conversationStart, { conversationId });
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  if (conversation.humanHoldUntil && new Date(conversation.humanHoldUntil) > new Date()) {
    return { success: false, error: 'Conversation is on human hold' };
  }

  const sessionStart = nowMs();
  const session = await getTemplateSession({
    automationId: automation._id,
    conversationId: conversation._id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    templateId: templateFlow.templateId,
  });
  logAutomationStep('template_load_session', sessionStart, { templateId: templateFlow.templateId });

  if (!session) {
    return { success: false, error: 'Automation paused for human response' };
  }

  const igStart = nowMs();
  const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
  logAutomationStep('template_load_ig_account', igStart, { instagramAccountId });
  if (!igAccount || !igAccount.accessToken) {
    return { success: false, error: 'Instagram account not found or not connected' };
  }

  if (!conversation.participantInstagramId) {
    return { success: false, error: 'Missing participant Instagram ID' };
  }

  if (templateFlow.templateId === 'sales_concierge') {
    const flowStart = nowMs();
    const result = await handleSalesConciergeFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
      messageContext,
    });
    logAutomationStep('template_sales_concierge', flowStart, { success: result.success });
    return result;
  }

  return { success: false, error: 'Unsupported template flow' };
}

/**
 * Execute an automation based on trigger type
 */
export async function executeAutomation(params: {
  workspaceId: string;
  triggerType: TriggerType;
  conversationId: string;
  messageText?: string;
  instagramAccountId: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; automationExecuted?: string; error?: string }> {
  const totalStart = nowMs();
  const finish = (result: { success: boolean; automationExecuted?: string; error?: string }) => {
    logAutomationStep('automation_total', totalStart, {
      success: result.success,
      automation: result.automationExecuted,
      error: result.error,
    });
    return result;
  };
  try {
    const {
      workspaceId,
      triggerType,
      conversationId,
      messageText,
      instagramAccountId,
      platform,
      messageContext,
    } = params;

    logAutomation('🤖 [AUTOMATION] Start', {
      workspaceId,
      triggerType,
      conversationId,
      instagramAccountId,
      messageTextPreview: messageText?.slice(0, 50),
      platform,
    });

    const normalizedMessage = messageText || '';
    const activeSession = await AutomationSession.findOne({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      status: 'active',
    }).sort({ updatedAt: -1 });

    if (activeSession) {
      const automation = await Automation.findById(activeSession.automationId);
      const replyStep = automation?.replySteps?.[0];
      if (automation && replyStep?.type === 'template_flow') {
        if (replyStep.templateFlow?.templateId === 'sales_concierge') {
          const defaults = await getAutomationDefaults('sales_concierge');
          const mergedConfig: SalesConciergeConfig = {
            ...defaults,
            ...(replyStep.templateFlow.config as SalesConciergeConfig),
          };
          const lockMode = mergedConfig.lockMode || 'session_only';
          const releaseKeywords = normalizeKeywordList(mergedConfig.releaseKeywords);

          if (releaseKeywords.length && messageHasKeyword(normalizedMessage, releaseKeywords)) {
            activeSession.status = 'paused';
            await activeSession.save();
            logAutomation('🔓 [AUTOMATION] Session released by keyword', {
              automationId: automation._id?.toString(),
              templateId: replyStep.templateFlow.templateId,
            });
          } else if (isSessionExpired(activeSession, mergedConfig.lockTtlMinutes)) {
            activeSession.status = 'paused';
            await activeSession.save();
            logAutomation('⌛ [AUTOMATION] Session expired', {
              automationId: automation._id?.toString(),
              templateId: replyStep.templateFlow.templateId,
              ttlMinutes: mergedConfig.lockTtlMinutes,
            });
          } else if (lockMode !== 'none') {
            logAutomation('🔒 [AUTOMATION] Active session lock', {
              automationId: automation._id?.toString(),
              templateId: replyStep.templateFlow.templateId,
            });
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
            return templateResult.success
              ? finish({ success: true, automationExecuted: automation.name })
              : finish({ success: false, error: templateResult.error || 'Template flow not executed' });
          }
        } else {
          logAutomation('🔒 [AUTOMATION] Active session lock', {
            automationId: automation._id?.toString(),
            templateId: replyStep.templateFlow?.templateId,
          });
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
          return templateResult.success
            ? finish({ success: true, automationExecuted: automation.name })
            : finish({ success: false, error: templateResult.error || 'Template flow not executed' });
        }
      }
    }

    const automationQuery: Record<string, any> = {
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      triggerType,
      isActive: true,
    };

    const fetchStart = nowMs();
    const automations = await Automation.find(automationQuery).sort({ createdAt: 1 });
    logAutomationStep('fetch_automations', fetchStart, { count: automations.length, triggerType });

    logAutomation('🔍 [AUTOMATION] Active', {
      count: automations.length,
      triggerType,
    });

    if (automations.length === 0) {
      logAutomation('⚠️  [AUTOMATION] No active automations found');
      return finish({ success: false, error: 'No active automations found for this trigger' });
    }

    const matchingAutomations: typeof automations = [];

    const matchStart = nowMs();
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
        const triggerMode = candidate.triggerConfig?.triggerMode || 'any';
        const matchedBy = triggerMode === 'categories' && (messageContext?.categoryId || messageContext?.categoryName)
          ? 'category'
          : candidate.triggerConfig?.matchOn?.link && messageContext?.hasLink
            ? 'link'
            : candidate.triggerConfig?.matchOn?.attachment && messageContext?.hasAttachment
              ? 'attachment'
              : 'keyword';
        logAutomation('✅ [AUTOMATION] Match', {
          automationId: candidate._id?.toString(),
          name: candidate.name,
          triggerType,
          triggerMode,
          matchedBy,
          categoryName: messageContext?.categoryName,
        });
        matchingAutomations.push(candidate);
      }
    }
    logAutomationStep('match_triggers', matchStart, {
      matched: matchingAutomations.length,
      evaluated: automations.length,
      triggerType,
    });

    if (matchingAutomations.length === 0) {
      logAutomation('⚠️  [AUTOMATION] No automations matched trigger filters');
      return finish({ success: false, error: 'No automations matched trigger filters' });
    }

    const automation = matchingAutomations[0];
    logAutomation('✅ [AUTOMATION] Execute', {
      automationId: automation._id?.toString(),
      name: automation.name,
      replyType: automation.replySteps[0]?.type,
    });

    const replyStep = automation.replySteps[0];

    if (!replyStep) {
      logAutomation('❌ [AUTOMATION] No reply step configured');
      return finish({ success: false, error: 'No reply step configured' });
    }

    if (replyStep.type === 'template_flow') {
      const templateStart = nowMs();
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
      logAutomationStep('execute_template_flow', templateStart, {
        success: templateResult.success,
        templateId: replyStep.templateFlow?.templateId,
      });

      if (templateResult.success) {
        return finish({ success: true, automationExecuted: automation.name });
      }

      return finish({ success: false, error: templateResult.error || 'Template flow not executed' });
    }

    if (replyStep.type === 'ai_reply') {
      const conversationStart = nowMs();
      const conversation = await Conversation.findById(conversationId);
      logAutomationStep('ai_load_conversation', conversationStart, { conversationId });
      if (!conversation) {
        return finish({ success: false, error: 'Conversation not found' });
      }

      const igStart = nowMs();
      const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
      logAutomationStep('ai_load_ig_account', igStart, { instagramAccountId });
      if (!igAccount || !igAccount.accessToken) {
        return finish({ success: false, error: 'Instagram account not found or not connected' });
      }

      if (!conversation.participantInstagramId) {
        return finish({ success: false, error: 'Missing participant Instagram ID' });
      }

      const aiStart = nowMs();
      const aiResult = await handleAiReplyFlow({
        automation,
        replyStep,
        conversation,
        igAccount,
        messageText: normalizedMessage,
        platform,
        messageContext,
      });
      logAutomationStep('execute_ai_reply', aiStart, { success: aiResult.success });

      if (aiResult.success) {
        return finish({ success: true, automationExecuted: automation.name });
      }

      return finish({ success: false, error: aiResult.error || 'AI reply not sent' });
    }

    logAutomation('❌ [AUTOMATION] Only template_flow and ai_reply automations are supported');
    return finish({ success: false, error: 'Only template_flow and ai_reply automations are supported' });
  } catch (error: any) {
    console.error('❌ [AUTOMATION] Error executing automation:', error);
    console.error('❌ [AUTOMATION] Error stack:', error.stack);
    return finish({ success: false, error: `Failed to execute automation: ${error.message}` });
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

    logAutomation(`Follow-up processing complete: ${JSON.stringify(stats)}`);
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

function buildFollowupResponse(followUpCount: number, base: string): string {
  const templates = [
    'I’ve flagged this to the team and they’ll handle it directly. I can’t confirm on their behalf, but I can gather any details they need.',
    'Your request is with the team. I cannot make promises here, but I can note your urgency and pass along details.',
    'Thanks for your patience. This needs a human to finalize. I’m here to help with any other questions meanwhile.',
  ];
  const variant = templates[followUpCount % templates.length];
  return base && base.trim().length > 0 ? base : variant;
}

function buildInitialEscalationReply(base: string): string {
  if (base && base.trim().length > 0) return base;
  return 'This needs a teammate to review personally, so I’ve flagged it for them. I won’t make commitments here, but I can help with other questions meanwhile.';
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
