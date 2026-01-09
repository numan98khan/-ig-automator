import mongoose from 'mongoose';
import Message, { IMessage } from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import FollowupTask from '../models/FollowupTask';
import AutomationInstance from '../models/AutomationInstance';
import AutomationSession from '../models/AutomationSession';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import { generateAIReply } from './aiReplyService';
import { generateAIAgentReply } from './aiAgentService';
import {
  sendMessage as sendInstagramMessage,
  sendButtonMessage,
} from '../utils/instagram-api';
import { addTicketUpdate, createTicket, getActiveTicket } from './escalationService';
import { addCountIncrement, trackDailyMetric } from './reportingService';
import { assertUsageLimit } from './tierService';
import { detectAutomationIntentDetailed, getWorkspaceSettings } from './workspaceSettingsService';
import { pauseForTypingIfNeeded } from './automation/typing';
import { matchTriggerConfigDetailed } from './automation/triggerMatcher';
import { matchesIntent } from './automation/intentMatcher';
import { isOutsideBusinessHours, matchesKeywords, normalizeText } from './automation/utils';
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
import { getWorkspaceById } from '../repositories/core/workspaceRepository';

type AutomationDeliveryMode = 'instagram' | 'preview';

type PreviewAutomationMessage = {
  id: string;
  from: 'ai';
  text: string;
  buttons?: Array<{ title: string; payload?: string }>;
  tags?: string[];
  source?: 'template_flow' | 'ai_reply';
  createdAt: Date;
};

type FlowRuntimeEdge = {
  from: string;
  to: string;
  condition?: RouterCondition;
  order?: number;
  isDefault?: boolean;
  default?: boolean;
};

type FlowRuntimeStep = {
  id?: string;
  type?: string;
  text?: string;
  message?: string;
  buttons?: Array<{ title: string; payload?: string } | string>;
  tags?: string[];
  aiSettings?: AutomationAiSettings;
  messageHistory?: Array<Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>>;
  agentSystemPrompt?: string;
  agentSteps?: string[];
  agentEndCondition?: string;
  agentStopCondition?: string;
  agentMaxQuestions?: number;
  agentSlots?: Array<{ key: string; question?: string; defaultValue?: string }>;
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
  routing?: RouterRouting;
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

type RouterMatchMode = 'first' | 'all';

type RouterRuleOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'keywords';
type RouterRuleSource = 'vars' | 'message' | 'config' | 'context';

type RouterRule = {
  source: RouterRuleSource;
  path?: string;
  operator: RouterRuleOperator;
  value?: any;
  match?: 'any' | 'all';
};

type RouterCondition = {
  type?: 'rules' | 'else' | 'default';
  op?: 'all' | 'any';
  rules?: RouterRule[];
  default?: boolean;
  isDefault?: boolean;
};

type RouterRouting = {
  matchMode?: RouterMatchMode;
  defaultTarget?: string;
};

type RouterContext = {
  messageText: string;
  messageContext?: AutomationTestContext;
  config: Record<string, any>;
  vars: Record<string, any>;
};

const nowMs = () => Date.now();

const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const shouldLogAutomationSteps = () => getLogSettingsSnapshot().automationStepsEnabled;

const ensurePreviewMeta = (session: any) => {
  if (!session.state || typeof session.state !== 'object') {
    session.state = {};
  }
  if (!session.state.previewMeta || typeof session.state.previewMeta !== 'object') {
    session.state.previewMeta = {};
  }
  if (!Array.isArray(session.state.previewMeta.events)) {
    session.state.previewMeta.events = [];
  }
  return session.state.previewMeta as { events: Array<{ id: string; type: string; message: string; createdAt: Date; details?: Record<string, any> }> };
};

const appendPreviewMetaEvent = (session: any, event: { type: string; message: string; createdAt?: Date; details?: Record<string, any> }) => {
  const meta = ensurePreviewMeta(session);
  meta.events = [
    ...meta.events,
    {
      id: new mongoose.Types.ObjectId().toString(),
      createdAt: event.createdAt || new Date(),
      ...event,
    },
  ].slice(-200);
};

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

const getWorkspaceOwnerId = async (workspaceId: string) => {
  const workspace = await getWorkspaceById(workspaceId);
  return workspace?.userId || null;
};

const checkAiMessageAllowance = async (workspaceId: string) => {
  const ownerId = await getWorkspaceOwnerId(workspaceId);
  if (!ownerId) {
    return { allowed: true, ownerId: null, limit: undefined, used: undefined };
  }
  const usageCheck = await assertUsageLimit(ownerId, 'aiMessages', 1, workspaceId, { increment: false });
  return { allowed: usageCheck.allowed, ownerId, limit: usageCheck.limit, used: usageCheck.current };
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
  hasLink: Boolean(context?.hasLink),
  hasAttachment: Boolean(context?.hasAttachment),
  forceOutsideBusinessHours: Boolean(context?.forceOutsideBusinessHours),
});

const hasKeywords = (config?: TriggerConfig) =>
  Array.isArray(config?.keywords) && config.keywords.length > 0;

const hasExcludeKeywords = (config?: TriggerConfig) =>
  Array.isArray(config?.excludeKeywords) && config.excludeKeywords.length > 0;

const hasIntent = (config?: TriggerConfig) =>
  Boolean(config?.intentText && config.intentText.trim());

const hasMatchOn = (config?: TriggerConfig) =>
  Boolean(config?.matchOn?.link || config?.matchOn?.attachment);

const isUnqualifiedTriggerConfig = (config?: TriggerConfig) => {
  if (!config) return true;
  const triggerMode = config.triggerMode || 'any';
  if (triggerMode !== 'any') return false;
  return !hasKeywords(config)
    && !hasIntent(config)
    && !hasMatchOn(config)
    && !hasExcludeKeywords(config)
    && !config.outsideBusinessHours;
};

const passesBaseFilters = (
  messageText: string,
  config?: TriggerConfig,
  context?: AutomationTestContext,
) => {
  if (hasExcludeKeywords(config)) {
    if (matchesKeywords(messageText, config?.excludeKeywords || [], 'any')) {
      return false;
    }
  }
  if (
    config?.outsideBusinessHours &&
    !context?.forceOutsideBusinessHours &&
    !isOutsideBusinessHours(config.businessHours)
  ) {
    return false;
  }
  return true;
};

const matchesKeywordCategory = (
  messageText: string,
  config: TriggerConfig | undefined,
  context?: AutomationTestContext,
) => {
  const triggerMode = config?.triggerMode || 'any';
  if (triggerMode === 'intent') return false;
  if (!passesBaseFilters(messageText, config, context)) return false;

  const linkMatched = Boolean(config?.matchOn?.link && context?.hasLink);
  const attachmentMatched = Boolean(config?.matchOn?.attachment && context?.hasAttachment);
  const keywordMatched = hasKeywords(config)
    ? matchesKeywords(messageText, config?.keywords || [], config?.keywordMatch || 'any')
    : false;

  if (!hasMatchOn(config) && !hasKeywords(config)) return false;
  if (linkMatched || attachmentMatched) return true;
  return keywordMatched;
};

const matchesIntentCategory = async (
  messageText: string,
  config: TriggerConfig | undefined,
  context?: AutomationTestContext,
) => {
  const triggerMode = config?.triggerMode || 'any';
  if (triggerMode === 'keywords') return false;
  if (!passesBaseFilters(messageText, config, context)) return false;
  const intentText = config?.intentText?.trim() || '';
  if (!intentText) return false;
  return matchesIntent(messageText, intentText);
};

const matchesUnqualifiedCategory = (
  messageText: string,
  config: TriggerConfig | undefined,
  context?: AutomationTestContext,
) => {
  if (!isUnqualifiedTriggerConfig(config)) return false;
  if (!passesBaseFilters(messageText, config, context)) return false;
  return true;
};

type AutomationMatchDiagnostic = {
  instanceId?: string;
  name?: string;
  templateId?: string;
  templateStatus?: string;
  templateVersionId?: string;
  latestVersionId?: string;
  availableTriggers?: string[];
  triggers?: Array<Record<string, any>>;
  messageContext?: Record<string, any>;
  reason: string;
};

type AutomationMatchResult = {
  instance: any;
  version: any;
  runtime: ReturnType<typeof resolveFlowRuntime>;
  matchedTrigger: FlowTriggerDefinition;
};

const CATEGORY_MISMATCH_REASON: Record<'keyword' | 'intent' | 'unqualified', string> = {
  keyword: 'keyword_bucket_mismatch',
  intent: 'intent_bucket_mismatch',
  unqualified: 'unqualified_bucket_mismatch',
};

export async function resolveAutomationSelection(params: {
  workspaceId: string;
  triggerType: TriggerType;
  messageText?: string;
  messageContext?: AutomationTestContext;
}): Promise<{
  match?: AutomationMatchResult;
  diagnostics: AutomationMatchDiagnostic[];
  evaluated: number;
}> {
  const { workspaceId, triggerType, messageText, messageContext } = params;
  const normalizedMessage = messageText || '';
  const contextSummary = summarizeMessageContext(messageContext);

  const instances = await AutomationInstance.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    isActive: true,
  }).sort({ createdAt: 1 });

  if (instances.length === 0) {
    return { match: undefined, diagnostics: [], evaluated: 0 };
  }

  const templateIds = Array.from(new Set(instances.map(instance => instance.templateId?.toString()).filter(Boolean)));
  const templates = templateIds.length
    ? await FlowTemplate.find({ _id: { $in: templateIds } }).select('currentVersionId status').lean()
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

  const diagnostics: AutomationMatchDiagnostic[] = [];
  const bucketDiagnostics: AutomationMatchDiagnostic[] = [];
  const bucketedInstanceIds = new Set<string>();
  const candidates: Array<{
    instance: any;
    version: any;
    runtime: ReturnType<typeof resolveFlowRuntime>;
    typedTriggers: FlowTriggerDefinition[];
    diagnosticBase: AutomationMatchDiagnostic;
  }> = [];

  for (const instance of instances) {
    const diagnostic: AutomationMatchDiagnostic = {
      instanceId: instance._id?.toString(),
      name: instance.name,
      templateId: instance.templateId?.toString(),
      reason: 'unknown',
    };
    const template = instance.templateId
      ? templateMap.get(instance.templateId.toString())
      : null;
    if (template?.status === 'archived') {
      diagnostic.reason = 'template_archived';
      diagnostic.templateStatus = template.status;
      diagnostics.push(diagnostic);
      continue;
    }
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
      diagnostics.push(diagnostic);
      continue;
    }

    const runtime = resolveFlowRuntime(version, instance);
    if (!runtime) {
      diagnostic.reason = 'runtime_resolution_failed';
      diagnostic.templateVersionId = version._id?.toString();
      diagnostics.push(diagnostic);
      continue;
    }
    const triggers = runtime.triggers || [];
    if (triggers.length === 0) {
      diagnostic.reason = 'no_triggers_defined';
      diagnostic.templateVersionId = version._id?.toString();
      diagnostics.push(diagnostic);
      continue;
    }

    const typedTriggers = triggers.filter((trigger) => trigger.type === triggerType);
    if (typedTriggers.length === 0) {
      diagnostic.reason = 'trigger_type_mismatch';
      diagnostic.templateVersionId = version._id?.toString();
      diagnostic.availableTriggers = triggers.map((trigger) => trigger.type);
      diagnostics.push(diagnostic);
      continue;
    }

    candidates.push({
      instance,
      version,
      runtime,
      typedTriggers,
      diagnosticBase: diagnostic,
    });
  }

  const findMatch = async (category: 'keyword' | 'intent' | 'unqualified') => {
    const categoryDiagnostics: AutomationMatchDiagnostic[] = [];

    for (const candidate of candidates) {
      const eligibleTriggers = candidate.typedTriggers.filter((trigger) => {
        if (category === 'keyword') {
          return (trigger.config?.triggerMode || 'any') !== 'intent'
            && (hasKeywords(trigger.config) || hasMatchOn(trigger.config));
        }
        if (category === 'intent') {
          return (trigger.config?.triggerMode || 'any') !== 'keywords' && hasIntent(trigger.config);
        }
        return isUnqualifiedTriggerConfig(trigger.config);
      });

      if (eligibleTriggers.length === 0) {
        continue;
      }

      let matchedTrigger: FlowTriggerDefinition | undefined;
      for (const trigger of eligibleTriggers) {
        if (category === 'keyword') {
          if (matchesKeywordCategory(normalizedMessage, trigger.config, messageContext)) {
            matchedTrigger = trigger;
            break;
          }
        } else if (category === 'intent') {
          if (await matchesIntentCategory(normalizedMessage, trigger.config, messageContext)) {
            matchedTrigger = trigger;
            break;
          }
        } else if (matchesUnqualifiedCategory(normalizedMessage, trigger.config, messageContext)) {
          matchedTrigger = trigger;
          break;
        }
      }

      if (matchedTrigger) {
        return {
          match: {
            instance: candidate.instance,
            version: candidate.version,
            runtime: candidate.runtime,
            matchedTrigger,
          },
          diagnostics: categoryDiagnostics,
        };
      }

      categoryDiagnostics.push({
        ...candidate.diagnosticBase,
        reason: CATEGORY_MISMATCH_REASON[category],
        templateVersionId: candidate.version._id?.toString(),
        triggers: summarizeTriggers(eligibleTriggers),
        messageContext: contextSummary,
      });
    }

    return { match: undefined, diagnostics: categoryDiagnostics };
  };

  const appendBucketDiagnostics = (items: AutomationMatchDiagnostic[]) => {
    items.forEach((item) => {
      if (item.instanceId) {
        bucketedInstanceIds.add(item.instanceId);
      }
      bucketDiagnostics.push(item);
    });
  };

  const keywordMatch = await findMatch('keyword');
  appendBucketDiagnostics(keywordMatch.diagnostics);
  if (keywordMatch.match) {
    return {
      match: keywordMatch.match,
      diagnostics: [...diagnostics, ...bucketDiagnostics],
      evaluated: instances.length,
    };
  }

  const intentMatch = await findMatch('intent');
  appendBucketDiagnostics(intentMatch.diagnostics);
  if (intentMatch.match) {
    return {
      match: intentMatch.match,
      diagnostics: [...diagnostics, ...bucketDiagnostics],
      evaluated: instances.length,
    };
  }

  const unqualifiedMatch = await findMatch('unqualified');
  appendBucketDiagnostics(unqualifiedMatch.diagnostics);
  if (unqualifiedMatch.match) {
    return {
      match: unqualifiedMatch.match,
      diagnostics: [...diagnostics, ...bucketDiagnostics],
      evaluated: instances.length,
    };
  }

  const fallbackDiagnostics = candidates
    .filter((candidate) => {
      const instanceId = candidate.diagnosticBase.instanceId;
      return !instanceId || !bucketedInstanceIds.has(instanceId);
    })
    .map((candidate) => ({
      ...candidate.diagnosticBase,
      reason: 'no_priority_bucket',
      templateVersionId: candidate.version._id?.toString(),
      triggers: summarizeTriggers(candidate.typedTriggers),
      messageContext: contextSummary,
    }));

  return {
    match: undefined,
    diagnostics: [
      ...diagnostics,
      ...bucketDiagnostics,
      ...fallbackDiagnostics,
    ],
    evaluated: instances.length,
  };
}

const deepClone = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const resolveLatestTemplateVersion = async (params: {
  templateId?: mongoose.Types.ObjectId | string;
  fallbackVersionId?: mongoose.Types.ObjectId | string;
}) => {
  const { templateId, fallbackVersionId } = params;
  if (templateId) {
    const template = await FlowTemplate.findById(templateId).select('currentVersionId status').lean();
    if (template?.status === 'archived') {
      return null;
    }
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
): 'send_message' | 'ai_reply' | 'ai_agent' | 'handoff' | 'trigger' | 'detect_intent' | 'router' | 'unknown' => {
  const raw = (step?.type || '').toLowerCase();
  if (raw === 'send_message' || raw === 'message' || raw === 'send' || raw === 'reply') {
    return 'send_message';
  }
  if (raw === 'ai_reply' || raw === 'ai' || raw === 'ai_message') {
    return 'ai_reply';
  }
  if (raw === 'ai_agent' || raw === 'agent') {
    return 'ai_agent';
  }
  if (raw === 'handoff' || raw === 'escalate') {
    return 'handoff';
  }
  if (raw === 'trigger' || raw === 'start' || raw === 'entry') {
    return 'trigger';
  }
  if (raw === 'router' || raw === 'branch' || raw === 'switch') {
    return 'router';
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

const CRM_STAGES = ['new', 'engaged', 'qualified', 'won', 'lost'];

const applyConversationTags = (conversation: any, tags?: string[]) => {
  if (!tags || tags.length === 0) return;
  const normalized = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
  if (normalized.length === 0) return;

  const stageTag = normalized.find((tag) => tag.startsWith('stage:'));
  if (stageTag) {
    const stage = stageTag.split(':')[1];
    if (CRM_STAGES.includes(stage)) {
      conversation.stage = stage;
    }
  }

  const tagList = normalized.filter((tag) => !tag.startsWith('stage:'));
  if (tagList.length === 0) return;

  const existing: string[] = Array.isArray(conversation.tags)
    ? conversation.tags.map((tag: unknown) => String(tag))
    : [];
  const seen = new Set(existing.map((tag: string) => tag.toLowerCase()));
  tagList.forEach((tag) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    existing.push(tag);
  });
  conversation.tags = existing;
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
    channel: 'live',
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
  igAccount?: any;
  recipientId?: string;
  text: string;
  buttons?: Array<{ title: string; payload?: string } | string>;
  platform?: string;
  tags?: string[];
  source?: 'template_flow' | 'ai_reply';
  deliveryMode?: AutomationDeliveryMode;
  trackStats?: boolean;
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
    deliveryMode = 'instagram',
    trackStats = true,
    aiMeta,
  } = params;

  const normalizedButtons = normalizeButtons(buttons);
  let result;
  if (deliveryMode === 'instagram') {
    await pauseForTypingIfNeeded();
    if (!igAccount || !igAccount.accessToken || !recipientId) {
      throw new Error('Instagram account or recipient missing for delivery.');
    }
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
  }

  const sentAt = new Date();
  const message = await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text,
    from: 'ai',
    platform: deliveryMode === 'preview' ? 'mock' : (platform || conversation.platform || 'instagram'),
    instagramMessageId: result?.message_id,
    automationSource: source || 'template_flow',
    aiTags: tags,
    aiShouldEscalate: aiMeta?.shouldEscalate,
    aiEscalationReason: aiMeta?.escalationReason,
    kbItemIdsUsed: aiMeta?.knowledgeItemIds,
    metadata: normalizedButtons.length > 0 ? { buttons: normalizedButtons } : undefined,
    createdAt: sentAt,
  });

  applyConversationTags(conversation, tags);
  conversation.lastMessage = text;
  conversation.lastMessageAt = sentAt;
  conversation.lastBusinessMessageAt = sentAt;
  await conversation.save();

  if (trackStats) {
    await markAutomationReplySent(instance._id, sentAt);
  }

  if (trackStats) {
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

  return message;
}

async function buildAutomationAiReply(params: {
  conversation: any;
  messageText: string;
  aiSettings?: AutomationAiSettings;
  knowledgeItemIds?: string[];
  messageHistory?: Array<Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>>;
}) {
  const { conversation, messageText, aiSettings, knowledgeItemIds, messageHistory } = params;

  return generateAIReply({
    conversation,
    workspaceId: conversation.workspaceId,
    latestCustomerMessage: messageText,
    historyLimit: aiSettings?.historyLimit,
    messageHistory,
    tone: aiSettings?.tone,
    maxReplySentences: aiSettings?.maxReplySentences,
    ragEnabled: aiSettings?.ragEnabled,
    allowHashtags: aiSettings?.allowHashtags,
    allowEmojis: aiSettings?.allowEmojis,
    replyLanguage: aiSettings?.replyLanguage,
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
  session: any;
  conversation: any;
  instance: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
  deliveryMode?: AutomationDeliveryMode;
  onMessageSent?: (message: PreviewAutomationMessage) => void;
  trackStats?: boolean;
  logContext?: Record<string, any>;
}): Promise<{ success: boolean; error?: string }> {
  const {
    step,
    graph,
    session,
    conversation,
    instance,
    igAccount,
    messageText,
    platform,
    messageContext,
    deliveryMode = 'instagram',
    onMessageSent,
    trackStats = true,
    logContext,
  } = params;
  const workspaceId = conversation.workspaceId?.toString?.() || conversation.workspaceId;
  let usageOwnerId: string | null = null;
  if (deliveryMode !== 'preview' && workspaceId) {
    const usageCheck = await checkAiMessageAllowance(workspaceId);
    if (!usageCheck.allowed) {
      logAutomation('⚠️  [AUTOMATION] AI message limit reached', {
        workspaceId,
        limit: usageCheck.limit,
        used: usageCheck.used,
      });
      return { success: false, error: 'AI message limit reached for this workspace' };
    }
    usageOwnerId = usageCheck.ownerId;
  }
  const settings = await getWorkspaceSettings(conversation.workspaceId);
  const aiSettings = {
    ...(graph.aiSettings || {}),
    ...(step.aiSettings || {}),
  };

  const replyStart = nowMs();
  const aiResponse = await buildAutomationAiReply({
    conversation,
    messageText,
    aiSettings,
    knowledgeItemIds: step.knowledgeItemIds,
    messageHistory: step.messageHistory,
  });
  const replyDurationMs = Math.max(0, Math.round(nowMs() - replyStart));
  logAutomationStep('flow_ai_reply_generate', replyStart);
  logAdminEvent({
    category: 'flow_node',
    message: 'AI reply generated',
    details: {
      ...(logContext || {}),
      nodeId: step.id,
      type: 'ai_reply',
      aiSettings,
      replyPreview: aiResponse.replyText?.slice(0, 500),
      tags: aiResponse.tags,
      shouldEscalate: aiResponse.shouldEscalate,
      escalationReason: aiResponse.escalationReason,
      knowledgeItemIds: aiResponse.knowledgeItemsUsed?.map((item) => item.id),
    },
    workspaceId: resolveWorkspaceId(logContext),
  });
  if (deliveryMode === 'preview') {
    const tagText = aiResponse.tags && aiResponse.tags.length > 0
      ? ` · tags: ${aiResponse.tags.slice(0, 4).join(', ')}${aiResponse.tags.length > 4 ? '…' : ''}`
      : '';
    const escalationText = aiResponse.shouldEscalate
      ? ` · escalated${aiResponse.escalationReason ? `: ${aiResponse.escalationReason}` : ''}`
      : '';
    appendPreviewMetaEvent(session, {
      type: 'info',
      message: `AI Reply generated${tagText}${escalationText}`,
      details: {
        nodeId: step.id,
        type: 'ai_reply',
        tags: aiResponse.tags,
        shouldEscalate: aiResponse.shouldEscalate,
        escalationReason: aiResponse.escalationReason,
        durationMs: replyDurationMs,
      },
    });
  }

  const activeTicket = deliveryMode === 'preview' ? null : await getActiveTicket(conversation._id);
  if (activeTicket && aiResponse.shouldEscalate) {
    aiResponse.replyText = buildFollowupResponse(activeTicket.followUpCount || 0, aiResponse.replyText);
  } else if (activeTicket && !aiResponse.shouldEscalate) {
    aiResponse.replyText = `${aiResponse.replyText} Your earlier request is with a human teammate and they will confirm that separately.`;
  } else if (aiResponse.shouldEscalate && deliveryMode !== 'preview') {
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
    deliveryMode,
    trackStats,
    aiMeta: {
      shouldEscalate: aiResponse.shouldEscalate,
      escalationReason: aiResponse.escalationReason,
      knowledgeItemIds: aiResponse.knowledgeItemsUsed?.map((item) => item.id),
    },
  });
  if (deliveryMode === 'preview' && onMessageSent) {
    onMessageSent({
      id: message._id?.toString() || '',
      from: 'ai',
      text: message.text,
      buttons: normalizeButtons(step.buttons),
      tags: aiResponse.tags,
      source: 'ai_reply',
      createdAt: message.createdAt || new Date(),
    });
  }
  logAutomationStep('flow_ai_reply_send', sendStart);
  if (deliveryMode !== 'preview' && usageOwnerId && workspaceId) {
    await assertUsageLimit(usageOwnerId, 'aiMessages', 1, workspaceId);
  }

  let ticketId = activeTicket?._id;
  if (aiResponse.shouldEscalate && !ticketId && deliveryMode !== 'preview') {
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

  if (aiResponse.shouldEscalate && deliveryMode !== 'preview') {
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

const normalizeRouterCondition = (condition?: RouterCondition): RouterCondition => {
  if (!condition) return { type: 'rules', op: 'all', rules: [] };
  if (condition.type === 'else' || condition.type === 'default' || condition.default || condition.isDefault) {
    return { type: 'else' };
  }
  return {
    type: 'rules',
    op: condition.op === 'any' ? 'any' : 'all',
    rules: Array.isArray(condition.rules) ? condition.rules : [],
  };
};

const normalizeRouterValue = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return String(value);
};

const coerceBoolean = (value: any): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
  }
  return null;
};

const coerceNumber = (value: any): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const getRouterValue = (rule: RouterRule, context: RouterContext): any => {
  if (rule.source === 'message') {
    return context.messageText;
  }
  if (rule.source === 'context') {
    if (!rule.path) return undefined;
    return context.messageContext?.[rule.path as keyof AutomationTestContext];
  }
  if (rule.source === 'vars') {
    const path = rule.path?.replace(/^vars\./, '') || '';
    return path ? getConfigValue(context.vars, path) : undefined;
  }
  if (rule.source === 'config') {
    const path = rule.path?.replace(/^config\./, '') || '';
    return path ? getConfigValue(context.config, path) : undefined;
  }
  return undefined;
};

const evaluateRouterRule = (rule: RouterRule, context: RouterContext): boolean => {
  const left = getRouterValue(rule, context);
  const operator = rule.operator;

  if (operator === 'keywords') {
    const keywords = Array.isArray(rule.value)
      ? rule.value.map((value) => String(value).trim()).filter(Boolean)
      : typeof rule.value === 'string'
        ? rule.value.split(',').map((value) => value.trim()).filter(Boolean)
        : [];
    return matchesKeywords(normalizeRouterValue(left), keywords, rule.match || 'any');
  }

  if (operator === 'gt' || operator === 'lt') {
    const leftNumber = coerceNumber(left);
    const rightNumber = coerceNumber(rule.value);
    if (leftNumber === null || rightNumber === null) return false;
    return operator === 'gt' ? leftNumber > rightNumber : leftNumber < rightNumber;
  }

  if (operator === 'contains') {
    if (Array.isArray(left)) {
      return left.some((item) => {
        if (typeof item === 'string' && typeof rule.value === 'string') {
          return normalizeText(item).includes(normalizeText(rule.value));
        }
        return item === rule.value;
      });
    }
    const leftText = normalizeText(normalizeRouterValue(left));
    const rightText = normalizeText(normalizeRouterValue(rule.value));
    if (!rightText) return false;
    return leftText.includes(rightText);
  }

  if (operator === 'equals') {
    if (typeof left === 'boolean') {
      const rightBool = coerceBoolean(rule.value);
      return rightBool !== null ? left === rightBool : false;
    }
    const leftNumber = coerceNumber(left);
    const rightNumber = coerceNumber(rule.value);
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber === rightNumber;
    }
    return normalizeText(normalizeRouterValue(left)) === normalizeText(normalizeRouterValue(rule.value));
  }

  return false;
};

const evaluateRouterCondition = (condition: RouterCondition, context: RouterContext): boolean => {
  if (condition.type === 'else') return false;
  const op = condition.op === 'any' ? 'any' : 'all';
  const rules = Array.isArray(condition.rules) ? condition.rules : [];
  if (rules.length === 0) return false;
  const results = rules.map((rule) => evaluateRouterRule(rule, context));
  return op === 'any' ? results.some(Boolean) : results.every(Boolean);
};

const sortRouterEdges = (edges: FlowRuntimeEdge[]): FlowRuntimeEdge[] => {
  return edges
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => {
      const aOrder = typeof a.edge.order === 'number' ? a.edge.order : a.index;
      const bOrder = typeof b.edge.order === 'number' ? b.edge.order : b.index;
      return aOrder - bOrder;
    })
    .map((entry) => entry.edge);
};

const resolveRouterTargets = (
  step: FlowRuntimeStep,
  plan: ExecutionPlan,
  context: RouterContext,
): { nextNodeId?: string; queuedNodeIds?: string[] } => {
  if (!step.id || !plan.edges) return {};
  const edges = plan.edges.filter((edge) => edge.from === step.id);
  if (edges.length === 0) return {};
  const sorted = sortRouterEdges(edges);
  const matchMode: RouterMatchMode = step.routing?.matchMode === 'all' ? 'all' : 'first';

  const isDefaultEdge = (edge: FlowRuntimeEdge) => {
    if (normalizeRouterCondition(edge.condition).type === 'else') return true;
    const rawEdge = edge as { default?: boolean; isDefault?: boolean };
    return Boolean(rawEdge.default || rawEdge.isDefault);
  };
  const defaultEdge = sorted.find((edge) => isDefaultEdge(edge));
  const matched = sorted.filter((edge) =>
    !isDefaultEdge(edge) && evaluateRouterCondition(normalizeRouterCondition(edge.condition), context),
  );

  if (matched.length > 0) {
    const targets = matched.map((edge) => edge.to).filter(Boolean);
    const uniqueTargets = Array.from(new Set(targets));
    if (uniqueTargets.length === 0) return {};
    if (matchMode === 'all') {
      return { nextNodeId: uniqueTargets[0], queuedNodeIds: uniqueTargets.slice(1) };
    }
    return { nextNodeId: uniqueTargets[0] };
  }

  if (defaultEdge?.to) {
    return { nextNodeId: defaultEdge.to };
  }

  const fallbackTarget = step.routing?.defaultTarget;
  if (fallbackTarget) {
    const edgeMatch = sorted.find((edge) => edge.to === fallbackTarget);
    if (edgeMatch?.to) {
      return { nextNodeId: edgeMatch.to };
    }
    if (plan.nodeMap?.has(fallbackTarget)) {
      return { nextNodeId: fallbackTarget };
    }
  }

  return {};
};

const resolveNextNodeId = (
  step: FlowRuntimeStep,
  plan: ExecutionPlan,
  stepType: ReturnType<typeof normalizeStepType>,
  context: RouterContext,
): { nextNodeId?: string; queuedNodeIds?: string[] } => {
  if (stepType === 'router') {
    return resolveRouterTargets(step, plan, context);
  }
  if (step.next) return { nextNodeId: step.next };
  if (!step.id || !plan.edges) return {};
  const edge = plan.edges.find((candidate) => candidate.from === step.id);
  return { nextNodeId: edge?.to };
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
  config?: Record<string, any>;
  deliveryMode?: AutomationDeliveryMode;
  onMessageSent?: (message: PreviewAutomationMessage) => void;
  trackStats?: boolean;
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
    config,
    deliveryMode = 'instagram',
    onMessageSent,
    trackStats = true,
  } = params;

  const runtimeConfig = config && typeof config === 'object' ? config : {};
  const maxSteps = 12;
  let sentCount = 0;
  let executedSteps = 0;
  let triggered = false;
  let nodeQueue = Array.isArray(session.state?.nodeQueue) ? [...session.state.nodeQueue] : [];
  let fallbackToStart = false;
  const logContext = {
    automationSessionId: session._id?.toString(),
    automationInstanceId: instance._id?.toString(),
    templateId: instance.templateId?.toString(),
    templateVersionId: session.templateVersionId?.toString(),
    conversationId: conversation._id?.toString(),
    workspaceId: conversation.workspaceId?.toString(),
  };

  const markTriggeredOnce = async () => {
    if (triggered) return;
    triggered = true;
    if (trackStats) {
      await markAutomationTriggered(instance._id, new Date());
    }
  };
  const buildNextState = (nextState: Record<string, any>) => {
    const base = { ...nextState };
    if (!('vars' in base) && session.state?.vars) {
      base.vars = session.state.vars;
    }
    if (!('agent' in base) && session.state?.agent) {
      base.agent = session.state.agent;
    }
    if (!('previewMeta' in base) && session.state?.previewMeta) {
      base.previewMeta = session.state.previewMeta;
    }
    return base;
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

    if (!step && plan.mode === 'nodes' && nodeId && plan.startNodeId && nodeId !== plan.startNodeId) {
      if (!fallbackToStart) {
        const missingNodeId = nodeId;
        fallbackToStart = true;
        nodeId = plan.startNodeId;
        nodeQueue = [];
        logAutomation('⚠️ [AUTOMATION] Flow node pointer missing, restarting at start node', {
          nodeId: missingNodeId,
          startNodeId: plan.startNodeId,
        });
        continue;
      }
    }

    if (!step) {
      break;
    }

    const stepType = normalizeStepType(step);
    const rateLimit = resolveRateLimit(step.rateLimit, plan.graph.rateLimit);
    const nodeStart = nowMs();
    let forceWaitForReply = false;
    let forcedNextNodeId: string | undefined;

    if (shouldLogNode(step)) {
      logNodeEvent('Node start', {
        ...logContext,
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
      const message = await sendFlowMessage({
        conversation,
        instance,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text,
        buttons: step.buttons,
        platform,
        tags: step.tags,
        source: 'template_flow',
        deliveryMode,
        trackStats,
      });
      if (deliveryMode === 'preview' && onMessageSent) {
        onMessageSent({
          id: message._id?.toString() || '',
          from: 'ai',
          text: message.text || text,
          buttons: normalizeButtons(step.buttons),
          tags: step.tags,
          source: 'template_flow',
          createdAt: message.createdAt || new Date(),
        });
      }
      sentCount += 1;
    } else if (stepType === 'ai_reply') {
      if (rateLimit && !updateRateLimit(session, rateLimit)) {
        return { success: false, error: 'Rate limit exceeded', sentCount, executedSteps };
      }
      await markTriggeredOnce();
      const aiResult = await handleAiReplyStep({
        step,
        graph: plan.graph,
        session,
        conversation,
        instance,
        igAccount,
        messageText,
        platform,
        messageContext,
        deliveryMode,
        onMessageSent,
        trackStats,
        logContext,
      });
      if (!aiResult.success) {
        return { success: false, error: aiResult.error || 'AI reply failed', sentCount, executedSteps };
      }
      sentCount += 1;
    } else if (stepType === 'ai_agent') {
      if (rateLimit && !updateRateLimit(session, rateLimit)) {
        return { success: false, error: 'Rate limit exceeded', sentCount, executedSteps };
      }
      await markTriggeredOnce();
      if (!step.id) {
        return { success: false, error: 'AI agent node missing id', sentCount, executedSteps };
      }

      const aiSettings = {
        ...(plan.graph.aiSettings || {}),
        ...(step.aiSettings || {}),
      };
      const workspaceId = conversation.workspaceId?.toString?.() || conversation.workspaceId;
      let usageOwnerId: string | null = null;
      if (deliveryMode !== 'preview' && workspaceId) {
        const usageCheck = await checkAiMessageAllowance(workspaceId);
        if (!usageCheck.allowed) {
          logAutomation('⚠️  [AUTOMATION] AI message limit reached', {
            workspaceId,
            limit: usageCheck.limit,
            used: usageCheck.used,
          });
          return { success: false, error: 'AI message limit reached for this workspace', sentCount, executedSteps };
        }
        usageOwnerId = usageCheck.ownerId;
      }
      const agentSteps = Array.isArray(step.agentSteps)
        ? step.agentSteps.map((agentStep) => String(agentStep || '').trim()).filter(Boolean)
        : [];
      const agentSlots = Array.isArray(step.agentSlots)
        ? step.agentSlots
          .map((slot) => ({
            key: typeof slot?.key === 'string' ? slot.key.trim() : '',
            question: typeof slot?.question === 'string' ? slot.question.trim() : undefined,
            defaultValue: typeof slot?.defaultValue === 'string' ? slot.defaultValue.trim() : undefined,
          }))
          .filter((slot) => slot.key)
        : [];
      const storedAgent = session.state?.agent?.nodeId === step.id ? session.state.agent : {};
      const agentStepIndex = typeof storedAgent?.stepIndex === 'number' ? storedAgent.stepIndex : 0;
      const agentSlotValues = storedAgent?.slots && typeof storedAgent.slots === 'object'
        ? { ...storedAgent.slots }
        : {};
      const questionsAsked = typeof storedAgent?.questionsAsked === 'number' ? storedAgent.questionsAsked : 0;
      const maxQuestions = typeof step.agentMaxQuestions === 'number' ? step.agentMaxQuestions : undefined;
      const maxQuestionsReached = typeof maxQuestions === 'number' ? questionsAsked >= maxQuestions : false;

      const agentStart = nowMs();
      const agentResult = await generateAIAgentReply({
        conversation,
        workspaceId: conversation.workspaceId,
        latestCustomerMessage: messageText,
        systemPrompt: step.agentSystemPrompt,
        steps: agentSteps,
        stepIndex: agentStepIndex,
        endCondition: step.agentEndCondition,
        stopCondition: step.agentStopCondition,
        slotDefinitions: agentSlots,
        slotValues: agentSlotValues,
        maxQuestions,
        questionsAsked,
        maxQuestionsReached,
        aiSettings,
        knowledgeItemIds: step.knowledgeItemIds,
      });
      const agentDurationMs = Math.max(0, Math.round(nowMs() - agentStart));
      logAutomationStep('flow_ai_agent', agentStart, {
        stepIndex: agentStepIndex,
        advanceStep: agentResult.advanceStep,
        endConversation: agentResult.endConversation,
      });
      logAdminEvent({
        category: 'flow_node',
        message: 'AI agent response generated',
        details: {
          ...(logContext || {}),
          nodeId: step.id,
          type: 'ai_agent',
          aiSettings,
          replyPreview: agentResult.replyText?.slice(0, 500),
          advanceStep: agentResult.advanceStep,
          endConversation: agentResult.endConversation,
          shouldStop: agentResult.shouldStop,
          missingFields: agentResult.missingFields,
          collectedFields: agentResult.collectedFields,
          stepIndex: agentStepIndex,
        },
        workspaceId: resolveWorkspaceId(logContext),
      });

      if (!agentResult.replyText) {
        return { success: false, error: 'AI agent reply missing', sentCount, executedSteps };
      }

      const message = await sendFlowMessage({
        conversation,
        instance,
        igAccount,
        recipientId: conversation.participantInstagramId,
        text: agentResult.replyText,
        platform,
        source: 'ai_reply',
        deliveryMode,
        trackStats,
      });
      if (deliveryMode === 'preview' && onMessageSent) {
        onMessageSent({
          id: message._id?.toString() || '',
          from: 'ai',
          text: message.text || agentResult.replyText,
          source: 'ai_reply',
          createdAt: message.createdAt || new Date(),
        });
      }
      sentCount += 1;
      if (deliveryMode !== 'preview' && usageOwnerId && workspaceId) {
        await assertUsageLimit(usageOwnerId, 'aiMessages', 1, workspaceId);
      }

      const collectedFields = agentResult.collectedFields || {};
      Object.entries(collectedFields).forEach(([key, value]) => {
        if (!key) return;
        if (value === null) return;
        if (typeof value === 'string' && value.trim()) {
          agentSlotValues[key] = value.trim();
        }
      });
      agentSlots.forEach((slot) => {
        if (!slot.defaultValue) return;
        if (!agentSlotValues[slot.key]) {
          agentSlotValues[slot.key] = slot.defaultValue;
        }
      });

      const missingFields = Array.isArray(agentResult.missingFields)
        ? agentResult.missingFields
        : agentSlots
          .map((slot) => slot.key)
          .filter((key) => !agentSlotValues[key]);

      const nextQuestionsAsked = agentResult.askedQuestion ? questionsAsked + 1 : questionsAsked;

      const stepCount = agentSteps.length;
      const nextStepIndex = agentResult.advanceStep && stepCount > 0
        ? Math.min(agentStepIndex + 1, stepCount - 1)
        : agentStepIndex;
      const agentStop = Boolean(agentResult.shouldStop);
      const agentDone = Boolean(agentResult.endConversation) || agentStop || maxQuestionsReached;

      if (deliveryMode === 'preview') {
        const collectedEntries = Object.entries(collectedFields)
          .filter(([key, value]) => key && value !== null && value !== undefined && String(value).trim());
        const formatValue = (value: string) => {
          const trimmed = value.trim();
          return trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed;
        };
        const formatEntries = (entries: Array<[string, any]>) => {
          if (entries.length === 0) return '';
          const sample = entries.slice(0, 3).map(([key, value]) => (
            value ? `${key}=${formatValue(String(value))}` : key
          ));
          const extra = entries.length - sample.length;
          return `${sample.join(', ')}${extra > 0 ? ` +${extra} more` : ''}`;
        };
        const formatList = (items: string[]) => {
          if (items.length === 0) return '';
          const sample = items.slice(0, 3).join(', ');
          const extra = items.length - Math.min(items.length, 3);
          return `${sample}${extra > 0 ? ` +${extra} more` : ''}`;
        };
        const stepLabel = agentSteps[agentStepIndex] ? agentSteps[agentStepIndex].trim() : '';
        const stepBadge = stepCount > 0 ? `Step ${agentStepIndex + 1}/${stepCount}` : `Step ${agentStepIndex + 1}`;
        const detailParts = [];
        if (stepLabel) detailParts.push(stepLabel.length > 60 ? `${stepLabel.slice(0, 60)}…` : stepLabel);
        const collectedSummary = formatEntries(collectedEntries);
        if (collectedSummary) detailParts.push(`captured: ${collectedSummary}`);
        const missingSummary = formatList(missingFields);
        if (missingSummary) detailParts.push(`missing: ${missingSummary}`);
        if (agentResult.advanceStep) detailParts.push('advance step');
        if (agentDone) detailParts.push('done');

        appendPreviewMetaEvent(session, {
          type: 'info',
          message: `AI Agent ${stepBadge}${detailParts.length > 0 ? ` · ${detailParts.join(' · ')}` : ''}`,
          details: {
            nodeId: step.id,
            type: stepType,
            stepIndex: agentStepIndex,
            stepCount,
            collectedFields,
            missingFields,
            advanceStep: agentResult.advanceStep,
            endConversation: agentResult.endConversation,
            shouldStop: agentResult.shouldStop,
            durationMs: agentDurationMs,
          },
        });
      }

      const nextVars = {
        ...(session.state?.vars || {}),
        agentNodeId: step.id,
        agentStepIndex: nextStepIndex,
        agentStepCount: stepCount,
        agentStep: agentSteps[nextStepIndex] || '',
        agentDone,
        agentStepSummary: agentResult.stepSummary,
        agentSlots: agentSlotValues,
        agentMissingSlots: missingFields,
        agentQuestionsAsked: nextQuestionsAsked,
      };

      session.state = {
        ...(session.state || {}),
        vars: nextVars,
      };

      if (agentDone) {
        if (session.state?.agent) {
          delete session.state.agent;
        }
      } else {
        session.state.agent = {
          nodeId: step.id,
          stepIndex: nextStepIndex,
          stepCount,
          lastStepSummary: agentResult.stepSummary,
          slots: agentSlotValues,
          questionsAsked: nextQuestionsAsked,
        };
        forceWaitForReply = true;
        forcedNextNodeId = step.id;
      }
    } else if (stepType === 'handoff') {
      await markTriggeredOnce();
      if (deliveryMode !== 'preview') {
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
      }

      if (step.handoff?.message) {
        const message = await sendFlowMessage({
          conversation,
          instance,
          igAccount,
          recipientId: conversation.participantInstagramId,
          text: step.handoff.message,
          platform,
          source: 'template_flow',
          deliveryMode,
          trackStats,
        });
        if (deliveryMode === 'preview' && onMessageSent) {
          onMessageSent({
            id: message._id?.toString() || '',
            from: 'ai',
            text: message.text || step.handoff.message,
            source: 'template_flow',
            createdAt: message.createdAt || new Date(),
          });
        }
        sentCount += 1;
      }
    } else if (stepType === 'detect_intent') {
      const intentStart = nowMs();
      const detected = await detectAutomationIntentDetailed(messageText || '', step.intentSettings);
      const intentDurationMs = Math.max(0, Math.round(nowMs() - intentStart));
      const detectedIntent = detected.value;
      await markTriggeredOnce();
      session.state = {
        ...(session.state || {}),
        vars: {
          ...(session.state?.vars || {}),
          detectedIntent,
        },
      };
      logAutomationStep('flow_detect_intent', intentStart, { detectedIntent });
      if (deliveryMode === 'preview') {
        appendPreviewMetaEvent(session, {
          type: 'info',
          message: `Detected intent: ${detectedIntent || 'none'}${detected.description ? ` — ${detected.description}` : ''}`,
          details: {
            nodeId: step.id,
            type: stepType,
            detectedIntent,
            intentDescription: detected.description,
            durationMs: intentDurationMs,
          },
        });
      }
    } else if (stepType === 'router') {
      // Router nodes only decide the next path.
    } else if (stepType === 'trigger') {
      // Triggers are metadata-only anchors and do not execute at runtime.
    } else {
      logAutomation('⚠️ [AUTOMATION] Unsupported flow step', { stepId: step.id, type: step.type });
      return completeWithError('Unsupported flow step');
    }

    executedSteps += 1;

    if (shouldLogNode(step)) {
      logNodeEvent('Node complete', {
        ...logContext,
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
      const routing = resolveNextNodeId(step, plan, stepType, {
        messageText,
        messageContext,
        config: runtimeConfig,
        vars: session.state?.vars || {},
      });
      nextNodeId = routing.nextNodeId;
      if (routing.queuedNodeIds && routing.queuedNodeIds.length > 0) {
        nodeQueue = nodeQueue.concat(routing.queuedNodeIds);
      }
      if (!nextNodeId && nodeQueue.length > 0) {
        nextNodeId = nodeQueue.shift();
      }
    }

    if (forcedNextNodeId) {
      nextNodeId = forcedNextNodeId;
    }

    const shouldPause = forceWaitForReply || (step.waitForReply && stepType !== 'ai_agent');
    if (shouldPause) {
      const hasNext = plan.mode === 'steps'
        ? (nextStepIndex !== undefined && Boolean(plan.steps[nextStepIndex]))
        : (Boolean(nextNodeId)
          && Boolean(plan.nodeMap?.get(nextNodeId as string) || plan.steps.find(candidate => candidate.id === nextNodeId)));
      const nextState = hasNext
        ? (plan.mode === 'steps'
          ? { stepIndex: nextStepIndex, nodeQueue: nodeQueue.length > 0 ? nodeQueue : undefined }
          : { nodeId: nextNodeId, nodeQueue: nodeQueue.length > 0 ? nodeQueue : undefined })
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
  runtime?: { graph: FlowRuntimeGraph; triggers: FlowTriggerDefinition[]; config: Record<string, any> } | null;
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
    config: resolvedRuntime.config,
  });
  logAutomationStep('flow_execute', runStart, { success: result.success, steps: result.executedSteps });

  return result.success
    ? { success: true }
    : { success: false, error: result.error || 'Flow execution failed' };
}

export async function executePreviewFlowForInstance(params: {
  instance: any;
  session: any;
  conversation: any;
  messageText: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string; messages: PreviewAutomationMessage[] }> {
  const { instance, session, conversation, messageText, messageContext } = params;
  const version = await resolveLatestTemplateVersion({
    templateId: instance.templateId,
    fallbackVersionId: session.templateVersionId || instance.templateVersionId,
  });
  if (!version) {
    return { success: false, error: 'Template version not found', messages: [] };
  }

  const runtime = resolveFlowRuntime(version, instance);
  if (!runtime) {
    return { success: false, error: 'Flow runtime unavailable', messages: [] };
  }

  const plan = buildExecutionPlan(runtime.graph);
  if (!plan) {
    return { success: false, error: 'Flow graph missing runnable steps', messages: [] };
  }

  const state = session.state || {};
  const hasActiveState = Boolean(
    state.stepIndex !== undefined ||
    state.nodeId ||
    (Array.isArray(state.nodeQueue) && state.nodeQueue.length > 0) ||
    state.agent?.nodeId,
  );

  if (!hasActiveState) {
    const triggers = runtime.triggers || [];
    const previewTriggerTypes: TriggerType[] = ['dm_message', 'post_comment', 'story_reply', 'story_mention'];
    const previewTriggers = triggers.filter((trigger) => previewTriggerTypes.includes(trigger.type));
    if (previewTriggers.length === 0) {
      return { success: false, error: 'No triggers configured for preview', messages: [] };
    }
    let matchedTrigger: FlowTriggerDefinition | null = null;
    let matchedDetails: Awaited<ReturnType<typeof matchTriggerConfigDetailed>> | null = null;
    for (const trigger of previewTriggers) {
      const details = await matchTriggerConfigDetailed(messageText || '', trigger.config, messageContext);
      if (details.matched) {
        matchedTrigger = trigger;
        matchedDetails = details;
        break;
      }
    }
    if (!matchedTrigger) {
      return { success: false, error: 'Trigger conditions did not match', messages: [] };
    }
    if (matchedDetails) {
      const matchSignals: string[] = [];
      if (matchedDetails.matchedOn.link) matchSignals.push('link');
      if (matchedDetails.matchedOn.attachment) matchSignals.push('attachment');
      if (matchedDetails.matchedOn.intent) matchSignals.push('intent');
      if (matchedDetails.matchedOn.keywords) matchSignals.push('keywords');
      const triggerLabel = matchedTrigger.label || matchedTrigger.type;
      const intentHint = matchedDetails.matchedOn.intent && matchedTrigger.config?.intentText
        ? ` · intent: ${matchedTrigger.config.intentText.trim()}`
        : '';
      const signalSuffix = matchSignals.length > 0 ? ` (${matchSignals.join(', ')})` : '';
      appendPreviewMetaEvent(session, {
        type: 'info',
        message: `Trigger matched: ${triggerLabel}${signalSuffix}${intentHint}`,
        details: {
          type: 'trigger',
          triggerType: matchedTrigger.type,
          triggerLabel: matchedTrigger.label,
          triggerMode: matchedDetails.triggerMode,
          matchedOn: matchedDetails.matchedOn,
          messagePreview: messageText?.slice(0, 160),
        },
      });
    }
  }

  if (session.templateVersionId?.toString() !== version._id.toString()) {
    session.templateVersionId = version._id;
  }

  session.lastCustomerMessageAt = new Date();

  const outbound: PreviewAutomationMessage[] = [];
  const result = await executeFlowPlan({
    plan,
    session,
    instance,
    conversation,
    igAccount: null,
    messageText,
    platform: 'mock',
    messageContext,
    config: runtime.config,
    deliveryMode: 'preview',
    onMessageSent: (message) => outbound.push(message),
    trackStats: false,
  });

  return result.success
    ? { success: true, messages: outbound }
    : { success: false, error: result.error || 'Flow execution failed', messages: outbound };
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

    const matchStart = nowMs();
    const selection = await resolveAutomationSelection({
      workspaceId,
      triggerType,
      messageText: normalizedMessage,
      messageContext,
    });

    logAutomationStep('match_triggers', matchStart, {
      matched: selection.match ? 1 : 0,
      evaluated: selection.evaluated,
      triggerType,
    });

    if (!selection.match) {
      if (selection.diagnostics.length > 0) {
        logAutomation('🔍 [AUTOMATION] Match diagnostics', {
          triggerType,
          messageContext: contextSummary,
          evaluated: selection.diagnostics.length,
          diagnostics: selection.diagnostics.slice(0, 10),
          truncated: selection.diagnostics.length > 10,
        });
      }
      logAutomation('⚠️  [AUTOMATION] No automations matched trigger filters');
      return finish({ success: false, error: 'No automations matched trigger filters' });
    }

    const { instance, version, runtime } = selection.match;
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
