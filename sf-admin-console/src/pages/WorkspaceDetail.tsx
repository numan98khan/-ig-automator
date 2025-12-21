import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import { useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Users,
  MessageSquare,
  Settings,
  Activity,
  Calendar,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'

type TabType = 'overview' | 'conversations' | 'members' | 'automations'

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('overview')

  const { data: workspaceData, isLoading: loadingWorkspace } = useQuery({
    queryKey: ['workspace', id],
    queryFn: () => adminApi.getWorkspaceById(id!),
  })

  const { data: conversationsData, isLoading: loadingConversations } = useQuery({
    queryKey: ['workspace-conversations', id],
    queryFn: () =>
      adminApi.getAllConversations({ workspaceId: id, limit: 100 }),
  })

  const { data: membersData, isLoading: loadingMembers } = useQuery({
    queryKey: ['workspace-members', id],
    queryFn: () => adminApi.getWorkspaceMembers(id!),
  })

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ['workspace-categories', id],
    queryFn: () => adminApi.getWorkspaceCategories(id!),
  })

  const workspacePayload = unwrapData<any>(workspaceData)
  const conversationsPayload = unwrapData<any>(conversationsData)
  const membersPayload = unwrapData<any>(membersData)
  const categoriesPayload = unwrapData<any>(categoriesData)

  const workspace = workspacePayload
  const conversations = conversationsPayload?.conversations || []
  const members = membersPayload?.members || []
  const categories = categoriesPayload?.categories || []

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
    { id: 'automations', label: 'Automations', icon: Settings },
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
          <span
            className={`badge ${
              workspace.isActive !== false ? 'badge-success' : 'badge-error'
            }`}
          >
            {workspace.isActive !== false ? 'Active' : 'Inactive'}
          </span>
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
          <div className="space-y-4">
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
                          {conv.categoryName && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary border border-primary/40">
                              {conv.categoryName}
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

        {activeTab === 'automations' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                Automation Settings ({categories.length} categories)
              </h3>
            </div>

            {loadingCategories ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading automation settings...
              </div>
            ) : categories.length === 0 ? (
              <div className="card text-center py-12">
                <Settings className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
                <p className="text-muted-foreground">No automation categories configured</p>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map((category: any) => (
                  <div key={category._id} className="card">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold text-foreground text-lg">
                            {category.nameEn}
                          </h4>
                          {category.isSystem && (
                            <span className="badge badge-secondary text-xs">System</span>
                          )}
                        </div>
                        {category.descriptionEn && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {category.descriptionEn}
                          </p>
                        )}
                        {category.exampleMessages && category.exampleMessages.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {category.exampleMessages.slice(0, 3).map((example: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground"
                              >
                                "{example}"
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">AI Policy</p>
                        <span
                          className={`badge ${
                            category.aiPolicy === 'full_auto'
                              ? 'badge-success'
                              : category.aiPolicy === 'assist_only'
                              ? 'badge-warning'
                              : 'badge-error'
                          }`}
                        >
                          {category.aiPolicy === 'full_auto'
                            ? 'Full Auto'
                            : category.aiPolicy === 'assist_only'
                            ? 'Assist Only'
                            : 'Escalate'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Auto-Reply</p>
                        <span
                          className={`badge ${
                            category.autoReplyEnabled ? 'badge-success' : 'badge-error'
                          }`}
                        >
                          {category.autoReplyEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Messages</p>
                        <p className="text-foreground font-semibold">
                          {category.messageCount || 0}
                        </p>
                      </div>
                    </div>

                    {category.escalationNote && (
                      <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-sm text-foreground">
                          <span className="font-semibold">Escalation Note: </span>
                          {category.escalationNote}
                        </p>
                      </div>
                    )}
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
