import { useQuery } from '@tanstack/react-query'
import { Building2, Users, MessageSquare, Activity } from 'lucide-react'
import { adminApi, unwrapData } from '../services/api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Workspaces() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces', page, search],
    queryFn: () => adminApi.getWorkspaces({ page, limit: 20, search }),
  })

  // Parse workspaces - handle both array and object responses
  const getWorkspaces = () => {
    const payload = unwrapData<any>(data)
    if (Array.isArray(payload)) return payload
    if (Array.isArray(payload?.workspaces)) return payload.workspaces
    return []
  }

  const workspaces = getWorkspaces()
  const pagination = unwrapData<any>(data)?.pagination || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workspaces</h1>
          <p className="mt-2 text-muted-foreground">
            Manage and monitor all workspaces
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search workspaces..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
      </div>

      {/* Workspaces Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : workspaces.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
          <p className="text-muted-foreground">No workspaces found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((workspace: any) => (
            <div
              key={workspace._id}
              onClick={() => navigate(`/workspaces/${workspace._id}`)}
              className="card hover:border-primary transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {workspace.name}
                    </h3>
                    <p className="text-xs text-muted-foreground/70">
                      Created {new Date(workspace.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className={`badge ${workspace.isActive ? 'badge-success' : 'badge-error'}`}>
                  {workspace.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground/70">
                    <Users className="w-4 h-4" />
                    <span className="text-xs">Members</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {workspace.memberCount || 0}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground/70">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-xs">Convos</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {workspace.conversationCount || 0}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground/70">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs">Today</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {workspace.todayActivity || 0}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="btn btn-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page === pagination.totalPages}
            className="btn btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
