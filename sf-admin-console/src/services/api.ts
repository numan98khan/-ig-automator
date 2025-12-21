import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

export const api = axios.create({
  baseURL: `${API_URL}/api/admin`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Unwrap nested Axios responses that may wrap payloads under .data
export const unwrapData = <T = any>(response: any): T => {
  let payload = response?.data ?? response
  while (payload && typeof payload === 'object' && 'data' in payload && (payload as any).data !== payload) {
    payload = (payload as any).data
  }
  return payload as T
}

// Add auth token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Admin API endpoints
export const adminApi = {
  // Dashboard & Analytics
  getDashboardStats: () => api.get('/dashboard/stats'),
  getSystemMetrics: () => api.get('/system/metrics'),
  getAnalytics: (params?: { range?: string }) => api.get('/analytics', { params }),

  // Workspaces
  getWorkspaces: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/workspaces', { params }),
  getWorkspaceById: (id: string) => api.get(`/workspaces/${id}`),
  getWorkspaceMembers: (id: string) => api.get(`/workspaces/${id}/members`),
  getWorkspaceCategories: (id: string) => api.get(`/workspaces/${id}/categories`),

  // Users
  getUsers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get('/users', { params }),
  getUserById: (id: string) => api.get(`/users/${id}`),

  // Conversations
  getAllConversations: (params?: {
    page?: number
    limit?: number
    workspaceId?: string
    status?: string
  }) => api.get('/conversations', { params }),
  getConversationById: (id: string) => api.get(`/conversations/${id}`),

  // Escalations
  getAllEscalations: (params?: {
    page?: number
    limit?: number
    status?: string
    severity?: string
  }) => api.get('/escalations', { params }),

  // System Health
  getHealthCheck: () => api.get('/health'),
  getDatabaseStats: () => api.get('/system/database'),
  getActiveConnections: () => api.get('/system/connections'),

  // AI Assistant Configuration per workspace
  getAssistantConfig: (workspaceId: string) => api.get(`/assistant/config/${workspaceId}`),
  updateAssistantConfig: (workspaceId: string, config: any) =>
    api.put(`/assistant/config/${workspaceId}`, config),

  // Knowledge Base Management per workspace
  getWorkspaceKnowledgeItems: (workspaceId: string) => api.get(`/knowledge/workspace/${workspaceId}`),
  createKnowledgeItem: (data: {
    title: string
    content: string
    workspaceId: string
    storageMode: 'vector' | 'text'
  }) => api.post('/knowledge', data),
  updateKnowledgeItem: (id: string, data: {
    title?: string
    content?: string
    storageMode?: 'vector' | 'text'
  }) => api.put(`/knowledge/${id}`, data),
  deleteKnowledgeItem: (id: string) => api.delete(`/knowledge/${id}`),
  reindexKnowledge: (workspaceId: string) =>
    api.post(`/knowledge/workspace/${workspaceId}/reindex-vector`),
}
