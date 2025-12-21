import { useQuery } from '@tanstack/react-query'
import { MessageSquare, User, Clock, AlertCircle } from 'lucide-react'
import { adminApi } from '../services/api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Conversations() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', page, status],
    queryFn: () =>
      adminApi.getAllConversations({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
      }),
  })

  const conversations = data?.data?.conversations || []
  const pagination = data?.data?.pagination || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Conversations</h1>
        <p className="mt-2 text-muted-foreground">
          Monitor all conversations across workspaces
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option>
        </select>
      </div>

      {/* Conversations List */}
      <div className="card">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
            <p className="text-muted-foreground">No conversations found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conversation: any) => (
              <div
                key={conversation._id}
                onClick={() => navigate(`/conversations/${conversation._id}`)}
                className="p-4 hover:bg-muted transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {conversation.customerName || 'Unknown User'}
                        </h3>
                        <p className="text-xs text-muted-foreground/70">
                          {conversation.workspaceName || 'Unknown Workspace'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground ml-13">
                      {conversation.lastMessage?.text || 'No messages yet'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 ml-13">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
                        <Clock className="w-3 h-3" />
                        {new Date(conversation.updatedAt).toLocaleString()}
                      </div>
                      <span className="text-xs text-muted-foreground/70">
                        {conversation.messageCount || 0} messages
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`badge ${
                        conversation.status === 'active'
                          ? 'badge-success'
                          : conversation.status === 'escalated'
                          ? 'badge-error'
                          : 'badge-info'
                      }`}
                    >
                      {conversation.status}
                    </span>
                    {conversation.hasEscalation && (
                      <div className="flex items-center gap-1 text-yellow-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs">Escalated</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4 border-t border-border">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="btn btn-secondary disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.totalPages}
              className="btn btn-secondary disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
