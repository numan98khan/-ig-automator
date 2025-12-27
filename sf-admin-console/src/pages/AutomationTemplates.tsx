import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import { Bot, RefreshCw, Save, Settings } from 'lucide-react'

type TemplateConfig = {
  templateId: string
  name?: string
  description?: string
  aiReply?: {
    model?: string
    temperature?: number
    maxOutputTokens?: number
  }
  categorization?: {
    model?: string
    temperature?: number
  }
  updatedAt?: string
}

type FormState = {
  aiReplyModel: string
  aiReplyTemperature: number | null
  aiReplyMaxOutputTokens: number | null
  categorizationModel: string
  categorizationTemperature: number | null
}

const DEFAULTS = {
  aiReply: {
    model: 'gpt-4o-mini',
    temperature: 0.35,
    maxOutputTokens: 420,
  },
  categorization: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
  },
}

const toNumberOrDefault = (value: any, fallback: number) =>
  typeof value === 'number' && !Number.isNaN(value) ? value : fallback

export default function AutomationTemplates() {
  const queryClient = useQueryClient()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('sales_concierge')
  const [formState, setFormState] = useState<FormState>({
    aiReplyModel: DEFAULTS.aiReply.model,
    aiReplyTemperature: DEFAULTS.aiReply.temperature,
    aiReplyMaxOutputTokens: DEFAULTS.aiReply.maxOutputTokens,
    categorizationModel: DEFAULTS.categorization.model,
    categorizationTemperature: DEFAULTS.categorization.temperature,
  })
  const [isSaving, setIsSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['automation-templates'],
    queryFn: () => adminApi.getAutomationTemplates(),
  })

  const templates = useMemo(() => {
    const payload = unwrapData<any>(data)
    return Array.isArray(payload) ? (payload as TemplateConfig[]) : []
  }, [data])

  useEffect(() => {
    if (!templates.length) return
    if (!templates.find((template) => template.templateId === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].templateId)
    }
  }, [templates, selectedTemplateId])

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
      categorizationModel: currentTemplate.categorization?.model || DEFAULTS.categorization.model,
      categorizationTemperature: toNumberOrDefault(
        currentTemplate.categorization?.temperature,
        DEFAULTS.categorization.temperature,
      ),
    })
  }, [currentTemplate?.templateId, currentTemplate?.updatedAt])

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

  const handleSave = () => {
    if (!selectedTemplateId) return
    setIsSaving(true)
    updateMutation.mutate({
      aiReply: {
        model: formState.aiReplyModel.trim() || DEFAULTS.aiReply.model,
        temperature: formState.aiReplyTemperature ?? DEFAULTS.aiReply.temperature,
        maxOutputTokens: formState.aiReplyMaxOutputTokens ?? DEFAULTS.aiReply.maxOutputTokens,
      },
      categorization: {
        model: formState.categorizationModel.trim() || DEFAULTS.categorization.model,
        temperature: formState.categorizationTemperature ?? DEFAULTS.categorization.temperature,
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
      categorizationModel: currentTemplate.categorization?.model || DEFAULTS.categorization.model,
      categorizationTemperature: toNumberOrDefault(
        currentTemplate.categorization?.temperature,
        DEFAULTS.categorization.temperature,
      ),
    })
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
              <div>
                <h2 className="text-lg font-semibold text-foreground">AI Reply Settings</h2>
                <p className="text-sm text-muted-foreground">
                  Controls the assistant model used to generate replies inside this template flow.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Model</label>
                  <input
                    className="input w-full font-mono text-sm"
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
              </div>

              <div className="border-t border-border pt-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Message Categorization</h2>
                  <p className="text-sm text-muted-foreground">
                    Adjust the model used to detect intent and language for inbound messages.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Model</label>
                    <input
                      className="input w-full font-mono text-sm"
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
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
