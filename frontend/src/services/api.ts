import axios from 'axios';

// API Base URL configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Types
export interface User {
  id: string;
  email: string;
}

export interface Workspace {
  _id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export interface InstagramAccount {
  _id: string;
  username: string;
  workspaceId: string;
  status: 'connected' | 'mock';
  createdAt: string;
}

export interface Conversation {
  _id: string;
  participantName: string;
  participantHandle: string;
  workspaceId: string;
  instagramAccountId: string;
  lastMessageAt: string;
  lastMessage?: string;
  createdAt: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  text: string;
  from: 'customer' | 'user' | 'ai';
  createdAt: string;
}

export interface KnowledgeItem {
  _id: string;
  title: string;
  content: string;
  workspaceId: string;
  createdAt: string;
}

// Auth API
export const authAPI = {
  signup: async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/signup', { email, password });
    return data;
  },

  login: async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    return data;
  },

  getMe: async () => {
    const { data } = await api.get('/api/auth/me');
    return data;
  },
};

// Workspace API
export const workspaceAPI = {
  create: async (name: string): Promise<Workspace> => {
    const { data } = await api.post('/api/workspaces', { name });
    return data;
  },

  getAll: async (): Promise<Workspace[]> => {
    const { data } = await api.get('/api/workspaces');
    return data;
  },

  getById: async (id: string): Promise<Workspace> => {
    const { data } = await api.get(`/api/workspaces/${id}`);
    return data;
  },
};

// Instagram API
export const instagramAPI = {
  connect: async (username: string, workspaceId: string): Promise<InstagramAccount> => {
    const { data } = await api.post('/api/instagram/connect', { username, workspaceId });
    return data;
  },

  getByWorkspace: async (workspaceId: string): Promise<InstagramAccount[]> => {
    const { data } = await api.get(`/api/instagram/workspace/${workspaceId}`);
    return data;
  },
};

// Conversation API
export const conversationAPI = {
  getByWorkspace: async (workspaceId: string): Promise<Conversation[]> => {
    const { data } = await api.get(`/api/conversations/workspace/${workspaceId}`);
    return data;
  },

  getById: async (id: string): Promise<Conversation> => {
    const { data } = await api.get(`/api/conversations/${id}`);
    return data;
  },
};

// Message API
export const messageAPI = {
  getByConversation: async (conversationId: string): Promise<Message[]> => {
    const { data } = await api.get(`/api/messages/conversation/${conversationId}`);
    return data;
  },

  send: async (conversationId: string, text: string): Promise<Message> => {
    const { data } = await api.post('/api/messages', { conversationId, text });
    return data;
  },

  generateAIReply: async (conversationId: string): Promise<Message> => {
    const { data } = await api.post('/api/messages/generate-ai-reply', { conversationId });
    return data;
  },
};

// Knowledge API
export const knowledgeAPI = {
  getByWorkspace: async (workspaceId: string): Promise<KnowledgeItem[]> => {
    const { data } = await api.get(`/api/knowledge/workspace/${workspaceId}`);
    return data;
  },

  create: async (title: string, content: string, workspaceId: string): Promise<KnowledgeItem> => {
    const { data } = await api.post('/api/knowledge', { title, content, workspaceId });
    return data;
  },

  update: async (id: string, title: string, content: string): Promise<KnowledgeItem> => {
    const { data } = await api.put(`/api/knowledge/${id}`, { title, content });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/knowledge/${id}`);
  },
};

export default api;
