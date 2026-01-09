import { AutomationAiSettings, AutomationRateLimit } from '../types/automation';
import { CompiledFlow, FlowDsl } from '../types/flow';

type CompileMeta = {
  name: string;
  version: number;
};

type FlowRuntimeStep = {
  id?: string;
  type?: string;
  text?: string;
  message?: string;
  buttons?: Array<{ title: string; payload?: string } | string>;
  tags?: string[];
  aiSettings?: AutomationAiSettings;
  messageHistory?: Array<{ from: string; text?: string; attachments?: any[]; createdAt?: string | Date }>;
  agentSystemPrompt?: string;
  agentSteps?: string[];
  agentEndCondition?: string;
  agentStopCondition?: string;
  agentMaxQuestions?: number;
  agentSlots?: Array<{ key: string; question?: string; defaultValue?: string }>;
  intentSettings?: {
    model?: string;
    temperature?: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  };
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
  routing?: {
    matchMode?: 'first' | 'all';
    defaultTarget?: string;
  };
};

type FlowRuntimeEdge = {
  from: string;
  to: string;
  condition?: Record<string, any>;
  order?: number;
  isDefault?: boolean;
};

type FlowCompileIssue = {
  code: string;
  message: string;
  nodeId?: string;
};

type FlowCompileDetails = {
  errors: FlowCompileIssue[];
  warnings: FlowCompileIssue[];
};

class FlowCompilerError extends Error {
  details: FlowCompileDetails;

  constructor(message: string, details: FlowCompileDetails) {
    super(message);
    this.name = 'FlowCompilerError';
    this.details = details;
  }
}

const normalizeText = (node: Record<string, any>) =>
  node.text ?? node.message ?? node.data?.text ?? node.data?.message;

const normalizeButtons = (node: Record<string, any>) => node.buttons ?? node.data?.buttons;

const normalizeTags = (node: Record<string, any>) => node.tags ?? node.data?.tags;

const normalizeAiSettings = (node: Record<string, any>) => node.aiSettings ?? node.data?.aiSettings;
const normalizeIntentSettings = (node: Record<string, any>) =>
  node.intentSettings ?? node.data?.intentSettings;
const normalizeAgentSystemPrompt = (node: Record<string, any>) =>
  node.agentSystemPrompt ?? node.data?.agentSystemPrompt;
const normalizeAgentSteps = (node: Record<string, any>) =>
  node.agentSteps ?? node.data?.agentSteps;
const normalizeAgentEndCondition = (node: Record<string, any>) =>
  node.agentEndCondition ?? node.data?.agentEndCondition;
const normalizeAgentStopCondition = (node: Record<string, any>) =>
  node.agentStopCondition ?? node.data?.agentStopCondition;
const normalizeAgentMaxQuestions = (node: Record<string, any>) =>
  node.agentMaxQuestions ?? node.data?.agentMaxQuestions;
const normalizeAgentSlots = (node: Record<string, any>) =>
  node.agentSlots ?? node.data?.agentSlots;

const normalizeKnowledgeItemIds = (node: Record<string, any>) =>
  node.knowledgeItemIds ?? node.data?.knowledgeItemIds;
const normalizeMessageHistory = (node: Record<string, any>) =>
  node.messageHistory ?? node.data?.messageHistory;

const normalizeWaitForReply = (node: Record<string, any>) =>
  node.waitForReply ?? node.data?.waitForReply;

const normalizeHandoff = (node: Record<string, any>) => node.handoff ?? node.data?.handoff;

const normalizeRateLimit = (node: Record<string, any>) => node.rateLimit ?? node.data?.rateLimit;

const normalizeNext = (node: Record<string, any>) => node.next ?? node.data?.next;

const normalizeLogEnabled = (node: Record<string, any>) => {
  if (typeof node.logEnabled === 'boolean') return node.logEnabled;
  if (typeof node.data?.logEnabled === 'boolean') return node.data.logEnabled;
  return undefined;
};

const normalizeRouting = (node: Record<string, any>) => node.routing ?? node.data?.routing;

const normalizeType = (node: Record<string, any>) =>
  typeof node.type === 'string'
    ? node.type
    : typeof node.nodeType === 'string'
      ? node.nodeType
      : '';

const normalizeId = (node: Record<string, any>) =>
  typeof node.id === 'string'
    ? node.id
    : typeof node.nodeId === 'string'
      ? node.nodeId
      : '';

export function compileFlow(dsl: FlowDsl): CompiledFlow {
  if (!dsl || typeof dsl !== 'object') {
    throw new Error('Invalid flow DSL');
  }

  const compiler: CompileMeta = {
    name: 'runtime_graph',
    version: 2,
  };

  const warnings: FlowCompileIssue[] = [];
  const errors: FlowCompileIssue[] = [];

  const rawNodes = Array.isArray(dsl.nodes)
    ? dsl.nodes
    : Array.isArray(dsl.steps)
      ? dsl.steps
      : null;

  if (!rawNodes) {
    errors.push({
      code: 'missing_nodes',
      message: 'dsl.nodes must be an array',
    });
  }

  if (dsl.edges !== undefined && !Array.isArray(dsl.edges)) {
    errors.push({
      code: 'invalid_edges',
      message: 'dsl.edges must be an array when provided',
    });
  }

  if (errors.length > 0) {
    throw new FlowCompilerError('Invalid flow DSL', { errors, warnings });
  }

  if (!Array.isArray(dsl.nodes) && Array.isArray(dsl.steps)) {
    warnings.push({
      code: 'deprecated_steps',
      message: 'dsl.steps is deprecated; use dsl.nodes instead',
    });
  }

  const normalizedNodes: FlowRuntimeStep[] = [];
  const nodeIds = new Set<string>();
  const nodeTypeById = new Map<string, string>();
  const nodeYById = new Map<string, number>();

  rawNodes?.forEach((node: any, index: number) => {
    if (!node || typeof node !== 'object') {
      warnings.push({
        code: 'invalid_node',
        message: `Node at index ${index} is not an object`,
      });
      return;
    }

    const id = normalizeId(node);
    if (!id) {
      warnings.push({
        code: 'missing_node_id',
        message: `Node at index ${index} is missing an id`,
      });
      return;
    }

    if (nodeIds.has(id)) {
      warnings.push({
        code: 'duplicate_node_id',
        message: `Node id "${id}" is duplicated`,
        nodeId: id,
      });
      return;
    }

    const type = normalizeType(node);
    if (!type) {
      warnings.push({
        code: 'missing_node_type',
        message: `Node "${id}" is missing a type`,
        nodeId: id,
      });
      return;
    }

    const text = normalizeText(node);
    const message = node.message ?? node.data?.message;
    const buttons = normalizeButtons(node);
    const tags = normalizeTags(node);
    const aiSettings = normalizeAiSettings(node);
    const agentSystemPrompt = normalizeAgentSystemPrompt(node);
    const agentSteps = normalizeAgentSteps(node);
    const agentEndCondition = normalizeAgentEndCondition(node);
    const agentStopCondition = normalizeAgentStopCondition(node);
    const agentMaxQuestions = normalizeAgentMaxQuestions(node);
    const agentSlots = normalizeAgentSlots(node);
    const intentSettings = normalizeIntentSettings(node);
    const knowledgeItemIds = normalizeKnowledgeItemIds(node);
    const messageHistory = normalizeMessageHistory(node);
    const waitForReply = normalizeWaitForReply(node);
    const handoff = normalizeHandoff(node);
    const rateLimit = normalizeRateLimit(node);
    const next = normalizeNext(node);
    const logEnabled = normalizeLogEnabled(node);
    const routing = normalizeRouting(node);

    if (type.toLowerCase() === 'send_message' && !text && !message) {
      warnings.push({
        code: 'missing_message_text',
        message: `Node "${id}" is missing message text`,
        nodeId: id,
      });
      return;
    }

    nodeIds.add(id);
    nodeTypeById.set(id, type.toLowerCase());
    if (typeof node.position?.y === 'number') {
      nodeYById.set(id, node.position.y);
    }
    normalizedNodes.push({
      id,
      type,
      text,
      message,
      buttons,
      tags,
      aiSettings,
      messageHistory: Array.isArray(messageHistory) ? messageHistory : undefined,
      agentSystemPrompt: typeof agentSystemPrompt === 'string' ? agentSystemPrompt : undefined,
      agentSteps: Array.isArray(agentSteps)
        ? agentSteps.filter((step) => typeof step === 'string' && step.trim())
        : undefined,
      agentEndCondition: typeof agentEndCondition === 'string' ? agentEndCondition : undefined,
      agentStopCondition: typeof agentStopCondition === 'string' ? agentStopCondition : undefined,
      agentMaxQuestions: typeof agentMaxQuestions === 'number' ? agentMaxQuestions : undefined,
      agentSlots: Array.isArray(agentSlots)
        ? agentSlots
          .map((slot: any) => ({
            key: typeof slot?.key === 'string' ? slot.key.trim() : '',
            question: typeof slot?.question === 'string' ? slot.question.trim() : undefined,
            defaultValue: typeof slot?.defaultValue === 'string' ? slot.defaultValue.trim() : undefined,
          }))
          .filter((slot: any) => slot.key)
        : undefined,
      intentSettings,
      knowledgeItemIds,
      waitForReply,
      next,
      logEnabled,
      handoff,
      rateLimit,
      routing,
    });
  });

  const normalizedEdges: FlowRuntimeEdge[] = [];
  (dsl.edges || []).forEach((edge: any, index: number) => {
    if (!edge || typeof edge !== 'object') {
      warnings.push({
        code: 'invalid_edge',
        message: `Edge at index ${index} is not an object`,
      });
      return;
    }

    const from = typeof edge.from === 'string'
      ? edge.from
      : typeof edge.source === 'string'
        ? edge.source
        : '';
    const to = typeof edge.to === 'string'
      ? edge.to
      : typeof edge.target === 'string'
        ? edge.target
        : '';

    if (!from || !to) {
      warnings.push({
        code: 'missing_edge_connection',
        message: `Edge at index ${index} is missing source/target`,
      });
      return;
    }

    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      warnings.push({
        code: 'edge_node_missing',
        message: `Edge at index ${index} references unknown nodes`,
      });
      return;
    }

    const rawCondition = (edge.condition ?? edge.data?.condition) as Record<string, any> | undefined;
    const isDefault = Boolean(edge.isDefault || edge.default || edge.data?.isDefault || edge.data?.default);
    const order = typeof edge.order === 'number'
      ? edge.order
      : (nodeTypeById.get(from) === 'router' ? nodeYById.get(to) : undefined);

    normalizedEdges.push({
      from,
      to,
      condition: rawCondition,
      order,
      isDefault: isDefault || undefined,
    });
  });

  let startNodeId = typeof dsl.startNodeId === 'string' ? dsl.startNodeId : undefined;
  if (!startNodeId && typeof dsl.start === 'string') {
    startNodeId = dsl.start;
  }
  if (!startNodeId || !nodeIds.has(startNodeId)) {
    const fallbackId = normalizedNodes[0]?.id;
    if (fallbackId) {
      warnings.push({
        code: 'start_node_fallback',
        message: 'startNodeId missing or invalid; falling back to first node',
        nodeId: fallbackId,
      });
      startNodeId = fallbackId;
    } else {
      errors.push({
        code: 'missing_start_node',
        message: 'No valid nodes available to determine startNodeId',
      });
    }
  }

  if (errors.length > 0) {
    throw new FlowCompilerError('Invalid flow DSL', { errors, warnings });
  }

  const graph = {
    nodes: normalizedNodes,
    edges: normalizedEdges,
    startNodeId,
    rateLimit: dsl.rateLimit,
    aiSettings: dsl.aiSettings,
  };

  return {
    compiler,
    compiledAt: new Date().toISOString(),
    graph,
    warnings,
  };
}
