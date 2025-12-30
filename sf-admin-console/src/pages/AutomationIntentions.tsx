import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

type Intention = {
  id: string
  name: string
  description: string
}

const STORAGE_KEY = 'sendfx.admin.intentions'

export default function AutomationIntentions() {
  const [intentions, setIntentions] = useState<Intention[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setIntentions(parsed)
      }
    } catch {
      // ignore invalid local storage payloads
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(intentions))
  }, [intentions])

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
    const duplicate = intentions.some(
      (item) => item.name.toLowerCase() === name.trim().toLowerCase(),
    )
    if (duplicate) {
      setError('That intention already exists.')
      return
    }
    setError(null)
    setIntentions((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: name.trim(),
        description: description.trim(),
      },
    ])
    setName('')
    setDescription('')
  }

  const handleDelete = (id: string) => {
    setIntentions((prev) => prev.filter((item) => item.id !== id))
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
          <button className="btn btn-primary mt-7 flex items-center gap-2" onClick={handleAdd}>
            <Plus className="w-4 h-4" />
            Add
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

        {sortedIntentions.length === 0 ? (
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
