import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  Users,
  MessageSquare,
  AlertTriangle,
  Activity,
  TrendingUp,
  Bot,
  Clock,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import { adminApi } from '../services/api'

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: adminApi.getDashboardStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: systemMetrics } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: adminApi.getSystemMetrics,
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const dashboardStats = stats?.data?.data || stats?.data || {}
  const metrics = systemMetrics?.data?.data || systemMetrics?.data || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Real-time overview of your Instagram automation platform
        </p>
      </div>

      {/* System Status Banner */}
      <div className="card bg-card border-l-4 border-l-success">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-green-500/20 rounded-lg">
            <Activity className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground">System Operational</p>
            <p className="text-sm text-muted-foreground">
              All services running normally • Uptime: {metrics.uptime || '99.9%'}
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Workspaces"
          value={dashboardStats.totalWorkspaces || 0}
          change={{ value: 12, positive: true }}
          icon={Building2}
          iconColor="text-primary"
          subtitle="Active workspaces"
        />
        <StatCard
          title="Total Users"
          value={dashboardStats.totalUsers || 0}
          change={{ value: 8, positive: true }}
          icon={Users}
          iconColor="text-blue-400"
          subtitle="Registered users"
        />
        <StatCard
          title="Conversations (24h)"
          value={dashboardStats.conversations24h || 0}
          icon={MessageSquare}
          iconColor="text-green-400"
          subtitle="Across all workspaces"
        />
        <StatCard
          title="Active Escalations"
          value={dashboardStats.activeEscalations || 0}
          icon={AlertTriangle}
          iconColor="text-yellow-400"
          subtitle="Requires attention"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="AI Response Rate"
          value={`${dashboardStats.aiResponseRate || 0}%`}
          change={{ value: 5.2, positive: true }}
          icon={Bot}
          iconColor="text-primary-light"
        />
        <StatCard
          title="Avg Response Time"
          value={dashboardStats.avgResponseTime || '0s'}
          change={{ value: -15, positive: true }}
          icon={Clock}
          iconColor="text-green-400"
        />
        <StatCard
          title="Messages (24h)"
          value={dashboardStats.messages24h || 0}
          icon={TrendingUp}
          iconColor="text-blue-400"
        />
        <StatCard
          title="Success Rate"
          value={`${dashboardStats.successRate || 0}%`}
          icon={Activity}
          iconColor="text-green-400"
        />
      </div>

      {/* Recent Activity & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Escalations */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-foreground">
              Recent Escalations
            </h2>
            <button className="text-sm text-primary hover:text-primary-light">
              View All
            </button>
          </div>
          <div className="space-y-3">
            {(dashboardStats.recentEscalations || []).length === 0 ? (
              <p className="text-sm text-muted-foreground/70 text-center py-8">
                No recent escalations
              </p>
            ) : (
              (dashboardStats.recentEscalations || []).map((escalation: any) => (
                <div
                  key={escalation.id}
                  className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      escalation.severity === 'critical'
                        ? 'bg-red-500'
                        : 'bg-yellow-500'
                    }`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {escalation.topic}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {escalation.workspace} • {escalation.time}
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      escalation.severity === 'critical'
                        ? 'badge-error'
                        : 'badge-warning'
                    }`}
                  >
                    {escalation.severity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Workspaces */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-foreground">
              Top Workspaces by Activity
            </h2>
          </div>
          <div className="space-y-3">
            {(dashboardStats.topWorkspaces || []).length === 0 ? (
              <p className="text-sm text-muted-foreground/70 text-center py-8">
                No workspace data available
              </p>
            ) : (
              (dashboardStats.topWorkspaces || []).map((workspace: any, idx: number) => (
                <div
                  key={workspace.id}
                  className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                >
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {workspace.name}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {workspace.conversations} conversations
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {workspace.messages}
                    </p>
                    <p className="text-xs text-muted-foreground/70">messages</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
