import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Users, MessageSquare } from 'lucide-react'
import { adminApi } from '../services/api'
import { useState } from 'react'

export default function Analytics() {
  const [range, setRange] = useState('7d')

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => adminApi.getAnalytics({ range }),
  })

  const analytics = data?.data?.data || data?.data || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="mt-2 text-muted-foreground">
            Platform-wide analytics and insights
          </p>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="input"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-muted-foreground">
                  Total Users
                </h3>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {analytics.totalUsers || 0}
              </p>
              <p className="text-sm text-green-400 mt-2">
                +{analytics.userGrowth || 0}% growth
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-semibold text-muted-foreground">
                  Messages
                </h3>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {analytics.totalMessages || 0}
              </p>
              <p className="text-sm text-green-400 mt-2">
                +{analytics.messageGrowth || 0}% growth
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="font-semibold text-muted-foreground">
                  AI Handled
                </h3>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {analytics.aiHandledRate || 0}%
              </p>
              <p className="text-sm text-green-400 mt-2">
                +{analytics.aiRateGrowth || 0}% improvement
              </p>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="font-semibold text-muted-foreground">
                  Conversions
                </h3>
              </div>
              <p className="text-3xl font-bold text-foreground">
                {analytics.totalConversions || 0}
              </p>
              <p className="text-sm text-green-400 mt-2">
                +{analytics.conversionGrowth || 0}% growth
              </p>
            </div>
          </div>

          {/* Charts Placeholder */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Message Volume Trend
              </h2>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground/70">Chart visualization here</p>
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                AI Performance
              </h2>
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <p className="text-muted-foreground/70">Chart visualization here</p>
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="card">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Top Performing Workspaces
            </h2>
            <div className="space-y-3">
              {(analytics.topWorkspaces || []).map((workspace: any, idx: number) => (
                <div
                  key={workspace.id}
                  className="flex items-center gap-4 p-3 bg-muted rounded-lg"
                >
                  <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                    <span className="font-bold text-primary">{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {workspace.name}
                    </p>
                    <p className="text-sm text-muted-foreground/70">
                      {workspace.conversations} conversations
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {workspace.aiHandledRate}%
                    </p>
                    <p className="text-xs text-muted-foreground/70">AI handled</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
