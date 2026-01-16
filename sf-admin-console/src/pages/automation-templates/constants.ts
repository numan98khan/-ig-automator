import {
  Bot,
  Flag,
  GitBranch,
  MessageSquare,
  Network,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { AiProvider, FlowAiSettings, FlowDisplay, FlowField, FlowNodeType, TriggerType } from './types'

export const TRIGGER_LIBRARY: Array<{ type: TriggerType; label: string; description: string }> = [
  {
    type: 'post_comment',
    label: 'Post or Reel Comments',
    description: 'User comments on your Post or Reel',
  },
  {
    type: 'story_reply',
    label: 'Story Reply',
    description: 'User replies to your Story',
  },
  {
    type: 'dm_message',
    label: 'Instagram Message',
    description: 'User sends a message',
  },
  {
    type: 'story_share',
    label: 'Story Share',
    description: 'User shares your Post or Reel as a Story',
  },
  {
    type: 'instagram_ads',
    label: 'Instagram Ads',
    description: 'User clicks an Instagram Ad',
  },
  {
    type: 'live_comment',
    label: 'Live Comments',
    description: 'User comments on your Live',
  },
  {
    type: 'ref_url',
    label: 'Instagram Ref URL',
    description: 'User clicks a referral link',
  },
]

export const TRIGGER_METADATA = TRIGGER_LIBRARY.reduce((acc, trigger) => {
  acc[trigger.type] = { label: trigger.label, description: trigger.description }
  return acc
}, {} as Record<TriggerType, { label: string; description: string }>)

export const DEFAULT_TRIGGER_TYPE: TriggerType = 'dm_message'

export const DEFAULT_AI_PROVIDER: AiProvider = 'openai'

export const AI_PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'groq', label: 'Groq' },
]

export const AI_MODEL_SUGGESTIONS_BY_PROVIDER: Record<AiProvider, string[]> = {
  openai: [
    'gpt-5.2',
    'gpt-5.2-pro',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-4.1',
  ],
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ],
}

export const MESSAGE_STATE_VARIABLES = [
  { key: 'detectedIntent', label: 'Detected intent', token: '{{ vars.detectedIntent }}' },
  { key: 'agentStepIndex', label: 'Agent step index', token: '{{ vars.agentStepIndex }}' },
  { key: 'agentStep', label: 'Agent step', token: '{{ vars.agentStep }}' },
  { key: 'agentDone', label: 'Agent done', token: '{{ vars.agentDone }}' },
  { key: 'agentStepSummary', label: 'Agent step summary', token: '{{ vars.agentStepSummary }}' },
  { key: 'agentSlots', label: 'Agent slots', token: '{{ vars.agentSlots }}' },
  { key: 'agentMissingSlots', label: 'Agent missing slots', token: '{{ vars.agentMissingSlots }}' },
  { key: 'agentQuestionsAsked', label: 'Agent questions asked', token: '{{ vars.agentQuestionsAsked }}' },
  { key: 'langchainIteration', label: 'LangChain iteration', token: '{{ vars.langchainIteration }}' },
  { key: 'langchainDone', label: 'LangChain done', token: '{{ vars.langchainDone }}' },
  { key: 'langchainToolCalls', label: 'LangChain tool calls', token: '{{ vars.langchainToolCalls }}' },
  { key: 'langchainActionSummary', label: 'LangChain action summary', token: '{{ vars.langchainActionSummary }}' },
]

export const LANGCHAIN_SYSTEM_PROMPT_VARIABLES = [
  { key: 'businessName', label: 'Business name', token: '{{ businessName }}' },
  { key: 'businessDescription', label: 'Business description', token: '{{ businessDescription }}' },
  { key: 'businessHours', label: 'Business hours', token: '{{ businessHours }}' },
  { key: 'businessTone', label: 'Business tone', token: '{{ businessTone }}' },
  { key: 'businessLocation', label: 'Business location', token: '{{ businessLocation }}' },
  { key: 'businessWebsite', label: 'Business website', token: '{{ businessWebsite }}' },
  { key: 'businessCatalog', label: 'Business catalog', token: '{{ businessCatalog }}' },
  { key: 'businessDocuments', label: 'Business documents', token: '{{ businessDocuments }}' },
  { key: 'assistantName', label: 'Assistant name', token: '{{ assistantName }}' },
  { key: 'assistantDescription', label: 'Assistant description', token: '{{ assistantDescription }}' },
  { key: 'workspaceSystemPrompt', label: 'Workspace system prompt', token: '{{ workspaceSystemPrompt }}' },
  ...MESSAGE_STATE_VARIABLES,
]

export const LANGCHAIN_TOOL_NAME_OPTIONS = [
  {
    label: 'Get business profile',
    value: 'get_business_profile',
    description: 'Fetches the workspace business profile details and summary.',
  },
  {
    label: 'Lookup contact',
    value: 'lookup_contact',
    description: 'Finds a contact by id, handle, email, phone, or name.',
  },
]

export const REASONING_EFFORT_OPTIONS: Array<FlowAiSettings['reasoningEffort']> = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]

export const FIELD_TYPES: FlowField['type'][] = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'json',
  'text',
]

export const GOAL_OPTIONS: Array<FlowDisplay['goal']> = [
  'Bookings',
  'Sales',
  'Leads',
  'Support',
  'General',
]

export const INDUSTRY_OPTIONS: Array<FlowDisplay['industry']> = [
  'Clinics',
  'Salons',
  'Retail',
  'Restaurants',
  'Real Estate',
  'General',
]

export const FLOW_NODE_LIBRARY: Array<{
  type: FlowNodeType
  label: string
  description: string
  icon: typeof MessageSquare
}> = [
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Starts the flow when a trigger fires.',
    icon: Zap,
  },
  {
    type: 'detect_intent',
    label: 'Detect intent',
    description: 'Analyze the latest message and capture intent.',
    icon: Search,
  },
  {
    type: 'send_message',
    label: 'Message',
    description: 'Send a static message.',
    icon: MessageSquare,
  },
  {
    type: 'router',
    label: 'Router',
    description: 'Branch the flow based on conditions.',
    icon: GitBranch,
  },
  {
    type: 'ai_reply',
    label: 'AI Reply',
    description: 'Generate a response with AI.',
    icon: Sparkles,
  },
  {
    type: 'ai_agent',
    label: 'AI Agent',
    description: 'Multi-turn agent with steps and end conditions.',
    icon: Bot,
  },
  {
    type: 'langchain_agent',
    label: 'LangChain Agent',
    description: 'Tool-aware agent with configurable controls.',
    icon: Network,
  },
  {
    type: 'handoff',
    label: 'Handoff',
    description: 'Escalate to a human teammate.',
    icon: Flag,
  },
]

export const FLOW_NODE_LABELS: Record<FlowNodeType, string> = {
  trigger: 'Trigger',
  detect_intent: 'Detect intent',
  send_message: 'Message',
  router: 'Router',
  ai_reply: 'AI Reply',
  ai_agent: 'AI Agent',
  langchain_agent: 'LangChain Agent',
  handoff: 'Handoff',
}

export type FlowNodeStyle = {
  badge: string
  border: string
  dot: string
  handle: string
  ring: string
  miniMap: string
}

export const FLOW_NODE_STYLES: Record<FlowNodeType, FlowNodeStyle> = {
  trigger: {
    badge: 'bg-emerald-500/10',
    border: 'border-l-emerald-400/80',
    dot: 'bg-emerald-400',
    handle: '!bg-emerald-400/80 !border-emerald-500/70',
    ring: 'ring-emerald-200/70 border-emerald-200/70',
    miniMap: '#3BAA74',
  },
  detect_intent: {
    badge: 'bg-indigo-500/10',
    border: 'border-l-indigo-400/80',
    dot: 'bg-indigo-400',
    handle: '!bg-indigo-400/80 !border-indigo-500/70',
    ring: 'ring-indigo-200/70 border-indigo-200/70',
    miniMap: '#6B7FD6',
  },
  send_message: {
    badge: 'bg-sky-500/10',
    border: 'border-l-sky-400/80',
    dot: 'bg-sky-400',
    handle: '!bg-sky-400/80 !border-sky-500/70',
    ring: 'ring-sky-200/70 border-sky-200/70',
    miniMap: '#4B9AD5',
  },
  router: {
    badge: 'bg-teal-500/10',
    border: 'border-l-teal-400/80',
    dot: 'bg-teal-400',
    handle: '!bg-teal-400/80 !border-teal-500/70',
    ring: 'ring-teal-200/70 border-teal-200/70',
    miniMap: '#4FA3B8',
  },
  ai_reply: {
    badge: 'bg-violet-500/10',
    border: 'border-l-violet-400/80',
    dot: 'bg-violet-400',
    handle: '!bg-violet-400/80 !border-violet-500/70',
    ring: 'ring-violet-200/70 border-violet-200/70',
    miniMap: '#8B7BC9',
  },
  ai_agent: {
    badge: 'bg-purple-500/10',
    border: 'border-l-purple-400/80',
    dot: 'bg-purple-400',
    handle: '!bg-purple-400/80 !border-purple-500/70',
    ring: 'ring-purple-200/70 border-purple-200/70',
    miniMap: '#7B6CB6',
  },
  langchain_agent: {
    badge: 'bg-cyan-500/10',
    border: 'border-l-cyan-400/80',
    dot: 'bg-cyan-400',
    handle: '!bg-cyan-400/80 !border-cyan-500/70',
    ring: 'ring-cyan-200/70 border-cyan-200/70',
    miniMap: '#4BA7B0',
  },
  handoff: {
    badge: 'bg-rose-500/10',
    border: 'border-l-rose-400/80',
    dot: 'bg-rose-400',
    handle: '!bg-rose-400/80 !border-rose-500/70',
    ring: 'ring-rose-200/70 border-rose-200/70',
    miniMap: '#C96A4A',
  },
}
