import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import { Bot, RefreshCw, Save, Settings, ToggleLeft, ToggleRight } from 'lucide-react'

type TemplateConfig = {
  templateId: string
  name?: string
  description?: string
  aiReply?: {
    model?: string
    temperature?: number
    maxOutputTokens?: number
    reasoningEffort?: string
  }
  categorization?: {
    model?: string
    temperature?: number
    reasoningEffort?: string
  }
  updatedAt?: string
}

type ReasoningEffortOption = 'default' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

type FormState = {
  aiReplyModel: string
  aiReplyTemperature: number | null
  aiReplyMaxOutputTokens: number | null
  aiReplyReasoningEffort: ReasoningEffortOption
  categorizationModel: string
  categorizationTemperature: number | null
  categorizationReasoningEffort: ReasoningEffortOption
}

type DefaultsState = {
  lockMode: 'none' | 'session_only'
  lockTtlMinutes: number | null
  releaseKeywords: string
  faqInterruptEnabled: boolean
  faqIntentKeywords: string
  faqResponseSuffix: string
}

type WorkspaceOption = {
  _id: string
  name: string
}

type AutomationOption = {
  _id: string
  name: string
  workspaceId: string
  replySteps?: Array<{ type?: string; templateFlow?: { templateId?: string } }>
  triggerType?: string
  isActive?: boolean
}

type AutomationSessionRow = {
  _id: string
  status: string
  step?: string
  questionCount?: number
  automationId: string
  conversationId: string
  updatedAt?: string
  lastCustomerMessageAt?: string
  lastAutomationMessageAt?: string
  pauseReason?: string
  conversation?: {
    participantInstagramId?: string
    lastMessageAt?: string
    lastMessage?: string
    lastCustomerMessageAt?: string
  } | null
}

const DEFAULTS = {
  aiReply: {
    model: 'gpt-4o-mini',
    temperature: 0.35,
    maxOutputTokens: 420,
    reasoningEffort: 'default' as ReasoningEffortOption,
  },
  categorization: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    reasoningEffort: 'default' as ReasoningEffortOption,
  },
  defaults: {
    lockMode: 'session_only' as const,
    lockTtlMinutes: 45,
    releaseKeywords: 'agent, human, stop, cancel',
    faqInterruptEnabled: true,
    faqIntentKeywords: 'return, refund, policy, exchange, warranty, shipping, delivery, hours, location',
    faqResponseSuffix: 'Want to continue with the product details?',
  },
}

const MODEL_OPTIONS = [
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano-2025-08-07',
  'gpt-5-mini',
  'gpt-5-nano',
  'gpt-4o-mini',
  'gpt-4o',
]

const REASONING_OPTIONS: Array<{ value: ReasoningEffortOption; label: string }> = [
  { value: 'default', label: 'Default (model)' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'none', label: 'None (gpt-5.1+ only)' },
]

const toNumberOrDefault = (value: any, fallback: number) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : fallback

export default function AutomationTemplates() {
  const queryClient = useQueryClient()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('sales_concierge')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>('')
  const [formState, setFormState] = useState<FormState>({
    aiReplyModel: DEFAULTS.aiReply.model,
    aiReplyTemperature: DEFAULTS.aiReply.temperature,
    aiReplyMaxOutputTokens: DEFAULTS.aiReply.maxOutputTokens,
    aiReplyReasoningEffort: DEFAULTS.aiReply.reasoningEffort,
    categorizationModel: DEFAULTS.categorization.model,
    categorizationTemperature: DEFAULTS.categorization.temperature,
    categorizationReasoningEffort: DEFAULTS.categorization.reasoningEffort,
  })
  const [defaultsState, setDefaultsState] = useState<DefaultsState>({
    lockMode: DEFAULTS.defaults.lockMode,
    lockTtlMinutes: DEFAULTS.defaults.lockTtlMinutes,
    releaseKeywords: DEFAULTS.defaults.releaseKeywords,
    faqInterruptEnabled: DEFAULTS.defaults.faqInterruptEnabled,
    faqIntentKeywords: DEFAULTS.defaults.faqIntentKeywords,
    faqResponseSuffix: DEFAULTS.defaults.faqResponseSuffix,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingDefaults, setIsSavingDefaults] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['automation-templates'],
    queryFn: () => adminApi.getAutomationTemplates(),
  })
  const { data: defaultsData } = useQuery({
    queryKey: ['automation-defaults', selectedTemplateId],
    queryFn: () => adminApi.getAutomationDefaults(selectedTemplateId),
    enabled: Boolean(selectedTemplateId),
  })

  const { data: workspaceData } = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => adminApi.getWorkspaces({ page: 1, limit: 200 }),
  })

  const { data: automationsData } = useQuery({
    queryKey: ['admin-automations', selectedWorkspaceId],
    queryFn: () => adminApi.getAutomations({ workspaceId: selectedWorkspaceId || undefined }),
    enabled: Boolean(selectedWorkspaceId),
  })

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ['admin-automation-sessions', selectedAutomationId],
    queryFn: () => adminApi.getAutomationSessions({ automationId: selectedAutomationId }),
    enabled: Boolean(selectedAutomationId),
  })

  const templates = useMemo(() => {
    const payload = unwrapData<any>(data)
    return Array.isArray(payload) ? (payload as TemplateConfig[]) : []
  }, [data])

  const workspaces = useMemo(() => {
    const payload = unwrapData<any>(workspaceData)
    if (Array.isArray(payload)) return payload as WorkspaceOption[]
    if (Array.isArray(payload?.workspaces)) return payload.workspaces as WorkspaceOption[]
    return []
  }, [workspaceData])

  const automations = useMemo(() => {
    const payload = unwrapData<any>(automationsData)
    return Array.isArray(payload) ? (payload as AutomationOption[]) : []
  }, [automationsData])

  const sessions = useMemo(() => {
    const payload = unwrapData<any>(sessionsData)
    return Array.isArray(payload) ? (payload as AutomationSessionRow[]) : []
  }, [sessionsData])

  useEffect(() => {
    if (!templates.length) return
    if (!templates.find((template) => template.templateId === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].templateId)
    }
  }, [templates, selectedTemplateId])

  useEffect(() => {
    if (!workspaces.length) return
    if (!selectedWorkspaceId) {
      setSelectedWorkspaceId(workspaces[0]._id)
    }
  }, [workspaces, selectedWorkspaceId])

  useEffect(() => {
    if (!automations.length) {
      setSelectedAutomationId('')
      return
    }
    if (!automations.find((automation) => automation._id === selectedAutomationId)) {
      setSelectedAutomationId(automations[0]._id)
    }
  }, [automations, selectedAutomationId])

  const currentTemplate = templates.find((template) => template.templateId === selectedTemplateId)

  useEffect(() => {
    if (!currentTemplate) return
    setFormState({
      aiReplyModel: currentTemplate.aiReply?.model || DEFAULTS.aiReply.model,
      aiReplyTemperature: toNumberOrDefault(currentTemplate.aiReply?.temperature, DEFAULTS.aiReply.temperature),
      aiReplyMaxOutputTokens: toNumberOrDefault(
        currentTemplate.aiReply?.maxOutputTokens,
        DEFAULTS.aiReply.maxOutputTokens,
      ),
      aiReplyReasoningEffort:
        (currentTemplate.aiReply?.reasoningEffort as ReasoningEffortOption) || DEFAULTS.aiReply.reasoningEffort,
      categorizationModel: currentTemplate.categorization?.model || DEFAULTS.categorization.model,
      categorizationTemperature: toNumberOrDefault(
        currentTemplate.categorization?.temperature,
        DEFAULTS.categorization.temperature,
      ),
      categorizationReasoningEffort:
        (currentTemplate.categorization?.reasoningEffort as ReasoningEffortOption)
        || DEFAULTS.categorization.reasoningEffort,
    })
  }, [currentTemplate?.templateId, currentTemplate?.updatedAt])

  useEffect(() => {
    const payload = unwrapData<any>(defaultsData)
    if (!payload) return
    setDefaultsState({
      lockMode: payload.lockMode || DEFAULTS.defaults.lockMode,
      lockTtlMinutes: toNumberOrDefault(payload.lockTtlMinutes, DEFAULTS.defaults.lockTtlMinutes),
      releaseKeywords: Array.isArray(payload.releaseKeywords)
        ? payload.releaseKeywords.join(', ')
        : DEFAULTS.defaults.releaseKeywords,
      faqInterruptEnabled: payload.faqInterruptEnabled ?? DEFAULTS.defaults.faqInterruptEnabled,
      faqIntentKeywords: Array.isArray(payload.faqIntentKeywords)
        ? payload.faqIntentKeywords.join(', ')
        : DEFAULTS.defaults.faqIntentKeywords,
      faqResponseSuffix: payload.faqResponseSuffix || DEFAULTS.defaults.faqResponseSuffix,
    })
  }, [defaultsData])

  const updateMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateAutomationTemplate(selectedTemplateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-templates'] })
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  const updateDefaultsMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateAutomationDefaults(selectedTemplateId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-defaults', selectedTemplateId] })
      setIsSavingDefaults(false)
    },
    onError: () => {
      setIsSavingDefaults(false)
    },
  })

  const pauseSessionsMutation = useMutation({
    mutationFn: (payload: { automationId?: string; sessionIds?: string[] }) =>
      adminApi.pauseAutomationSessions(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-automation-sessions', selectedAutomationId] })
    },
  })

  const stopSessionsMutation = useMutation({
    mutationFn: (payload: { automationId?: string; sessionIds?: string[] }) =>
      adminApi.stopAutomationSessions(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-automation-sessions', selectedAutomationId] })
    },
  })

  const handleSave = () => {
    if (!selectedTemplateId) return
    setIsSaving(true)
    updateMutation.mutate({
      aiReply: {
        model: formState.aiReplyModel.trim() || DEFAULTS.aiReply.model,
        temperature: formState.aiReplyTemperature ?? DEFAULTS.aiReply.temperature,
        maxOutputTokens: formState.aiReplyMaxOutputTokens ?? DEFAULTS.aiReply.maxOutputTokens,
        reasoningEffort: formState.aiReplyReasoningEffort === 'default' ? null : formState.aiReplyReasoningEffort,
      },
      categorization: {
        model: formState.categorizationModel.trim() || DEFAULTS.categorization.model,
        temperature: formState.categorizationTemperature ?? DEFAULTS.categorization.temperature,
        reasoningEffort: formState.categorizationReasoningEffort === 'default'
          ? null
          : formState.categorizationReasoningEffort,
      },
    })
  }

  const handleReset = () => {
    if (!currentTemplate) return
    setFormState({
      aiReplyModel: currentTemplate.aiReply?.model || DEFAULTS.aiReply.model,
      aiReplyTemperature: toNumberOrDefault(currentTemplate.aiReply?.temperature, DEFAULTS.aiReply.temperature),
      aiReplyMaxOutputTokens: toNumberOrDefault(
        currentTemplate.aiReply?.maxOutputTokens,
        DEFAULTS.aiReply.maxOutputTokens,
      ),
      aiReplyReasoningEffort:
        (currentTemplate.aiReply?.reasoningEffort as ReasoningEffortOption) || DEFAULTS.aiReply.reasoningEffort,
      categorizationModel: currentTemplate.categorization?.model || DEFAULTS.categorization.model,
      categorizationTemperature: toNumberOrDefault(
        currentTemplate.categorization?.temperature,
        DEFAULTS.categorization.temperature,
      ),
      categorizationReasoningEffort:
        (currentTemplate.categorization?.reasoningEffort as ReasoningEffortOption)
        || DEFAULTS.categorization.reasoningEffort,
    })
  }

  const handleSaveDefaults = () => {
    if (!selectedTemplateId) return
    setIsSavingDefaults(true)
    updateDefaultsMutation.mutate({
      lockMode: defaultsState.lockMode,
      lockTtlMinutes: defaultsState.lockTtlMinutes ?? DEFAULTS.defaults.lockTtlMinutes,
      releaseKeywords: defaultsState.releaseKeywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      faqInterruptEnabled: defaultsState.faqInterruptEnabled,
      faqIntentKeywords: defaultsState.faqIntentKeywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      faqResponseSuffix: defaultsState.faqResponseSuffix.trim() || DEFAULTS.defaults.faqResponseSuffix,
    })
  }

  const handlePauseAllSessions = () => {
    if (!selectedAutomationId) return
    pauseSessionsMutation.mutate({ automationId: selectedAutomationId })
  }

  const handleStopAllSessions = () => {
    if (!selectedAutomationId) return
    stopSessionsMutation.mutate({ automationId: selectedAutomationId })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Automation Templates
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Manage global AI settings for automation templates and categorization.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary flex items-center gap-2"
            onClick={handleReset}
            disabled={!currentTemplate}
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={handleSave}
            disabled={isSaving || !currentTemplate}
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-foreground mb-4">Templates</h3>
          <div className="space-y-2">
            {isLoading && (
              <div className="text-sm text-muted-foreground">Loading templates...</div>
            )}
            {!isLoading && templates.length === 0 && (
              <div className="text-sm text-muted-foreground">No templates found.</div>
            )}
            {templates.map((template) => (
              <button
                key={template.templateId}
                onClick={() => setSelectedTemplateId(template.templateId)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                  selectedTemplateId === template.templateId
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted'
                }`}
              >
                <Bot className="w-4 h-4 mt-0.5 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {template.name || 'Automation template'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {template.description || 'Template settings'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card lg:col-span-3 space-y-6">
          {!currentTemplate ? (
            <div className="text-sm text-muted-foreground">Select a template to edit.</div>
          ) : (
            <>
              <datalist id="model-options">
                {MODEL_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              <div>
                <h2 className="text-lg font-semibold text-foreground">AI Reply Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Controls the assistant model used to generate replies inside this template flow.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <input
                    className="input w-full font-mono text-sm"
                    list="model-options"
                    value={formState.aiReplyModel}
                    onChange={(e) => setFormState((prev) => ({ ...prev, aiReplyModel: e.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Temperature</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={0}
                    max={2}
                    step={0.05}
                    value={formState.aiReplyTemperature ?? ''}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        aiReplyTemperature: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Max output tokens</label>
                  <input
                    className="input w-full"
                    type="number"
                    min={1}
                    step={10}
                    value={formState.aiReplyMaxOutputTokens ?? ''}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        aiReplyMaxOutputTokens: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Reasoning effort</label>
                  <select
                    className="input w-full"
                    value={formState.aiReplyReasoningEffort}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        aiReplyReasoningEffort: e.target.value as ReasoningEffortOption,
                      }))
                    }
                  >
                    {REASONING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Message Categorization</h2>
                  <p className="text-sm text-muted-foreground">
                    Adjust the model used to detect intent and language for inbound messages.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Model</label>
                    <input
                      className="input w-full font-mono text-sm"
                      list="model-options"
                      value={formState.categorizationModel}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, categorizationModel: e.target.value }))
                      }
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Temperature</label>
                    <input
                      className="input w-full"
                      type="number"
                      min={0}
                      max={2}
                      step={0.05}
                      value={formState.categorizationTemperature ?? ''}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          categorizationTemperature: e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Reasoning effort</label>
                    <select
                      className="input w-full"
                      value={formState.categorizationReasoningEffort}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          categorizationReasoningEffort: e.target.value as ReasoningEffortOption,
                        }))
                      }
                    >
                      {REASONING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Runtime Defaults</h2>
                  <p className="text-sm text-muted-foreground">
                    Global defaults applied to Sales Concierge automations at runtime.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Lock mode</label>
                    <select
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={defaultsState.lockMode}
                      onChange={(e) =>
                        setDefaultsState((prev) => ({
                          ...prev,
                          lockMode: e.target.value as DefaultsState['lockMode'],
                        }))
                      }
                    >
                      <option value="session_only">Session lock</option>
                      <option value="none">No lock</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Lock TTL (minutes)</label>
                    <input
                      className="input w-full"
                      type="number"
                      min={1}
                      value={defaultsState.lockTtlMinutes ?? ''}
                      onChange={(e) =>
                        setDefaultsState((prev) => ({
                          ...prev,
                          lockTtlMinutes: e.target.value === '' ? null : Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Release keywords (comma-separated)</label>
                  <input
                    className="input w-full"
                    value={defaultsState.releaseKeywords}
                    onChange={(e) =>
                      setDefaultsState((prev) => ({ ...prev, releaseKeywords: e.target.value }))
                    }
                    placeholder="agent, human, stop, cancel"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">FAQ interrupts</p>
                    <p className="text-xs text-muted-foreground">Answer FAQs mid-flow using RAG.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDefaultsState((prev) => ({
                        ...prev,
                        faqInterruptEnabled: !prev.faqInterruptEnabled,
                      }))
                    }
                    className="text-primary"
                  >
                    {defaultsState.faqInterruptEnabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">FAQ intent keywords</label>
                  <input
                    className="input w-full"
                    value={defaultsState.faqIntentKeywords}
                    onChange={(e) =>
                      setDefaultsState((prev) => ({ ...prev, faqIntentKeywords: e.target.value }))
                    }
                    placeholder="return, refund, policy, exchange"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">FAQ response suffix</label>
                  <input
                    className="input w-full"
                    value={defaultsState.faqResponseSuffix}
                    onChange={(e) =>
                      setDefaultsState((prev) => ({ ...prev, faqResponseSuffix: e.target.value }))
                    }
                    placeholder="Want to continue with the product details?"
                  />
                </div>
                <div className="flex items-center justify-end">
                  <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={handleSaveDefaults}
                    disabled={isSavingDefaults}
                  >
                    <Save className="w-4 h-4" />
                    {isSavingDefaults ? 'Saving defaults...' : 'Save defaults'}
                  </button>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Active Sessions</h2>
                    <p className="text-sm text-muted-foreground">
                      View and control active automation sessions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn btn-secondary"
                      onClick={handlePauseAllSessions}
                      disabled={!selectedAutomationId || pauseSessionsMutation.isPending}
                    >
                      Pause all
                    </button>
                    <button
                      className="btn btn-destructive"
                      onClick={handleStopAllSessions}
                      disabled={!selectedAutomationId || stopSessionsMutation.isPending}
                    >
                      Stop all
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Workspace</label>
                    <select
                      className="select w-full"
                      value={selectedWorkspaceId}
                      onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                    >
                      {workspaces.map((workspace) => (
                        <option key={workspace._id} value={workspace._id}>
                          {workspace.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Automation</label>
                    <select
                      className="select w-full"
                      value={selectedAutomationId}
                      onChange={(event) => setSelectedAutomationId(event.target.value)}
                    >
                      {automations.map((automation) => (
                        <option key={automation._id} value={automation._id}>
                          {automation.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {sessionsLoading ? (
                  <div className="text-sm text-muted-foreground">Loading sessions...</div>
                ) : sessions.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No active sessions for this automation.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-2 pr-4">Conversation</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Step</th>
                          <th className="py-2 pr-4">Updated</th>
                          <th className="py-2 pr-4">Last message</th>
                          <th className="py-2 pr-4">Pause reason</th>
                          <th className="py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session._id} className="border-b border-border/60">
                            <td className="py-3 pr-4">
                              <div className="text-foreground">
                                {session.conversation?.participantInstagramId || session.conversationId}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {session.conversationId}
                              </div>
                            </td>
                            <td className="py-3 pr-4">
                              <span className="badge badge-secondary">{session.status}</span>
                            </td>
                            <td className="py-3 pr-4">{session.step || '—'}</td>
                            <td className="py-3 pr-4">
                              {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : '—'}
                            </td>
                            <td className="py-3 pr-4 max-w-[220px] truncate">
                              {session.conversation?.lastMessage || '—'}
                            </td>
                            <td className="py-3 pr-4">{session.pauseReason || '—'}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() =>
                                    pauseSessionsMutation.mutate({ automationId: selectedAutomationId, sessionIds: [session._id] })
                                  }
                                  disabled={session.status !== 'active' || pauseSessionsMutation.isPending}
                                >
                                  Pause
                                </button>
                                <button
                                  className="btn btn-destructive btn-sm"
                                  onClick={() =>
                                    stopSessionsMutation.mutate({ automationId: selectedAutomationId, sessionIds: [session._id] })
                                  }
                                  disabled={session.status === 'completed' || stopSessionsMutation.isPending}
                                >
                                  Stop
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
