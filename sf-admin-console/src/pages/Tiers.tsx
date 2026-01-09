import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import {
  Plus,
  Edit,
  Trash2,
  Shield,
  Zap,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from 'lucide-react'

type TierFormState = {
  _id?: string
  name: string
  description?: string
  status: 'active' | 'inactive' | 'deprecated'
  isDefault: boolean
  limits: {
    aiMessages?: number | null
    instagramAccounts?: number | null
    teamMembers?: number | null
    automations?: number | null
    knowledgeItems?: number | null
    crm?: boolean | null
    integrations?: boolean | null
    flowBuilder?: boolean | null
    executionTimeline?: boolean | null
  }
}

const EMPTY_TIER: TierFormState = {
  name: '',
  description: '',
  status: 'active',
  isDefault: false,
  limits: {},
}

export default function Tiers() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [formState, setFormState] = useState<TierFormState>(EMPTY_TIER)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['tiers'],
    queryFn: () => adminApi.getTiers({ limit: 100 }),
  })

  const tiers = unwrapData<any>(data)?.tiers || []

  const upsertMutation = useMutation({
    mutationFn: (payload: TierFormState) => {
      const body = {
        name: payload.name,
        description: payload.description,
        status: payload.status,
        isDefault: payload.isDefault,
        limits: normalizeLimits(payload.limits),
      }
      return payload._id ? adminApi.updateTier(payload._id, body) : adminApi.createTier(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
      setModalOpen(false)
      setFormState(EMPTY_TIER)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteTier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tiers'] })
      setDeleteId(null)
    },
  })

  const currentTitle = formState._id ? 'Edit tier' : 'Create tier'

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1)),
    [tiers],
  )

  const openEdit = (tier: any) => {
    setFormState({
      _id: tier._id,
      name: tier.name || '',
      description: tier.description || '',
      status: tier.status || 'active',
      isDefault: Boolean(tier.isDefault),
      limits: tier.limits || {},
    })
    setModalOpen(true)
  }

  const limitFields: Array<{ key: NumericLimitKey; label: string }> = [
    { key: 'aiMessages', label: 'AI messages' },
    { key: 'instagramAccounts', label: 'Instagram accounts' },
    { key: 'teamMembers', label: 'Team members' },
    { key: 'automations', label: 'Automations' },
    { key: 'knowledgeItems', label: 'Knowledge items' },
  ]

  const featureFields: Array<{ key: FeatureFlagKey; label: string; description: string }> = [
    { key: 'crm', label: 'CRM', description: 'Access CRM contacts, notes, and tasks.' },
    { key: 'integrations', label: 'Integrations', description: 'Enable third-party integrations.' },
    { key: 'flowBuilder', label: 'Flow builder', description: 'Create and manage automation flows.' },
    { key: 'executionTimeline', label: 'Execution timeline', description: 'Expose execution timeline logging in automation previews.' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tiers</h1>
          <p className="text-muted-foreground mt-1">Manage plans, limits, and defaults.</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={() => {
            setFormState(EMPTY_TIER)
            setModalOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          New tier
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading tiers...</div>
        ) : sortedTiers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No tiers found</div>
        ) : (
          <div className="divide-y divide-border">
            {sortedTiers.map((tier: any) => (
              <div key={tier._id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="text-lg font-semibold text-foreground">{tier.name}</span>
                    {tier.isDefault && <span className="badge badge-primary">Default</span>}
                    <span className="badge badge-secondary">{tier.status}</span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xl">{tier.description}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {limitFields.map((field) => (
                      <span key={field.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Zap className="w-3 h-3 text-primary" />
                        {field.label}: {displayLimit(tier.limits?.[field.key])}
                      </span>
                    ))}
                    {featureFields.map((field) => (
                      <span key={field.key} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                        <Zap className="w-3 h-3 text-primary" />
                        {field.label}: {displayFeature(tier.limits?.[field.key])}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Custom limits: {Object.keys(tier.limits || {}).length || 0}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    className="btn btn-secondary btn-sm flex items-center gap-2"
                    onClick={() => openEdit(tier)}
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-rose-500 flex items-center gap-2"
                    onClick={() => setDeleteId(tier._id)}
                    disabled={tier.isDefault}
                    title={tier.isDefault ? 'Cannot delete default tier' : 'Delete tier'}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">{currentTitle}</h3>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <LabeledInput
                  label="Name"
                  value={formState.name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm text-muted-foreground">Default tier</span>
                  <button
                    type="button"
                    onClick={() => setFormState((prev) => ({ ...prev, isDefault: !prev.isDefault }))}
                    className="text-primary"
                  >
                    {formState.isDefault ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                </div>
                <LabeledInput
                  label="Description"
                  value={formState.description || ''}
                  onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                />
                <div className="space-y-1">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <select
                    value={formState.status}
                    onChange={(e) => setFormState((prev) => ({ ...prev, status: e.target.value as TierFormState['status'] }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {limitFields.map((field) => (
                  <LabeledInput
                    key={field.key}
                    label={`${field.label} limit (blank = unlimited)`}
                    type="number"
                    value={formState.limits[field.key] ?? ''}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        limits: { ...prev.limits, [field.key]: e.target.value === '' ? null : Number(e.target.value) },
                      }))
                    }
                    min={0}
                  />
                ))}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">Feature access</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {featureFields.map((field) => (
                    <FeatureSelect
                      key={field.key}
                      label={field.label}
                      description={field.description}
                      value={formState.limits[field.key]}
                      onChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          limits: { ...prev.limits, [field.key]: value },
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border">
              <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
                <button
                  className="btn btn-primary flex items-center gap-2"
                  onClick={() => upsertMutation.mutate(formState)}
                  disabled={upsertMutation.isPending}
                >
                  {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
            </div>
          </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 space-y-3">
              <h3 className="text-lg font-semibold text-foreground">Delete tier?</h3>
              <p className="text-sm text-muted-foreground">This cannot be undone. Users assigned to this tier will lose their assignment.</p>
              <div className="flex items-center justify-end gap-2">
                <button className="btn btn-ghost" onClick={() => setDeleteId(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-destructive flex items-center gap-2"
                  onClick={() => deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function displayLimit(value?: number | null) {
  return value === null || value === undefined ? '∞' : value
}

function displayFeature(value?: boolean | null) {
  if (value === undefined || value === null) return 'Default'
  return value ? 'On' : 'Off'
}

function normalizeLimits(limits: TierFormState['limits']) {
  const cleaned: Record<string, number | boolean | undefined> = {}
  Object.entries(limits || {}).forEach(([key, val]) => {
    if (val === null || val === undefined || Number.isNaN(val)) {
      cleaned[key] = undefined
    } else {
      cleaned[key] = val
    }
  })
  return cleaned
}

function LabeledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label className="space-y-1 text-sm text-muted-foreground">
      <span>{label}</span>
      <input
        {...rest}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  )
}

type NumericLimitKey = 'aiMessages' | 'instagramAccounts' | 'teamMembers' | 'automations' | 'knowledgeItems'
type FeatureFlagKey = 'crm' | 'integrations' | 'flowBuilder' | 'executionTimeline'

type FeatureSelectProps = {
  label: string
  description: string
  value?: boolean | null
  onChange: (value: boolean | null) => void
}

function FeatureSelect({ label, description, value, onChange }: FeatureSelectProps) {
  const currentValue = value === null || value === undefined ? 'default' : value ? 'enabled' : 'disabled'
  return (
    <label className="space-y-1 text-sm text-muted-foreground">
      <span className="text-foreground">{label}</span>
      <p className="text-xs text-muted-foreground">{description}</p>
      <select
        value={currentValue}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === 'default' ? null : next === 'enabled')
        }}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      >
        <option value="default">Use default</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </label>
  )
}
