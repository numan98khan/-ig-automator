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

export default function AdminDebug() {
  const queryClient = useQueryClient()
  const [logSettings, setLogSettings] = useState({
    aiTimingEnabled: true,
    aiLogsEnabled: true,
    automationLogsEnabled: true,
    automationStepsEnabled: true,
    instagramWebhookLogsEnabled: true,
    igApiLogsEnabled: true,
    openaiApiLogsEnabled: false,
    consoleLogsEnabled: false,
  })
  const [uiTheme, setUiTheme] = useState<'legacy' | 'comic'>('legacy')

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
  const { data: uiSettingsData } = useQuery({
    queryKey: ['admin-ui-settings'],
    queryFn: () => adminApi.getUiSettings(),
  })

  const adminToken = localStorage.getItem('admin_token')

  useEffect(() => {
    const payload = unwrapData<any>(logSettingsData)
    if (payload && typeof payload.aiTimingEnabled === 'boolean') {
      setLogSettings({
        aiTimingEnabled: payload.aiTimingEnabled,
        aiLogsEnabled: payload.aiLogsEnabled ?? true,
        automationLogsEnabled: payload.automationLogsEnabled,
        automationStepsEnabled: payload.automationStepsEnabled,
        instagramWebhookLogsEnabled: payload.instagramWebhookLogsEnabled ?? true,
        igApiLogsEnabled: payload.igApiLogsEnabled ?? true,
        openaiApiLogsEnabled: payload.openaiApiLogsEnabled ?? false,
        consoleLogsEnabled: payload.consoleLogsEnabled ?? false,
      })
    }
  }, [logSettingsData])

  useEffect(() => {
    const payload = unwrapData<any>(uiSettingsData)
    if (payload?.uiTheme === 'comic' || payload?.uiTheme === 'legacy') {
      setUiTheme(payload.uiTheme)
    }
  }, [uiSettingsData])

  const updateLogsMutation = useMutation({
    mutationFn: (payload: Partial<typeof logSettings>) => adminApi.updateLogSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-log-settings'] })
    },
  })
  const updateUiMutation = useMutation({
    mutationFn: (payload: { uiTheme: 'legacy' | 'comic' }) => adminApi.updateUiSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ui-settings'] })
    },
  })

  const toggleLogSetting = (key: keyof typeof logSettings) => {
    const nextValue = !logSettings[key]
    setLogSettings((prev) => ({ ...prev, [key]: nextValue }))
    updateLogsMutation.mutate({ [key]: nextValue })
  }

  const handleUiThemeChange = (nextTheme: 'legacy' | 'comic') => {
    setUiTheme(nextTheme)
    updateUiMutation.mutate({ uiTheme: nextTheme })
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
  const isSavingLogSettings = updateLogsMutation.isPending
  const isSavingUiSettings = updateUiMutation.isPending

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
            title="AI logs"
            description="AI reply generation logs."
            enabled={logSettings.aiLogsEnabled}
            onToggle={() => toggleLogSetting('aiLogsEnabled')}
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
            title="Instagram webhook logs"
            description="Inbound webhook payload summaries."
            enabled={logSettings.instagramWebhookLogsEnabled}
            onToggle={() => toggleLogSetting('instagramWebhookLogsEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="IG API logs"
            description="Instagram API request/response logs."
            enabled={logSettings.igApiLogsEnabled}
            onToggle={() => toggleLogSetting('igApiLogsEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="OpenAI API logs"
            description="Raw OpenAI response summaries for debugging."
            enabled={logSettings.openaiApiLogsEnabled}
            onToggle={() => toggleLogSetting('openaiApiLogsEnabled')}
            disabled={isSavingLogSettings}
          />
          <LogToggleRow
            title="Console logs"
            description="Capture console.log/warn/error output into Mongo."
            enabled={logSettings.consoleLogsEnabled}
            onToggle={() => toggleLogSetting('consoleLogsEnabled')}
            disabled={isSavingLogSettings}
          />
        </div>
        {isSavingLogSettings && (
          <p className="text-xs text-muted-foreground mt-3">Saving log settings...</p>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-foreground mb-2">🎨 UI Theme</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose the default app theme to serve to customers.
        </p>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="ui-theme-select">
            Theme style
          </label>
          <select
            id="ui-theme-select"
            className="input-field max-w-xs bg-background"
            value={uiTheme}
            onChange={(event) => handleUiThemeChange(event.target.value as 'legacy' | 'comic')}
            disabled={isSavingUiSettings}
          >
            <option value="legacy">Legacy (current)</option>
            <option value="comic">Comic pop-art</option>
          </select>
          {isSavingUiSettings && (
            <p className="text-xs text-muted-foreground">Saving theme selection...</p>
          )}
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
