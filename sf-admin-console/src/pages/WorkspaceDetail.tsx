import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi, instagramAdminApi, unwrapData } from '../services/api'
import { useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Users,
  MessageSquare,
  Activity,
  Calendar,
  TrendingUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'

type TabType = 'overview' | 'conversations' | 'members'

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const { data: workspaceData, isLoading: loadingWorkspace, refetch: refetchWorkspace } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => adminApi.getWorkspaceById(id!),
    enabled: Boolean(id),
  })

  const { data: conversationsData, isLoading: loadingConversations, refetch: refetchConversations } = useQuery({
    queryKey: ['workspace-conversations', id],
    queryFn: () =>
      adminApi.getAllConversations({ workspaceId: id, limit: 100 }),
    enabled: Boolean(id),
  })

  const { data: membersData, isLoading: loadingMembers, refetch: refetchMembers } = useQuery({
    queryKey: ['workspace-members', id],
    queryFn: () => adminApi.getWorkspaceMembers(id!),
    enabled: Boolean(id),
  })

  const { data: usageData } = useQuery({
    queryKey: ['workspace-usage', id],
    queryFn: () => adminApi.getWorkspaceUsage(id!),
    enabled: Boolean(id),
  })

  const {
    data: availableConversationsData,
    isLoading: loadingAvailableConversations,
    error: availableConversationsError,
    refetch: refetchAvailableConversations,
  } = useQuery({
    queryKey: ['workspace-available-conversations', id],
    queryFn: () => instagramAdminApi.getAvailableConversations(id!),
    enabled: Boolean(id),
  })

  const workspacePayload = unwrapData<any>(workspaceData)
  const conversationsPayload = unwrapData<any>(conversationsData)
  const membersPayload = unwrapData<any>(membersData)
  const usagePayload = unwrapData<any>(usageData)
  const availableConversationsPayload = unwrapData<any[]>(availableConversationsData)

  const workspace = workspacePayload
  const conversations = conversationsPayload?.conversations || []
  const members = membersPayload?.members || []
  const usage = usagePayload || {}
  const availableConversations = availableConversationsPayload || []
  const [syncingConversationId, setSyncingConversationId] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [resettingWorkspace, setResettingWorkspace] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleResetWorkspace = async () => {
    if (!id || resettingWorkspace) return
    const confirmed = window.confirm(
      'Reset this workspace? This will delete all conversations, messages, Instagram accounts, automations, and settings.'
    )
    if (!confirmed) return
    setResetError(null)
    setResettingWorkspace(true)
    try {
      await adminApi.resetWorkspace(id)
      await Promise.all([
        refetchWorkspace(),
        refetchConversations(),
        refetchMembers(),
        refetchAvailableConversations(),
      ])
    } catch (error) {
      console.error('Admin reset workspace error:', error)
      setResetError('Failed to reset workspace. Please try again.')
    } finally {
      setResettingWorkspace(false)
    }
  }

  const formatNumber = (value?: number) =>
    new Intl.NumberFormat('en-US').format(value || 0)
  const formatCost = (cents?: number) =>
    `$${((cents || 0) / 100).toFixed(2)}`

  const handleSyncConversation = async (conversationId: string) => {
    if (!id) return
    setSyncError(null)
    setSyncingConversationId(conversationId)
    try {
      await instagramAdminApi.syncConversation(id, conversationId)
      await Promise.all([refetchAvailableConversations(), refetchConversations()])
    } catch (error) {
      console.error('Admin sync conversation error:', error)
      setSyncError('Failed to sync conversation. Please try again.')
    } finally {
      setSyncingConversationId(null)
    }
  }

  if (loadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading workspace...</div>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Workspace not found</p>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare },
    { id: 'members', label: 'Members', icon: Users },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/workspaces')}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Workspaces
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/20 rounded-lg flex items-center justify-center">
              <Building2 className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {workspace.name}
              </h1>
              <p className="mt-1 text-muted-foreground">
                Created {new Date(workspace.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`badge ${
                workspace.isActive !== false ? 'badge-success' : 'badge-error'
              }`}
            >
              {workspace.isActive !== false ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={handleResetWorkspace}
              className="btn border border-red-500/40 text-red-500 hover:bg-red-500/10"
              disabled={resettingWorkspace}
            >
              {resettingWorkspace ? 'Resetting...' : 'Reset workspace'}
            </button>
            {resetError && (
              <span className="text-xs text-red-500">{resetError}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="card">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">Members</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {workspace.memberCount || 0}
                </p>
              </div>
              <div className="card">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">Conversations</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {workspace.conversationCount || 0}
                </p>
              </div>
              <div className="card">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">Today's Activity</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {workspace.todayActivity || 0}
                </p>
              </div>
              <div className="card">
                <div className="flex items-center gap-3 text-muted-foreground mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Response Rate</span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {workspace.responseRate || 0}%
                </p>
              </div>
            </div>

            {/* Workspace Info */}
            <div className="card">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Workspace Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Workspace ID</p>
                  <p className="text-foreground font-mono text-sm mt-1">
                    {workspace._id}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created At</p>
                  <p className="text-foreground mt-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(workspace.createdAt).toLocaleString()}
                  </p>
                </div>
                {workspace.instagramUsername && (
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Instagram Account
                    </p>
                    <p className="text-foreground mt-1">
                      @{workspace.instagramUsername}
                    </p>
                  </div>
                )}
                {workspace.description && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="text-foreground mt-1">
                      {workspace.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  AI Usage (last {usage.rangeDays || 30} days)
                </h3>
                <span className="text-xs text-muted-foreground">
                  Updated {usage.endAt ? new Date(usage.endAt).toLocaleString() : '—'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Input Tokens
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatNumber(usage.promptTokens)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Output Tokens
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatNumber(usage.completionTokens)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Total Tokens
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatNumber(usage.totalTokens)}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Estimated Cost
                  </p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatCost(usage.costCents)}
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Recent Conversations
              </h3>
              {loadingConversations ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : conversations.length === 0 ? (
                <p className="text-muted-foreground">No conversations yet</p>
              ) : (
                <div className="space-y-3">
                  {conversations.slice(0, 5).map((conv: any) => (
                    <div
                      key={conv._id}
                      onClick={() => navigate(`/conversations/${conv._id}`)}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {conv.participantName || 'Unknown'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {conv.messageCount || 0} messages
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`badge ${
                            conv.status === 'active'
                              ? 'badge-success'
                              : conv.status === 'pending'
                              ? 'badge-warning'
                              : 'badge-error'
                          }`}
                        >
                          {conv.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Instagram Conversations
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Sync individual conversations from Instagram.
                  </p>
                </div>
                <button
                  onClick={() => refetchAvailableConversations()}
                  disabled={loadingAvailableConversations || Boolean(syncingConversationId)}
                  className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/60 transition disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAvailableConversations ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {syncError && (
                <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {syncError}
                </div>
              )}

              {availableConversationsError ? (
                <div className="text-sm text-muted-foreground">
                  Unable to load Instagram conversations.
                </div>
              ) : loadingAvailableConversations ? (
                <div className="text-sm text-muted-foreground">Loading Instagram conversations...</div>
              ) : availableConversations.length === 0 ? (
                <div className="text-sm text-muted-foreground">No Instagram conversations available.</div>
              ) : (
                <div className="divide-y divide-border/60">
                  {availableConversations.map((conv: any) => (
                    <div key={conv.instagramConversationId} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">
                          {conv.participantName || 'Instagram User'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {conv.updatedAt ? new Date(conv.updatedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`badge ${conv.isSynced ? 'badge-success' : 'badge-warning'}`}>
                          {conv.isSynced ? 'Synced' : 'Not synced'}
                        </span>
                        <button
                          onClick={() => handleSyncConversation(conv.instagramConversationId)}
                          disabled={Boolean(syncingConversationId)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/60 transition disabled:opacity-60"
                        >
                          {syncingConversationId === conv.instagramConversationId
                            ? 'Syncing...'
                            : conv.isSynced ? 'Re-sync' : 'Sync'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                All Conversations ({conversations.length})
              </h3>
            </div>

            {loadingConversations ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="card text-center py-12">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
                <p className="text-muted-foreground">No conversations found</p>
              </div>
            ) : (
              <div className="card p-0 divide-y divide-border/60">
                {conversations.map((conv: any) => (
                  <div
                    key={conv._id}
                    onClick={() => navigate(`/conversations/${conv._id}`)}
                    className="p-4 cursor-pointer transition-all duration-200 hover:bg-muted/60 border-l-2 border-l-transparent hover:border-l-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-foreground truncate">
                            {conv.participantName || 'Unknown User'}
                          </h4>
                          {conv.participantUsername && (
                            <span className="text-xs text-muted-foreground truncate">
                              @{conv.participantUsername}
                            </span>
                          )}
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mb-2">
                            {conv.lastMessage.content || conv.lastMessage.text || 'No message'}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {conv.hasEscalation && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
                              Escalated
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {conv.messageCount || 0} messages
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span
                          className={`badge ${
                            conv.status === 'active'
                              ? 'badge-success'
                              : conv.status === 'pending'
                              ? 'badge-warning'
                              : 'badge-error'
                          }`}
                        >
                          {conv.status}
                        </span>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Workspace Members ({members.length})
              </h3>
            </div>

            {loadingMembers ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading members...
              </div>
            ) : members.length === 0 ? (
              <div className="card text-center py-12">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
                <p className="text-muted-foreground">No members found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {members.map((member: any) => (
                  <div key={member._id} className="card">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-foreground">
                          {member.userId?.name || member.userId?.email || 'Unknown'}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {member.userId?.email}
                        </p>
                      </div>
                      <span className="badge badge-primary">{member.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
