import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../services/api'
import {
  ArrowLeft,
  MessageSquare,
  User,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Bot,
  Send,
} from 'lucide-react'

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: conversationData, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => adminApi.getConversationById(id!),
  })

  const payload = conversationData?.data?.data || conversationData?.data
  const conversation = payload?.conversation
  const messages = payload?.messages || []
  const workspace = conversation?.workspaceId

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading conversation...</div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'badge-success'
      case 'pending':
        return 'badge-warning'
      case 'resolved':
      case 'closed':
        return 'badge-error'
      default:
        return 'badge-secondary'
    }
  }

  const getSenderIcon = (sender: string) => {
    if (sender === 'ai' || sender === 'bot') {
      return <Bot className="w-5 h-5" />
    }
    return <User className="w-5 h-5" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="card">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  {conversation.participantName || 'Unknown User'}
                </h1>
                <p className="mt-1 text-muted-foreground">
                  {conversation.participantUsername && `@${conversation.participantUsername}`}
                </p>
              </div>
            </div>
            <span className={`badge ${getStatusColor(conversation.status)}`}>
              {conversation.status}
            </span>
          </div>

          {/* Conversation Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-border">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Building2 className="w-4 h-4" />
                <span className="text-sm">Workspace</span>
              </div>
              <p className="text-foreground font-medium">
                {workspace?.name || 'Unknown'}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm">Messages</span>
              </div>
              <p className="text-foreground font-medium">{messages.length}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Started</span>
              </div>
              <p className="text-foreground font-medium">
                {new Date(conversation.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Last Activity</span>
              </div>
              <p className="text-foreground font-medium">
                {new Date(conversation.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Escalation Info */}
          {conversation.hasEscalation && (
            <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">This conversation has been escalated</span>
              </div>
            </div>
          )}

          {/* Conversation ID */}
          <div className="mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">Conversation ID</p>
            <p className="text-foreground font-mono text-sm mt-1">
              {conversation._id}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="card">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          Messages ({messages.length})
        </h2>

        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
            <p className="text-muted-foreground">No messages in this conversation</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message: any, index: number) => {
              const isAI = message.sender === 'ai' || message.sender === 'bot'
              const isUser = message.sender === 'user'
              const isInstagram = message.sender === 'instagram'

              return (
                <div
                  key={message._id || index}
                  className={`flex gap-4 p-4 rounded-lg transition-colors ${
                    isAI
                      ? 'bg-primary/5 border border-primary/20'
                      : isUser
                      ? 'bg-muted/30'
                      : 'bg-card'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isAI
                        ? 'bg-primary/20 text-primary'
                        : isUser
                        ? 'bg-blue-500/20 text-blue-500'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {getSenderIcon(message.sender)}
                  </div>

                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-foreground">
                        {isAI
                          ? 'AI Assistant'
                          : isUser
                          ? conversation.participantName || 'User'
                          : isInstagram
                          ? 'Instagram'
                          : message.senderName || 'Unknown'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                      {message.isRead && (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      )}
                    </div>

                    {/* Message Text */}
                    <div className="text-foreground whitespace-pre-wrap break-words">
                      {message.content || message.text || message.message || '(No content)'}
                    </div>

                    {/* Message Metadata */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Send className="w-3 h-3" />
                        {message.sender}
                      </span>
                      {message.messageId && (
                        <span className="font-mono">{message.messageId.slice(0, 8)}...</span>
                      )}
                      {message.type && message.type !== 'text' && (
                        <span className="badge badge-secondary">{message.type}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Additional Info */}
      {conversation.metadata && Object.keys(conversation.metadata).length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Additional Information
          </h3>
          <div className="space-y-2">
            {Object.entries(conversation.metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground font-mono text-sm">
                  {JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
