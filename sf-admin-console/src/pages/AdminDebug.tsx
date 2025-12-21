import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'
import { AlertCircle, CheckCircle, XCircle, Database, Users as UsersIcon, LayoutDashboard } from 'lucide-react'

export default function AdminDebug() {
  const { data: workspaces, error: workspacesError } = useQuery({
    queryKey: ['debug-workspaces'],
    queryFn: () => adminApi.getWorkspaces({ limit: 100 }),
  })

  const { data: users, error: usersError } = useQuery({
    queryKey: ['debug-users'],
    queryFn: () => adminApi.getUsers({ limit: 100 }),
  })

  const { data: stats, error: statsError } = useQuery({
    queryKey: ['debug-stats'],
    queryFn: () => adminApi.getDashboardStats(),
  })

  const adminToken = localStorage.getItem('admin_token')

  // Parse workspace count - handle both array and object responses
  const getWorkspaceCount = () => {
    if (!workspaces?.data) return 0
    // If data is an array
    if (Array.isArray(workspaces.data)) return workspaces.data.length
    // If data.workspaces is an array
    if (Array.isArray(workspaces.data.workspaces)) return workspaces.data.workspaces.length
    return 0
  }

  // Parse users count - handle both array and object responses
  const getUserCount = () => {
    if (!users?.data) return 0
    // If data is an array
    if (Array.isArray(users.data)) return users.data.length
    // If data.users is an array
    if (Array.isArray(users.data.users)) return users.data.users.length
    return 0
  }

  const workspaceCount = getWorkspaceCount()
  const userCount = getUserCount()

  const checks = [
    {
      name: 'Admin Token Present',
      status: !!adminToken,
      icon: CheckCircle,
      details: adminToken ? `Token exists (${adminToken.substring(0, 20)}...)` : 'No token found',
      color: adminToken ? 'text-green-500' : 'text-red-500',
    },
    {
      name: 'Workspaces API',
      status: !workspacesError && !!workspaces && workspaceCount > 0,
      icon: Database,
      details: workspacesError
        ? `Error: ${workspacesError.message}`
        : workspaceCount > 0
        ? `✅ Success: ${workspaceCount} workspace${workspaceCount !== 1 ? 's' : ''} found`
        : '⚠️ API works but returned 0 workspaces - check backend permissions',
      data: workspaces?.data,
      color: workspacesError ? 'text-red-500' : workspaceCount > 0 ? 'text-green-500' : 'text-yellow-500',
    },
    {
      name: 'Users API',
      status: !usersError && !!users && userCount > 0,
      icon: UsersIcon,
      details: usersError
        ? `Error: ${usersError.message}`
        : userCount > 0
        ? `✅ Success: ${userCount} user${userCount !== 1 ? 's' : ''} found`
        : '⚠️ API works but returned 0 users - check backend permissions',
      data: users?.data,
      color: usersError ? 'text-red-500' : userCount > 0 ? 'text-green-500' : 'text-yellow-500',
    },
    {
      name: 'Dashboard Stats API',
      status: !statsError && !!stats,
      icon: LayoutDashboard,
      details: statsError
        ? `Error: ${statsError.message}`
        : `✅ Success: Stats loaded`,
      data: stats?.data,
      color: statsError ? 'text-red-500' : 'text-green-500',
    },
  ]

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

      {/* Detailed Checks */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">API Endpoint Tests</h2>
        {checks.map((check) => {
          const Icon = check.icon
          return (
            <div key={check.name} className="card">
              <div className="flex items-start gap-3">
                <Icon className={`w-6 h-6 ${check.color} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-lg">{check.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {check.details}
                  </p>
                  {check.data && (
                    <details className="mt-3">
                      <summary className="text-xs text-primary cursor-pointer hover:text-primary-light font-medium">
                        📋 View Raw Response Data
                      </summary>
                      <pre className="mt-2 p-4 bg-muted/50 rounded-lg text-xs overflow-auto max-h-96 border border-border">
                        {JSON.stringify(check.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )
        })}
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

      {/* Backend Requirements */}
      <div className="card bg-blue-500/10 border-2 border-blue-500/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-foreground mb-2">📚 Backend Requirements</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Your backend needs to implement these endpoints with admin-only access:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">GET /api/admin/workspaces</code>
              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">GET /api/admin/users</code>
              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">GET /api/admin/dashboard/stats</code>
              <code className="text-xs bg-muted px-2 py-1 rounded text-foreground">GET /api/admin/conversations</code>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              💡 These endpoints should return ALL data (god eye view), not filtered by user membership.
            </p>
            <p className="text-sm text-foreground mt-2">
              📖 See <code className="bg-muted px-1 py-0.5 rounded">BACKEND_REQUIREMENTS.md</code> for complete specs
            </p>
          </div>
        </div>
      </div>

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
