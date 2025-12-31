import {
  DEFAULT_TRIGGER_TYPE,
  FLOW_NODE_LABELS,
  TRIGGER_METADATA,
} from './constants'
import type {
  DraftForm,
  FieldForm,
  FlowButton,
  FlowEdge,
  FlowField,
  FlowNode,
  FlowNodeData,
  FlowNodeType,
  FlowTrigger,
  FlowTriggerConfig,
  TriggerForm,
  TriggerType,
} from './types'

export const formatJson = (value: any) => {
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

export const formatDefaultValue = (value: any, type: FlowField['type']) => {
  if (type === 'boolean') return Boolean(value)
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return formatJson(value)
}

export const parseOptionsText = (text: string) => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines
    .map((line) => {
      const [labelPart, valuePart] = line.includes('|') ? line.split('|') : line.split(':')
      const label = (labelPart || '').trim()
      const value = (valuePart || labelPart || '').trim()
      return { label: label || value, value }
    })
    .filter((option) => option.value)
}

export const parseDefaultValue = (field: FieldForm) => {
  const raw = field.defaultValue
  if (raw === '' || raw === undefined || raw === null) return undefined
  if (field.type === 'boolean') return Boolean(raw)
  if (field.type === 'number') {
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return undefined
    return parsed
  }
  if (field.type === 'json') {
    if (typeof raw !== 'string') return raw
    return JSON.parse(raw)
  }
  if (field.type === 'multi_select') {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      return JSON.parse(raw)
    }
    return String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return raw
}

export const formatButtonList = (buttons?: FlowButton[]) => {
  if (!buttons || buttons.length === 0) return ''
  return buttons
    .map((button) => (button.payload ? `${button.title}|${button.payload}` : button.title))
    .join('\n')
}

export const parseButtonList = (value: string): FlowButton[] => {
  if (!value.trim()) return []
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [titlePart, payloadPart] = line.includes('|') ? line.split('|') : line.split(':')
      const title = (titlePart || '').trim()
      const payload = payloadPart ? payloadPart.trim() : undefined
      return title ? { title, payload } : null
    })
    .filter(Boolean) as FlowButton[]
}

export const formatTags = (tags?: string[]) => (tags || []).join(', ')

export const parseTags = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const formatKeywordList = (keywords?: string[]) => (keywords || []).join(', ')

export const parseKeywordList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const formatKnowledgeIds = (ids?: string[]) => (ids || []).join(', ')

export const parseKnowledgeIds = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

export const parseOptionalNumber = (value: string) => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const normalizeTriggerConfig = (config?: FlowTriggerConfig) => {
  if (!config) return undefined
  const keywords = Array.isArray(config.keywords) ? config.keywords.filter(Boolean) : []
  const excludeKeywords = Array.isArray(config.excludeKeywords) ? config.excludeKeywords.filter(Boolean) : []
  const intentText = config.intentText?.trim()
  const output: FlowTriggerConfig = {}

  if (config.triggerMode) output.triggerMode = config.triggerMode
  if (config.keywordMatch) output.keywordMatch = config.keywordMatch
  if (keywords.length > 0) output.keywords = keywords
  if (excludeKeywords.length > 0) output.excludeKeywords = excludeKeywords
  if (intentText) output.intentText = intentText

  return Object.keys(output).length > 0 ? output : undefined
}

export const buildNodeSubtitle = (node: FlowNode) => {
  if (node.type === 'send_message') {
    const text = node.text || node.message || ''
    return text ? text.slice(0, 80) : 'No message yet'
  }
  if (node.type === 'trigger') {
    const triggerType = node.triggerType || DEFAULT_TRIGGER_TYPE
    const meta = TRIGGER_METADATA[triggerType]
    return node.triggerDescription?.trim() || meta?.description || 'Entry trigger for this flow'
  }
  if (node.type === 'detect_intent') {
    return 'Detects intent from the latest message'
  }
  if (node.type === 'ai_reply') {
    const details = []
    if (node.aiSettings?.model) details.push(`Model: ${node.aiSettings.model}`)
    if (node.aiSettings?.tone) details.push(`Tone: ${node.aiSettings.tone}`)
    if (node.aiSettings?.historyLimit) {
      details.push(`History: ${node.aiSettings.historyLimit}`)
    }
    if (node.aiSettings?.ragEnabled === false) {
      details.push('RAG: off')
    }
    if (node.aiSettings?.maxOutputTokens) {
      details.push(`Max tokens: ${node.aiSettings.maxOutputTokens}`)
    }
    return details.length > 0 ? details.join(' · ') : 'Uses AI defaults'
  }
  if (node.type === 'ai_agent') {
    const details = []
    const stepCount = Array.isArray(node.agentSteps) ? node.agentSteps.filter(Boolean).length : 0
    if (stepCount > 0) details.push(`Steps: ${stepCount}`)
    if (node.agentEndCondition?.trim()) details.push('End condition set')
    if (typeof node.agentMaxQuestions === 'number') details.push(`Max Q: ${node.agentMaxQuestions}`)
    const slotCount = Array.isArray(node.agentSlots) ? node.agentSlots.filter((slot) => slot?.key).length : 0
    if (slotCount > 0) details.push(`Slots: ${slotCount}`)
    if (node.aiSettings?.model) details.push(`Model: ${node.aiSettings.model}`)
    return details.length > 0 ? details.join(' · ') : 'Configure agent steps'
  }
  if (node.type === 'handoff') {
    return node.handoff?.topic ? `Topic: ${node.handoff.topic}` : 'No topic set'
  }
  if (node.type === 'router') {
    return node.routing?.matchMode === 'all'
      ? 'Routes to all matching branches'
      : 'Routes to the first matching branch'
  }
  return ''
}

export const buildNodeData = (node: FlowNode): FlowNodeData => ({
  label: node.data?.label || FLOW_NODE_LABELS[node.type] || 'Node',
  subtitle: buildNodeSubtitle(node),
  isStart: node.data?.isStart,
  branchTag: node.data?.branchTag,
})

export const normalizeFlowNode = (node: any, index: number): FlowNode => {
  const id = node?.id || `node-${index + 1}`
  const rawType = node?.type as FlowNodeType | undefined
  const type = rawType && FLOW_NODE_LABELS[rawType] ? rawType : 'send_message'
  const triggerTypeCandidate = node?.triggerType as TriggerType | undefined
  const triggerType = triggerTypeCandidate && TRIGGER_METADATA[triggerTypeCandidate]
    ? triggerTypeCandidate
    : undefined
  const position = node?.position || { x: 120 + index * 60, y: 80 + index * 40 }
  const normalized: FlowNode = {
    id,
    type,
    position,
    data: {
      ...(node?.data || {}),
      label: node?.data?.label || node?.label || FLOW_NODE_LABELS[type] || 'Node',
    },
    triggerType: type === 'trigger' ? triggerType || DEFAULT_TRIGGER_TYPE : undefined,
    triggerDescription: typeof node?.triggerDescription === 'string' ? node.triggerDescription : undefined,
    triggerConfig: node?.triggerConfig ?? node?.data?.triggerConfig,
    intentSettings: node?.intentSettings ?? node?.data?.intentSettings,
    logEnabled: typeof node?.logEnabled === 'boolean'
      ? node.logEnabled
      : typeof node?.data?.logEnabled === 'boolean'
        ? node.data.logEnabled
        : undefined,
    text: node?.text,
    message: node?.message,
    buttons: node?.buttons,
    tags: node?.tags,
    aiSettings: node?.aiSettings,
    agentSystemPrompt: node?.agentSystemPrompt ?? node?.data?.agentSystemPrompt,
    agentSteps: node?.agentSteps ?? node?.data?.agentSteps,
    agentEndCondition: node?.agentEndCondition ?? node?.data?.agentEndCondition,
    agentStopCondition: node?.agentStopCondition ?? node?.data?.agentStopCondition,
    agentMaxQuestions: node?.agentMaxQuestions ?? node?.data?.agentMaxQuestions,
    agentSlots: node?.agentSlots ?? node?.data?.agentSlots,
    knowledgeItemIds: node?.knowledgeItemIds,
    handoff: node?.handoff,
    waitForReply: node?.waitForReply,
    routing: node?.routing ?? node?.data?.routing,
  }
  normalized.data = buildNodeData(normalized)
  return normalized
}

export const normalizeFlowEdge = (edge: any, index: number): FlowEdge | null => {
  if (!edge?.source || !edge?.target) {
    return null
  }
  return {
    id: edge?.id || `edge-${index + 1}-${edge?.source}-${edge?.target}`,
    source: edge.source,
    target: edge.target,
    type: edge?.type || 'smoothstep',
    label: edge?.label,
    condition: edge?.condition,
    order: edge?.order,
  }
}

export const parseFlowDsl = (dsl: any): { nodes: FlowNode[]; edges: FlowEdge[]; startNodeId: string } => {
  const base = dsl && typeof dsl === 'object' ? dsl : { nodes: [], edges: [] }
  const nodes = Array.isArray(base.nodes) ? base.nodes.map(normalizeFlowNode) : []
  const edges = Array.isArray(base.edges)
    ? base.edges.map(normalizeFlowEdge).filter(Boolean) as FlowEdge[]
    : []
  const startNodeId = typeof base.startNodeId === 'string'
    ? base.startNodeId
    : nodes[0]?.id || ''
  return { nodes, edges, startNodeId }
}

export const buildFlowDsl = (nodes: FlowNode[], edges: FlowEdge[], startNodeId?: string) => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: (() => {
      const data = { ...(node.data || {}) } as Record<string, any>
      delete data.branchTag
      return data
    })(),
    triggerType: node.triggerType,
    triggerDescription: node.triggerDescription,
    triggerConfig: node.triggerConfig,
    intentSettings: node.intentSettings,
    logEnabled: node.logEnabled,
    text: node.text,
    message: node.message,
    buttons: node.buttons,
    tags: node.tags,
    aiSettings: node.aiSettings,
    agentSystemPrompt: node.agentSystemPrompt,
    agentSteps: node.agentSteps,
    agentEndCondition: node.agentEndCondition,
    agentStopCondition: node.agentStopCondition,
    agentMaxQuestions: node.agentMaxQuestions,
    agentSlots: node.agentSlots,
    knowledgeItemIds: node.knowledgeItemIds,
    handoff: node.handoff,
    waitForReply: node.waitForReply,
    routing: node.routing,
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    label: edge.label,
    condition: edge.condition,
    order: edge.order,
  })),
  ...(startNodeId ? { startNodeId } : {}),
})

export const buildEmptyDraftForm = (): DraftForm => ({
  name: '',
  description: '',
  status: 'draft',
  templateId: '',
  dslText: '{\n  "nodes": [],\n  "edges": []\n}',
  triggers: [],
  fields: [],
  display: {
    outcome: '',
    goal: '',
    industry: '',
    setupTime: '',
    collectsText: '',
    icon: '',
    previewText: '',
  },
})

export const buildFieldForm = (field?: FlowField): FieldForm => ({
  id: `${Date.now()}-${Math.random()}`,
  key: field?.key || '',
  label: field?.label || '',
  type: field?.type || 'string',
  description: field?.description || '',
  required: Boolean(field?.required),
  defaultValue: formatDefaultValue(field?.defaultValue, field?.type || 'string'),
  optionsText: (field?.options || [])
    .map((option) => `${option.label}|${option.value}`)
    .join('\n'),
  uiGroup: field?.ui?.group || '',
  uiOrder: field?.ui?.order !== undefined ? String(field.ui.order) : '',
  uiPlaceholder: field?.ui?.placeholder || '',
  uiHelpText: field?.ui?.helpText || '',
  validationMin: field?.validation?.min !== undefined ? String(field.validation.min) : '',
  validationMax: field?.validation?.max !== undefined ? String(field.validation.max) : '',
  validationPattern: field?.validation?.pattern || '',
  sourceNodeId: field?.source?.nodeId || '',
  sourcePath: field?.source?.path || '',
})

export const buildTriggerForm = (trigger?: FlowTrigger): TriggerForm => ({
  id: `${Date.now()}-${Math.random()}`,
  type: trigger?.type || 'dm_message',
  label: trigger?.label || '',
  description: trigger?.description || '',
  configText: formatJson(trigger?.config),
})
