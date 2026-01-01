import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Node } from '@xyflow/react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import AutomationsTabs from '../components/AutomationsTabs'
import { adminApi, unwrapData } from '../services/api'
import { buildFlowNodeTypes } from './automation-templates/components/FlowNodes'
import { parseFlowDsl } from './automation-templates/utils'

type Workspace = {
  _id: string
  name: string
}

type AutomationSessionHistory = {
  _id: string
  workspaceId: string
  automationInstanceId: string
  templateId?: string
  templateVersionId?: string
  conversationId?: string
  status: 'active' | 'paused' | 'completed' | 'handoff'
  channel?: 'live' | 'preview'
  createdAt?: string
  lastCustomerMessageAt?: string
  lastAutomationMessageAt?: string
  automationName?: string
  templateName?: string
}

type FlowTemplateVersion = {
  _id: string
  templateId: string
  version?: number
  versionLabel?: string
  dslSnapshot?: Record<string, any>
  dsl?: Record<string, any>
  compiled?: Record<string, any>
}

type AdminLogEvent = {
  _id: string
  workspaceId?: string
  category: string
  level: 'info' | 'warn' | 'error'
  message: string
  details?: Record<string, any>
  createdAt?: string
}

const formatTimestamp = (value?: string) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

const extractDsl = (version?: FlowTemplateVersion | null) => {
  if (!version) return null
  if (version.dslSnapshot) return version.dslSnapshot
  if (version.dsl) return version.dsl
  if (version.compiled?.dslSnapshot) return version.compiled.dslSnapshot
  if (version.compiled?.graph) return version.compiled.graph
  return version.compiled || null
}

export default function AutomationHistory() {
  const [filters, setFilters] = useState({
    workspaceId: '',
    channel: 'live' as 'live' | 'preview',
  })
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const { data: workspacesData } = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => adminApi.getWorkspaces({ limit: 200 }),
  })

  const { data: sessionsData, isFetching: isFetchingSessions } = useQuery({
    queryKey: ['automation-sessions', filters],
    queryFn: () =>
      adminApi.getAutomationSessions({
        limit: 100,
        workspaceId: filters.workspaceId || undefined,
        channel: filters.channel,
      }),
  })

  const workspacePayload = unwrapData<any>(workspacesData)
  const workspaces: Workspace[] = Array.isArray(workspacePayload)
    ? workspacePayload
    : Array.isArray(workspacePayload?.workspaces)
      ? workspacePayload.workspaces
      : Array.isArray(workspacePayload?.data)
        ? workspacePayload.data
        : []
  const sessionsPayload = unwrapData<{ sessions: AutomationSessionHistory[] }>(sessionsData)
  const sessions = sessionsPayload?.sessions || []

  const selectedSession = sessions.find((session) => session._id === selectedSessionId) || null

  const { data: versionData, isFetching: isFetchingVersion } = useQuery({
    queryKey: ['automation-history-version', selectedSession?.templateId, selectedSession?.templateVersionId],
    queryFn: () => adminApi.getFlowTemplateVersion(
      selectedSession?.templateId || '',
      selectedSession?.templateVersionId || '',
    ),
    enabled: Boolean(selectedSession?.templateId && selectedSession?.templateVersionId),
  })

  const { data: logEventsData, isFetching: isFetchingLogs } = useQuery({
    queryKey: ['automation-history-logs', selectedSession?.workspaceId, selectedSession?._id],
    queryFn: () =>
      adminApi.getLogEvents({
        category: 'flow_node',
        sessionId: selectedSession?._id || undefined,
        limit: 500,
      }),
    enabled: Boolean(selectedSession?.workspaceId && selectedSession?._id),
  })

  const version = unwrapData<FlowTemplateVersion>(versionData)
  const logEvents = unwrapData<AdminLogEvent[]>(logEventsData) || []

  const flowData = useMemo(() => {
    const dsl = extractDsl(version)
    if (!dsl) return { nodes: [], edges: [], startNodeId: '' }
    return parseFlowDsl(dsl)
  }, [version])

  const nodeTypes = useMemo(() => buildFlowNodeTypes(), [])

  const nodeLogs = useMemo(() => {
    if (!selectedNodeId) return []
    return logEvents.filter((event) => event.details?.nodeId === selectedNodeId)
  }, [logEvents, selectedNodeId])

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setSelectedNodeId(null)
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <AutomationsTabs />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-6">
        <div className="card h-fit space-y-4">
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground">Runs</h3>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Workspace</label>
              <select
                className="input w-full"
                value={filters.workspaceId}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, workspaceId: event.target.value }))
                }
              >
                <option value="">All workspaces</option>
                {workspaces.map((workspace) => (
                  <option key={workspace._id} value={workspace._id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Channel</label>
              <select
                className="input w-full"
                value={filters.channel}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, channel: event.target.value as 'live' | 'preview' }))
                }
              >
                <option value="live">Live</option>
                <option value="preview">Preview</option>
              </select>
            </div>
            <div className="text-xs text-muted-foreground">
              {isFetchingSessions ? 'Refreshing…' : `${sessions.length} run(s)`}
            </div>
          </div>
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {sessions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No runs found.</div>
            ) : (
              sessions.map((session) => (
                <button
                  key={session._id}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                    selectedSessionId === session._id
                      ? 'border-primary/60 bg-primary/10'
                      : 'border-border hover:border-primary/40 hover:bg-muted/30'
                  }`}
                  onClick={() => handleSelectSession(session._id)}
                >
                  <div className="text-sm font-semibold text-foreground">
                    {session.automationName || 'Automation run'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {session.templateName || 'Template'} · {session.status}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Started: {formatTimestamp(session.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Flow Snapshot</h3>
              <p className="text-xs text-muted-foreground">
                {selectedSession
                  ? `Template: ${selectedSession.templateName || selectedSession.templateId || 'Unknown'}`
                  : 'Select a run to view its flow.'}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {isFetchingVersion ? 'Loading flow…' : selectedSession?.templateVersionId || '—'}
            </div>
          </div>
          <div className="mt-4 h-[520px] rounded-lg border border-border bg-muted/30">
            {selectedSession ? (
              <ReactFlow
                nodes={flowData.nodes as Node[]}
                edges={flowData.edges}
                nodeTypes={nodeTypes}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                elementsSelectable
              >
                <Background gap={16} size={1} />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a run to view the flow.
              </div>
            )}
          </div>
        </div>

        <div className="card h-fit">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-foreground">Node Details</h3>
              <p className="text-xs text-muted-foreground">
                {selectedNodeId ? `Node ${selectedNodeId}` : 'Select a node to inspect logs.'}
              </p>
            </div>
            <div className="text-xs text-muted-foreground">
              {isFetchingLogs ? 'Loading logs…' : `${nodeLogs.length} event(s)`}
            </div>
          </div>
          <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {!selectedNodeId ? (
              <div className="text-sm text-muted-foreground">Pick a node to see its log events.</div>
            ) : nodeLogs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No logs found for this node.</div>
            ) : (
              nodeLogs.map((event) => (
                <div key={event._id} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTimestamp(event.createdAt)}</span>
                    <span className="uppercase">{event.level}</span>
                  </div>
                  <div className="mt-2 text-sm text-foreground">{event.message}</div>
                  {event.details ? (
                    <pre className="mt-2 text-xs whitespace-pre-wrap break-words text-muted-foreground">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
