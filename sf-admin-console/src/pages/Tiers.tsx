import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi, Tier, TierInput, TierLimits, unwrapData } from '../services/api'
import { Layers, Plus, Shield, Trash2, Edit, Save, X, Search, CheckCircle, Info } from 'lucide-react'

const limitFields: { key: keyof TierLimits; label: string }[] = [
  { key: 'aiMessages', label: 'AI messages / period' },
  { key: 'instagramAccounts', label: 'Instagram accounts' },
  { key: 'teamMembers', label: 'Team members' },
  { key: 'automations', label: 'Automations' },
  { key: 'knowledgeItems', label: 'Knowledge items' },
  { key: 'messageCategories', label: 'Message categories' },
]

const makeEmptyForm = (): TierInput => ({
  name: '',
  description: '',
  allowCustomCategories: true,
  status: 'active',
  isDefault: false,
  isCustom: false,
  limits: {},
})

export default function Tiers() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [createForm, setCreateForm] = useState<TierInput>(makeEmptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TierInput>(makeEmptyForm())
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tiers', page, search],
    queryFn: () => adminApi.getTiers({ page, limit: 20, search }),
  })

  const payload = unwrapData<any>(data)
  const tiers: Tier[] = payload?.tiers || []
  const pagination = payload?.pagination || {}

  const sortedTiers = useMemo(
    () => [...tiers].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    [tiers],
  )

  const resetCreateForm = () => setCreateForm(makeEmptyForm())

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await adminApi.createTier(createForm)
      resetCreateForm()
      await refetch()
    } finally {
      setIsSubmitting(false)
    }
  }

  const startEdit = (tier: Tier) => {
    setEditingId(tier._id)
    setEditForm({
      name: tier.name,
      description: tier.description,
      allowCustomCategories: tier.allowCustomCategories,
      isDefault: tier.isDefault,
      isCustom: tier.isCustom,
      status: tier.status,
      limits: { ...(tier.limits || {}) },
    })
  }

  const onUpdate = async () => {
    if (!editingId) return
    setIsSubmitting(true)
    try {
      await adminApi.updateTier(editingId, editForm)
      setEditingId(null)
      await refetch()
    } finally {
      setIsSubmitting(false)
    }
  }

  const onDelete = async (id: string, isDefault?: boolean) => {
    if (isDefault) return
    const confirmed = window.confirm('Delete this tier? This cannot be undone.')
    if (!confirmed) return
    setIsSubmitting(true)
    try {
      await adminApi.deleteTier(id)
      if (editingId === id) setEditingId(null)
      await refetch()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tiers</h1>
          <p className="text-muted-foreground mt-1">
            Define pricing tiers and limits for workspaces and users.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-full md:w-80">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tiers..."
            className="w-full bg-transparent focus:outline-none text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      <form onSubmit={onCreate} className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Create tier</p>
            <p className="text-sm text-muted-foreground">Set base limits and defaults.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Name</label>
            <input
              className="input"
              placeholder="Starter, Pro..."
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Status</label>
            <select
              className="input"
              value={createForm.status}
              onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as TierInput['status'] })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              className="input min-h-[80px]"
              placeholder="Short description"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={createForm.allowCustomCategories}
              onChange={(e) => setCreateForm({ ...createForm, allowCustomCategories: e.target.checked })}
            />
            Allow custom categories
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={createForm.isDefault}
              onChange={(e) => setCreateForm({ ...createForm, isDefault: e.target.checked })}
            />
            Make default
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={createForm.isCustom}
              onChange={(e) => setCreateForm({ ...createForm, isCustom: e.target.checked })}
            />
            Custom tier
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {limitFields.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">{field.label}</label>
              <input
                type="number"
                min={0}
                placeholder="Unlimited"
                className="input"
                value={createForm.limits?.[field.key] ?? ''}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    limits: { ...(prev.limits || {}), [field.key]: e.target.value === '' ? undefined : Number(e.target.value) },
                  }))
                }
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resetCreateForm}
            disabled={isSubmitting}
          >
            Reset
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Create tier'}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="card text-center py-8 text-muted-foreground">Loading tiers...</div>
        ) : sortedTiers.length === 0 ? (
          <div className="card text-center py-10 space-y-3">
            <Layers className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">No tiers yet. Create one above.</p>
          </div>
        ) : (
          sortedTiers.map((tier) => {
            const isEditing = editingId === tier._id
            const formState = isEditing ? editForm : tier
            return (
              <div key={tier._id} className="card">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      {isEditing ? (
                        <input
                          className="input"
                          value={formState.name}
                          onChange={(e) => setEditForm({ ...formState, name: e.target.value })}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold text-foreground">{tier.name}</p>
                          {tier.isDefault && (
                            <span className="badge badge-success inline-flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Default
                            </span>
                          )}
                          {tier.status !== 'active' && (
                            <span className="badge badge-secondary capitalize">{tier.status}</span>
                          )}
                        </div>
                      )}
                      {isEditing ? (
                        <textarea
                          className="input mt-2"
                          value={formState.description || ''}
                          onChange={(e) => setEditForm({ ...formState, description: e.target.value })}
                          placeholder="Description"
                        />
                      ) : (
                        <p className="text-muted-foreground mt-1 text-sm">{tier.description || 'No description'}</p>
                      )}
                      {isEditing && (
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={!!formState.allowCustomCategories}
                              onChange={(e) => setEditForm({ ...formState, allowCustomCategories: e.target.checked })}
                            />
                            Allow custom categories
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={!!formState.isDefault}
                              onChange={(e) => setEditForm({ ...formState, isDefault: e.target.checked })}
                            />
                            Default tier
                          </label>
                          <label className="flex items-center gap-2 text-sm text-foreground">
                            <input
                              type="checkbox"
                              checked={!!formState.isCustom}
                              onChange={(e) => setEditForm({ ...formState, isCustom: e.target.checked })}
                            />
                            Custom
                          </label>
                          <select
                            className="input h-10"
                            value={formState.status}
                            onChange={(e) => setEditForm({ ...formState, status: e.target.value as TierInput['status'] })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="deprecated">Deprecated</option>
                          </select>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="badge badge-outline flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {tier.allowCustomCategories ? 'Custom categories allowed' : 'Categories locked'}
                        </span>
                        {tier.isCustom && (
                          <span className="badge badge-outline flex items-center gap-1">
                            <Info className="w-3 h-3" /> Custom tier
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={onUpdate}
                          disabled={isSubmitting}
                        >
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setEditingId(null)}
                          disabled={isSubmitting}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary" onClick={() => startEdit(tier)}>
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => onDelete(tier._id, tier.isDefault)}
                          disabled={tier.isDefault || isSubmitting}
                          title={tier.isDefault ? 'Cannot delete default tier' : 'Delete tier'}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {limitFields.map((field) => (
                    <div key={field.key} className="p-3 rounded-lg border border-border bg-muted/30">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">{field.label}</p>
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          className="input mt-1"
                          value={formState.limits?.[field.key] ?? ''}
                          placeholder="Unlimited"
                          onChange={(e) =>
                            setEditForm((prev) => ({
                              ...prev,
                              limits: {
                                ...(prev.limits || {}),
                                [field.key]: e.target.value === '' ? undefined : Number(e.target.value),
                              },
                            }))
                          }
                        />
                      ) : (
                        <p className="text-lg font-semibold text-foreground mt-1">
                          {tier.limits?.[field.key] ?? 'Unlimited'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            className="btn btn-secondary"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          <button
            className="btn btn-secondary"
            onClick={() =>
              setPage((prev) => {
                const totalPages = pagination.totalPages || prev + 1
                return Math.min(totalPages, prev + 1)
              })
            }
            disabled={page === pagination.totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
