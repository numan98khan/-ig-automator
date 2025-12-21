import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import {
  Bot,
  Save,
  RefreshCw,
  FileText,
  Settings,
  Database,
  Sparkles,
} from 'lucide-react'

export default function AIAssistantConfig() {
  const queryClient = useQueryClient()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['system-prompt'])
  )
  const [systemPrompt, setSystemPrompt] = useState('')
  const [assistantName, setAssistantName] = useState('SendFx Assistant')
  const [assistantDescription, setAssistantDescription] = useState(
    'Ask about product, pricing, or guardrails'
  )
  const [isSaving, setIsSaving] = useState(false)

  // Fetch workspaces to target assistant configuration
  const { data: workspaceData, isLoading: loadingWorkspaces } = useQuery({
    queryKey: ['assistant-workspaces'],
    queryFn: () => adminApi.getWorkspaces({ limit: 200 }),
  })

  const workspaces = (() => {
    const payload = unwrapData<any>(workspaceData)
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.workspaces)) return payload.workspaces
    return []
  })()

  // Default workspace to first available
  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0]._id)
    }
  }, [selectedWorkspaceId, workspaces])

  // Fetch assistant config for selected workspace
  const { data: configData } = useQuery({
    queryKey: ['assistant-config', selectedWorkspaceId],
    queryFn: () => adminApi.getAssistantConfig(selectedWorkspaceId!),
    enabled: !!selectedWorkspaceId,
  })

  // Update state when config data changes
  useEffect(() => {
    const config = unwrapData<any>(configData)
    if (config) {
      setSystemPrompt(config.systemPrompt || '')
      setAssistantName(config.assistantName || 'SendFx Assistant')
      setAssistantDescription(
        config.assistantDescription || 'Ask about product, pricing, or guardrails'
      )
    }
  }, [configData])

  // Fetch workspace knowledge items
  const { data: knowledgeData, isLoading: loadingKnowledge } = useQuery({
    queryKey: ['workspace-knowledge', selectedWorkspaceId],
    queryFn: () => adminApi.getWorkspaceKnowledgeItems(selectedWorkspaceId!),
    enabled: !!selectedWorkspaceId,
  })

  const knowledgePayload = unwrapData<any>(knowledgeData)
  const knowledgeItems = Array.isArray(knowledgePayload)
    ? knowledgePayload
    : Array.isArray(knowledgePayload?.items)
    ? knowledgePayload.items
    : []

  // Mutation for updating config
  const updateConfigMutation = useMutation({
    mutationFn: (config: any) =>
      adminApi.updateAssistantConfig(selectedWorkspaceId!, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-config', selectedWorkspaceId] })
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  // Mutation for reindexing knowledge
  const reindexMutation = useMutation({
    mutationFn: () => adminApi.reindexKnowledge(selectedWorkspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-knowledge', selectedWorkspaceId] })
    },
  })

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const handleSaveConfig = () => {
    if (!selectedWorkspaceId) return
    setIsSaving(true)
    updateConfigMutation.mutate({
      systemPrompt,
      assistantName,
      assistantDescription,
    })
  }

  const handleReindexKnowledge = () => {
    if (!selectedWorkspaceId) return
    if (
      confirm(
        'This will re-embed all vector-based knowledge items. Continue?'
      )
    ) {
      reindexMutation.mutate()
    }
  }

  const vectorItems = knowledgeItems.filter(
    (item: any) => item.storageMode === 'vector'
  )
  const textItems = knowledgeItems.filter(
    (item: any) => item.storageMode === 'text'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              SendFx Assistant
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Configure the workspace assistant and knowledge used for automated replies
            </p>
          </div>
        </div>
      </div>

      {/* Workspace Selector */}
      <div className="card">
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-foreground">Workspace</label>
          {loadingWorkspaces ? (
            <p className="text-muted-foreground text-sm">Loading workspaces...</p>
          ) : workspaces.length === 0 ? (
            <p className="text-muted-foreground text-sm">No workspaces available.</p>
          ) : (
            <select
              value={selectedWorkspaceId ?? ''}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="input max-w-md"
            >
              {workspaces.map((w: any) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="card">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Database className="w-4 h-4" />
            <span className="text-sm">Vector Knowledge</span>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {vectorItems.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            RAG-enabled items
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm">Text Knowledge</span>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {textItems.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Text-only items
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm">Total Sections</span>
          </div>
          <p className="text-3xl font-bold text-foreground">
            {knowledgeItems.length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            All knowledge items
          </p>
        </div>
      </div>

      {/* Documents Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="card">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Sections
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => toggleSection('system-prompt')}
              className={`w-full flex items-start gap-2 p-3 rounded-lg text-left transition-colors ${
                expandedSections.has('system-prompt')
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted'
              }`}
            >
              <Settings className="w-4 h-4 mt-0.5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  System Prompt
                </p>
                <p className="text-xs text-muted-foreground">
                  Configure AI behavior
                </p>
              </div>
            </button>

            <button
              onClick={() => toggleSection('knowledge-base')}
              className={`w-full flex items-start gap-2 p-3 rounded-lg text-left transition-colors ${
                expandedSections.has('knowledge-base')
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-muted'
              }`}
            >
              <FileText className="w-4 h-4 mt-0.5 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Knowledge Base
                </p>
                <p className="text-xs text-muted-foreground">
                  Public documentation
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-primary/20 text-primary rounded">
                  public
                </span>
              </div>
            </button>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <p className="text-xs font-semibold text-foreground mb-2">
              Tips for better embeddings
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Use clear, descriptive section titles</li>
              <li>• Keep sections focused on one topic</li>
              <li>• Include keywords users might search</li>
              <li>• Avoid very short sections (&lt;50 chars)</li>
            </ul>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* System Prompt Section */}
          {expandedSections.has('system-prompt') && (
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    System Prompt
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure AI agent behavior and personality
                  </p>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="btn btn-primary flex items-center gap-2 justify-center"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Assistant Name
                  </label>
                  <input
                    type="text"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    className="input w-full"
                    placeholder="SendFx Assistant"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Assistant Description
                  </label>
                  <input
                    type="text"
                    value={assistantDescription}
                    onChange={(e) =>
                      setAssistantDescription(e.target.value)
                    }
                    className="input w-full"
                    placeholder="Ask about product, pricing, or guardrails"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    System Prompt
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={12}
                    className="input w-full font-mono text-sm"
                    placeholder="You are a helpful AI assistant for SendFx..."
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    This prompt defines how the AI agent behaves and
                    responds to users. It has no access to user or workspace data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Base Section */}
          {expandedSections.has('knowledge-base') && (
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Public Knowledge Base
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {knowledgeItems.length} sections
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReindexKnowledge}
                    disabled={reindexMutation.isPending}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${
                        reindexMutation.isPending ? 'animate-spin' : ''
                      }`}
                    />
                    Re-embed All
                  </button>
                </div>
              </div>

              {loadingKnowledge ? (
                <div className="text-center py-12 text-muted-foreground">
                  Loading knowledge items...
                </div>
              ) : knowledgeItems.length === 0 ? (
                <div className="text-center py-12">
                  <Database className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No knowledge items yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Knowledge items are managed via the backend API.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {knowledgeItems.map((item: any, index: number) => (
                    <div
                      key={item._id}
                      className="flex items-start gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                    >
                      <div className="w-8 h-8 bg-primary/20 rounded flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">
                          #{index + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground mb-1">
                          {item.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {item.content?.substring(0, 150)}...
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${
                              item.storageMode === 'vector'
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted-foreground/20 text-muted-foreground'
                            }`}
                          >
                            {item.storageMode === 'vector'
                              ? 'RAG (pgvector)'
                              : 'Text only'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
