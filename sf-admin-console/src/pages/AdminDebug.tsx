import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Database,
  Users as UsersIcon,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

type AdminLogEvent = {
  _id: string
  workspaceId?: string
  category: string
  level: 'info' | 'warn' | 'error'
  message: string
  details?: Record<string, any>
  source?: string
  createdAt?: string
}

export default function AdminDebug() {
  const queryClient = useQueryClient()
  const [logSettings, setLogSettings] = useState({
    aiTimingEnabled: true,
    automationLogsEnabled: true,
    automationStepsEnabled: true,
    openaiApiLogsEnabled: false,
  })
  const [logFilters, setLogFilters] = useState({
    limit: 200,
    category: '',
    level: '' as '' | 'info' | 'warn' | 'error',
    workspaceId: '',
    autoRefresh: true,
  })

  const { data: workspaces } = useQuery({
    queryKey: ['debug-workspaces'],
    queryFn: () => adminApi.getWorkspaces({ limit: 100 }),
  })

  const { data: users } = useQuery({
    queryKey: ['debug-users'],
    queryFn: () => adminApi.getUsers({ limit: 100 }),
  })

  const { data: logSettingsData } = useQuery({
    queryKey: ['admin-log-settings'],
    queryFn: () => adminApi.getLogSettings(),
  })

  const { data: logEventsData, isFetching: isFetchingLogs } = useQuery({
    queryKey: ['admin-log-events', logFilters],
    queryFn: () =>
      adminApi.getLogEvents({
        limit: logFilters.limit,
        category: logFilters.category || undefined,
        level: logFilters.level || undefined,
        workspaceId: logFilters.workspaceId || undefined,
      }),
    refetchInterval: logFilters.autoRefresh ? 5000 : false,
  })

  const adminToken = localStorage.getItem('admin_token')

  useEffect(() => {
    const payload = unwrapData<any>(logSettingsData)
    if (payload && typeof payload.aiTimingEnabled === 'boolean') {
      setLogSettings({
        aiTimingEnabled: payload.aiTimingEnabled,
        automationLogsEnabled: payload.automationLogsEnabled,
        automationStepsEnabled: payload.automationStepsEnabled,
        openaiApiLogsEnabled: payload.openaiApiLogsEnabled ?? false,
      })
    }
  }, [logSettingsData])

  const updateLogsMutation = useMutation({
    mutationFn: (payload: Partial<typeof logSettings>) => adminApi.updateLogSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-log-settings'] })
    },
  })

  const toggleLogSetting = (key: keyof typeof logSettings) => {
    const nextValue = !logSettings[key]
    setLogSettings((prev) => ({ ...prev, [key]: nextValue }))
    updateLogsMutation.mutate({ [key]: nextValue })
  }

  // Parse workspace count - handle both array and object responses
  const getWorkspaceCount = () => {
    const payload = unwrapData<any>(workspaces)
    if (Array.isArray(payload)) return payload.length
    if (Array.isArray(payload?.workspaces)) return payload.workspaces.length
    return 0
  }

  // Parse users count - handle both array and object responses
  const getUserCount = () => {
    const payload = unwrapData<any>(users)
    if (Array.isArray(payload)) return payload.length
    if (Array.isArray(payload?.users)) return payload.users.length
    return 0
  }

  const workspaceCount = getWorkspaceCount()
  const userCount = getUserCount()
  const logEvents = unwrapData<AdminLogEvent[]>(logEventsData) || []

  const isSavingLogSettings = updateLogsMutation.isPending
  const formatTimestamp = (value?: string) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Access Debug</h1>
        <p className="text-muted-foreground mt-2">
          Check admin permissions and API responses
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`card border-l-4 ${workspaceCount > 0 ? 'border-l-green-500 bg-green-500/5' : 'border-l-yellow-500 bg-yellow-500/5'}`}>
          <div className="flex items-center gap-3">
            <Database className={`w-8 h-8 ${workspaceCount > 0 ? 'text-green-500' : 'text-yellow-500'}`} />
            <div>
              <p className="text-2xl font-bold text-foreground">{workspaceCount}</p>
              <p className="text-sm text-muted-foreground">Workspaces Found</p>
            </div>
          </div>
        </div>

        <div className={`card border-l-4 ${userCount > 0 ? 'border-l-green-500 bg-green-500/5' : 'border-l-yellow-500 bg-yellow-500/5'}`}>
          <div className="flex items-center gap-3">
            <UsersIcon className={`w-8 h-8 ${userCount > 0 ? 'text-green-500' : 'text-yellow-500'}`} />
            <div>
              <p className="text-2xl font-bold text-foreground">{userCount}</p>
              <p className="text-sm text-muted-foreground">Users Found</p>
            </div>
          </div>
        </div>

        <div className={`card border-l-4 ${adminToken ? 'border-l-green-500 bg-green-500/5' : 'border-l-red-500 bg-red-500/5'}`}>
          <div className="flex items-center gap-3">
            {adminToken ? (
              <CheckCircle className="w-8 h-8 text-green-500" />
            ) : (
              <XCircle className="w-8 h-8 text-red-500" />
            )}
            <div>
              <p className="text-2xl font-bold text-foreground">{adminToken ? 'Valid' : 'Missing'}</p>
              <p className="text-sm text-muted-foreground">Admin Token</p>
            </div>
          </div>
        </div>
      </div>


      {/* Log Controls */}
      <div className="card">
        <h3 className="font-semibold text-foreground mb-2">🧾 Backend Log Controls</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Toggle which categories of logs appear in the backend console.
        </p>
        <div className="space-y-3">
          <LogToggleRow
            title="AI timing logs"
            description="Durations for OpenAI calls (ms)."
            enabled={logSettings.aiTimingEnabled}
            onToggle={() => toggleLogSetting('aiTimingEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="Automation logs"
            description="Automation start/match/execute summaries."
            enabled={logSettings.automationLogsEnabled}
            onToggle={() => toggleLogSetting('automationLogsEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="Automation step timing"
            description="Step-by-step timing within automations."
            enabled={logSettings.automationStepsEnabled}
            onToggle={() => toggleLogSetting('automationStepsEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="OpenAI API logs"
            description="Raw OpenAI response summaries for debugging."
            enabled={logSettings.openaiApiLogsEnabled}
            onToggle={() => toggleLogSetting('openaiApiLogsEnabled')}
            disabled={isSavingLogSettings}
          />
        </div>
        {isSavingLogSettings && (
          <p className="text-xs text-muted-foreground mt-3">Saving log settings...</p>
        )}
      </div>

      {/* Log Viewer */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">📜 Log Viewer</h3>
            <p className="text-sm text-muted-foreground">
              Recent automation logs stored in Mongo (last 24 hours). Refreshes every 5s when enabled.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isFetchingLogs ? 'Refreshing…' : `Showing ${logEvents.length} events`}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Limit</label>
            <select
              className="input w-full"
              value={logFilters.limit}
              onChange={(event) =>
                setLogFilters((prev) => ({
                  ...prev,
                  limit: Number(event.target.value),
                }))
              }
            >
              {[50, 100, 200, 300, 500].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Category</label>
            <input
              className="input w-full"
              placeholder="automation"
              value={logFilters.category}
              onChange={(event) =>
                setLogFilters((prev) => ({ ...prev, category: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Level</label>
            <select
              className="input w-full"
              value={logFilters.level}
              onChange={(event) =>
                setLogFilters((prev) => ({
                  ...prev,
                  level: event.target.value as '' | 'info' | 'warn' | 'error',
                }))
              }
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Workspace ID</label>
            <input
              className="input w-full"
              placeholder="optional"
              value={logFilters.workspaceId}
              onChange={(event) =>
                setLogFilters((prev) => ({ ...prev, workspaceId: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Auto refresh</label>
            <button
              className="btn btn-secondary w-full"
              onClick={() =>
                setLogFilters((prev) => ({ ...prev, autoRefresh: !prev.autoRefresh }))
              }
            >
              {logFilters.autoRefresh ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Message</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {logEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No log events found for the current filters.
                  </td>
                </tr>
              ) : (
                logEvents.map((event) => (
                  <tr key={event._id} className="border-b border-border/60">
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {formatTimestamp(event.createdAt)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-muted px-2 py-1 text-xs uppercase text-muted-foreground">
                        {event.level}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{event.category}</td>
                    <td className="py-3 pr-3">{event.message}</td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {event.details ? (
                        <pre className="max-w-[360px] whitespace-pre-wrap break-words">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warning if no data */}
      {workspaceCount === 0 && (
        <div className="card bg-yellow-500/10 border-2 border-yellow-500/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-foreground mb-2">⚠️ No Workspaces Found</h3>
              <p className="text-sm text-muted-foreground mb-3">
                The API is working, but it returned 0 workspaces. This usually means:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 ml-4">
                <li>• Your admin user doesn't have permission to see all workspaces</li>
                <li>• The backend is filtering results by user membership (it shouldn't for admins)</li>
                <li>• The database actually has no workspaces yet</li>
              </ul>
              <p className="text-sm font-medium text-foreground mt-3">
                👉 Check: Is your backend's <code className="bg-muted px-1 py-0.5 rounded">/api/admin/workspaces</code> endpoint returning ALL workspaces without filtering by user?
              </p>
            </div>
          </div>
        </div>
      )}



      {/* API Configuration */}
      <div className="card">
        <h3 className="font-semibold text-foreground mb-3">⚙️ API Configuration</h3>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Base URL:</span>
            <code className="text-sm text-foreground bg-muted px-3 py-2 rounded border border-border">
              {import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Authorization Header:</span>
            <code className="text-sm text-foreground bg-muted px-3 py-2 rounded border border-border break-all">
              Bearer {adminToken ? `${adminToken.substring(0, 30)}...` : 'None'}
            </code>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Request Example:</span>
            <pre className="text-xs text-foreground bg-muted px-3 py-2 rounded border border-border overflow-auto">
{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
     ${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/workspaces`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

function LogToggleRow(props: {
  title: string
  description: string
  enabled: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  const { title, description, enabled, disabled, onToggle } = props
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="text-primary disabled:opacity-50"
        aria-label={`${title} toggle`}
      >
        {enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
      </button>
    </div>
  )
}
