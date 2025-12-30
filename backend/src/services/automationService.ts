import mongoose from 'mongoose';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import FollowupTask from '../models/FollowupTask';
import AutomationInstance from '../models/AutomationInstance';
import AutomationSession from '../models/AutomationSession';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import { generateAIReply } from './aiReplyService';
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
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { logAdminEvent } from './adminLogEventService';
import {
  AutomationAiSettings,
  AutomationIntentSettings,
  AutomationRateLimit,
  TriggerConfig,
  TriggerType,
} from '../types/automation';
import { FlowExposedField, FlowTriggerDefinition } from '../types/flow';
import { AutomationTestContext } from './automation/types';

type FlowRuntimeEdge = {
  from: string;
  to: string;
  condition?: Record<string, any>;
};

type FlowRuntimeStep = {
  id?: string;
  type?: string;
  text?: string;
  message?: string;
  buttons?: Array<{ title: string; payload?: string } | string>;
  tags?: string[];
  aiSettings?: AutomationAiSettings;
  knowledgeItemIds?: string[];
  waitForReply?: boolean;
  next?: string;
  logEnabled?: boolean;
  handoff?: {
    topic?: string;
    summary?: string;
    recommendedNextAction?: string;
    message?: string;
  };
  rateLimit?: AutomationRateLimit;
  intentSettings?: AutomationIntentSettings;
};

type FlowRuntimeGraph = {
  steps?: FlowRuntimeStep[];
  nodes?: FlowRuntimeStep[];
  edges?: FlowRuntimeEdge[];
  startNodeId?: string;
  start?: string;
  response?: FlowRuntimeStep;
  rateLimit?: AutomationRateLimit;
  aiSettings?: AutomationAiSettings;
};

type ExecutionPlan = {
  mode: 'steps' | 'nodes';
  steps: FlowRuntimeStep[];
  startIndex?: number;
  startNodeId?: string;
  nodeMap?: Map<string, FlowRuntimeStep>;
  edges?: FlowRuntimeEdge[];
  graph: FlowRuntimeGraph;
};

const nowMs = () => Date.now();

const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const shouldLogAutomationSteps = () => getLogSettingsSnapshot().automationStepsEnabled;

const resolveWorkspaceId = (details?: Record<string, any>) => {
  const candidate = details?.workspaceId;
  if (!candidate) return undefined;
  if (typeof candidate === 'string') return candidate;
  if (candidate instanceof mongoose.Types.ObjectId) return candidate;
  if (typeof candidate === 'object' && typeof candidate.toString === 'function') {
    return candidate.toString();
  }
  return undefined;
};

const logAutomation = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  void logAdminEvent({
    category: 'automation',
    message,
    details,
    workspaceId: resolveWorkspaceId(details),
  });
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
};

const logAutomationStep = (step: string, startMs: number, details?: Record<string, any>) => {
  if (!shouldLogAutomationSteps()) return;
  const ms = Math.max(0, Math.round(nowMs() - startMs));
  void logAdminEvent({
    category: 'automation_step',
    message: 'Automation step timing',
    details: { step, ms, ...(details || {}) },
    workspaceId: resolveWorkspaceId(details),
  });
  console.log('⏱️ [AUTOMATION] Step', { step, ms, ...(details || {}) });
};

const shouldLogNode = (step?: FlowRuntimeStep) => step?.logEnabled !== false;

const logNodeEvent = (message: string, details?: Record<string, any>) => {
  void logAdminEvent({
    category: 'flow_node',
    message: `🧩 [FLOW NODE] ${message}`,
    details,
    workspaceId: resolveWorkspaceId(details),
  });
  console.log(`🧩 [FLOW NODE] ${message}`, details || {});
};

const summarizeTriggerConfig = (config?: TriggerConfig) => {
  if (!config) return null;
  return {
    triggerMode: config.triggerMode || 'any',
    keywordMatch: config.keywordMatch || 'any',
    keywordCount: config.keywords?.length || 0,
    excludeKeywordCount: config.excludeKeywords?.length || 0,
    categoryIdsCount: config.categoryIds?.length || 0,
    outsideBusinessHours: Boolean(config.outsideBusinessHours),
    intentTextPreview: config.intentText ? config.intentText.slice(0, 80) : undefined,
    matchOn: config.matchOn
      ? {
          link: Boolean(config.matchOn.link),
          attachment: Boolean(config.matchOn.attachment),
        }
      : undefined,
  };
};

const summarizeTriggers = (triggers: FlowTriggerDefinition[]) =>
  triggers.map((trigger) => ({
    type: trigger.type,
    label: trigger.label,
    description: trigger.description,
    config: summarizeTriggerConfig(trigger.config),
  }));

const summarizeMessageContext = (context?: AutomationTestContext) => ({
  categoryId: context?.categoryId,
  categoryName: context?.categoryName,
  hasLink: Boolean(context?.hasLink),
  hasAttachment: Boolean(context?.hasAttachment),
  forceOutsideBusinessHours: Boolean(context?.forceOutsideBusinessHours),
});

const deepClone = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const resolveLatestTemplateVersion = async (params: {
  templateId?: mongoose.Types.ObjectId | string;
  fallbackVersionId?: mongoose.Types.ObjectId | string;
}) => {
  const { templateId, fallbackVersionId } = params;
  if (templateId) {
    const template = await FlowTemplate.findById(templateId).select('currentVersionId').lean();
    if (template?.currentVersionId) {
      const version = await FlowTemplateVersion.findOne({
        _id: template.currentVersionId,
        status: 'published',
      }).lean();
      if (version) return version;
    }
  }
  if (fallbackVersionId) {
    const version = await FlowTemplateVersion.findOne({
      _id: fallbackVersionId,
      status: 'published',
    }).lean();
    if (version) return version;
  }
  return null;
};

function buildEffectiveUserConfig(
  exposedFields: FlowExposedField[] | undefined,
  userConfig: Record<string, any> | undefined,
): Record<string, any> {
  const config: Record<string, any> = {};
  if (Array.isArray(exposedFields)) {
    exposedFields.forEach((field) => {
      if (!field?.key) return;
      if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
        config[field.key] = field.defaultValue;
      }
    });
  }
  if (userConfig && typeof userConfig === 'object') {
    Object.keys(userConfig).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
        config[key] = userConfig[key];
      }
    });
  }
  return config;
}

const TOKEN_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;

const stringifyConfigValue = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const PATH_INDEX_REGEX = /\[(\d+)\]/g;

const parsePath = (path: string): Array<string | number> => {
  return path
    .replace(PATH_INDEX_REGEX, '.$1')
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean)
    .map(segment => (segment.match(/^\d+$/) ? Number(segment) : segment));
};

const getConfigValue = (config: Record<string, any>, path: string): any => {
  const parts = parsePath(path);
  return parts.reduce((acc, part) => {
    if (acc === null || acc === undefined) return acc;
    return acc[part as keyof typeof acc];
  }, config as any);
};

const resolveTemplateString = (
  value: string,
  config: Record<string, any>,
  options?: { preserveUnknownVars?: boolean },
): any => {
  if (!value.includes('{{')) return value;
  const matches = Array.from(value.matchAll(TOKEN_REGEX));
  if (matches.length === 0) return value;
  const preserveUnknownVars = options?.preserveUnknownVars;
  if (matches.length === 1 && value === matches[0][0]) {
    const key = matches[0][1].trim();
    const raw = getConfigValue(config, key);
    if (raw === undefined) {
      return preserveUnknownVars && key.startsWith('vars.') ? value : '';
    }
    return raw;
  }
  return value.replace(TOKEN_REGEX, (match, key) => {
    const trimmed = key.trim();
    const raw = getConfigValue(config, trimmed);
    if (raw === undefined && preserveUnknownVars && trimmed.startsWith('vars.')) {
      return match;
    }
    return stringifyConfigValue(raw);
  });
};

const interpolateObject = (
  value: any,
  config: Record<string, any>,
  options?: { preserveUnknownVars?: boolean },
): any => {
  if (typeof value === 'string') {
    return resolveTemplateString(value, config, options);
  }
  if (Array.isArray(value)) {
    return value.map(item => interpolateObject(item, config, options));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = interpolateObject(entry, config, options);
    });
    return output;
  }
  return value;
};

const buildRuntimeTemplateContext = (session?: any): Record<string, any> => {
  const vars = session?.state?.vars && typeof session.state.vars === 'object' ? session.state.vars : {};
  return { vars, ...vars };
};

const resolveMessageTemplate = (value: string, session?: any): string => {
  if (!value) return '';
  const resolved = resolveTemplateString(value, buildRuntimeTemplateContext(session));
  if (typeof resolved === 'string') return resolved;
  return stringifyConfigValue(resolved);
};

const setByPath = (target: any, path: string, value: any) => {
  if (!path) return;
  const parts = parsePath(path);
  if (parts.length === 0) return;

  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cursor[key] === undefined) {
      const next = parts[i + 1];
      cursor[key] = typeof next === 'number' ? [] : {};
    }
    cursor = cursor[key];
    if (!cursor) return;
  }

  cursor[parts[parts.length - 1]] = value;
};

const findNodeById = (graph: any, nodeId: string): any | null => {
  const nodes = graph?.nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes.find((node: any) => node?.id === nodeId || node?.nodeId === nodeId) || null;
};

const applyExposedFields = (params: {
  graph: any;
  triggers: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  config: Record<string, any>;
}) => {
  const { graph, triggers, exposedFields, config } = params;
  if (!Array.isArray(exposedFields)) return;

  const triggerRoot = { triggers };

  exposedFields.forEach((field) => {
    if (!field?.key || !field?.source?.path) return;
    if (!Object.prototype.hasOwnProperty.call(config, field.key)) return;
    const rawPath = field.source.path.trim();
    if (!rawPath) return;

    const normalizedPath = rawPath.replace(/^graph\./, '');

    if (/^triggers(\.|\[|$)/.test(normalizedPath)) {
      setByPath(triggerRoot, normalizedPath, config[field.key]);
      return;
    }

    let target = graph;
    if (field.source.nodeId) {
      const node = findNodeById(graph, field.source.nodeId);
      if (node) {
        target = node;
      }
    }

    setByPath(target, normalizedPath, config[field.key]);
  });
};

const resolveFlowRuntime = (version: any, instance: any) => {
  const config = buildEffectiveUserConfig(version?.exposedFields, instance?.userConfig);
  const compiledClone = deepClone(version?.compiled || {});
  const graph = compiledClone?.graph ?? compiledClone;
  if (!graph || typeof graph !== 'object') {
    return null;
  }
  const triggers = deepClone(version?.triggers || []);
  applyExposedFields({
    graph,
    triggers,
    exposedFields: version?.exposedFields,
    config,
  });

  const resolvedGraph = interpolateObject(graph, config, { preserveUnknownVars: true });
  const resolvedTriggers = interpolateObject(triggers, config) as FlowTriggerDefinition[];

  return {
    graph: resolvedGraph as FlowRuntimeGraph,
    triggers: resolvedTriggers,
    config,
  };
};

const buildExecutionPlan = (graph: FlowRuntimeGraph): ExecutionPlan | null => {
  if (Array.isArray(graph.steps) && graph.steps.length > 0) {
    return { mode: 'steps', steps: graph.steps, startIndex: 0, graph };
  }
  if (graph.response && typeof graph.response === 'object') {
    return { mode: 'steps', steps: [graph.response], startIndex: 0, graph };
  }
  if (Array.isArray(graph.nodes) && graph.nodes.length > 0) {
    const nodeMap = new Map<string, FlowRuntimeStep>();
    graph.nodes.forEach((node) => {
      if (node?.id) {
        nodeMap.set(node.id, node);
      }
    });
    const startNodeId = graph.startNodeId || graph.start || graph.nodes[0]?.id;
    return {
      mode: 'nodes',
      steps: graph.nodes,
      startNodeId,
      nodeMap,
      edges: graph.edges,
      graph,
    };
  }
  return null;
};

const normalizeStepType = (
  step?: FlowRuntimeStep,
): 'send_message' | 'ai_reply' | 'handoff' | 'trigger' | 'detect_intent' | 'unknown' => {
  const raw = (step?.type || '').toLowerCase();
  if (raw === 'send_message' || raw === 'message' || raw === 'send' || raw === 'reply') {
    return 'send_message';
  }
  if (raw === 'ai_reply' || raw === 'ai' || raw === 'ai_message') {
    return 'ai_reply';
  }
  if (raw === 'handoff' || raw === 'escalate') {
    return 'handoff';
  }
  if (raw === 'trigger' || raw === 'start' || raw === 'entry') {
    return 'trigger';
  }
  if (raw === 'detect_intent' || raw === 'intent' || raw === 'intent_detection') {
    return 'detect_intent';
  }
  return 'unknown';
};

const normalizeButtons = (buttons?: Array<{ title: string; payload?: string } | string>) => {
  if (!Array.isArray(buttons)) return [];
  return buttons
    .map((button) => {
      if (typeof button === 'string') {
        return { title: button, payload: `button_${button}` };
      }
      if (!button?.title) return null;
      return { title: button.title, payload: button.payload || `button_${button.title}` };
    })
    .filter(Boolean) as Array<{ title: string; payload?: string }>;
};

const resolveRateLimit = (
  stepLimit?: AutomationRateLimit,
  graphLimit?: AutomationRateLimit,
): AutomationRateLimit | null => {
  const limit = stepLimit || graphLimit;
  if (!limit) return null;
  const maxMessages = Number(limit.maxMessages);
  const perMinutes = Number(limit.perMinutes);
  if (!maxMessages || !perMinutes) return null;
  return { maxMessages, perMinutes };
};

const updateRateLimit = (session: any, rateLimit: AutomationRateLimit): boolean => {
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
};

async function ensureAutomationSession(params: {
  instance: any;
  conversationId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  templateVersionId: mongoose.Types.ObjectId;
}): Promise<any | null> {
  const latest = await AutomationSession.findOne({
    automationInstanceId: params.instance._id,
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
    automationInstanceId: params.instance._id,
    templateId: params.instance.templateId,
    templateVersionId: params.templateVersionId,
    status: 'active',
    state: {},
  });
}

async function markAutomationTriggered(instanceId: mongoose.Types.ObjectId, timestamp: Date) {
  await AutomationInstance.findByIdAndUpdate(instanceId, {
    $inc: { 'stats.totalTriggered': 1 },
    $set: { 'stats.lastTriggeredAt': timestamp },
  });
}

async function markAutomationReplySent(instanceId: mongoose.Types.ObjectId, timestamp: Date) {
  await AutomationInstance.findByIdAndUpdate(instanceId, {
    $inc: { 'stats.totalRepliesSent': 1 },
    $set: { 'stats.lastReplySentAt': timestamp },
  });
}

async function sendFlowMessage(params: {
  conversation: any;
  instance: any;
  igAccount: any;
  recipientId: string;
  text: string;
  buttons?: Array<{ title: string; payload?: string } | string>;
  platform?: string;
  tags?: string[];
  source?: 'template_flow' | 'ai_reply';
  aiMeta?: {
    shouldEscalate?: boolean;
    escalationReason?: string;
    knowledgeItemIds?: string[];
  };
}): Promise<any> {
  const {
    conversation,
    instance,
    igAccount,
    recipientId,
    text,
    buttons,
    platform,
    tags,
    source,
    aiMeta,
  } = params;

  await pauseForTypingIfNeeded(platform || conversation.platform);

  const normalizedButtons = normalizeButtons(buttons);
  let result;
  if (normalizedButtons.length > 0 && igAccount.instagramAccountId) {
    result = await sendButtonMessage(
      igAccount.instagramAccountId,
      recipientId,
      text,
      normalizedButtons.map((button) => ({
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
  const message = await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text,
    from: 'ai',
    platform: platform || conversation.platform || 'instagram',
    instagramMessageId: result.message_id,
    automationSource: source || 'template_flow',
    aiTags: tags,
    aiShouldEscalate: aiMeta?.shouldEscalate,
    aiEscalationReason: aiMeta?.escalationReason,
    kbItemIdsUsed: aiMeta?.knowledgeItemIds,
    metadata: normalizedButtons.length > 0 ? { buttons: normalizedButtons } : undefined,
    createdAt: sentAt,
  });

  conversation.lastMessage = text;
  conversation.lastMessageAt = sentAt;
  conversation.lastBusinessMessageAt = sentAt;
  await conversation.save();

  await markAutomationReplySent(instance._id, sentAt);

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
  workspaceSettings?: any;
}) {
  const { conversation, messageText, messageContext, aiSettings, knowledgeItemIds } = params;
  const settings = params.workspaceSettings || await getWorkspaceSettings(conversation.workspaceId);
  const goalConfigs = getGoalConfigs(settings);
  const detectedGoal = await detectGoalIntent(messageText || '');
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
    historyLimit: aiSettings?.historyLimit,
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
    ragEnabled: aiSettings?.ragEnabled,
    model: aiSettings?.model,
    temperature: aiSettings?.temperature,
    maxOutputTokens: aiSettings?.maxOutputTokens,
    reasoningEffort: aiSettings?.reasoningEffort,
    knowledgeItemIds,
  });
}

async function handleAiReplyStep(params: {
  step: FlowRuntimeStep;
  graph: FlowRuntimeGraph;
  conversation: any;
  instance: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const { step, graph, conversation, instance, igAccount, messageText, platform, messageContext } = params;
  const settings = await getWorkspaceSettings(conversation.workspaceId);
  const aiSettings = {
    ...(graph.aiSettings || {}),
    ...(step.aiSettings || {}),
  };

  const replyStart = nowMs();
  const aiResponse = await buildAutomationAiReply({
    conversation,
    messageText,
    messageContext,
    aiSettings,
    knowledgeItemIds: step.knowledgeItemIds,
    workspaceSettings: settings,
  });
  logAutomationStep('flow_ai_reply_generate', replyStart);

  const activeTicket = await getActiveTicket(conversation._id);
  if (activeTicket && aiResponse.shouldEscalate) {
    aiResponse.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiResponse.replyText);
  } else if (activeTicket && !aiResponse.shouldEscalate) {
    aiResponse.replyText = `${aiResponse.replyText} Your earlier request is with a human teammate and they will confirm that separately.`;
  } else if (aiResponse.shouldEscalate) {
    aiResponse.replyText = buildInitialEscalationReply(aiResponse.replyText);
  }

  const sendStart = nowMs();
  const message = await sendFlowMessage({
    conversation,
    instance,
    igAccount,
    recipientId: conversation.participantInstagramId,
    text: aiResponse.replyText,
    platform,
    tags: aiResponse.tags,
    source: 'ai_reply',
    aiMeta: {
      shouldEscalate: aiResponse.shouldEscalate,
      escalationReason: aiResponse.escalationReason,
      knowledgeItemIds: aiResponse.knowledgeItemsUsed?.map((item) => item.id),
    },
  });
  logAutomationStep('flow_ai_reply_send', sendStart);

  let ticketId = activeTicket?._id;
  if (aiResponse.shouldEscalate && !ticketId) {
    const ticketStart = nowMs();
    const ticket = await createTicket({
      conversationId: conversation._id,
      topicSummary: (aiResponse.escalationReason || aiResponse.replyText).slice(0, 140),
      reason: aiResponse.escalationReason || 'Escalated by AI',
      createdBy: 'ai',
    });
    logAutomationStep('flow_ai_create_ticket', ticketStart, { ticketId: ticket._id?.toString() });
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
    logAutomationStep('flow_ai_ticket_update', updateStart, { ticketId: ticketId.toString() });
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
    logAutomationStep('flow_ai_conversation_save', saveStart);
  }

  return { success: true };
}

const normalizeIntentList = (value?: string | string[]): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
};

const matchesIntentCondition = (condition: Record<string, any>, detectedIntent?: string): boolean => {
  const intents = normalizeIntentList(condition.intent || condition.intents);
  const notIntents = normalizeIntentList(condition.notIntent || condition.notIntents);

  if (intents.length > 0 && (!detectedIntent || !intents.includes(detectedIntent))) {
    return false;
  }

  if (notIntents.length > 0 && detectedIntent && notIntents.includes(detectedIntent)) {
    return false;
  }

  if (intents.length === 0 && notIntents.length === 0) {
    return Object.keys(condition).length === 0;
  }

  return true;
};

const resolveNextNodeId = (
  step: FlowRuntimeStep,
  plan: ExecutionPlan,
  session: any,
): string | undefined => {
  if (step.next) return step.next;
  if (!step.id || !plan.edges) return undefined;

  const outboundEdges = plan.edges.filter((candidate) => candidate.from === step.id);
  if (outboundEdges.length === 0) return undefined;

  const detectedIntent = session?.state?.vars?.detectedIntent;

  for (const edge of outboundEdges) {
    if (!edge.condition || typeof edge.condition !== 'object') continue;
    if (matchesIntentCondition(edge.condition, detectedIntent)) {
      return edge.to;
    }
  }

  const fallbackEdge = outboundEdges.find((candidate) => !candidate.condition);
  return fallbackEdge?.to;
};

async function executeFlowPlan(params: {
  plan: ExecutionPlan;
  session: any;
  instance: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string; sentCount: number; executedSteps: number }> {
  const {
    plan,
    session,
    instance,
    conversation,
    igAccount,
    messageText,
    platform,
    messageContext,
  } = params;

  const maxSteps = 12;
  let sentCount = 0;
  let executedSteps = 0;
  let triggered = false;

  const markTriggeredOnce = async () => {
    if (triggered) return;
    triggered = true;
    await markAutomationTriggered(instance._id, new Date());
  };
  const buildNextState = (nextState: Record<string, any>) => {
    if (session.state?.vars) {
      return { ...nextState, vars: session.state.vars };
    }
    return nextState;
  };
  const completeWithError = async (error: string) => {
    session.status = 'completed';
    session.state = buildNextState({});
    await session.save();
    return { success: false, error, sentCount, executedSteps };
  };

  let stepIndex = 0;
  let nodeId: string | undefined;

  if (plan.mode === 'steps') {
    stepIndex = typeof session.state?.stepIndex === 'number'
      ? session.state.stepIndex
      : (plan.startIndex || 0);
  } else {
    nodeId = session.state?.nodeId || plan.startNodeId;
  }

  for (let i = 0; i < maxSteps; i += 1) {
    let step: FlowRuntimeStep | undefined;
    if (plan.mode === 'steps') {
      step = plan.steps[stepIndex];
    } else if (nodeId && plan.nodeMap) {
      step = plan.nodeMap.get(nodeId) || plan.steps.find(candidate => candidate.id === nodeId);
    }

    if (!step) {
      break;
    }

    const stepType = normalizeStepType(step);
    const rateLimit = resolveRateLimit(step.rateLimit, plan.graph.rateLimit);
    const nodeStart = nowMs();

    if (shouldLogNode(step)) {
      logNodeEvent('Node start', {
        nodeId: step.id,
        type: stepType,
        waitForReply: step.waitForReply,
        hasNext: Boolean(step.next || plan.edges?.some((edge) => edge.from === step.id)),
      });
    }

    if (stepType === 'send_message') {
      const text = resolveMessageTemplate(step.text || step.message || '', session);
      if (!text) {
        return completeWithError('Missing message text for step');
      }
      if (rateLimit && !updateRateLimit(session, rateLimit)) {
        return { success: false, error: 'Rate limit exceeded', sentCount, executedSteps };
      }
      await markTriggeredOnce();
      await sendFlowMessage({
        conversation,
        instance,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text,
        buttons: step.buttons,
        platform,
        tags: step.tags,
        source: 'template_flow',
      });
      sentCount += 1;
    } else if (stepType === 'ai_reply') {
      if (rateLimit && !updateRateLimit(session, rateLimit)) {
        return { success: false, error: 'Rate limit exceeded', sentCount, executedSteps };
      }
      await markTriggeredOnce();
      const aiResult = await handleAiReplyStep({
        step,
        graph: plan.graph,
        conversation,
        instance,
        igAccount,
        messageText,
        platform,
        messageContext,
      });
      if (!aiResult.success) {
        return { success: false, error: aiResult.error || 'AI reply failed', sentCount, executedSteps };
      }
      sentCount += 1;
    } else if (stepType === 'handoff') {
      await markTriggeredOnce();
      const topic = step.handoff?.topic || 'Handoff requested';
      const summary = step.handoff?.summary || 'Flow requested handoff to a teammate.';
      const handoffStart = nowMs();
      await createTicket({
        conversationId: conversation._id,
        topicSummary: topic.slice(0, 140),
        reason: summary,
        createdBy: 'system',
        customerMessage: messageText,
      });
      logAutomationStep('flow_handoff', handoffStart);

      conversation.humanRequired = true;
      conversation.humanRequiredReason = topic;
      conversation.humanTriggeredAt = new Date();
      conversation.humanTriggeredByMessageId = undefined;
      conversation.humanHoldUntil = new Date(Date.now() + 60 * 60 * 1000);
      await conversation.save();

      if (step.handoff?.message) {
        await sendFlowMessage({
          conversation,
          instance,
          igAccount,
          recipientId: conversation.participantInstagramId,
          text: step.handoff.message,
          platform,
          source: 'template_flow',
        });
        sentCount += 1;
      }
    } else if (stepType === 'detect_intent') {
      const intentStart = nowMs();
      const detectedIntent = await detectGoalIntent(messageText || '', step.intentSettings);
      await markTriggeredOnce();
      session.state = {
        ...(session.state || {}),
        vars: {
          ...(session.state?.vars || {}),
          detectedIntent,
        },
      };
      logAutomationStep('flow_detect_intent', intentStart, { detectedIntent });
    } else if (stepType === 'trigger') {
      // Triggers are metadata-only anchors and do not execute at runtime.
    } else {
      logAutomation('⚠️ [AUTOMATION] Unsupported flow step', { stepId: step.id, type: step.type });
      return completeWithError('Unsupported flow step');
    }

    executedSteps += 1;

    if (shouldLogNode(step)) {
      logNodeEvent('Node complete', {
        nodeId: step.id,
        type: stepType,
        executedSteps,
        durationMs: Math.max(0, Math.round(nowMs() - nodeStart)),
      });
    }

    let nextStepIndex: number | undefined;
    let nextNodeId: string | undefined;

    if (plan.mode === 'steps') {
      nextStepIndex = stepIndex + 1;
    } else {
      nextNodeId = resolveNextNodeId(step, plan, session);
    }

    if (step.waitForReply) {
      const hasNext = plan.mode === 'steps'
        ? (nextStepIndex !== undefined && Boolean(plan.steps[nextStepIndex]))
        : (Boolean(nextNodeId)
          && Boolean(plan.nodeMap?.get(nextNodeId as string) || plan.steps.find(candidate => candidate.id === nextNodeId)));
      const nextState = hasNext
        ? (plan.mode === 'steps' ? { stepIndex: nextStepIndex } : { nodeId: nextNodeId })
        : {};
      session.state = buildNextState(nextState);
      session.status = hasNext ? 'active' : 'completed';
      break;
    }

    if (plan.mode === 'steps') {
      if (nextStepIndex === undefined || !plan.steps[nextStepIndex]) {
        session.status = 'completed';
        session.state = buildNextState({});
        break;
      }
      stepIndex = nextStepIndex;
    } else {
      if (!nextNodeId) {
        session.status = 'completed';
        session.state = buildNextState({});
        break;
      }
      nodeId = nextNodeId;
    }
  }

  if (sentCount > 0) {
    session.lastAutomationMessageAt = new Date();
  }

  await session.save();

  if (executedSteps === 0) {
    return { success: false, error: 'Flow has no runnable steps', sentCount, executedSteps };
  }

  return { success: true, sentCount, executedSteps };
}

async function executeFlowForInstance(params: {
  instance: any;
  version: any;
  session?: any;
  conversationId: string;
  workspaceId: string;
  instagramAccountId: string;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
  runtime?: { graph: FlowRuntimeGraph; triggers: FlowTriggerDefinition[] } | null;
}): Promise<{ success: boolean; error?: string }> {
  const {
    instance,
    version,
    session,
    conversationId,
    workspaceId,
    instagramAccountId,
    messageText,
    platform,
    messageContext,
  } = params;

  const conversationStart = nowMs();
  const conversation = await Conversation.findById(conversationId);
  logAutomationStep('flow_load_conversation', conversationStart, { conversationId });
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  if (conversation.humanHoldUntil && new Date(conversation.humanHoldUntil) > new Date()) {
    return { success: false, error: 'Conversation is on human hold' };
  }

  if (conversation.autoReplyDisabled) {
    return { success: false, error: 'Auto replies disabled' };
  }

  const resolvedRuntime = params.runtime || resolveFlowRuntime(version, instance);
  if (!resolvedRuntime) {
    return { success: false, error: 'Flow runtime unavailable' };
  }

  const plan = buildExecutionPlan(resolvedRuntime.graph);
  if (!plan) {
    return { success: false, error: 'Flow graph missing runnable steps' };
  }

  const sessionStart = nowMs();
  const activeSession = session || await ensureAutomationSession({
    instance,
    conversationId: conversation._id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    templateVersionId: version._id,
  });
  logAutomationStep('flow_load_session', sessionStart, { instanceId: instance._id?.toString() });

  if (!activeSession) {
    return { success: false, error: 'Automation paused for human response' };
  }

  if (activeSession.templateVersionId?.toString() !== version._id.toString()) {
    activeSession.templateVersionId = version._id;
  }

  const igStart = nowMs();
  const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
  logAutomationStep('flow_load_ig_account', igStart, { instagramAccountId });
  if (!igAccount || !igAccount.accessToken) {
    return { success: false, error: 'Instagram account not found or not connected' };
  }

  if (!conversation.participantInstagramId) {
    return { success: false, error: 'Missing participant Instagram ID' };
  }

  activeSession.lastCustomerMessageAt = new Date();

  const runStart = nowMs();
  const result = await executeFlowPlan({
    plan,
    session: activeSession,
    instance,
    conversation,
    igAccount,
    messageText,
    platform,
    messageContext,
  });
  logAutomationStep('flow_execute', runStart, { success: result.success, steps: result.executedSteps });

  return result.success
    ? { success: true }
    : { success: false, error: result.error || 'Flow execution failed' };
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
    const contextSummary = summarizeMessageContext(messageContext);
    const activeSession = await AutomationSession.findOne({
      conversationId: new mongoose.Types.ObjectId(conversationId),
      status: 'active',
    }).sort({ updatedAt: -1 });

    if (activeSession) {
      const instance = await AutomationInstance.findById(activeSession.automationInstanceId);
      if (!instance) {
        logAutomation('⚠️  [AUTOMATION] Active session instance missing', {
          sessionId: activeSession._id?.toString(),
          automationInstanceId: activeSession.automationInstanceId?.toString(),
        });
      } else if (!instance.isActive) {
        logAutomation('⚠️  [AUTOMATION] Active session instance inactive', {
          sessionId: activeSession._id?.toString(),
          automationInstanceId: instance._id?.toString(),
          name: instance.name,
        });
      } else {
        const version = await resolveLatestTemplateVersion({
          templateId: instance.templateId,
          fallbackVersionId: activeSession.templateVersionId || instance.templateVersionId,
        });
        if (!version) {
          logAutomation('⚠️  [AUTOMATION] Active session version missing', {
            sessionId: activeSession._id?.toString(),
            automationInstanceId: instance._id?.toString(),
            templateId: instance.templateId?.toString(),
            templateVersionId: activeSession.templateVersionId?.toString() || instance.templateVersionId?.toString(),
          });
        } else {
          const runtime = resolveFlowRuntime(version, instance);
          if (!runtime) {
            logAutomation('⚠️  [AUTOMATION] Active session runtime invalid', {
              sessionId: activeSession._id?.toString(),
              automationInstanceId: instance._id?.toString(),
              templateVersionId: version._id?.toString(),
            });
          } else {
          const result = await executeFlowForInstance({
            instance,
            version,
            runtime,
            session: activeSession,
            conversationId,
            workspaceId,
            instagramAccountId,
            messageText: normalizedMessage,
            platform,
            messageContext,
          });
          if (!result.success) {
            logAutomation('⚠️  [AUTOMATION] Active session execution failed', {
              instanceId: instance._id?.toString(),
              name: instance.name,
              templateVersionId: version._id?.toString(),
              error: result.error,
            });
          }
          return result.success
            ? finish({ success: true, automationExecuted: instance.name })
            : finish({ success: false, error: result.error || 'Flow execution failed' });
        }
      }
      }
    }

    const fetchStart = nowMs();
    const instances = await AutomationInstance.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      isActive: true,
    }).sort({ createdAt: 1 });
    logAutomationStep('fetch_instances', fetchStart, { count: instances.length, triggerType });

    if (instances.length === 0) {
      logAutomation('⚠️  [AUTOMATION] No active automations found');
      return finish({ success: false, error: 'No active automations found for this trigger' });
    }

    const templateIds = Array.from(new Set(instances.map(instance => instance.templateId?.toString()).filter(Boolean)));
    const templates = templateIds.length
      ? await FlowTemplate.find({ _id: { $in: templateIds } }).select('currentVersionId').lean()
      : [];
    const templateMap = new Map(templates.map((template: any) => [template._id.toString(), template]));

    const storedVersionIds = instances
      .map(instance => instance.templateVersionId?.toString())
      .filter(Boolean) as string[];
    const currentVersionIds = templates
      .map((template: any) => template.currentVersionId?.toString())
      .filter(Boolean) as string[];
    const versionIds = Array.from(new Set([...storedVersionIds, ...currentVersionIds]));

    const versions = versionIds.length
      ? await FlowTemplateVersion.find({
          _id: { $in: versionIds },
          status: 'published',
        }).lean()
      : [];
    const versionMap = new Map(versions.map(version => [version._id.toString(), version]));

    const matchStart = nowMs();
    const matchDiagnostics: Array<Record<string, any>> = [];
    for (const instance of instances) {
      const diagnostic: Record<string, any> = {
        instanceId: instance._id?.toString(),
        name: instance.name,
        templateId: instance.templateId?.toString(),
      };
      const template = instance.templateId
        ? templateMap.get(instance.templateId.toString())
        : null;
      const latestVersionId = template?.currentVersionId?.toString();
      const latestVersion = latestVersionId ? versionMap.get(latestVersionId) || null : null;
      const storedVersion = instance.templateVersionId
        ? versionMap.get(instance.templateVersionId.toString()) || null
        : null;
      const version = latestVersion || storedVersion;
      if (!version) {
        diagnostic.reason = 'missing_published_version';
        diagnostic.templateVersionId = instance.templateVersionId?.toString();
        diagnostic.latestVersionId = latestVersionId;
        matchDiagnostics.push(diagnostic);
        continue;
      }

      const runtime = resolveFlowRuntime(version, instance);
      if (!runtime) {
        diagnostic.reason = 'runtime_resolution_failed';
        diagnostic.templateVersionId = version._id?.toString();
        matchDiagnostics.push(diagnostic);
        continue;
      }
      const triggers = runtime.triggers || [];
      if (triggers.length === 0) {
        diagnostic.reason = 'no_triggers_defined';
        diagnostic.templateVersionId = version._id?.toString();
        matchDiagnostics.push(diagnostic);
        continue;
      }

      const typedTriggers = triggers.filter((trigger) => trigger.type === triggerType);
      if (typedTriggers.length === 0) {
        diagnostic.reason = 'trigger_type_mismatch';
        diagnostic.templateVersionId = version._id?.toString();
        diagnostic.availableTriggers = triggers.map((trigger) => trigger.type);
        matchDiagnostics.push(diagnostic);
        continue;
      }

      let matchedTrigger: FlowTriggerDefinition | undefined;
      for (const trigger of typedTriggers) {
        if (await matchesTriggerConfig(normalizedMessage, trigger.config, messageContext)) {
          matchedTrigger = trigger;
          break;
        }
      }

      if (!matchedTrigger) {
        diagnostic.reason = 'trigger_config_mismatch';
        diagnostic.templateVersionId = version._id?.toString();
        diagnostic.triggers = summarizeTriggers(typedTriggers);
        diagnostic.messageContext = contextSummary;
        matchDiagnostics.push(diagnostic);
        continue;
      }

      logAutomation('✅ [AUTOMATION] Match', {
        instanceId: instance._id?.toString(),
        name: instance.name,
        triggerType,
      });

      const result = await executeFlowForInstance({
        instance,
        version,
        runtime,
        conversationId,
        workspaceId,
        instagramAccountId,
        messageText: normalizedMessage,
        platform,
        messageContext,
      });

      logAutomationStep('execute_flow', matchStart, {
        success: result.success,
        templateVersionId: version._id?.toString(),
      });

      if (!result.success) {
        logAutomation('⚠️  [AUTOMATION] Match execution failed', {
          instanceId: instance._id?.toString(),
          name: instance.name,
          templateVersionId: version._id?.toString(),
          error: result.error,
        });
      }

      return result.success
        ? finish({ success: true, automationExecuted: instance.name })
        : finish({ success: false, error: result.error || 'Flow execution failed' });
    }

    logAutomationStep('match_triggers', matchStart, {
      matched: 0,
      evaluated: instances.length,
      triggerType,
    });

    if (matchDiagnostics.length > 0) {
      logAutomation('🔍 [AUTOMATION] Match diagnostics', {
        triggerType,
        messageContext: contextSummary,
        evaluated: matchDiagnostics.length,
        diagnostics: matchDiagnostics.slice(0, 10),
        truncated: matchDiagnostics.length > 10,
      });
    }

    logAutomation('⚠️  [AUTOMATION] No automations matched trigger filters');
    return finish({ success: false, error: 'No automations matched trigger filters' });
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
}): Promise<{ executed: boolean; automationName?: string; error?: string }> {
  const result = await executeAutomation(params);
  return {
    executed: result.success,
    automationName: result.automationExecuted,
    error: result.error,
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
