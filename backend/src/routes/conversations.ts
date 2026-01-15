import express, { Response } from 'express';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Escalation from '../models/Escalation';
import AutomationSession from '../models/AutomationSession';
import AutomationInstance from '../models/AutomationInstance';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

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

  const previewCandidate = node.text
    ?? node.message
    ?? node.agentSystemPrompt
    ?? node.langchainSystemPrompt
    ?? node.handoff?.message
    ?? node.handoff?.summary;
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
    if (typeof node.burstBufferSeconds === 'number' && node.burstBufferSeconds > 0) {
      add('Reply buffer', `${node.burstBufferSeconds}s`);
    }
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
    if (typeof node.burstBufferSeconds === 'number' && node.burstBufferSeconds > 0) {
      add('Reply buffer', `${node.burstBufferSeconds}s`);
    }
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
  } else if (nodeType === 'langchain_agent') {
    const tools = Array.isArray(node.langchainTools) ? node.langchainTools.filter((tool: any) => tool?.name) : [];
    if (tools.length > 0) add('Tools', `${tools.length}`);
    add('End condition', truncateText(node.langchainEndCondition, 120));
    add('Stop condition', truncateText(node.langchainStopCondition, 120));
    if (typeof node.langchainMaxIterations === 'number') add('Max iterations', `${node.langchainMaxIterations}`);
    if (typeof node.langchainToolChoice === 'string') add('Tool choice', node.langchainToolChoice);
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

// Get all conversations for a workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace (owner or member)
    const { hasAccess, workspace } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess || !workspace) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const conversations = await Conversation.find({ workspaceId, platform: { $ne: 'mock' } })
      .sort({ lastMessageAt: -1 });
    const conversationIds = conversations.map((conv) => conv._id);
    const [activeEscalations, activeHandoffs] = await Promise.all([
      Escalation.find({
        conversationId: { $in: conversationIds },
        status: { $in: ['pending', 'in_progress'] },
      })
        .select('conversationId reason createdAt')
        .lean(),
      AutomationSession.find({
        conversationId: { $in: conversationIds },
        status: 'handoff',
      })
        .select('conversationId')
        .lean(),
    ]);
    const escalationByConversationId = new Map(
      activeEscalations.map((escalation) => [escalation.conversationId.toString(), escalation])
    );
    const handoffConversationIds = new Set(
      activeHandoffs.map((session) => session.conversationId.toString())
    );

    const normalizeId = (value: unknown): string | undefined => {
      if (!value) return undefined;
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        const obj = value as { _id?: unknown };
        if (obj && obj._id) return obj._id.toString();
        if ('toString' in (obj || {}) && typeof (obj as any).toString === 'function') {
          return (obj as any).toString();
        }
      }
      if (typeof value === 'number' || typeof value === 'bigint') return String(value);
      return undefined;
    };

    // Get last message for each conversation
    const conversationsWithLastMessage = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await Message.findOne({ conversationId: conv._id })
          .sort({ createdAt: -1 })
          .limit(1);

        const convObj = conv.toObject();
        const conversationId = conv._id.toString();
        const activeEscalation = escalationByConversationId.get(conversationId);
        const isHandoff = handoffConversationIds.has(conversationId);
        const isEscalated = Boolean(activeEscalation) || isHandoff;
        return {
          ...convObj,
          instagramAccountId: normalizeId(convObj.instagramAccountId),
          humanRequired: isEscalated,
          humanRequiredReason: isEscalated
            ? activeEscalation?.reason || convObj.humanRequiredReason
            : undefined,
          humanTriggeredAt: isEscalated
            ? activeEscalation?.createdAt || convObj.humanTriggeredAt
            : undefined,
          humanHoldUntil: isEscalated ? convObj.humanHoldUntil : undefined,
          lastMessage: lastMessage ? lastMessage.text : '',
          isSynced: true, // Local conversations are synced
        };
      })
    );

    res.json(conversationsWithLastMessage);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resolve / clear human escalation for a conversation
router.post('/:id/resolve-escalation', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    conversation.humanRequired = false;
    conversation.humanRequiredReason = undefined;
    conversation.humanTriggeredAt = undefined;
    conversation.humanTriggeredByMessageId = undefined;
    conversation.humanHoldUntil = undefined;
    await conversation.save();

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Resolve escalation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get human-required conversations for a workspace
router.get('/escalations/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const conversations = await Conversation.find({
      workspaceId,
      humanRequired: true,
    })
      .sort({ humanTriggeredAt: -1 })
      .limit(50);

    const payload = await Promise.all(conversations.map(async (conv) => {
      const recentMessages = await Message.find({ conversationId: conv._id })
        .sort({ createdAt: -1 })
        .limit(10);

      const lastEscalation = await Message.findOne({
        conversationId: conv._id,
        aiShouldEscalate: true,
      }).sort({ createdAt: -1 });

      return {
        conversation: conv,
        recentMessages: recentMessages.reverse(),
        lastEscalation,
        humanRequiredReason: conv.humanRequiredReason,
        humanHoldUntil: conv.humanHoldUntil,
        humanTriggeredAt: conv.humanTriggeredAt,
      };
    }));

    res.json(payload);
  } catch (error) {
    console.error('Get escalations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get active automation session for a conversation
router.get('/:id/automation-session', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const session = await AutomationSession.findOne({
      conversationId: conversation._id,
      status: { $in: ['active', 'paused', 'handoff'] },
    }).sort({ updatedAt: -1 }).lean();

    if (!session) {
      return res.json({ data: { session: null } });
    }

    const [instance, template, versionDoc] = await Promise.all([
      AutomationInstance.findById(session.automationInstanceId).select('name').lean(),
      FlowTemplate.findById(session.templateId).select('name').lean(),
      FlowTemplateVersion.findById(session.templateVersionId)
        .select('version versionLabel compiled dslSnapshot')
        .lean(),
    ]);

    const version = versionDoc
      ? { _id: versionDoc._id, version: versionDoc.version, versionLabel: versionDoc.versionLabel }
      : null;
    const nodeId = session.state?.nodeId || session.state?.agent?.nodeId || session.state?.langchainAgent?.nodeId;
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
    const currentNode = node
      ? buildNodeSummary(node, {
        fallbackId,
        label: nodeLabel,
        edges: Array.isArray(compiledGraph?.edges) ? compiledGraph.edges : [],
      })
      : null;

    res.json({
      data: {
        session,
        instance: instance ? { _id: instance._id, name: instance.name } : null,
        template: template ? { _id: template._id, name: template.name } : null,
        version,
        currentNode,
      },
    });
  } catch (error) {
    console.error('Get automation session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Pause the active automation session for a conversation
router.post('/:id/automation-session/pause', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const session = await AutomationSession.findOne({
      conversationId: conversation._id,
      status: 'active',
    }).sort({ updatedAt: -1 });

    if (!session) {
      return res.status(404).json({ error: 'No active automation session found' });
    }

    session.status = 'paused';
    session.pausedAt = new Date();
    session.pauseReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'manual_pause';
    await session.save();

    res.json({ data: { session } });
  } catch (error) {
    console.error('Pause automation session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Stop (complete) the current automation session for a conversation
router.post('/:id/automation-session/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const session = await AutomationSession.findOne({
      conversationId: conversation._id,
      status: { $in: ['active', 'paused', 'handoff'] },
    }).sort({ updatedAt: -1 });

    if (!session) {
      return res.status(404).json({ error: 'No active automation session found' });
    }

    session.status = 'completed';
    session.state = {};
    if (typeof req.body?.reason === 'string' && req.body.reason.trim()) {
      session.pauseReason = req.body.reason.trim();
    }
    await session.save();

    res.json({ data: { session } });
  } catch (error) {
    console.error('Stop automation session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get conversation by ID
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await Conversation.findById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(
      conversation.workspaceId.toString(),
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
