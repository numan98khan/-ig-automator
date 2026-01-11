import express, { Response } from 'express';
import mongoose from 'mongoose';
import AutomationInstance from '../models/AutomationInstance';
import AutomationSession from '../models/AutomationSession';
import Conversation from '../models/Conversation';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import InstagramAccount from '../models/InstagramAccount';
import Message from '../models/Message';
import AutomationPreviewProfile from '../models/AutomationPreviewProfile';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { getAdminLogEvents } from '../services/adminLogEventService';
import {
  executePreviewFlowForInstance,
  resolveLatestTemplateVersion,
  resolveAutomationSelection,
} from '../services/automationService';
import { assertWorkspaceLimit, getWorkspaceOwnerTier } from '../services/tierService';

const router = express.Router();

const TEMPLATE_PUBLIC_FIELDS = 'name description status currentVersionId createdAt updatedAt';
const VERSION_PUBLIC_FIELDS = 'templateId version versionLabel status triggers exposedFields display publishedAt createdAt updatedAt';

type PreviewPersona = {
  name: string;
  handle?: string;
  userId?: string;
  avatarUrl?: string;
};

type PreviewEventType =
  | 'node_start'
  | 'node_complete'
  | 'field_update'
  | 'field_clear'
  | 'tag_added'
  | 'tag_removed'
  | 'error'
  | 'info';

type PreviewEvent = {
  id: string;
  type: PreviewEventType;
  message: string;
  createdAt: Date;
  details?: Record<string, any>;
};

const truncateText = (value: unknown, max = 160): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 3)).trim()}...`;
};

const formatList = (items: Array<string | undefined>, limit = 4): string | undefined => {
  const cleaned = items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (cleaned.length === 0) return undefined;
  const visible = cleaned.slice(0, limit);
  const extra = cleaned.length - visible.length;
  if (extra > 0) {
    return `${visible.join(', ')} (+${extra} more)`;
  }
  return visible.join(', ');
};

const normalizeHandle = (value?: string) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return undefined;
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

const normalizePersona = (input?: Record<string, any>): PreviewPersona | null => {
  if (!input || typeof input !== 'object') return null;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const handle = normalizeHandle(typeof input.handle === 'string' ? input.handle : undefined);
  const userId = typeof input.userId === 'string' ? input.userId.trim() : undefined;
  const avatarUrl = typeof input.avatarUrl === 'string' ? input.avatarUrl.trim() : undefined;
  return {
    name: name || 'Preview Tester',
    handle,
    userId,
    avatarUrl,
  };
};

const buildMessageContext = (text: string) => ({
  hasLink: /\bhttps?:\/\/\S+/i.test(text),
  hasAttachment: false,
});

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
  return session.state.previewMeta as {
    events: PreviewEvent[];
    profileId?: string;
    persona?: PreviewPersona;
    source?: string;
    selectedAutomation?: {
      id?: string;
      name?: string;
      templateId?: string;
      trigger?: { type?: string; label?: string; description?: string };
    };
  };
};

const appendPreviewEvent = (session: any, event: Omit<PreviewEvent, 'id'> & { id?: string }) => {
  const meta = ensurePreviewMeta(session);
  const payload: PreviewEvent = {
    ...event,
    id: event.id || new mongoose.Types.ObjectId().toString(),
    createdAt: event.createdAt || new Date(),
  };
  meta.events = [...meta.events, payload].slice(-200);
};

const extractNodeLabel = (dslSnapshot: any, nodeId: string): string | undefined => {
  const nodes = Array.isArray(dslSnapshot?.nodes)
    ? dslSnapshot.nodes
    : Array.isArray(dslSnapshot?.steps)
      ? dslSnapshot.steps
      : [];
  const match = nodes.find((node: any) => node?.id === nodeId || node?.nodeId === nodeId);
  const label = typeof match?.data?.label === 'string'
    ? match.data.label
    : typeof match?.label === 'string'
      ? match.label
      : undefined;
  return label?.trim() || undefined;
};

const buildNodeSummary = (node: any, options: {
  fallbackId?: string;
  label?: string;
  edges?: Array<{ from?: string }>;
}) => {
  if (!node || typeof node !== 'object') return null;
  const id = typeof node.id === 'string' ? node.id : options.fallbackId;
  const type = typeof node.type === 'string' ? node.type : 'unknown';
  if (!id && !type) return null;

  const summary: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    summary.push({ label, value: trimmed });
  };

  const previewCandidate = node.text ?? node.message ?? node.agentSystemPrompt ?? node.handoff?.message ?? node.handoff?.summary;
  const preview = truncateText(previewCandidate, 180);

  if (typeof node.waitForReply === 'boolean') {
    add('Wait for reply', node.waitForReply ? 'Yes' : 'No');
  }

  const nodeType = type.toLowerCase();
  if (nodeType === 'send_message') {
    const buttons = Array.isArray(node.buttons) ? node.buttons : [];
    if (buttons.length > 0) {
      const titles = buttons.map((button: any) => (
        typeof button === 'string' ? button : button?.title
      ));
      add('Buttons', formatList(titles, 3) || `${buttons.length}`);
    }
    const tags = Array.isArray(node.tags) ? node.tags : [];
    if (tags.length > 0) {
      add('Tags', formatList(tags, 4) || `${tags.length}`);
    }
  } else if (nodeType === 'ai_reply') {
    const ai = node.aiSettings || {};
    add('Model', ai.model);
    add('Reasoning', ai.reasoningEffort);
    if (typeof ai.temperature === 'number') add('Temperature', `${ai.temperature}`);
    if (typeof ai.maxOutputTokens === 'number') add('Max tokens', `${ai.maxOutputTokens}`);
    if (typeof ai.historyLimit === 'number') add('History', `${ai.historyLimit}`);
    if (typeof ai.ragEnabled === 'boolean') add('RAG', ai.ragEnabled ? 'On' : 'Off');
    const knowledgeItemIds = Array.isArray(node.knowledgeItemIds) ? node.knowledgeItemIds : [];
    if (knowledgeItemIds.length > 0) add('Knowledge items', `${knowledgeItemIds.length}`);
  } else if (nodeType === 'ai_agent') {
    const steps = Array.isArray(node.agentSteps) ? node.agentSteps.filter(Boolean) : [];
    if (steps.length > 0) add('Steps', `${steps.length}`);
    add('End condition', truncateText(node.agentEndCondition, 120));
    add('Stop condition', truncateText(node.agentStopCondition, 120));
    if (typeof node.agentMaxQuestions === 'number') add('Max questions', `${node.agentMaxQuestions}`);
    const slots = Array.isArray(node.agentSlots) ? node.agentSlots : [];
    if (slots.length > 0) {
      const keys = slots.map((slot: any) => slot?.key).filter(Boolean);
      add('Slots', formatList(keys, 4) || `${slots.length}`);
    }
    const ai = node.aiSettings || {};
    add('Model', ai.model);
    add('Reasoning', ai.reasoningEffort);
    if (typeof ai.temperature === 'number') add('Temperature', `${ai.temperature}`);
    if (typeof ai.ragEnabled === 'boolean') add('RAG', ai.ragEnabled ? 'On' : 'Off');
    const knowledgeItemIds = Array.isArray(node.knowledgeItemIds) ? node.knowledgeItemIds : [];
    if (knowledgeItemIds.length > 0) add('Knowledge items', `${knowledgeItemIds.length}`);
  } else if (nodeType === 'detect_intent') {
    const intent = node.intentSettings || {};
    add('Model', intent.model);
    add('Reasoning', intent.reasoningEffort);
    if (typeof intent.temperature === 'number') add('Temperature', `${intent.temperature}`);
  } else if (nodeType === 'handoff') {
    add('Topic', truncateText(node.handoff?.topic, 120));
    add('Summary', truncateText(node.handoff?.summary, 160));
    add('Message', truncateText(node.handoff?.message, 160));
  } else if (nodeType === 'router') {
    const routing = node.routing || {};
    add('Match mode', routing.matchMode);
    if (routing.defaultTarget) add('Default target', `${routing.defaultTarget}`);
    const edges = Array.isArray(options.edges) ? options.edges : [];
    if (edges.length > 0 && id) {
      add('Routes', `${edges.filter((edge) => edge?.from === id).length}`);
    }
  }

  const cleanLabel = typeof options.label === 'string' ? options.label.trim() : undefined;
  return {
    id: id || '',
    type,
    label: cleanLabel || undefined,
    preview,
    summary: summary.length > 0 ? summary : undefined,
  };
};

const resolveTemplateVersion = async (params: {
  templateId?: string;
  templateVersionId?: string;
}) => {
  const { templateId, templateVersionId } = params;
  let template = null;

  if (templateId) {
    template = await FlowTemplate.findById(templateId).lean();
  } else if (templateVersionId) {
    const version = await FlowTemplateVersion.findById(templateVersionId).lean();
    if (!version || version.status !== 'published') {
      return null;
    }
    template = await FlowTemplate.findById(version.templateId).lean();
  }

  if (!template || !template.currentVersionId) return null;

  const version = await FlowTemplateVersion.findOne({
    _id: template.currentVersionId,
    status: 'published',
  }).lean();
  if (!version) return null;

  return {
    templateId: template._id,
    templateVersionId: version._id,
  };
};

const hydrateInstances = async (instances: Array<Record<string, any>>) => {
  if (!instances.length) return instances;

  const templateIds = Array.from(new Set(instances.map((item) => item.templateId?.toString()).filter(Boolean)));
  const storedVersionIds = Array.from(
    new Set(instances.map((item) => item.templateVersionId?.toString()).filter(Boolean)),
  );

  const templates = templateIds.length
    ? await FlowTemplate.find({ _id: { $in: templateIds } }).select(TEMPLATE_PUBLIC_FIELDS).lean()
    : [];

  const currentVersionIds = templates
    .map((template: any) => template.currentVersionId?.toString())
    .filter(Boolean) as string[];

  const versionIds = Array.from(new Set([...storedVersionIds, ...currentVersionIds]));

  const versions = versionIds.length
    ? await FlowTemplateVersion.find({ _id: { $in: versionIds } })
        .select(VERSION_PUBLIC_FIELDS)
        .lean()
    : [];

  const templateMap = new Map(templates.map((template: any) => [template._id.toString(), template]));
  const versionMap = new Map(versions.map((version: any) => [version._id.toString(), version]));

  return instances.map((instance) => {
    const template = instance.templateId ? templateMap.get(instance.templateId.toString()) || null : null;
    const latestVersionId = template?.currentVersionId?.toString();
    const latestVersion = latestVersionId ? versionMap.get(latestVersionId) || null : null;
    const storedVersion = instance.templateVersionId
      ? versionMap.get(instance.templateVersionId.toString()) || null
      : null;

    return {
      ...instance,
      template,
      templateVersion: latestVersion || storedVersion,
    };
  });
};

const formatPreviewConversation = (conversation: any) => ({
  _id: conversation._id?.toString(),
  participantName: conversation.participantName,
  participantHandle: conversation.participantHandle,
  participantInstagramId: conversation.participantInstagramId,
  participantProfilePictureUrl: conversation.participantProfilePictureUrl,
  tags: Array.isArray(conversation.tags) ? conversation.tags : [],
  lastMessageAt: conversation.lastMessageAt,
});

const buildCurrentNodeSummary = (session: any, versionDoc: any) => {
  if (!session || !versionDoc) return null;
  const nodeId = session.state?.nodeId || session.state?.agent?.nodeId;
  const compiledGraph = versionDoc?.compiled?.graph || versionDoc?.compiled;
  const nodes = Array.isArray(compiledGraph?.nodes) ? compiledGraph.nodes : [];
  let node = nodeId ? nodes.find((candidate: any) => candidate?.id === nodeId) : undefined;
  let fallbackId = nodeId;
  if (!node && typeof session.state?.stepIndex === 'number') {
    node = nodes[session.state.stepIndex];
    if (!fallbackId && typeof node?.id === 'string') {
      fallbackId = node.id;
    }
  }
  const labelId = typeof node?.id === 'string' ? node.id : nodeId;
  const nodeLabel = labelId ? extractNodeLabel(versionDoc?.dslSnapshot, labelId) : undefined;
  return node
    ? buildNodeSummary(node, {
      fallbackId,
      label: nodeLabel,
      edges: Array.isArray(compiledGraph?.edges) ? compiledGraph.edges : [],
    })
    : null;
};

const resolvePreviewProfile = async (workspaceId: mongoose.Types.ObjectId, profileId?: string) => {
  if (profileId && mongoose.Types.ObjectId.isValid(profileId)) {
    const profile = await AutomationPreviewProfile.findOne({ _id: profileId, workspaceId }).lean();
    if (profile) return profile;
  }
  return AutomationPreviewProfile.findOne({ workspaceId, isDefault: true }).sort({ updatedAt: -1 }).lean();
};

const toPersonaFromProfile = (profile: any): PreviewPersona | null => {
  if (!profile) return null;
  return normalizePersona({
    name: profile.name,
    handle: profile.handle,
    userId: profile.userId,
    avatarUrl: profile.avatarUrl,
  });
};

const applyPersonaToConversation = async (conversation: any, persona: PreviewPersona) => {
  if (!persona) return;
  const nextName = persona.name || conversation.participantName || 'Preview Tester';
  const nextHandle = persona.handle || conversation.participantHandle || '@preview';
  const nextUserId = persona.userId || conversation.participantInstagramId || `preview-${conversation._id?.toString()}`;
  conversation.participantName = nextName;
  conversation.participantHandle = nextHandle;
  conversation.participantInstagramId = nextUserId;
  if (persona.avatarUrl) {
    conversation.participantProfilePictureUrl = persona.avatarUrl;
  }
  await conversation.save();
};

const buildPreviewEvents = async (session: any, versionDoc: any) => {
  if (!session?._id) return [];
  const sessionId = session._id.toString();
  const logEvents = await getAdminLogEvents({
    sessionId,
    category: 'flow_node',
    limit: 200,
  });
  const nodeLabelLookup = (nodeId?: string) => (nodeId ? extractNodeLabel(versionDoc?.dslSnapshot, nodeId) : undefined);
  const formatNodeType = (nodeType?: string) => {
    if (!nodeType) return '';
    return nodeType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  };
  const buildNodeDescriptor = (nodeId?: string, nodeType?: string) => {
    const nodeLabel = nodeId ? nodeLabelLookup(nodeId) : undefined;
    const nodeDisplay = nodeLabel || nodeId || 'node';
    const nodeTypeLabel = formatNodeType(nodeType);
    return nodeTypeLabel ? `${nodeTypeLabel} · ${nodeDisplay}` : nodeDisplay;
  };
  const mappedLogEvents: PreviewEvent[] = logEvents
    .map((event: any) => {
      const message = typeof event.message === 'string' ? event.message : 'Flow event';
      const cleanMessage = message.replace(/^🧩\s*\[FLOW NODE\]\s*/i, '').trim();
      const lower = cleanMessage.toLowerCase();
      const isStart = lower.includes('node start');
      const isComplete = lower.includes('node complete');
      const type: PreviewEventType = isStart ? 'node_start' : isComplete ? 'node_complete' : 'info';
      const nodeId = typeof event.details?.nodeId === 'string' ? event.details.nodeId : undefined;
      const nodeType = typeof event.details?.type === 'string' ? event.details.type : undefined;
      const nodeDescriptor = buildNodeDescriptor(nodeId, nodeType);
      const displayMessage = isStart
        ? `Started ${nodeDescriptor}`
        : isComplete
          ? `Completed ${nodeDescriptor}`
          : cleanMessage || message;
      return {
        id: event._id?.toString() || new mongoose.Types.ObjectId().toString(),
        type,
        message: displayMessage,
        createdAt: event.createdAt || new Date(),
        details: event.details,
      };
    })
    .reverse()
    .filter((event) => event.type !== 'node_start' && event.type !== 'node_complete');

  const metaEvents = Array.isArray(session.state?.previewMeta?.events)
    ? session.state.previewMeta.events
    : [];
  const normalizedMetaEvents = metaEvents
    .filter((event: PreviewEvent) => event.type !== 'node_start' && event.type !== 'node_complete')
    .map((event: PreviewEvent) => event);

  const merged = [...mappedLogEvents, ...normalizedMetaEvents].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  return merged;
};

const buildPreviewConversation = async (params: {
  instance: any;
  instagramAccountId: mongoose.Types.ObjectId;
  persona?: PreviewPersona | null;
}) => {
  const { instance, instagramAccountId, persona } = params;
  const participantHandle = persona?.handle || '@preview';
  return Conversation.create({
    participantName: persona?.name || 'Preview Tester',
    participantHandle,
    participantProfilePictureUrl: persona?.avatarUrl,
    workspaceId: instance.workspaceId,
    instagramAccountId,
    platform: 'mock',
    participantInstagramId: persona?.userId || `preview-${instance._id.toString()}`,
  });
};

const formatPreviewMessages = (messages: Array<Record<string, any>>) =>
  messages.map((message) => ({
    id: message._id?.toString(),
    text: message.text,
    from: message.from,
    createdAt: message.createdAt,
  }));

const loadPreviewMessages = async (conversationId: mongoose.Types.ObjectId | string) => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();
  return formatPreviewMessages(messages);
};

const ensurePreviewSession = async (params: {
  instance: any;
  templateVersionId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  reset?: boolean;
  sessionId?: string;
  persona?: PreviewPersona | null;
  profileId?: string;
}) => {
  const {
    instance,
    templateVersionId,
    instagramAccountId,
    reset,
    sessionId,
    persona,
    profileId,
  } = params;
  let session = sessionId
    ? await AutomationSession.findById(sessionId)
    : await AutomationSession.findOne({
        automationInstanceId: instance._id,
        channel: 'preview',
      }).sort({ updatedAt: -1 });

  const shouldReset = reset || !session || session.status !== 'active' || session.channel !== 'preview';
  if (shouldReset) {
    const conversation = await buildPreviewConversation({ instance, instagramAccountId, persona });
    session = await AutomationSession.create({
      workspaceId: instance.workspaceId,
      conversationId: conversation._id,
      automationInstanceId: instance._id,
      templateId: instance.templateId,
      templateVersionId,
      channel: 'preview',
      status: 'active',
      state: {},
    });
    appendPreviewEvent(session, {
      type: 'info',
      message: 'Preview session started',
      createdAt: new Date(),
    });
    if (persona) {
      const meta = ensurePreviewMeta(session);
      meta.persona = persona;
      if (profileId) {
        meta.profileId = profileId;
      }
    }
    await session.save();
    return { session, conversation };
  }

  if (!session) {
    throw new Error('Preview session missing');
  }

  if (session.templateVersionId?.toString() !== templateVersionId.toString()) {
    session.templateVersionId = templateVersionId;
    await session.save();
  }

  const conversation = await Conversation.findById(session.conversationId);
  if (!conversation) {
    const newConversation = await buildPreviewConversation({ instance, instagramAccountId, persona });
    session.conversationId = newConversation._id;
    await session.save();
    return { session, conversation: newConversation };
  }

  if (persona) {
    const meta = ensurePreviewMeta(session);
    const previousPersona = meta.persona;
    const personaChanged = !previousPersona || JSON.stringify(previousPersona) !== JSON.stringify(persona);
    if (personaChanged) {
      await applyPersonaToConversation(conversation, persona);
      appendPreviewEvent(session, {
        type: 'info',
        message: 'Mock persona updated',
        createdAt: new Date(),
      });
    }
    meta.persona = persona;
    if (profileId) {
      meta.profileId = profileId;
    }
    await session.save();
  }

  return { session, conversation };
};

const loadInstanceWithAccess = async (
  id: string,
  userId: string,
  res: Response,
): Promise<{ instance: any } | null> => {
  const instance = await AutomationInstance.findById(id);
  if (!instance) {
    res.status(404).json({ error: 'Automation instance not found' });
    return null;
  }
  const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), userId);
  if (!hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return { instance };
};

const canViewExecutionTimeline = async (workspaceId: string) => {
  const { limits } = await getWorkspaceOwnerTier(workspaceId);
  return limits?.executionTimeline !== false;
};

const buildPreviewSessionPayload = async (
  session: any,
  conversation: any,
  options?: { includeEvents?: boolean },
) => {
  const sessionDoc = session?.toObject ? session.toObject() : session;
  const versionDoc = sessionDoc?.templateVersionId
    ? await FlowTemplateVersion.findById(sessionDoc.templateVersionId)
      .select('version versionLabel compiled dslSnapshot')
      .lean()
    : null;
  const currentNode = sessionDoc && versionDoc ? buildCurrentNodeSummary(sessionDoc, versionDoc) : null;
  const includeEvents = options?.includeEvents !== false;
  const events = includeEvents && sessionDoc ? await buildPreviewEvents(sessionDoc, versionDoc) : [];
  const profileId = sessionDoc?.state?.previewMeta?.profileId;
  const profile = profileId && mongoose.Types.ObjectId.isValid(profileId)
    ? await AutomationPreviewProfile.findById(profileId).lean()
    : null;
  return {
    session: sessionDoc || null,
    conversation: conversation ? formatPreviewConversation(conversation) : null,
    currentNode,
    events,
    profile,
    persona: sessionDoc?.state?.previewMeta?.persona || null,
  };
};

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const instances = await AutomationInstance.find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean();
    const hydrated = await hydrateInstances(instances);
    res.json(hydrated);
  } catch (error) {
    console.error('Get automation instances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/simulate/message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, text, triggerType, persona, profileId, sessionId, reset } = req.body || {};
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trimmedText = text.trim();
    const resolvedTriggerType = typeof triggerType === 'string' ? triggerType : 'dm_message';
    const messageContext = buildMessageContext(trimmedText);

    let selectedInstance: any | null = null;
    let selectedVersion: any | null = null;
    let matchedTrigger: any | null = null;
    let diagnostics: Array<Record<string, any>> = [];

    let activePreviewSession: any | null = null;
    if (sessionId && !reset) {
      const existingSession = await AutomationSession.findOne({
        _id: sessionId,
        channel: 'preview',
        status: 'active',
      });
      if (existingSession) {
        const instance = await AutomationInstance.findById(existingSession.automationInstanceId);
        if (instance && instance.isActive) {
          const version = await resolveLatestTemplateVersion({
            templateId: instance.templateId,
            fallbackVersionId: existingSession.templateVersionId || instance.templateVersionId,
          });
          if (version) {
            selectedInstance = instance;
            selectedVersion = version;
            activePreviewSession = existingSession;
          }
        }
      }
    }

    if (!selectedInstance || !selectedVersion) {
      const selection = await resolveAutomationSelection({
        workspaceId,
        triggerType: resolvedTriggerType as any,
        messageText: trimmedText,
        messageContext,
      });
      diagnostics = selection.diagnostics;
      if (!selection.match) {
        return res.json({
          success: false,
          error: 'No automations matched trigger filters',
          diagnostics,
          session: null,
          conversation: null,
          currentNode: null,
          events: [],
          profile: null,
          persona: null,
        });
      }
      selectedInstance = selection.match.instance;
      selectedVersion = selection.match.version;
      matchedTrigger = selection.match.matchedTrigger;
    }

    const instagramAccount = await InstagramAccount.findOne({ workspaceId })
      .select('_id')
      .lean();
    const instagramAccountId = instagramAccount?._id || new mongoose.Types.ObjectId();

    const resolvedProfile = await resolvePreviewProfile(new mongoose.Types.ObjectId(workspaceId), profileId);
    const resolvedPersona = normalizePersona(persona) || toPersonaFromProfile(resolvedProfile);

    const { session, conversation } = await ensurePreviewSession({
      instance: selectedInstance,
      templateVersionId: selectedVersion._id,
      instagramAccountId,
      reset: Boolean(reset),
      sessionId: activePreviewSession?._id?.toString(),
      persona: resolvedPersona,
      profileId: resolvedProfile?._id?.toString(),
    });
    const meta = ensurePreviewMeta(session);
    meta.source = 'simulate';
    meta.selectedAutomation = {
      id: selectedInstance._id?.toString(),
      name: selectedInstance.name,
      templateId: selectedInstance.templateId?.toString(),
      trigger: matchedTrigger
        ? { type: matchedTrigger.type, label: matchedTrigger.label, description: matchedTrigger.description }
        : undefined,
    };

    const customerMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId: conversation.workspaceId,
      text: trimmedText,
      from: 'customer',
      platform: 'mock',
    });

    conversation.lastMessage = customerMessage.text;
    conversation.lastMessageAt = customerMessage.createdAt;
    conversation.lastCustomerMessageAt = customerMessage.createdAt;
    await conversation.save();

    const result = await executePreviewFlowForInstance({
      instance: selectedInstance,
      session,
      conversation,
      messageText: trimmedText,
      messageContext,
    });

    if (!result.success) {
      appendPreviewEvent(session, {
        type: 'error',
        message: result.error || 'Flow execution failed',
        createdAt: new Date(),
      });
    }

    await session.save();
    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(workspaceId),
    });

    return res.json({
      success: result.success,
      error: result.error,
      sessionId: session._id,
      conversationId: conversation._id,
      status: session.status,
      messages: result.messages,
      ...payload,
      selectedAutomation: meta.selectedAutomation,
      diagnostics,
    });
  } catch (error) {
    console.error('Simulate automation message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/simulate/session', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : '';
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = await AutomationSession.findOne({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      channel: 'preview',
      'state.previewMeta.source': 'simulate',
    }).sort({ updatedAt: -1 });

    if (!session) {
      return res.json({ session: null, conversation: null, currentNode: null, events: [], profile: null, persona: null });
    }

    const conversation = await Conversation.findById(session.conversationId);
    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(workspaceId),
    });
    const messages = conversation ? await loadPreviewMessages(conversation._id) : [];
    const selectedAutomation = (session.state as any)?.previewMeta?.selectedAutomation || null;

    return res.json({
      sessionId: session._id,
      conversationId: conversation?._id,
      status: session.status,
      messages,
      selectedAutomation,
      ...payload,
    });
  } catch (error) {
    console.error('Get simulate session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/simulate/reset', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, sessionId } = req.body || {};
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = sessionId
      ? await AutomationSession.findOne({
        _id: sessionId,
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        channel: 'preview',
      })
      : await AutomationSession.findOne({
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        channel: 'preview',
        'state.previewMeta.source': 'simulate',
      }).sort({ updatedAt: -1 });

    if (!session) {
      return res.json({ success: true });
    }

    const conversationId = session.conversationId;
    await AutomationSession.deleteOne({ _id: session._id });
    if (conversationId) {
      await Message.deleteMany({ conversationId });
      await Conversation.deleteOne({ _id: conversationId });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Reset simulate session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id).lean();
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [hydrated] = await hydrateInstances([instance]);
    res.json(hydrated);
  } catch (error) {
    console.error('Get automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, workspaceId, templateId, templateVersionId, userConfig, isActive } = req.body || {};

    if (!name || !workspaceId || (!templateId && !templateVersionId)) {
      return res.status(400).json({
        error: 'name, workspaceId, and templateId or templateVersionId are required',
      });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can create automations' });
    }

    const currentCount = await AutomationInstance.countDocuments({ workspaceId });
    const limitCheck = await assertWorkspaceLimit(workspaceId, 'automations', currentCount + 1);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: `Automation limit reached for this workspace (limit: ${limitCheck.limit})`,
      });
    }

    const resolved = await resolveTemplateVersion({ templateId, templateVersionId });
    if (!resolved) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instance = await AutomationInstance.create({
      name,
      description,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      templateId: resolved.templateId,
      templateVersionId: resolved.templateVersionId,
      userConfig: userConfig || {},
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.status(201).json(hydrated);
  } catch (error: any) {
    console.error('Create automation instance error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, userConfig, isActive, templateId, templateVersionId } = req.body || {};

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can update automations' });
    }

    if (templateId || templateVersionId) {
      const resolved = await resolveTemplateVersion({ templateId, templateVersionId });
      if (!resolved) {
        return res.status(400).json({ error: 'Template version not found or unpublished' });
      }
      instance.templateId = resolved.templateId;
      instance.templateVersionId = resolved.templateVersionId;
    }

    if (name !== undefined) instance.name = name;
    if (description !== undefined) instance.description = description;
    if (userConfig !== undefined) instance.userConfig = userConfig;
    if (isActive !== undefined) instance.isActive = Boolean(isActive);

    await instance.save();
    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.json(hydrated);
  } catch (error: any) {
    console.error('Update automation instance error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.patch('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    instance.isActive = !instance.isActive;
    await instance.save();
    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.json(hydrated);
  } catch (error) {
    console.error('Toggle automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(
      instance.workspaceId.toString(),
      req.userId!,
    );
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can delete automations' });
    }

    await AutomationInstance.findByIdAndDelete(id);
    res.json({ message: 'Automation instance deleted successfully' });
  } catch (error) {
    console.error('Delete automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/preview-profiles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const profiles = await AutomationPreviewProfile.find({ workspaceId: instance.workspaceId })
      .sort({ isDefault: -1, createdAt: -1 })
      .lean();

    res.json({ profiles });
  } catch (error) {
    console.error('Get preview profiles error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-profiles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const handle = normalizeHandle(typeof req.body?.handle === 'string' ? req.body.handle : undefined);
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : undefined;
    const avatarUrlRaw = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim() : '';
    const avatarUrl = avatarUrlRaw || undefined;
    const wantsDefault = Boolean(req.body?.isDefault);

    const existingDefault = await AutomationPreviewProfile.findOne({
      workspaceId: instance.workspaceId,
      isDefault: true,
    }).lean();
    const isDefault = wantsDefault || !existingDefault;

    const profile = await AutomationPreviewProfile.create({
      workspaceId: instance.workspaceId,
      name: name || 'Mock Tester',
      handle,
      userId,
      avatarUrl,
      isDefault,
    });

    if (isDefault) {
      await AutomationPreviewProfile.updateMany(
        { workspaceId: instance.workspaceId, _id: { $ne: profile._id } },
        { $set: { isDefault: false } },
      );
    }

    res.status(201).json({ profile });
  } catch (error) {
    console.error('Create preview profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/preview-profiles/:profileId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const profile = await AutomationPreviewProfile.findOne({
      _id: req.params.profileId,
      workspaceId: instance.workspaceId,
    });
    if (!profile) {
      return res.status(404).json({ error: 'Preview profile not found' });
    }

    if (typeof req.body?.name === 'string') {
      const trimmed = req.body.name.trim();
      if (trimmed) profile.name = trimmed;
    }
    if (req.body?.handle !== undefined) {
      profile.handle = normalizeHandle(typeof req.body.handle === 'string' ? req.body.handle : undefined);
    }
    if (req.body?.userId !== undefined) {
      profile.userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : undefined;
    }
    if (req.body?.avatarUrl !== undefined) {
      const avatarValue = typeof req.body.avatarUrl === 'string' ? req.body.avatarUrl.trim() : '';
      profile.avatarUrl = avatarValue || undefined;
    }

    await profile.save();
    res.json({ profile });
  } catch (error) {
    console.error('Update preview profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-profiles/:profileId/duplicate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const profile = await AutomationPreviewProfile.findOne({
      _id: req.params.profileId,
      workspaceId: instance.workspaceId,
    }).lean();
    if (!profile) {
      return res.status(404).json({ error: 'Preview profile not found' });
    }

    const duplicated = await AutomationPreviewProfile.create({
      workspaceId: instance.workspaceId,
      name: `${profile.name || 'Mock Tester'} Copy`,
      handle: profile.handle,
      userId: profile.userId,
      avatarUrl: profile.avatarUrl,
      isDefault: false,
    });

    res.status(201).json({ profile: duplicated });
  } catch (error) {
    console.error('Duplicate preview profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-profiles/:profileId/default', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const profile = await AutomationPreviewProfile.findOneAndUpdate(
      { _id: req.params.profileId, workspaceId: instance.workspaceId },
      { $set: { isDefault: true } },
      { new: true },
    );
    if (!profile) {
      return res.status(404).json({ error: 'Preview profile not found' });
    }

    await AutomationPreviewProfile.updateMany(
      { workspaceId: instance.workspaceId, _id: { $ne: profile._id } },
      { $set: { isDefault: false } },
    );

    res.json({ profile });
  } catch (error) {
    console.error('Set default preview profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/preview-profiles/:profileId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const profile = await AutomationPreviewProfile.findOneAndDelete({
      _id: req.params.profileId,
      workspaceId: instance.workspaceId,
    });
    if (!profile) {
      return res.status(404).json({ error: 'Preview profile not found' });
    }

    if (profile.isDefault) {
      const fallback = await AutomationPreviewProfile.findOne({ workspaceId: instance.workspaceId })
        .sort({ createdAt: -1 });
      if (fallback) {
        fallback.isDefault = true;
        await fallback.save();
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete preview profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session/persona', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const { sessionId, profileId, persona } = req.body || {};
    const session = sessionId
      ? await AutomationSession.findOne({ _id: sessionId, automationInstanceId: instance._id, channel: 'preview' })
      : await AutomationSession.findOne({ automationInstanceId: instance._id, channel: 'preview' })
        .sort({ updatedAt: -1 });
    if (!session) {
      return res.status(404).json({ error: 'Preview session not found' });
    }

    const conversation = await Conversation.findById(session.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Preview conversation not found' });
    }

    const resolvedProfile = profileId && mongoose.Types.ObjectId.isValid(profileId)
      ? await AutomationPreviewProfile.findOne({ _id: profileId, workspaceId: instance.workspaceId }).lean()
      : null;
    const resolvedPersona = normalizePersona(persona) || toPersonaFromProfile(resolvedProfile);
    if (!resolvedPersona) {
      return res.status(400).json({ error: 'Persona details are required' });
    }

    await applyPersonaToConversation(conversation, resolvedPersona);
    const meta = ensurePreviewMeta(session);
    if (!meta.source) {
      meta.source = 'preview';
    }
    meta.persona = resolvedPersona;
    if (resolvedProfile?._id) {
      meta.profileId = resolvedProfile._id.toString();
    }
    appendPreviewEvent(session, {
      type: 'info',
      message: 'Mock persona updated',
      createdAt: new Date(),
    });
    await session.save();

    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(instance.workspaceId.toString()),
    });
    res.json(payload);
  } catch (error) {
    console.error('Update preview persona error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reset, profileId, persona, sessionId } = req.body || {};
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await resolveLatestTemplateVersion({
      templateId: instance.templateId,
      fallbackVersionId: instance.templateVersionId,
    });
    if (!version) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instagramAccount = await InstagramAccount.findOne({ workspaceId: instance.workspaceId })
      .select('_id')
      .lean();
    if (!instagramAccount?._id) {
      return res.status(400).json({ error: 'Instagram account not connected for this workspace' });
    }

    const resolvedProfile = await resolvePreviewProfile(instance.workspaceId, profileId);
    const resolvedPersona = normalizePersona(persona) || toPersonaFromProfile(resolvedProfile);

    const { session, conversation } = await ensurePreviewSession({
      instance,
      templateVersionId: version._id,
      instagramAccountId: instagramAccount._id,
      reset: Boolean(reset),
      sessionId,
      persona: resolvedPersona,
      profileId: resolvedProfile?._id?.toString(),
    });
    const meta = ensurePreviewMeta(session);
    if (!meta.source) {
      meta.source = 'preview';
    }

    const messages = await loadPreviewMessages(conversation._id);
    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(instance.workspaceId.toString()),
    });
    return res.json({
      sessionId: session._id,
      conversationId: conversation._id,
      status: session.status,
      messages,
      ...payload,
    });
  } catch (error) {
    console.error('Create preview session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/preview-session/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const access = await loadInstanceWithAccess(req.params.id, req.userId!, res);
    if (!access) return;
    const { instance } = access;

    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const session = sessionId
      ? await AutomationSession.findOne({ _id: sessionId, automationInstanceId: instance._id, channel: 'preview' })
      : await AutomationSession.findOne({ automationInstanceId: instance._id, channel: 'preview' })
        .sort({ updatedAt: -1 });

    if (!session) {
      return res.json({ session: null, conversation: null, currentNode: null, events: [], profile: null, persona: null });
    }

    const conversation = await Conversation.findById(session.conversationId);
    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(instance.workspaceId.toString()),
    });
    res.json(payload);
  } catch (error) {
    console.error('Get preview session status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session/pause', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId, reason } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = await AutomationSession.findOne({
      _id: sessionId,
      automationInstanceId: instance._id,
      channel: 'preview',
    });
    if (!session) {
      return res.status(404).json({ error: 'Preview session not found' });
    }

    session.status = 'paused';
    session.pausedAt = new Date();
    session.pauseReason = typeof reason === 'string' ? reason : 'Paused by admin';
    await session.save();

    return res.json({ session });
  } catch (error) {
    console.error('Pause preview session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId, reason } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const session = await AutomationSession.findOne({
      _id: sessionId,
      automationInstanceId: instance._id,
      channel: 'preview',
    });
    if (!session) {
      return res.status(404).json({ error: 'Preview session not found' });
    }

    session.status = 'completed';
    session.state = {};
    session.pauseReason = typeof reason === 'string' ? reason : undefined;
    await session.save();

    return res.json({ session });
  } catch (error) {
    console.error('Stop preview session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session/message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, sessionId, profileId, persona } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await resolveLatestTemplateVersion({
      templateId: instance.templateId,
      fallbackVersionId: instance.templateVersionId,
    });
    if (!version) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instagramAccount = await InstagramAccount.findOne({ workspaceId: instance.workspaceId })
      .select('_id')
      .lean();
    if (!instagramAccount?._id) {
      return res.status(400).json({ error: 'Instagram account not connected for this workspace' });
    }

    let resolvedProfile: any = null;
    let resolvedPersona: PreviewPersona | null = null;
    let resolvedProfileId: string | undefined;
    if (profileId || persona) {
      if (profileId && mongoose.Types.ObjectId.isValid(profileId)) {
        resolvedProfile = await AutomationPreviewProfile.findOne({
          _id: profileId,
          workspaceId: instance.workspaceId,
        }).lean();
      }
      resolvedPersona = normalizePersona(persona) || toPersonaFromProfile(resolvedProfile);
      resolvedProfileId = resolvedProfile?._id?.toString();
    }

    const { session, conversation } = await ensurePreviewSession({
      instance,
      templateVersionId: version._id,
      instagramAccountId: instagramAccount._id,
      sessionId,
      persona: resolvedPersona,
      profileId: resolvedProfileId,
    });
    const meta = ensurePreviewMeta(session);
    if (!meta.source) {
      meta.source = 'preview';
    }

    const previousVars = session.state?.vars && typeof session.state.vars === 'object'
      ? { ...session.state.vars }
      : {};
    const previousTags = Array.isArray(conversation.tags) ? [...conversation.tags] : [];

    const trimmedText = text.trim();
    const customerMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId: conversation.workspaceId,
      text: trimmedText,
      from: 'customer',
      platform: 'mock',
    });

    conversation.lastMessage = customerMessage.text;
    conversation.lastMessageAt = customerMessage.createdAt;
    conversation.lastCustomerMessageAt = customerMessage.createdAt;
    await conversation.save();

    const result = await executePreviewFlowForInstance({
      instance,
      session,
      conversation,
      messageText: trimmedText,
    });

    const nextVars = session.state?.vars && typeof session.state.vars === 'object'
      ? session.state.vars
      : {};
    const nextTags = Array.isArray(conversation.tags) ? conversation.tags : [];

    const stringifyValue = (value: any) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const isValueEmpty = (value: any) => value === null || value === undefined || value === '';
    const keys = new Set([...Object.keys(previousVars), ...Object.keys(nextVars)]);
    keys.forEach((key) => {
      const prevVal = previousVars[key];
      const nextVal = nextVars[key];
      const prevEmpty = isValueEmpty(prevVal);
      const nextEmpty = isValueEmpty(nextVal);
      if (!nextEmpty && (prevEmpty || stringifyValue(prevVal) !== stringifyValue(nextVal))) {
        appendPreviewEvent(session, {
          type: 'field_update',
          message: `Field updated: ${key} = ${stringifyValue(nextVal)}`,
          createdAt: new Date(),
          details: { key, value: nextVal },
        });
      } else if (nextEmpty && !prevEmpty) {
        appendPreviewEvent(session, {
          type: 'field_clear',
          message: `Field cleared: ${key}`,
          createdAt: new Date(),
          details: { key },
        });
      }
    });

    const previousTagSet = new Set(previousTags.map((tag) => String(tag)));
    const nextTagSet = new Set(nextTags.map((tag) => String(tag)));
    nextTagSet.forEach((tag) => {
      if (!previousTagSet.has(tag)) {
        appendPreviewEvent(session, {
          type: 'tag_added',
          message: `Tag added: ${tag}`,
          createdAt: new Date(),
          details: { tag },
        });
      }
    });
    previousTagSet.forEach((tag) => {
      if (!nextTagSet.has(tag)) {
        appendPreviewEvent(session, {
          type: 'tag_removed',
          message: `Tag removed: ${tag}`,
          createdAt: new Date(),
          details: { tag },
        });
      }
    });

    if (!result.success) {
      appendPreviewEvent(session, {
        type: 'error',
        message: result.error || 'Flow execution failed',
        createdAt: new Date(),
      });
    }

    await session.save();
    const payload = await buildPreviewSessionPayload(session, conversation, {
      includeEvents: await canViewExecutionTimeline(instance.workspaceId.toString()),
    });
    return res.json({
      success: result.success,
      error: result.error,
      sessionId: session._id,
      messages: result.messages,
      ...payload,
    });
  } catch (error) {
    console.error('Send preview message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
