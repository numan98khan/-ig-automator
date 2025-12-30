import {
  Bot,
  Flag,
  GitBranch,
  MessageSquare,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { FlowAiSettings, FlowDisplay, FlowField, FlowNodeType, TriggerType } from './types'

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

export const AI_MODEL_SUGGESTIONS = [
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4o',
  'gpt-4o-mini',
  'o1',
  'o1-mini',
  'o1-preview',
]

export const MESSAGE_STATE_VARIABLES = [
  { key: 'detectedIntent', label: 'Detected intent', token: '{{ vars.detectedIntent }}' },
  { key: 'agentStepIndex', label: 'Agent step index', token: '{{ vars.agentStepIndex }}' },
  { key: 'agentStep', label: 'Agent step', token: '{{ vars.agentStep }}' },
  { key: 'agentDone', label: 'Agent done', token: '{{ vars.agentDone }}' },
  { key: 'agentStepSummary', label: 'Agent step summary', token: '{{ vars.agentStepSummary }}' },
  { key: 'agentSlots', label: 'Agent slots', token: '{{ vars.agentSlots }}' },
  { key: 'agentMissingSlots', label: 'Agent missing slots', token: '{{ vars.agentMissingSlots }}' },
  { key: 'agentQuestionsAsked', label: 'Agent questions asked', token: '{{ vars.agentQuestionsAsked }}' },
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
  handoff: 'Handoff',
}
