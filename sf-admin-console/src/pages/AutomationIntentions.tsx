import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'
import AutomationsTabs from '../components/AutomationsTabs'
import { Edit, Loader2, Plus, Tag, Trash2 } from 'lucide-react'

type IntentFormState = {
  _id?: string
  value: string
  description: string
}

const EMPTY_INTENT: IntentFormState = {
  value: '',
  description: '',
}

export default function AutomationIntentions() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [formState, setFormState] = useState<IntentFormState>(EMPTY_INTENT)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['automation-intents'],
    queryFn: () => adminApi.getAutomationIntents(),
  })

  const intents = useMemo(() => {
    const payload = unwrapData<any>(data)
    return Array.isArray(payload) ? payload : []
  }, [data])

  const sortedIntents = useMemo(
    () => [...intents].sort((a, b) => String(a.value || '').localeCompare(String(b.value || ''))),
    [intents],
  )

  const upsertMutation = useMutation({
    mutationFn: (payload: IntentFormState) => {
      const body = {
        value: payload.value.trim(),
        description: payload.description.trim(),
      }
      return payload._id
        ? adminApi.updateAutomationIntent(payload._id, body)
        : adminApi.createAutomationIntent(body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-intents'] })
      setModalOpen(false)
      setFormState(EMPTY_INTENT)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteAutomationIntent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-intents'] })
      setDeleteId(null)
    },
  })

  const openEdit = (intent: any) => {
    setFormState({
      _id: intent._id,
      value: intent.value || '',
      description: intent.description || '',
    })
    setModalOpen(true)
  }

  const currentTitle = formState._id ? 'Edit intention' : 'Create intention'

  return (
    <div className="space-y-6">
      <AutomationsTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Intentions</h1>
          <p className="text-muted-foreground mt-1">
            Define reusable intent labels for flow detection and routing.
          </p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2"
          onClick={() => {
            setFormState(EMPTY_INTENT)
            setModalOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          New intention
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading intentions...</div>
        ) : sortedIntents.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No intentions found</div>
        ) : (
          <div className="divide-y divide-border">
            {sortedIntents.map((intent: any) => (
              <div
                key={intent._id || intent.value}
                className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Tag className="w-4 h-4 text-primary" />
                    <span className="text-lg font-semibold text-foreground">{intent.value}</span>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xl">{intent.description}</p>
                  <div className="text-xs text-muted-foreground">
                    Updating the key may break existing flows that reference it.
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    className="btn btn-secondary btn-sm flex items-center gap-2"
                    onClick={() => openEdit(intent)}
                    disabled={!intent._id}
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    className="btn btn-ghost btn-sm text-rose-500 flex items-center gap-2"
                    onClick={() => setDeleteId(intent._id)}
                    disabled={!intent._id}
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
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-lg font-semibold text-foreground">{currentTitle}</h3>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <LabeledInput
                label="Intent key"
                placeholder="order_now"
                value={formState.value}
                onChange={(e) => setFormState((prev) => ({ ...prev, value: e.target.value }))}
                required
              />
              <LabeledTextArea
                label="Description"
                placeholder="Describe how to detect this intent"
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                required
              />
              <div className="text-xs text-muted-foreground">
                Use short, consistent keys (snake_case). Descriptions guide AI detection.
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
              <h3 className="text-lg font-semibold text-foreground">Delete intention?</h3>
              <p className="text-sm text-muted-foreground">
                This cannot be undone and may impact flows that reference it.
              </p>
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

function LabeledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label className="space-y-1 text-sm text-muted-foreground">
      <span>{label}</span>
      <input
        className="input w-full"
        {...rest}
      />
    </label>
  )
}

function LabeledTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label className="space-y-1 text-sm text-muted-foreground">
      <span>{label}</span>
      <textarea
        className="input min-h-[96px] w-full"
        {...rest}
      />
    </label>
  )
}
