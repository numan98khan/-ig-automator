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

  // Global AI Assistant Configuration (public assistant)
  getGlobalAssistantConfig: () => api.get('/assistant/config'),
  updateGlobalAssistantConfig: (config: any) => api.put('/assistant/config', config),

  // Global Knowledge Base Management (public assistant)
  getGlobalKnowledgeItems: () => api.get('/knowledge'),
  createGlobalKnowledgeItem: (data: {
    title: string
    content: string
    storageMode: 'vector' | 'text'
  }) => api.post('/knowledge', data),
  updateGlobalKnowledgeItem: (id: string, data: {
    title?: string
    content?: string
    storageMode?: 'vector' | 'text'
  }) => api.put(`/knowledge/${id}`, data),
  deleteGlobalKnowledgeItem: (id: string) => api.delete(`/knowledge/${id}`),
  reindexGlobalKnowledge: () => api.post('/knowledge/reindex-vector'),

  // Flow drafts & templates
  getFlowDrafts: (params?: { templateId?: string; status?: string }) =>
    api.get('/flow-drafts', { params }),
  getFlowDraft: (draftId: string) => api.get(`/flow-drafts/${draftId}`),
  createFlowDraft: (payload: any) => api.post('/flow-drafts', payload),
  updateFlowDraft: (draftId: string, payload: any) => api.put(`/flow-drafts/${draftId}`, payload),
  publishFlowDraft: (draftId: string, payload: any) =>
    api.post(`/flow-drafts/${draftId}/publish`, payload),
  getFlowTemplates: () => api.get('/flow-templates'),
  getFlowTemplate: (templateId: string) => api.get(`/flow-templates/${templateId}`),
  updateFlowTemplate: (templateId: string, payload: any) =>
    api.put(`/flow-templates/${templateId}`, payload),
  getFlowTemplateVersions: (templateId: string) =>
    api.get(`/flow-templates/${templateId}/versions`),
  getFlowTemplateVersion: (templateId: string, versionId: string) =>
    api.get(`/flow-templates/${templateId}/versions/${versionId}`),

  // Log settings
  getLogSettings: () => api.get('/log-settings'),
  updateLogSettings: (payload: any) => api.put('/log-settings', payload),
  getLogEvents: (params?: {
    limit?: number
    category?: string
    level?: 'info' | 'warn' | 'error'
    workspaceId?: string
    before?: string
  }) => api.get('/log-events', { params }),

  // Tiers
  getTiers: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get('/tiers', { params }),
  getTierById: (id: string) => api.get(`/tiers/${id}`),
  createTier: (payload: any) => api.post('/tiers', payload),
  updateTier: (id: string, payload: any) => api.put(`/tiers/${id}`, payload),
  deleteTier: (id: string) => api.delete(`/tiers/${id}`),
  assignTierToUser: (tierId: string, userId: string) =>
    api.post(`/tiers/${tierId}/assign/${userId}`),
}
