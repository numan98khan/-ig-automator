import type { NodeProps, NodeTypes } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Bot, Flag, GitBranch, MessageSquare, Search, Sparkles, Zap } from 'lucide-react'
import { FLOW_NODE_LABELS } from '../constants'
import type { FlowNode } from '../types'

const NodeShell = ({
  title,
  subtitle,
  icon: Icon,
  selected,
  isStart,
  branchTag,
}: {
  title: string
  subtitle?: string
  icon: typeof MessageSquare
  selected?: boolean
  isStart?: boolean
  branchTag?: string
}) => (
  <div className="relative">
    {branchTag ? (
      <div className="absolute -top-3 left-3 rounded-full border border-border bg-card/90 px-2.5 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {branchTag}
      </div>
    ) : null}
    <div
      className={`rounded-lg border bg-card px-3 py-2 shadow-sm min-w-[190px] ${
        selected ? 'ring-2 ring-primary/50 border-primary/70' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !border-primary" />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-primary" />
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {isStart && (
        <span className="text-[10px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">Start</span>
      )}
    </div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle || 'No details yet.'}</div>
    </div>
  </div>
)

const MessageNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.send_message}
    subtitle={data.subtitle}
    icon={MessageSquare}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const TriggerNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.trigger}
    subtitle={data.subtitle}
    icon={Zap}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const DetectIntentNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.detect_intent}
    subtitle={data.subtitle}
    icon={Search}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const AiReplyNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.ai_reply}
    subtitle={data.subtitle}
    icon={Sparkles}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const AiAgentNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.ai_agent}
    subtitle={data.subtitle}
    icon={Bot}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const RouterNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.router}
    subtitle={data.subtitle}
    icon={GitBranch}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const HandoffNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.handoff}
    subtitle={data.subtitle}
    icon={Flag}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

export const buildFlowNodeTypes = (): NodeTypes => ({
  trigger: TriggerNode,
  detect_intent: DetectIntentNode,
  send_message: MessageNode,
  router: RouterNode,
  ai_reply: AiReplyNode,
  ai_agent: AiAgentNode,
  handoff: HandoffNode,
})
