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
  email?: string;
  firstName?: string;
  lastName?: string;
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional: boolean;
  emailVerified: boolean;
  defaultWorkspaceId?: string;
  createdAt: string;
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
  instagramConversationId?: string;
  lastMessageAt: string;
  lastMessage?: string;
  createdAt: string;
  isSynced?: boolean;
  categoryName?: string;
  categoryId?: any;
  humanRequired?: boolean;
  humanRequiredReason?: string;
  humanTriggeredAt?: string;
  humanTriggeredByMessageId?: string;
  humanHoldUntil?: string;
}

export interface MessageAttachment {
  type: 'image' | 'video' | 'audio' | 'voice' | 'file';
  url: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
  fileName?: string;
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  text: string;
  from: 'customer' | 'user' | 'ai';
  createdAt: string;
  categoryId?: any;
  seenAt?: string;
  aiTags?: string[];
  aiShouldEscalate?: boolean;
  aiEscalationReason?: string;
  attachments?: MessageAttachment[];
  linkPreview?: LinkPreview;
  platform?: 'instagram' | 'mock';
  instagramMessageId?: string;
}

export interface KnowledgeItem {
  _id: string;
  title: string;
  content: string;
  workspaceId: string;
  createdAt: string;
}

export type GoalType =
  | 'none'
  | 'capture_lead'
  | 'book_appointment'
  | 'start_order'
  | 'handle_support'
  | 'drive_to_channel';

export interface GoalConfigs {
  leadCapture: {
    collectName: boolean;
    collectPhone: boolean;
    collectEmail: boolean;
    collectCustomNote: boolean;
  };
  booking: {
    bookingLink?: string;
    collectDate: boolean;
    collectTime: boolean;
    collectServiceType: boolean;
  };
  order: {
    catalogUrl?: string;
    collectProductName: boolean;
    collectQuantity: boolean;
    collectVariant: boolean;
  };
  support: {
    askForOrderId: boolean;
    askForPhoto: boolean;
  };
  drive: {
    targetType: 'website' | 'WhatsApp' | 'store' | 'app';
    targetLink?: string;
  };
}

// Phase 2: Automation Types
export interface WorkspaceSettings {
  _id: string;
  workspaceId: string;
  defaultLanguage: string;
  defaultReplyLanguage?: string;
  uiLanguage: string;
  allowHashtags?: boolean;
  allowEmojis?: boolean;
  maxReplySentences?: number;
  decisionMode?: 'full_auto' | 'assist' | 'info_only';
  escalationGuidelines?: string;
  escalationExamples?: string[];
  humanEscalationBehavior?: 'ai_silent' | 'ai_allowed';
  humanHoldMinutes?: number;
  commentDmEnabled: boolean;
  commentDmTemplate: string;
  dmAutoReplyEnabled: boolean;
  followupEnabled: boolean;
  followupHoursBeforeExpiry: number;
  followupTemplate: string;
  primaryGoal?: GoalType;
  secondaryGoal?: GoalType;
  goalConfigs?: GoalConfigs;
  createdAt: string;
  updatedAt: string;
}

export interface MessageCategory {
  _id: string;
  workspaceId: string;
  nameEn: string;
  description?: string;
  descriptionEn?: string;
  exampleMessages?: string[];
  aiPolicy?: 'full_auto' | 'assist_only' | 'escalate';
  escalationNote?: string;
  isSystem: boolean;
  autoReplyEnabled: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryKnowledge {
  _id: string;
  workspaceId: string;
  categoryId: string;
  content: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxMessage {
  role: 'customer';
  text: string;
}

export interface SandboxScenario {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  messages: SandboxMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SandboxRunStepMeta {
  detectedLanguage?: string;
  categoryName?: string;
  goalMatched?: GoalType | 'none';
  shouldEscalate?: boolean;
  escalationReason?: string;
  tags?: string[];
  knowledgeItemsUsed?: { id: string; title: string }[];
}

export interface SandboxRunStep {
  customerText: string;
  aiReplyText: string;
  meta?: SandboxRunStepMeta;
}

export interface SandboxRunResponse {
  runId: string;
  steps: SandboxRunStep[];
  createdAt: string;
  settingsSnapshot?: Record<string, any>;
}

export interface SandboxRun extends SandboxRunResponse {
  _id: string;
}

export interface EscalationCase {
  escalation: {
    _id: string;
    conversationId: string;
    categoryId?: string;
    topicSummary: string;
    reason?: string;
    status: 'pending' | 'in_progress' | 'resolved' | 'cancelled';
    followUpCount: number;
    createdAt: string;
    updatedAt: string;
    lastCustomerMessage?: string;
    lastCustomerAt?: string;
    lastAiMessage?: string;
    lastAiAt?: string;
  };
  conversation: Conversation;
  recentMessages: Message[];
  lastEscalation?: Message;
}

export interface AutomationStats {
  commentDm: {
    sent: number;
    failed: number;
  };
  autoReply: {
    sent: number;
  };
  followup: {
    sent: number;
    pending: number;
  };
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

  secureAccount: async (email: string, password: string) => {
    const { data } = await api.post('/api/auth/secure-account', { email, password });
    return data;
  },

  verifyEmail: async (token: string) => {
    const { data } = await api.get(`/api/auth/verify-email?token=${token}`);
    return data;
  },

  resendVerification: async () => {
    const { data } = await api.post('/api/auth/resend-verification');
    return data;
  },

  requestPasswordReset: async (email: string) => {
    const { data } = await api.post('/api/auth/reset-password-request', { email });
    return data;
  },

  resetPassword: async (token: string, newPassword: string) => {
    const { data } = await api.post('/api/auth/reset-password', { token, newPassword });
    return data;
  },
};

// Workspace Members API
export interface WorkspaceMember {
  user: User;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  joinedAt: string;
}

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

  getMembers: async (workspaceId: string): Promise<WorkspaceMember[]> => {
    const { data } = await api.get(`/api/workspaces/${workspaceId}/members`);
    return data;
  },

  updateMemberRole: async (workspaceId: string, userId: string, role: string): Promise<{ message: string }> => {
    const { data } = await api.put(`/api/workspaces/${workspaceId}/members/${userId}/role`, { role });
    return data;
  },

  removeMember: async (workspaceId: string, userId: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/api/workspaces/${workspaceId}/members/${userId}`);
    return data;
  },
};

// Instagram API
export const instagramAPI = {
  // OAuth flow - Get authorization URL
  getAuthUrl: async (workspaceId: string): Promise<{ authUrl: string }> => {
    const { data } = await api.get(`/api/instagram/auth?workspaceId=${workspaceId}`);
    return data;
  },

  // Legacy mock connection (for demo mode)
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

  updateCategory: async (messageId: string, categoryId: string): Promise<Message> => {
    const { data } = await api.patch(`/api/messages/${messageId}/category`, { categoryId });
    return data;
  },

  markSeen: async (conversationId: string): Promise<{ success: boolean; markedCount: number }> => {
    const { data } = await api.post('/api/messages/mark-seen', { conversationId });
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

// Instagram Sync API
export const instagramSyncAPI = {
  syncMessages: async (workspaceId: string, conversationId?: string): Promise<{
    success: boolean;
    conversationsSynced: number;
    messagesSynced: number;
    lastSyncedAt: string;
  }> => {
    const { data } = await api.post('/api/instagram/sync-messages', { workspaceId, conversationId });
    return data;
  },

  getAvailableConversations: async (workspaceId: string): Promise<any[]> => {
    const { data } = await api.get('/api/instagram/available-conversations', { params: { workspaceId } });
    return data;
  },

  sendMessage: async (
    conversationId: string,
    text: string,
    options?: {
      messageType?: 'text' | 'image' | 'video' | 'audio';
      mediaUrl?: string;
      buttons?: Array<{
        title: string;
        actionType: 'url' | 'postback' | 'tag' | 'next_step';
        url?: string;
        tag?: string;
        payload?: string;
        nextStepId?: string;
      }>;
      isCommentReply?: boolean;
      commentId?: string;
    }
  ): Promise<any> => {
    const { data } = await api.post('/api/instagram/send-message', {
      conversationId,
      text,
      ...options,
    });
    return data;
  },

  markAsRead: async (conversationId: string): Promise<{ success: boolean }> => {
    const { data } = await api.post('/api/instagram/mark-as-read', { conversationId });
    return data;
  },
};

// Settings API (Phase 2)
export const settingsAPI = {
  getByWorkspace: async (workspaceId: string): Promise<WorkspaceSettings> => {
    const { data } = await api.get(`/api/settings/workspace/${workspaceId}`);
    return data;
  },

  update: async (workspaceId: string, settings: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> => {
    const { data } = await api.put(`/api/settings/workspace/${workspaceId}`, settings);
    return data;
  },

  getStats: async (workspaceId: string): Promise<AutomationStats> => {
    const { data } = await api.get(`/api/settings/workspace/${workspaceId}/stats`);
    return data;
  },
};

// Human-in-the-loop / escalations
export const escalationAPI = {
  listByWorkspace: async (workspaceId: string): Promise<EscalationCase[]> => {
    const { data } = await api.get(`/api/escalations/workspace/${workspaceId}`);
    return data;
  },
  resolve: async (escalationId: string): Promise<{ success: boolean }> => {
    const { data } = await api.post(`/api/escalations/${escalationId}/resolve`);
    return data;
  },
};

// Categories API (Phase 2)
export const categoriesAPI = {
  getByWorkspace: async (workspaceId: string): Promise<MessageCategory[]> => {
    const { data } = await api.get(`/api/categories/workspace/${workspaceId}`);
    return data;
  },

  getById: async (id: string): Promise<MessageCategory> => {
    const { data } = await api.get(`/api/categories/${id}`);
    return data;
  },

  create: async (workspaceId: string, nameEn: string, description?: string): Promise<MessageCategory> => {
    const { data } = await api.post('/api/categories', { workspaceId, nameEn, description });
    return data;
  },

  update: async (id: string, updates: Partial<MessageCategory>): Promise<MessageCategory> => {
    const { data } = await api.put(`/api/categories/${id}`, updates);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/categories/${id}`);
  },

  getKnowledge: async (categoryId: string): Promise<CategoryKnowledge> => {
    const { data } = await api.get(`/api/categories/${categoryId}/knowledge`);
    return data;
  },

  updateKnowledge: async (categoryId: string, content: string): Promise<CategoryKnowledge> => {
    const { data } = await api.put(`/api/categories/${categoryId}/knowledge`, { content });
    return data;
  },
};

export const sandboxAPI = {
  listScenarios: async (workspaceId: string): Promise<SandboxScenario[]> => {
    const { data } = await api.get('/api/sandbox/scenarios', { params: { workspaceId } });
    return data;
  },

  createScenario: async (payload: {
    workspaceId: string;
    name: string;
    description?: string;
    messages: SandboxMessage[];
  }): Promise<SandboxScenario> => {
    const { data } = await api.post('/api/sandbox/scenarios', payload);
    return data;
  },

  updateScenario: async (
    scenarioId: string,
    payload: Partial<Pick<SandboxScenario, 'name' | 'description' | 'messages'>>
  ): Promise<SandboxScenario> => {
    const { data } = await api.put(`/api/sandbox/scenarios/${scenarioId}`, payload);
    return data;
  },

  deleteScenario: async (scenarioId: string): Promise<void> => {
    await api.delete(`/api/sandbox/scenarios/${scenarioId}`);
  },

  runScenario: async (
    scenarioId: string,
    overrideSettings?: Partial<WorkspaceSettings>
  ): Promise<SandboxRunResponse> => {
    const { data } = await api.post(`/api/sandbox/scenarios/${scenarioId}/run`, {
      overrideSettings,
    });
    return data;
  },

  listRuns: async (scenarioId: string): Promise<SandboxRun[]> => {
    const { data } = await api.get(`/api/sandbox/scenarios/${scenarioId}/runs`);
    return data;
  },

  quickRun: async (
    workspaceId: string,
    message: string,
    overrideSettings?: Partial<WorkspaceSettings>
  ): Promise<SandboxRunResponse> => {
    const { data } = await api.post('/api/sandbox/quick-run', {
      workspaceId,
      messages: [message],
      overrideSettings,
    });
    return data;
  },
};

// Workspace Invites API
export interface WorkspaceInvite {
  _id: string;
  workspaceId: string;
  email: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  invitedBy: string;
  token: string;
  expiresAt: string;
  accepted: boolean;
  createdAt: string;
}

export interface InviteDetails {
  email: string;
  workspaceName: string;
  role: string;
}

export const workspaceInviteAPI = {
  sendInvite: async (workspaceId: string, email: string, role: string): Promise<{ message: string; invite: WorkspaceInvite }> => {
    const { data } = await api.post('/api/workspace-invites/send', { workspaceId, email, role });
    return data;
  },

  listInvites: async (workspaceId: string): Promise<WorkspaceInvite[]> => {
    const { data } = await api.get(`/api/workspace-invites/${workspaceId}`);
    return data;
  },

  cancelInvite: async (inviteId: string): Promise<{ message: string }> => {
    const { data } = await api.delete(`/api/workspace-invites/${inviteId}`);
    return data;
  },

  getInviteDetails: async (token: string): Promise<InviteDetails> => {
    const { data } = await api.get(`/api/workspace-invites/details/${token}`);
    return data;
  },

  acceptInvite: async (token: string, password: string, firstName?: string, lastName?: string): Promise<{ message: string; token: string; user: User }> => {
    const { data } = await api.post('/api/workspace-invites/accept', { token, password, firstName, lastName });
    return data;
  },
};

export default api;
