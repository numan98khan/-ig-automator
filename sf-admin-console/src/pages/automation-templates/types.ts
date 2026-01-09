import type { Edge, Node } from '@xyflow/react'

export type TriggerType =
  | 'post_comment'
  | 'story_reply'
  | 'dm_message'
  | 'story_share'
  | 'instagram_ads'
  | 'live_comment'
  | 'ref_url'

export type FlowTrigger = {
  type: TriggerType
  label?: string
  description?: string
  config?: Record<string, any>
}

export type FlowField = {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'json' | 'text'
  description?: string
  required?: boolean
  defaultValue?: any
  options?: Array<{ label: string; value: string }>
  ui?: {
    placeholder?: string
    helpText?: string
    group?: string
    order?: number
  }
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
  source?: {
    nodeId?: string
    path?: string
  }
}

export type FlowDisplay = {
  outcome?: string
  goal?: 'Bookings' | 'Sales' | 'Leads' | 'Support' | 'General'
  industry?: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General'
  setupTime?: string
  collects?: string[]
  icon?: string
  previewConversation?: Array<{ from: 'bot' | 'customer'; message: string }>
}

export type FlowDraft = {
  _id: string
  name: string
  description?: string
  status: 'draft' | 'published' | 'archived'
  templateId?: string
  dsl: Record<string, any>
  triggers?: FlowTrigger[]
  exposedFields?: FlowField[]
  display?: FlowDisplay
  updatedAt?: string
}

export type FlowTemplate = {
  _id: string
  name: string
  description?: string
  status: 'active' | 'archived'
  currentVersionId?: string
}

export type FlowNodeType =
  | 'trigger'
  | 'detect_intent'
  | 'send_message'
  | 'ai_reply'
  | 'ai_agent'
  | 'handoff'
  | 'router'

export type AiProvider = 'openai' | 'groq'

export type RouterMatchMode = 'first' | 'all'
export type RouterRuleOperator = 'equals' | 'contains' | 'gt' | 'lt' | 'keywords'
export type RouterRuleSource = 'vars' | 'message' | 'config' | 'context'

export type RouterRule = {
  source: RouterRuleSource
  path?: string
  operator: RouterRuleOperator
  value?: string | number | boolean | string[]
  match?: 'any' | 'all'
}

export type RouterCondition = {
  type?: 'rules' | 'else'
  op?: 'all' | 'any'
  rules?: RouterRule[]
}

export type RouterRouting = {
  matchMode?: RouterMatchMode
}

export type FlowAiSettings = {
  tone?: string
  maxReplySentences?: number
  historyLimit?: number
  ragEnabled?: boolean
  allowHashtags?: boolean
  allowEmojis?: boolean
  replyLanguage?: string
  systemPrompt?: string
  provider?: AiProvider
  model?: string
  temperature?: number
  maxOutputTokens?: number
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

export type FlowIntentSettings = {
  provider?: AiProvider
  model?: string
  temperature?: number
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

export type FlowAgentSlot = {
  key: string
  question?: string
  defaultValue?: string
}

export type FlowTriggerConfig = {
  keywords?: string[]
  excludeKeywords?: string[]
  keywordMatch?: 'any' | 'all'
  triggerMode?: 'keywords' | 'any' | 'intent'
  intentText?: string
  intentProvider?: AiProvider
  intentModel?: string
}

export type FlowButton = {
  title: string
  payload?: string
}

export type FlowNodeData = {
  label: string
  subtitle?: string
  isStart?: boolean
  branchTag?: string
}

export type FlowNode = Node<FlowNodeData> & {
  type: FlowNodeType
  triggerType?: TriggerType
  triggerDescription?: string
  triggerConfig?: FlowTriggerConfig
  intentSettings?: FlowIntentSettings
  logEnabled?: boolean
  text?: string
  message?: string
  buttons?: FlowButton[]
  tags?: string[]
  aiSettings?: FlowAiSettings
  agentSystemPrompt?: string
  agentSteps?: string[]
  agentEndCondition?: string
  agentStopCondition?: string
  agentMaxQuestions?: number
  agentSlots?: FlowAgentSlot[]
  knowledgeItemIds?: string[]
  handoff?: {
    topic?: string
    summary?: string
    recommendedNextAction?: string
    message?: string
  }
  waitForReply?: boolean
  routing?: RouterRouting
}

export type FlowEdge = Edge & {
  condition?: RouterCondition
  order?: number
}

export type TriggerForm = {
  id: string
  type: TriggerType
  label: string
  description: string
  configText: string
}

export type FieldForm = {
  id: string
  key: string
  label: string
  type: FlowField['type']
  description: string
  required: boolean
  defaultValue: string | boolean
  optionsText: string
  uiGroup: string
  uiOrder: string
  uiPlaceholder: string
  uiHelpText: string
  validationMin: string
  validationMax: string
  validationPattern: string
  sourceNodeId: string
  sourcePath: string
}

export type DraftForm = {
  name: string
  description: string
  status: 'draft' | 'published' | 'archived'
  templateId: string
  dslText: string
  triggers: TriggerForm[]
  fields: FieldForm[]
  display: {
    outcome: string
    goal: FlowDisplay['goal'] | ''
    industry: FlowDisplay['industry'] | ''
    setupTime: string
    collectsText: string
    icon: string
    previewText: string
  }
}
