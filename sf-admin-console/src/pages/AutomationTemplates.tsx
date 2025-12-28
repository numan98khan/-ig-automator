import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import { Plus, Save, RefreshCw, UploadCloud, Trash2 } from 'lucide-react'

type TriggerType =
  | 'post_comment'
  | 'story_reply'
  | 'dm_message'
  | 'story_share'
  | 'instagram_ads'
  | 'live_comment'
  | 'ref_url'

type FlowTrigger = {
  type: TriggerType
  label?: string
  description?: string
  config?: Record<string, any>
}

type FlowField = {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'json' | 'text'
  description?: string
  required?: boolean
  defaultValue?: any
  options?: Array<{ label: string; value: string }>
  ui?: {
    placeholder?: string
    helpText?: string
    group?: string
    order?: number
  }
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
  source?: {
    nodeId?: string
    path?: string
  }
}

type FlowDisplay = {
  outcome?: string
  goal?: 'Bookings' | 'Sales' | 'Leads' | 'Support' | 'General'
  industry?: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General'
  setupTime?: string
  collects?: string[]
  icon?: string
  previewConversation?: Array<{ from: 'bot' | 'customer'; message: string }>
}

type FlowDraft = {
  _id: string
  name: string
  description?: string
  status: 'draft' | 'archived'
  templateId?: string
  dsl: Record<string, any>
  triggers?: FlowTrigger[]
  exposedFields?: FlowField[]
  display?: FlowDisplay
  updatedAt?: string
}

type FlowTemplate = {
  _id: string
  name: string
  description?: string
  status: 'active' | 'archived'
  currentVersionId?: string
}

type TriggerForm = {
  id: string
  type: TriggerType
  label: string
  description: string
  configText: string
}

type FieldForm = {
  id: string
  key: string
  label: string
  type: FlowField['type']
  description: string
  required: boolean
  defaultValue: string | boolean
  optionsText: string
  uiGroup: string
  uiOrder: string
  uiPlaceholder: string
  uiHelpText: string
  validationMin: string
  validationMax: string
  validationPattern: string
  sourceNodeId: string
  sourcePath: string
}

type DraftForm = {
  name: string
  description: string
  status: 'draft' | 'archived'
  templateId: string
  dslText: string
  triggers: TriggerForm[]
  fields: FieldForm[]
  display: {
    outcome: string
    goal: FlowDisplay['goal'] | ''
    industry: FlowDisplay['industry'] | ''
    setupTime: string
    collectsText: string
    icon: string
    previewText: string
  }
}

const TRIGGER_OPTIONS: Array<{ value: TriggerType; label: string }> = [
  { value: 'post_comment', label: 'Post or Reel Comments' },
  { value: 'story_reply', label: 'Story Reply' },
  { value: 'dm_message', label: 'Instagram Message' },
  { value: 'story_share', label: 'Story Share' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'live_comment', label: 'Live Comments' },
  { value: 'ref_url', label: 'Instagram Ref URL' },
]

const FIELD_TYPES: FlowField['type'][] = [
  'string',
  'number',
  'boolean',
  'select',
  'multi_select',
  'json',
  'text',
]

const GOAL_OPTIONS: Array<FlowDisplay['goal']> = ['Bookings', 'Sales', 'Leads', 'Support', 'General']
const INDUSTRY_OPTIONS: Array<FlowDisplay['industry']> = [
  'Clinics',
  'Salons',
  'Retail',
  'Restaurants',
  'Real Estate',
  'General',
]

const formatJson = (value: any) => {
  if (value === undefined || value === null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

const formatDefaultValue = (value: any, type: FlowField['type']) => {
  if (type === 'boolean') return Boolean(value)
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return formatJson(value)
}

const parseOptionsText = (text: string) => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const [labelPart, valuePart] = line.includes('|') ? line.split('|') : line.split(':')
    const label = (labelPart || '').trim()
    const value = (valuePart || labelPart || '').trim()
    return { label: label || value, value }
  }).filter((option) => option.value)
}

const parseDefaultValue = (field: FieldForm) => {
  const raw = field.defaultValue
  if (raw === '' || raw === undefined || raw === null) return undefined
  if (field.type === 'boolean') return Boolean(raw)
  if (field.type === 'number') {
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return undefined
    return parsed
  }
  if (field.type === 'json') {
    if (typeof raw !== 'string') return raw
    return JSON.parse(raw)
  }
  if (field.type === 'multi_select') {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
      return JSON.parse(raw)
    }
    return String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return raw
}

const buildEmptyDraftForm = (): DraftForm => ({
  name: '',
  description: '',
  status: 'draft',
  templateId: '',
  dslText: '{\n  "nodes": [],\n  "edges": []\n}',
  triggers: [],
  fields: [],
  display: {
    outcome: '',
    goal: '',
    industry: '',
    setupTime: '',
    collectsText: '',
    icon: '',
    previewText: '',
  },
})

const buildFieldForm = (field?: FlowField): FieldForm => ({
  id: `${Date.now()}-${Math.random()}`,
  key: field?.key || '',
  label: field?.label || '',
  type: field?.type || 'string',
  description: field?.description || '',
  required: Boolean(field?.required),
  defaultValue: formatDefaultValue(field?.defaultValue, field?.type || 'string'),
  optionsText: (field?.options || [])
    .map((option) => `${option.label}|${option.value}`)
    .join('\n'),
  uiGroup: field?.ui?.group || '',
  uiOrder: field?.ui?.order !== undefined ? String(field.ui.order) : '',
  uiPlaceholder: field?.ui?.placeholder || '',
  uiHelpText: field?.ui?.helpText || '',
  validationMin: field?.validation?.min !== undefined ? String(field.validation.min) : '',
  validationMax: field?.validation?.max !== undefined ? String(field.validation.max) : '',
  validationPattern: field?.validation?.pattern || '',
  sourceNodeId: field?.source?.nodeId || '',
  sourcePath: field?.source?.path || '',
})

const buildTriggerForm = (trigger?: FlowTrigger): TriggerForm => ({
  id: `${Date.now()}-${Math.random()}`,
  type: trigger?.type || 'dm_message',
  label: trigger?.label || '',
  description: trigger?.description || '',
  configText: formatJson(trigger?.config),
})

export default function AutomationTemplates() {
  const queryClient = useQueryClient()
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [draftForm, setDraftForm] = useState<DraftForm>(buildEmptyDraftForm())
  const [versionLabel, setVersionLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newDraftOpen, setNewDraftOpen] = useState(false)
  const [newDraftName, setNewDraftName] = useState('')
  const [newDraftDescription, setNewDraftDescription] = useState('')
  const [newDraftTemplateId, setNewDraftTemplateId] = useState('')

  const { data: draftData, isLoading } = useQuery({
    queryKey: ['flow-drafts'],
    queryFn: () => adminApi.getFlowDrafts(),
  })

  const { data: templateData } = useQuery({
    queryKey: ['flow-templates'],
    queryFn: () => adminApi.getFlowTemplates(),
  })

  const drafts = useMemo(() => {
    const payload = unwrapData<any>(draftData)
    return Array.isArray(payload) ? (payload as FlowDraft[]) : []
  }, [draftData])

  const templates = useMemo(() => {
    const payload = unwrapData<any>(templateData)
    return Array.isArray(payload) ? (payload as FlowTemplate[]) : []
  }, [templateData])

  const templateMap = useMemo(() => {
    const map = new Map<string, FlowTemplate>()
    templates.forEach((template) => map.set(template._id, template))
    return map
  }, [templates])

  const selectedDraft = drafts.find((draft) => draft._id === selectedDraftId) || null

  useEffect(() => {
    if (!selectedDraftId && drafts.length > 0) {
      setSelectedDraftId(drafts[0]._id)
    }
  }, [drafts, selectedDraftId])

  useEffect(() => {
    if (!selectedDraft) return
    setDraftForm({
      name: selectedDraft.name || '',
      description: selectedDraft.description || '',
      status: selectedDraft.status || 'draft',
      templateId: selectedDraft.templateId || '',
      dslText: formatJson(selectedDraft.dsl || {}),
      triggers: (selectedDraft.triggers || []).map((trigger) => buildTriggerForm(trigger)),
      fields: (selectedDraft.exposedFields || []).map((field) => buildFieldForm(field)),
      display: {
        outcome: selectedDraft.display?.outcome || '',
        goal: selectedDraft.display?.goal || '',
        industry: selectedDraft.display?.industry || '',
        setupTime: selectedDraft.display?.setupTime || '',
        collectsText: (selectedDraft.display?.collects || []).join(', '),
        icon: selectedDraft.display?.icon || '',
        previewText: formatJson(selectedDraft.display?.previewConversation || []),
      },
    })
    setVersionLabel('')
    setError(null)
  }, [selectedDraft])

  const createMutation = useMutation({
    mutationFn: (payload: any) => adminApi.createFlowDraft(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
      const created = unwrapData<any>(response)
      if (created?._id) {
        setSelectedDraftId(created._id)
      }
      setNewDraftName('')
      setNewDraftDescription('')
      setNewDraftTemplateId('')
      setNewDraftOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: any) => adminApi.updateFlowDraft(selectedDraftId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (payload: any) => adminApi.publishFlowDraft(selectedDraftId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })
      queryClient.invalidateQueries({ queryKey: ['flow-templates'] })
      setVersionLabel('')
    },
  })

  const handleCreateDraft = () => {
    if (!newDraftName.trim()) {
      setError('Draft name is required.')
      return
    }
    setError(null)
    createMutation.mutate({
      name: newDraftName.trim(),
      description: newDraftDescription.trim(),
      templateId: newDraftTemplateId || undefined,
      dsl: { nodes: [], edges: [] },
    })
  }

  const buildPayload = () => {
    if (!draftForm.name.trim()) {
      return { error: 'Draft name is required.' }
    }

    let dsl: any
    try {
      dsl = JSON.parse(draftForm.dslText || '{}')
    } catch {
      return { error: 'DSL must be valid JSON.' }
    }

    const triggers: FlowTrigger[] = []
    for (const trigger of draftForm.triggers) {
      if (!trigger.type) continue
      let config: Record<string, any> | undefined
      if (trigger.configText.trim()) {
        try {
          config = JSON.parse(trigger.configText)
        } catch {
          return { error: `Trigger config must be valid JSON for ${trigger.type}.` }
        }
      }
      triggers.push({
        type: trigger.type,
        label: trigger.label.trim() || undefined,
        description: trigger.description.trim() || undefined,
        ...(config ? { config } : {}),
      })
    }

    const exposedFields: FlowField[] = []
    for (const field of draftForm.fields) {
      const hasContent = Boolean(
        field.key ||
        field.label ||
        field.description ||
        field.optionsText ||
        field.uiGroup ||
        field.uiHelpText ||
        field.uiPlaceholder ||
        field.validationPattern ||
        field.sourceNodeId ||
        field.sourcePath ||
        field.defaultValue !== ''
      )
      if (!hasContent) continue
      if (!field.key.trim() || !field.label.trim()) {
        return { error: 'Each exposed field needs a key and label.' }
      }

      let defaultValue
      try {
        defaultValue = parseDefaultValue(field)
      } catch {
        return { error: `Default value for ${field.label} is invalid.` }
      }

      const options = field.optionsText.trim() ? parseOptionsText(field.optionsText) : []
      const uiOrder = field.uiOrder.trim() ? Number(field.uiOrder) : undefined
      if (field.uiOrder.trim() && Number.isNaN(uiOrder)) {
        return { error: `UI order for ${field.label} must be a number.` }
      }

      const validationMin = field.validationMin.trim() ? Number(field.validationMin) : undefined
      const validationMax = field.validationMax.trim() ? Number(field.validationMax) : undefined
      if ((field.validationMin.trim() && Number.isNaN(validationMin)) ||
          (field.validationMax.trim() && Number.isNaN(validationMax))) {
        return { error: `Validation bounds for ${field.label} must be numbers.` }
      }

      exposedFields.push({
        key: field.key.trim(),
        label: field.label.trim(),
        type: field.type,
        description: field.description.trim() || undefined,
        required: field.required || undefined,
        defaultValue,
        options: options.length ? options : undefined,
        ui: {
          placeholder: field.uiPlaceholder.trim() || undefined,
          helpText: field.uiHelpText.trim() || undefined,
          group: field.uiGroup.trim() || undefined,
          order: uiOrder,
        },
        validation: {
          min: validationMin,
          max: validationMax,
          pattern: field.validationPattern.trim() || undefined,
        },
        source: {
          nodeId: field.sourceNodeId.trim() || undefined,
          path: field.sourcePath.trim() || undefined,
        },
      })
    }

    let previewConversation
    if (draftForm.display.previewText.trim()) {
      try {
        previewConversation = JSON.parse(draftForm.display.previewText)
      } catch {
        return { error: 'Preview conversation must be valid JSON.' }
      }
    }

    const display: FlowDisplay | undefined = {
      outcome: draftForm.display.outcome.trim() || undefined,
      goal: draftForm.display.goal || undefined,
      industry: draftForm.display.industry || undefined,
      setupTime: draftForm.display.setupTime.trim() || undefined,
      collects: draftForm.display.collectsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      icon: draftForm.display.icon.trim() || undefined,
      previewConversation,
    }

    return {
      payload: {
        name: draftForm.name.trim(),
        description: draftForm.description.trim() || undefined,
        status: draftForm.status,
        templateId: draftForm.templateId || undefined,
        dsl,
        triggers,
        exposedFields,
        display,
      },
    }
  }

  const handleSaveDraft = () => {
    if (!selectedDraftId) return
    const result = buildPayload()
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    updateMutation.mutate(result.payload)
  }

  const handlePublish = () => {
    if (!selectedDraftId) return
    const result = buildPayload()
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    publishMutation.mutate({
      ...result.payload,
      dslSnapshot: result.payload.dsl,
      versionLabel: versionLabel.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Flow Builder</h1>
          <p className="text-muted-foreground mt-1">
            Author internal flow drafts, control display metadata, and expose configurable fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary flex items-center gap-2"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['flow-drafts'] })}
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={() => setNewDraftOpen((prev) => !prev)}
          >
            <Plus className="w-4 h-4" />
            New draft
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <div className="card p-4 space-y-4">
          {newDraftOpen && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="text-sm font-semibold text-foreground">New flow draft</div>
              <input
                className="input w-full"
                placeholder="Draft name"
                value={newDraftName}
                onChange={(event) => setNewDraftName(event.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Description (optional)"
                value={newDraftDescription}
                onChange={(event) => setNewDraftDescription(event.target.value)}
              />
              <select
                className="input w-full"
                value={newDraftTemplateId}
                onChange={(event) => setNewDraftTemplateId(event.target.value)}
              >
                <option value="">Create new template on publish</option>
                {templates.map((template) => (
                  <option key={template._id} value={template._id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary w-full"
                onClick={handleCreateDraft}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create draft'}
              </button>
            </div>
          )}

          <div className="text-sm font-semibold text-foreground">Drafts</div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading drafts...</div>
          ) : drafts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No drafts yet.</div>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => {
                const isActive = draft._id === selectedDraftId
                const templateName = draft.templateId ? templateMap.get(draft.templateId)?.name : ''
                return (
                  <button
                    key={draft._id}
                    onClick={() => setSelectedDraftId(draft._id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                      isActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{draft.name}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{draft.status}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {templateName ? `Template: ${templateName}` : 'New template on publish'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="card p-6 space-y-6">
          {!selectedDraft ? (
            <div className="text-sm text-muted-foreground">Select a draft to edit.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Draft settings</h2>
                  <p className="text-sm text-muted-foreground">
                    Update metadata, configurable fields, and publish versions.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={handleSaveDraft}
                    disabled={updateMutation.isPending}
                  >
                    <Save className="w-4 h-4" />
                    {updateMutation.isPending ? 'Saving...' : 'Save draft'}
                  </button>
                  <button
                    className="btn btn-primary flex items-center gap-2"
                    onClick={handlePublish}
                    disabled={publishMutation.isPending}
                  >
                    <UploadCloud className="w-4 h-4" />
                    {publishMutation.isPending ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Draft name</label>
                  <input
                    className="input w-full"
                    value={draftForm.name}
                    onChange={(event) => setDraftForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <select
                    className="input w-full"
                    value={draftForm.status}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, status: event.target.value as DraftForm['status'] }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-muted-foreground">Description</label>
                  <input
                    className="input w-full"
                    value={draftForm.description}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm text-muted-foreground">Template association</label>
                  <select
                    className="input w-full"
                    value={draftForm.templateId}
                    onChange={(event) =>
                      setDraftForm((prev) => ({ ...prev, templateId: event.target.value }))
                    }
                  >
                    <option value="">Create new template on publish</option>
                    {templates.map((template) => (
                      <option key={template._id} value={template._id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Display metadata</h3>
                    <p className="text-sm text-muted-foreground">
                      Controls what the end user sees in the automation gallery.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Outcome</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.outcome}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, outcome: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Setup time</label>
                    <input
                      className="input w-full"
                      placeholder="~5 min"
                      value={draftForm.display.setupTime}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, setupTime: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Goal</label>
                    <select
                      className="input w-full"
                      value={draftForm.display.goal}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, goal: event.target.value as DraftForm['display']['goal'] },
                        }))
                      }
                    >
                      <option value="">Select goal</option>
                      {GOAL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Industry</label>
                    <select
                      className="input w-full"
                      value={draftForm.display.industry}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, industry: event.target.value as DraftForm['display']['industry'] },
                        }))
                      }
                    >
                      <option value="">Select industry</option>
                      {INDUSTRY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Collects (comma-separated)</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.collectsText}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, collectsText: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Icon key</label>
                    <input
                      className="input w-full"
                      value={draftForm.display.icon}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, icon: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm text-muted-foreground">Preview conversation (JSON)</label>
                    <textarea
                      className="input w-full h-32 font-mono text-xs"
                      value={draftForm.display.previewText}
                      onChange={(event) =>
                        setDraftForm((prev) => ({
                          ...prev,
                          display: { ...prev.display, previewText: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Triggers</h3>
                    <p className="text-sm text-muted-foreground">
                      Define how this flow is triggered. Expose settings via fields if needed.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={() =>
                      setDraftForm((prev) => ({
                        ...prev,
                        triggers: [...prev.triggers, buildTriggerForm()],
                      }))
                    }
                  >
                    <Plus className="w-4 h-4" />
                    Add trigger
                  </button>
                </div>
                {draftForm.triggers.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No triggers configured yet.</div>
                ) : (
                  <div className="space-y-4">
                    {draftForm.triggers.map((trigger, index) => (
                      <div key={trigger.id} className="rounded-lg border border-border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Trigger {index + 1}</div>
                          <button
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                            onClick={() =>
                              setDraftForm((prev) => ({
                                ...prev,
                                triggers: prev.triggers.filter((item) => item.id !== trigger.id),
                              }))
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Type</label>
                            <select
                              className="input w-full"
                              value={trigger.type}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  triggers: prev.triggers.map((item) =>
                                    item.id === trigger.id
                                      ? { ...item, type: event.target.value as TriggerType }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              {TRIGGER_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Label</label>
                            <input
                              className="input w-full"
                              value={trigger.label}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  triggers: prev.triggers.map((item) =>
                                    item.id === trigger.id
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm text-muted-foreground">Description</label>
                            <input
                              className="input w-full"
                              value={trigger.description}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  triggers: prev.triggers.map((item) =>
                                    item.id === trigger.id
                                      ? { ...item, description: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm text-muted-foreground">Config (JSON)</label>
                            <textarea
                              className="input w-full h-24 font-mono text-xs"
                              value={trigger.configText}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  triggers: prev.triggers.map((item) =>
                                    item.id === trigger.id
                                      ? { ...item, configText: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Exposed fields</h3>
                    <p className="text-sm text-muted-foreground">
                      Choose which inputs are configurable on the customer automations page.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={() =>
                      setDraftForm((prev) => ({
                        ...prev,
                        fields: [...prev.fields, buildFieldForm()],
                      }))
                    }
                  >
                    <Plus className="w-4 h-4" />
                    Add field
                  </button>
                </div>
                {draftForm.fields.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No exposed fields yet.</div>
                ) : (
                  <div className="space-y-4">
                    {draftForm.fields.map((field, index) => (
                      <div key={field.id} className="rounded-lg border border-border p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium">Field {index + 1}</div>
                          <button
                            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                            onClick={() =>
                              setDraftForm((prev) => ({
                                ...prev,
                                fields: prev.fields.filter((item) => item.id !== field.id),
                              }))
                            }
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Key</label>
                            <input
                              className="input w-full"
                              value={field.key}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id ? { ...item, key: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Label</label>
                            <input
                              className="input w-full"
                              value={field.label}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id ? { ...item, label: event.target.value } : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Type</label>
                            <select
                              className="input w-full"
                              value={field.type}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, type: event.target.value as FieldForm['type'] }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              {FIELD_TYPES.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-sm text-muted-foreground">Description</label>
                            <input
                              className="input w-full"
                              value={field.description}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, description: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Required</label>
                            <select
                              className="input w-full"
                              value={field.required ? 'yes' : 'no'}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, required: event.target.value === 'yes' }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              <option value="no">Optional</option>
                              <option value="yes">Required</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Default value</label>
                            {field.type === 'boolean' ? (
                              <select
                                className="input w-full"
                                value={field.defaultValue ? 'true' : 'false'}
                                onChange={(event) =>
                                  setDraftForm((prev) => ({
                                    ...prev,
                                    fields: prev.fields.map((item) =>
                                      item.id === field.id
                                        ? { ...item, defaultValue: event.target.value === 'true' }
                                        : item,
                                    ),
                                  }))
                                }
                              >
                                <option value="false">False</option>
                                <option value="true">True</option>
                              </select>
                            ) : (
                              <input
                                className="input w-full"
                                value={field.defaultValue as string}
                                onChange={(event) =>
                                  setDraftForm((prev) => ({
                                    ...prev,
                                    fields: prev.fields.map((item) =>
                                      item.id === field.id
                                        ? { ...item, defaultValue: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            )}
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">
                              Options (one per line: label|value)
                            </label>
                            <textarea
                              className="input w-full h-24 font-mono text-xs"
                              value={field.optionsText}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, optionsText: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Group</label>
                            <input
                              className="input w-full"
                              value={field.uiGroup}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiGroup: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">UI order</label>
                            <input
                              className="input w-full"
                              value={field.uiOrder}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiOrder: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Placeholder</label>
                            <input
                              className="input w-full"
                              value={field.uiPlaceholder}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiPlaceholder: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">Help text</label>
                            <input
                              className="input w-full"
                              value={field.uiHelpText}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, uiHelpText: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Validation min</label>
                            <input
                              className="input w-full"
                              value={field.validationMin}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationMin: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Validation max</label>
                            <input
                              className="input w-full"
                              value={field.validationMax}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationMax: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2 md:col-span-3">
                            <label className="text-sm text-muted-foreground">Validation pattern</label>
                            <input
                              className="input w-full"
                              value={field.validationPattern}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, validationPattern: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Source node</label>
                            <input
                              className="input w-full"
                              value={field.sourceNodeId}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, sourceNodeId: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm text-muted-foreground">Source path</label>
                            <input
                              className="input w-full"
                              value={field.sourcePath}
                              onChange={(event) =>
                                setDraftForm((prev) => ({
                                  ...prev,
                                  fields: prev.fields.map((item) =>
                                    item.id === field.id
                                      ? { ...item, sourcePath: event.target.value }
                                      : item,
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Flow DSL</h3>
                  <p className="text-sm text-muted-foreground">
                    Store the draft graph JSON for the internal builder.
                  </p>
                </div>
                <textarea
                  className="input w-full h-64 font-mono text-xs"
                  value={draftForm.dslText}
                  onChange={(event) =>
                    setDraftForm((prev) => ({ ...prev, dslText: event.target.value }))
                  }
                />
              </div>

              <div className="border-t border-border pt-6 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Version label (optional)</label>
                    <input
                      className="input w-full"
                      value={versionLabel}
                      onChange={(event) => setVersionLabel(event.target.value)}
                      placeholder="e.g. v2.0"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      className="btn btn-primary w-full flex items-center gap-2 justify-center"
                      onClick={handlePublish}
                      disabled={publishMutation.isPending}
                    >
                      <UploadCloud className="w-4 h-4" />
                      {publishMutation.isPending ? 'Publishing...' : 'Publish draft'}
                    </button>
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
