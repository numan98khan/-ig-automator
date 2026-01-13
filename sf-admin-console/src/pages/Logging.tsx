import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, unwrapData } from '../services/api'

type AdminLogEvent = {
  _id: string
  workspaceId?: string
  category: string
  level: 'info' | 'warn' | 'error'
  message: string
  details?: Record<string, any>
  source?: string
  createdAt?: string
}

export default function Logging() {
  const queryClient = useQueryClient()
  const [logFilters, setLogFilters] = useState({
    limit: 200,
    category: '',
    level: '' as '' | 'info' | 'warn' | 'error',
    workspaceId: '',
    autoRefresh: true,
  })

  const { data: logEventsData, isFetching: isFetchingLogs } = useQuery({
    queryKey: ['admin-log-events', logFilters],
    queryFn: () =>
      adminApi.getLogEvents({
        limit: logFilters.limit,
        category: logFilters.category || undefined,
        level: logFilters.level || undefined,
        workspaceId: logFilters.workspaceId || undefined,
      }),
    refetchInterval: logFilters.autoRefresh ? 5000 : false,
  })

  const purgeLogsMutation = useMutation({
    mutationFn: () => adminApi.deleteLogEvents(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-log-events'] })
    },
  })

  const handlePurgeLogs = () => {
    if (!window.confirm('Permanently delete all stored log events?')) return
    purgeLogsMutation.mutate()
  }

  const logEventsPayload = unwrapData<AdminLogEvent[] | { events?: AdminLogEvent[] }>(logEventsData)
  const logEvents = Array.isArray(logEventsPayload)
    ? logEventsPayload
    : logEventsPayload?.events || []

  const formatTimestamp = (value?: string) => {
    if (!value) return '—'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Logging</h1>
        <p className="text-muted-foreground mt-2">
          Review and filter recent log events captured in the last 24 hours.
        </p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">📜 Log Viewer</h3>
            <p className="text-sm text-muted-foreground">
              Recent automation logs stored in Mongo (last 24 hours). Refreshes every 5s when enabled.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isFetchingLogs ? 'Refreshing…' : `Showing ${logEvents.length} events`}
            <button
              className="btn btn-secondary text-xs"
              onClick={handlePurgeLogs}
              disabled={purgeLogsMutation.isPending}
            >
              {purgeLogsMutation.isPending ? 'Purging...' : 'Purge logs'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Limit</label>
            <select
              className="input w-full"
              value={logFilters.limit}
              onChange={(event) =>
                setLogFilters((prev) => ({
                  ...prev,
                  limit: Number(event.target.value),
                }))
              }
            >
              {[50, 100, 200, 300, 500].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Category</label>
            <input
              className="input w-full"
              placeholder="automation"
              value={logFilters.category}
              onChange={(event) =>
                setLogFilters((prev) => ({ ...prev, category: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Level</label>
            <select
              className="input w-full"
              value={logFilters.level}
              onChange={(event) =>
                setLogFilters((prev) => ({
                  ...prev,
                  level: event.target.value as '' | 'info' | 'warn' | 'error',
                }))
              }
            >
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Workspace ID</label>
            <input
              className="input w-full"
              placeholder="optional"
              value={logFilters.workspaceId}
              onChange={(event) =>
                setLogFilters((prev) => ({ ...prev, workspaceId: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Auto refresh</label>
            <button
              className="btn btn-secondary w-full"
              onClick={() =>
                setLogFilters((prev) => ({ ...prev, autoRefresh: !prev.autoRefresh }))
              }
            >
              {logFilters.autoRefresh ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-foreground">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Message</th>
                <th className="py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {logEvents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">
                    No log events found for the current filters.
                  </td>
                </tr>
              ) : (
                logEvents.map((event) => (
                  <tr key={event._id} className="border-b border-border/60">
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {formatTimestamp(event.createdAt)}
                    </td>
                    <td className="py-3 pr-3">
                      <span className="rounded-full bg-muted px-2 py-1 text-xs uppercase text-muted-foreground">
                        {event.level}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-foreground break-words">{event.category}</td>
                    <td className="py-3 pr-3 text-foreground break-words">
                      <div className="max-w-[360px] whitespace-pre-wrap break-words">
                        {event.message}
                      </div>
                    </td>
                    <td className="py-3 text-xs text-muted-foreground">
                      {event.details ? (
                        <pre className="max-w-[360px] whitespace-pre-wrap break-words text-foreground/90">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
