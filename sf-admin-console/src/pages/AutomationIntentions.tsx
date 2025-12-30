import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'

type Intention = {
  id: string
  name: string
  description: string
}

export default function AutomationIntentions() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['intentions'],
    queryFn: () => adminApi.getIntentions(),
  })

  const intentions = useMemo(() => {
    const payload = unwrapData<any>(data)
    return Array.isArray(payload)
      ? payload.map((item: any) => ({
        id: item._id || item.id,
        name: item.name,
        description: item.description,
      }))
      : []
  }, [data])

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) => adminApi.createIntention(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intentions'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteIntention(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intentions'] })
    },
  })

  const sortedIntentions = useMemo(
    () => [...intentions].sort((a, b) => a.name.localeCompare(b.name)),
    [intentions],
  )

  const handleAdd = () => {
    if (!name.trim()) {
      setError('Intention name is required.')
      return
    }
    if (!description.trim()) {
      setError('Intention description is required.')
      return
    }
    setError(null)
    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
    })
    setName('')
    setDescription('')
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Intentions</h1>
        <p className="text-muted-foreground mt-1">
          Maintain a single source of truth for intent categories and their descriptions.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add intention</h2>
            <p className="text-sm text-muted-foreground">
              Define an intent once and reuse it across flows and routing logic.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3 items-start">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Name</label>
            <input
              className="input w-full"
              placeholder="e.g. booking_request"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Description</label>
            <input
              className="input w-full"
              placeholder="Describe what this intention means."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <button
            className="btn btn-primary mt-7 flex items-center gap-2"
            onClick={handleAdd}
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            {createMutation.isPending ? 'Saving...' : 'Add'}
          </button>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">All intentions</h2>
            <p className="text-sm text-muted-foreground">
              {intentions.length} total intentions configured.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading intentions...</div>
        ) : sortedIntentions.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No intentions yet. Add one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedIntentions.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card/80 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{item.name}</div>
                  <div className="text-sm text-muted-foreground">{item.description}</div>
                </div>
                <button
                  className="btn btn-secondary text-red-500 flex items-center gap-2 self-start"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
