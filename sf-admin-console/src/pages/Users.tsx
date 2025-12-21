import { useQuery } from '@tanstack/react-query'
import { User, Mail, Calendar, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { adminApi } from '../services/api'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Users() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => adminApi.getUsers({ page, limit: 20, search }),
  })

  const payload = data?.data?.data || data?.data
  const users = payload?.users || []
  const pagination = payload?.pagination || {}

  const toggleUserExpansion = (userId: string) => {
    const newExpanded = new Set(expandedUsers)
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId)
    } else {
      newExpanded.add(userId)
    }
    setExpandedUsers(newExpanded)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Users</h1>
        <p className="mt-2 text-muted-foreground">
          Manage and monitor all platform users
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <input
          type="text"
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
      </div>

      {/* Users Table - Desktop */}
      <div className="hidden md:block card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
            <p className="text-muted-foreground">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    Workspaces
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user: any) => (
                  <>
                    <tr
                      key={user._id}
                      className="hover:bg-muted transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              {user.name || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              ID: {user._id.slice(-8)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-4 h-4" />
                          <span className="text-sm">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleUserExpansion(user._id)}
                          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Building2 className="w-4 h-4" />
                          <span className="text-sm">
                            {user.workspaceCount || 0} workspace(s)
                          </span>
                          {user.workspaces && user.workspaces.length > 0 && (
                            expandedUsers.has(user._id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="badge badge-success">Active</span>
                      </td>
                    </tr>
                    {/* Expanded Workspace Details */}
                    {expandedUsers.has(user._id) && user.workspaces && user.workspaces.length > 0 && (
                      <tr key={`${user._id}-details`} className="bg-muted/30">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="ml-14">
                            <h4 className="text-sm font-semibold text-foreground mb-3">
                              Workspace Memberships
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {user.workspaces.map((workspace: any) => (
                                <div
                                  key={workspace._id || workspace.workspaceId}
                                  onClick={() => navigate(`/workspaces/${workspace._id || workspace.workspaceId}`)}
                                  className="flex items-center justify-between p-3 bg-background rounded-lg border border-border hover:border-primary transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                                      <Building2 className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {workspace.name || workspace.workspaceName || 'Unknown Workspace'}
                                      </p>
                                      {workspace._id && (
                                        <p className="text-xs text-muted-foreground/70">
                                          ID: {workspace._id.slice(-8)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`badge ${
                                    workspace.role === 'admin'
                                      ? 'badge-primary'
                                      : workspace.role === 'owner'
                                      ? 'badge-success'
                                      : 'badge-secondary'
                                  }`}>
                                    {workspace.role || 'member'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
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

      {/* Users Cards - Mobile */}
      <div className="md:hidden space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : users.length === 0 ? (
          <div className="card text-center py-12">
            <User className="w-12 h-12 mx-auto text-muted-foreground/70 mb-4" />
            <p className="text-muted-foreground">No users found</p>
          </div>
        ) : (
          <>
            {users.map((user: any) => (
              <div key={user._id} className="card">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">
                          {user.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground/70 truncate">
                          {user.email}
                        </p>
                      </div>
                      <span className="badge badge-success flex-shrink-0">Active</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-border">
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground/70 mb-1">
                      <Building2 className="w-3 h-3" />
                      <span className="text-xs">Workspaces</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {user.workspaceCount || 0}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 text-muted-foreground/70 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs">Joined</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {user.workspaces && user.workspaces.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleUserExpansion(user._id)}
                      className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      <span>View Workspaces</span>
                      {expandedUsers.has(user._id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {expandedUsers.has(user._id) && (
                      <div className="mt-3 space-y-2">
                        {user.workspaces.map((workspace: any) => (
                          <div
                            key={workspace._id || workspace.workspaceId}
                            onClick={() => navigate(`/workspaces/${workspace._id || workspace.workspaceId}`)}
                            className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border hover:border-primary transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                              <p className="text-sm font-medium text-foreground truncate">
                                {workspace.name || workspace.workspaceName || 'Unknown Workspace'}
                              </p>
                            </div>
                            <span className={`badge flex-shrink-0 ml-2 ${
                              workspace.role === 'admin'
                                ? 'badge-primary'
                                : workspace.role === 'owner'
                                ? 'badge-success'
                                : 'badge-secondary'
                            }`}>
                              {workspace.role || 'member'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Mobile Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn btn-secondary disabled:opacity-50 text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground px-2">
                  {pagination.currentPage} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === pagination.totalPages}
                  className="btn btn-secondary disabled:opacity-50 text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
