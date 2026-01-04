import type { NodeProps, NodeTypes } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { Bot, Flag, GitBranch, MessageSquare, Search, Sparkles, Tags, Zap } from 'lucide-react'
import type { FlowNodeStyle } from '../constants'
import { FLOW_NODE_LABELS, FLOW_NODE_STYLES } from '../constants'
import type { FlowNode } from '../types'

const NodeShell = ({
  title,
  subtitle,
  icon: Icon,
  style,
  selected,
  isStart,
  branchTag,
}: {
  title: string
  subtitle?: string
  icon: typeof MessageSquare
  style: FlowNodeStyle
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
      className={`rounded-lg border border-l-4 bg-card px-3 py-2 shadow-sm min-w-[200px] ${style.border} ${
        selected ? `ring-2 ${style.ring}` : 'border-border'
      }`}
    >
      {!isStart && (
        <Handle type="target" position={Position.Left} className={`!border-2 ${style.handle}`} />
      )}
      <Handle type="source" position={Position.Right} className={`!border-2 ${style.handle}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-md ${style.badge}`}>
            <Icon className="h-4 w-4 text-foreground" />
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {isStart && (
          <span className="text-[10px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">Start</span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
        <span>{subtitle || 'No details yet.'}</span>
      </div>
    </div>
  </div>
)

const MessageNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.send_message}
    subtitle={data.subtitle}
    icon={MessageSquare}
    style={FLOW_NODE_STYLES.send_message}
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
    style={FLOW_NODE_STYLES.trigger}
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
    style={FLOW_NODE_STYLES.detect_intent}
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
    style={FLOW_NODE_STYLES.ai_reply}
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
    style={FLOW_NODE_STYLES.ai_agent}
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
    style={FLOW_NODE_STYLES.router}
    selected={selected}
    isStart={data.isStart}
    branchTag={data.branchTag}
  />
)

const ActionNode = ({ data, selected }: NodeProps<FlowNode>) => (
  <NodeShell
    title={data.label || FLOW_NODE_LABELS.action}
    subtitle={data.subtitle}
    icon={Tags}
    style={FLOW_NODE_STYLES.action}
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
    style={FLOW_NODE_STYLES.handoff}
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
  action: ActionNode,
  ai_reply: AiReplyNode,
  ai_agent: AiAgentNode,
  handoff: HandoffNode,
})
