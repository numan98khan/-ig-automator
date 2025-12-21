import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import {
  Bot,
  Save,
  RefreshCw,
  FileText,
  Settings,
} from 'lucide-react'

export default function AIAssistantConfig() {
  const queryClient = useQueryClient()
  const [selectedSection, setSelectedSection] = useState<'system-prompt' | 'knowledge-base'>('system-prompt')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [assistantName, setAssistantName] = useState('SendFx Assistant')
  const [assistantDescription, setAssistantDescription] = useState(
    'Ask about product, pricing, or guardrails'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState('')
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('')
  const [newKnowledgeStorageMode, setNewKnowledgeStorageMode] = useState<'vector' | 'text'>('vector')

  // Fetch global assistant config
  const { data: configData } = useQuery({
    queryKey: ['global-assistant-config'],
    queryFn: () => adminApi.getGlobalAssistantConfig(),
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

  // Fetch global knowledge items
  const { data: knowledgeData, isLoading: loadingKnowledge } = useQuery({
    queryKey: ['global-knowledge-items'],
    queryFn: () => adminApi.getGlobalKnowledgeItems(),
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
      adminApi.updateGlobalAssistantConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-assistant-config'] })
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  // Mutation for reindexing knowledge
  const reindexMutation = useMutation({
    mutationFn: () => adminApi.reindexGlobalKnowledge(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-knowledge-items'] })
    },
  })

  const createKnowledgeMutation = useMutation({
    mutationFn: (data: { title: string; content: string; storageMode: 'vector' | 'text' }) =>
      adminApi.createGlobalKnowledgeItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['global-knowledge-items'] })
      setNewKnowledgeTitle('')
      setNewKnowledgeContent('')
      setNewKnowledgeStorageMode('vector')
    },
  })

  const toggleSection = (section: string) => {
    setSelectedSection(section as 'system-prompt' | 'knowledge-base')
  }

  const handleSaveConfig = () => {
    setIsSaving(true)
    updateConfigMutation.mutate({
      systemPrompt,
      assistantName,
      assistantDescription,
    })
  }

  const handleReindexKnowledge = () => {
    if (
      confirm(
        'This will re-embed all vector-based knowledge items. Continue?'
      )
    ) {
      reindexMutation.mutate()
    }
  }

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
              Configure the public assistant and shared knowledge used for automated replies
            </p>
          </div>
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
                selectedSection === 'system-prompt'
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
                selectedSection === 'knowledge-base'
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
          {selectedSection === 'system-prompt' && (
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
          {selectedSection === 'knowledge-base' && (
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <div className="lg:col-span-2">
                  <div className="card bg-muted/60 border border-border">
                    <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Add Knowledge Item
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Title</label>
                        <input
                          className="input w-full"
                          value={newKnowledgeTitle}
                          onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                          placeholder="e.g. Pricing tiers"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Content</label>
                        <textarea
                          className="input w-full h-28"
                          value={newKnowledgeContent}
                          onChange={(e) => setNewKnowledgeContent(e.target.value)}
                          placeholder="Provide clear, factual details the assistant can quote."
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-medium text-foreground">Storage</label>
                        <select
                          className="input w-40"
                          value={newKnowledgeStorageMode}
                          onChange={(e) => setNewKnowledgeStorageMode(e.target.value as 'vector' | 'text')}
                        >
                          <option value="vector">Vector (embeddings)</option>
                          <option value="text">Text only</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Good sections focus on one topic and stay under a few paragraphs.
                        </p>
                        <button
                          onClick={() =>
                            createKnowledgeMutation.mutate({
                              title: newKnowledgeTitle.trim(),
                              content: newKnowledgeContent.trim(),
                              storageMode: newKnowledgeStorageMode,
                            })
                          }
                          disabled={
                            createKnowledgeMutation.isPending ||
                            !newKnowledgeTitle.trim() ||
                            !newKnowledgeContent.trim()
                          }
                          className="btn btn-primary flex items-center gap-2"
                        >
                          {createKnowledgeMutation.isPending ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              Save
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="card bg-muted/60 border border-border">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Tips for embeddings</h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Use clear, descriptive section titles</li>
                    <li>• Keep sections focused on one topic</li>
                    <li>• Include keywords users might search</li>
                    <li>• Avoid very short sections (&lt;50 chars)</li>
                  </ul>
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
