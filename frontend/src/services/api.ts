import axios from 'axios';
import { generateRequestId, recordRequestId } from './diagnostics';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

// API Base URL configuration
const API_BASE_URL = getApiBaseUrl();

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
  const requestId = generateRequestId();
  if (!config.headers['x-request-id']) {
    config.headers['x-request-id'] = requestId;
  }
  recordRequestId(config.headers['x-request-id'] as string);
  return config;
});

api.interceptors.response.use(
  (response) => {
    const responseRequestId = response.headers['x-request-id'];
    if (responseRequestId) {
      recordRequestId(responseRequestId as string);
    }
    return response;
  },
  (error) => {
    const responseRequestId = error?.response?.headers?.['x-request-id'];
    if (responseRequestId) {
      recordRequestId(responseRequestId as string);
    }
    return Promise.reject(error);
  }
);

// Types
export interface User {
  id: string;
  _id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin';
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional: boolean;
  emailVerified: boolean;
  defaultWorkspaceId?: string;
  createdAt: string;
  tier?: Tier;
  tierLimits?: TierLimits;
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
  status: 'connected';
  name?: string;
  profilePictureUrl?: string;
  tokenExpiresAt?: string;
  lastSyncedAt?: string;
  createdAt: string;
}

export interface Conversation {
  _id: string;
  participantName: string;
  participantHandle: string;
  participantProfilePictureUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  tags?: string[];
  stage?: 'new' | 'engaged' | 'qualified' | 'won' | 'lost';
  ownerId?: string;
  workspaceId: string;
  instagramAccountId: string;
  instagramConversationId?: string;
  lastMessageAt: string;
  lastMessage?: string;
  lastCustomerMessageAt?: string;
  lastBusinessMessageAt?: string;
  createdAt: string;
  updatedAt?: string;
  isSynced?: boolean;
  humanRequired?: boolean;
  humanRequiredReason?: string;
  humanTriggeredAt?: string;
  humanTriggeredByMessageId?: string;
  humanHoldUntil?: string;
}

export type CrmStage = 'new' | 'engaged' | 'qualified' | 'won' | 'lost';

export interface CrmContact {
  _id: string;
  workspaceId: string;
  participantName: string;
  participantHandle: string;
  participantProfilePictureUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  stage?: CrmStage;
  tags?: string[];
  ownerId?: string;
  primaryConversationId?: string;
  lastMessageAt?: string;
  lastMessage?: string;
  lastCustomerMessageAt?: string;
  lastBusinessMessageAt?: string;
  createdAt: string;
  updatedAt?: string;
  openTaskCount?: number;
  overdueTaskCount?: number;
  nextTaskDueAt?: string;
  unreadCount?: number;
  leadScore?: number;
}

export interface CrmContactListResponse {
  contacts: CrmContact[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
  };
  stageCounts: Record<CrmStage, number>;
  tagCounts: Record<string, number>;
  summary?: {
    newToday: number;
    overdue: number;
    waiting: number;
    qualified: number;
  };
}

export interface CrmUserRef {
  _id: string;
  name?: string;
  email?: string;
  instagramUsername?: string;
}

export interface CrmNote {
  _id: string;
  conversationId: string;
  body: string;
  author?: CrmUserRef;
  authorId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type CrmTaskStatus = 'open' | 'completed' | 'cancelled';
export type CrmTaskType = 'follow_up' | 'general';

export interface CrmTask {
  _id: string;
  conversationId: string;
  title: string;
  description?: string;
  taskType: CrmTaskType;
  status: CrmTaskStatus;
  dueAt?: string;
  reminderAt?: string;
  assignedTo?: CrmUserRef;
  createdBy?: CrmUserRef;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
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
  seenAt?: string;
  aiTags?: string[];
  aiShouldEscalate?: boolean;
  aiEscalationReason?: string;
  attachments?: MessageAttachment[];
  linkPreview?: LinkPreview;
  platform?: 'instagram' | 'mock';
  instagramMessageId?: string;
}

export interface AutomationSessionState {
  stepIndex?: number;
  nodeId?: string;
  vars?: Record<string, any>;
}

export interface AutomationSession {
  _id: string;
  workspaceId: string;
  conversationId: string;
  automationInstanceId: string;
  templateId: string;
  templateVersionId: string;
  status: 'active' | 'paused' | 'completed' | 'handoff';
  state?: AutomationSessionState;
  rateLimit?: {
    windowStart?: string;
    count?: number;
  };
  lastAutomationMessageAt?: string;
  lastCustomerMessageAt?: string;
  pausedAt?: string;
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmAutomationEvent extends AutomationSession {
  automationName?: string;
  templateName?: string;
}

export interface AutomationSessionSummary {
  session: AutomationSession | null;
  instance?: { _id: string; name?: string } | null;
  template?: { _id: string; name?: string } | null;
  version?: { _id: string; version?: number; versionLabel?: string } | null;
  currentNode?: AutomationSessionNodeSummary | null;
}

export interface AutomationPreviewMessage {
  id: string;
  from: 'customer' | 'ai';
  text: string;
  createdAt?: string;
}

export type AutomationSimulationDiagnostic = {
  instanceId?: string;
  name?: string;
  templateId?: string;
  templateStatus?: string;
  templateVersionId?: string;
  latestVersionId?: string;
  availableTriggers?: string[];
  triggers?: Array<Record<string, any>>;
  messageContext?: Record<string, any>;
  reason: string;
};

export type AutomationSimulationSelection = {
  id: string;
  name?: string;
  templateId?: string;
  trigger?: { type?: string; label?: string; description?: string };
};

export type AutomationSimulationResponse = AutomationPreviewSessionState & {
  success: boolean;
  error?: string;
  sessionId?: string;
  conversationId?: string;
  status?: 'active' | 'paused' | 'completed' | 'handoff';
  messages?: AutomationPreviewMessage[];
  selectedAutomation?: AutomationSimulationSelection;
  diagnostics?: AutomationSimulationDiagnostic[];
};

export type AutomationSimulationSessionResponse = AutomationPreviewSessionState & {
  sessionId?: string;
  conversationId?: string;
  status?: 'active' | 'paused' | 'completed' | 'handoff';
  messages?: AutomationPreviewMessage[];
  selectedAutomation?: AutomationSimulationSelection;
  diagnostics?: AutomationSimulationDiagnostic[];
};

export interface AutomationPreviewSession extends AutomationPreviewSessionState {
  sessionId: string;
  conversationId: string;
  status: 'active' | 'paused' | 'completed' | 'handoff';
  messages: AutomationPreviewMessage[];
}

export interface AutomationPreviewSessionResponse {
  session: AutomationSession;
}

export interface AutomationPreviewConversation {
  _id: string;
  participantName: string;
  participantHandle: string;
  participantInstagramId?: string;
  participantProfilePictureUrl?: string;
  tags?: string[];
  lastMessageAt?: string;
}

export interface AutomationPreviewPersona {
  name: string;
  handle?: string;
  userId?: string;
  avatarUrl?: string;
}

export interface AutomationPreviewProfile {
  _id: string;
  workspaceId: string;
  name: string;
  handle?: string;
  userId?: string;
  avatarUrl?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AutomationPreviewEventType =
  | 'node_start'
  | 'node_complete'
  | 'field_update'
  | 'field_clear'
  | 'tag_added'
  | 'tag_removed'
  | 'error'
  | 'info';

export interface AutomationPreviewEvent {
  id: string;
  type: AutomationPreviewEventType;
  message: string;
  createdAt: string;
  details?: Record<string, any>;
}

export interface AutomationPreviewSessionState {
  session: AutomationSession | null;
  conversation?: AutomationPreviewConversation | null;
  currentNode?: AutomationSessionNodeSummary | null;
  events?: AutomationPreviewEvent[];
  profile?: AutomationPreviewProfile | null;
  persona?: AutomationPreviewPersona | null;
}

export interface AutomationPreviewSendResponse extends AutomationPreviewSessionState {
  success: boolean;
  error?: string;
  sessionId: string;
  messages: AutomationPreviewMessage[];
}

export interface AutomationSessionNodeSummaryItem {
  label: string;
  value: string;
}

export interface AutomationSessionNodeSummary {
  id: string;
  type: string;
  label?: string;
  preview?: string;
  summary?: AutomationSessionNodeSummaryItem[];
}

export interface KnowledgeItem {
  _id: string;
  title: string;
  content: string;
  storageMode?: 'vector' | 'text';
  active?: boolean;
  workspaceId: string;
  createdAt: string;
  updatedAt?: string;
}

// Automation types
export type TriggerType =
  | 'post_comment'      // Post or Reel Comments
  | 'story_reply'       // Story Reply
  | 'story_mention'     // Story Mention
  | 'dm_message'        // Instagram Message
  | 'story_share'       // User shares your Post or Reel as a Story (NEW)
  | 'instagram_ads'     // Instagram Ads (PRO)
  | 'live_comment'      // Live Comments
  | 'ref_url';          // Instagram Ref URL

export interface TriggerConfig {
  keywords?: string[];
  excludeKeywords?: string[];
  keywordMatch?: 'any' | 'all';
  triggerMode?: 'keywords' | 'any' | 'intent';
  intentText?: string;
  outsideBusinessHours?: boolean;
  businessHours?: BusinessHoursConfig;
  matchOn?: {
    link?: boolean;
    attachment?: boolean;
  };
}

export interface AutomationStats {
  totalTriggered: number;
  totalRepliesSent: number;
  lastTriggeredAt?: string;
  lastReplySentAt?: string;
}

export interface FlowFieldOption {
  label: string;
  value: string;
}

export interface FlowFieldUi {
  placeholder?: string;
  helpText?: string;
  group?: string;
  order?: number;
  widget?: string;
}

export interface FlowFieldValidation {
  min?: number;
  max?: number;
  pattern?: string;
}

export interface FlowFieldSource {
  nodeId: string;
  path: string;
}

export interface FlowExposedField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select' | 'json' | 'text';
  description?: string;
  required?: boolean;
  defaultValue?: any;
  options?: FlowFieldOption[];
  ui?: FlowFieldUi;
  validation?: FlowFieldValidation;
  source?: FlowFieldSource;
}

export interface FlowTriggerDefinition {
  type: TriggerType;
  config?: TriggerConfig;
  label?: string;
  description?: string;
}

export interface FlowPreviewMessage {
  from: 'bot' | 'customer';
  message: string;
}

export interface FlowTemplateDisplay {
  outcome?: string;
  goal?: 'Bookings' | 'Sales' | 'Leads' | 'Support' | 'General';
  industry?: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  setupTime?: string;
  collects?: string[];
  icon?: string;
  previewConversation?: FlowPreviewMessage[];
}

export interface FlowTemplateVersion {
  _id: string;
  templateId: string;
  version: number;
  versionLabel?: string;
  status: 'published' | 'archived';
  triggers?: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  display?: FlowTemplateDisplay;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowTemplate {
  _id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  currentVersionId?: string;
  currentVersion?: FlowTemplateVersion | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationInstance {
  _id: string;
  name: string;
  description?: string;
  workspaceId: string;
  templateId: string;
  templateVersionId: string;
  userConfig?: Record<string, any>;
  isActive: boolean;
  stats: AutomationStats;
  template?: FlowTemplate | null;
  templateVersion?: FlowTemplateVersion | null;
  createdAt: string;
  updatedAt: string;
}

export type GoalType =
  | 'none'
  | 'capture_lead'
  | 'book_appointment'
  | 'order_now'
  | 'product_inquiry'
  | 'delivery'
  | 'order_status'
  | 'refund_exchange'
  | 'human'
  | 'handle_support'
  ;

export interface BusinessHoursConfig {
  startTime: string;
  endTime: string;
  timezone?: string;
  daysOfWeek?: number[];
}

export interface TierLimits {
  aiMessages?: number;
  instagramAccounts?: number;
  teamMembers?: number;
  automations?: number;
  knowledgeItems?: number;
  crm?: boolean;
  integrations?: boolean;
  flowBuilder?: boolean;
  executionTimeline?: boolean;
}

export interface Tier {
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isCustom: boolean;
  status: 'active' | 'inactive' | 'deprecated';
  limits: TierLimits;
}

export interface ResourceUsage {
  used: number;
  limit?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface WorkspaceTierUsage {
  instagramAccounts?: number;
  teamMembers?: number;
  knowledgeItems?: number;
}

export interface TierSummaryResponse {
  tier?: Tier;
  limits?: TierLimits;
  usage?: {
    aiMessages?: ResourceUsage;
  };
  workspace?: {
    workspaceId: string;
    ownerId?: string;
    tier?: Tier;
    limits?: TierLimits;
    usage?: WorkspaceTierUsage;
  };
}

export interface WorkspaceTierResponse {
  tier?: Tier;
  limits?: TierLimits;
  ownerId?: string;
  usage?: WorkspaceTierUsage;
}

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
  businessName?: string;
  businessDescription?: string;
  businessHours?: string;
  businessTone?: string;
  businessLocation?: string;
  businessWebsite?: string;
  businessCatalog?: Array<{
    name: string;
    description?: string;
    price?: string;
  }>;
  businessDocuments?: Array<{
    title: string;
    url?: string;
  }>;
  demoModeEnabled?: boolean;
  onboarding?: {
    templateSelectedAt?: string;
    basicsCompletedAt?: string;
    simulatorCompletedAt?: string;
    publishCompletedAt?: string;
  };
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
  googleSheets?: GoogleSheetsIntegration;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleSheetsIntegration {
  enabled?: boolean;
  spreadsheetId?: string;
  sheetName?: string;
  serviceAccountJson?: string;
  headerRow?: number;
  inventoryMapping?: InventoryMapping;
  oauthConnected?: boolean;
  oauthConnectedAt?: string;
  oauthEmail?: string;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
  lastTestMessage?: string;
}

export type InventoryMappingField =
  | 'productName'
  | 'sku'
  | 'description'
  | 'price'
  | 'quantity'
  | 'variant'
  | 'category'
  | 'brand'
  | 'imageUrl'
  | 'location'
  | 'status'
  | 'cost'
  | 'barcode';

export interface InventoryMappingEntry {
  header?: string;
  confidence?: number;
  notes?: string;
}

export interface InventoryMapping {
  fields?: Record<InventoryMappingField, InventoryMappingEntry>;
  summary?: string;
  updatedAt?: string;
  sourceRange?: string;
  sourceHeaders?: string[];
}

export interface EscalationCase {
  escalation: {
    _id: string;
    conversationId: string;
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

  deleteAccount: async () => {
    const { data } = await api.delete('/api/auth/account');
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
  getAuthUrl: async (
    workspaceId: string,
    options?: { reconnect?: boolean },
  ): Promise<{ authUrl: string }> => {
    const params = new URLSearchParams({ workspaceId });
    if (options?.reconnect) {
      params.set('reconnect', 'true');
    }
    const { data } = await api.get(`/api/instagram/auth?${params.toString()}`);
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

  getAutomationSession: async (conversationId: string): Promise<AutomationSessionSummary> => {
    const { data } = await api.get(`/api/conversations/${conversationId}/automation-session`);
    return data?.data || data;
  },

  pauseAutomationSession: async (conversationId: string, reason?: string): Promise<AutomationSession> => {
    const { data } = await api.post(`/api/conversations/${conversationId}/automation-session/pause`, { reason });
    const payload = data?.data || data;
    return payload.session || payload;
  },

  stopAutomationSession: async (conversationId: string, reason?: string): Promise<AutomationSession> => {
    const { data } = await api.post(`/api/conversations/${conversationId}/automation-session/stop`, { reason });
    const payload = data?.data || data;
    return payload.session || payload;
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

  markSeen: async (conversationId: string): Promise<{ success: boolean; markedCount: number }> => {
    const { data } = await api.post('/api/messages/mark-seen', { conversationId });
    return data;
  },
};

// CRM API
export const crmAPI = {
  listContacts: async (params: {
    workspaceId: string;
    page?: number;
    limit?: number;
    search?: string;
    stage?: CrmStage;
    tags?: string[];
    inactiveDays?: number;
  }): Promise<CrmContactListResponse> => {
    const { data } = await api.get('/api/crm/contacts', {
      params: {
        ...params,
        tags: params.tags?.join(','),
      },
    });
    const payload = data?.data || data;
    const rawStageCounts = Array.isArray(payload?.stageCounts) ? payload.stageCounts : [];
    const rawTagCounts = Array.isArray(payload?.tagCounts) ? payload.tagCounts : [];
    const stageCounts = rawStageCounts.reduce((acc: Record<CrmStage, number>, entry: any) => {
      if (!entry?.stage) return acc;
      acc[entry.stage as CrmStage] = entry.count ?? 0;
      return acc;
    }, {
      new: 0,
      engaged: 0,
      qualified: 0,
      won: 0,
      lost: 0,
    });
    const tagCounts = rawTagCounts.reduce((acc: Record<string, number>, entry: any) => {
      if (!entry?.tag) return acc;
      acc[entry.tag] = entry.count ?? 0;
      return acc;
    }, {});
    return {
      ...payload,
      stageCounts,
      tagCounts,
    };
  },

  getContact: async (contactId: string): Promise<{ contact: CrmContact }> => {
    const { data } = await api.get(`/api/crm/contacts/${contactId}`);
    return data?.data || data;
  },

  updateContact: async (contactId: string, updates: Partial<CrmContact>): Promise<CrmContact> => {
    const { data } = await api.patch(`/api/crm/contacts/${contactId}`, updates);
    const payload = data?.data || data;
    return payload.contact || payload;
  },

  getNotes: async (contactId: string): Promise<CrmNote[]> => {
    const { data } = await api.get(`/api/crm/contacts/${contactId}/notes`);
    const payload = data?.data || data;
    return payload.notes || [];
  },

  addNote: async (contactId: string, body: string): Promise<CrmNote> => {
    const { data } = await api.post(`/api/crm/contacts/${contactId}/notes`, { body });
    const payload = data?.data || data;
    return payload.note || payload;
  },

  getTasks: async (contactId: string): Promise<CrmTask[]> => {
    const { data } = await api.get(`/api/crm/contacts/${contactId}/tasks`);
    const payload = data?.data || data;
    return payload.tasks || [];
  },

  addTask: async (
    contactId: string,
    task: {
      title: string;
      description?: string;
      dueAt?: string;
      reminderAt?: string;
      assignedTo?: string;
      taskType?: CrmTaskType;
    },
  ): Promise<CrmTask> => {
    const { data } = await api.post(`/api/crm/contacts/${contactId}/tasks`, task);
    const payload = data?.data || data;
    return payload.task || payload;
  },

  updateTask: async (
    contactId: string,
    taskId: string,
    updates: Partial<{
      title: string;
      description?: string;
      dueAt?: string;
      reminderAt?: string;
      assignedTo?: string;
      status?: CrmTaskStatus;
      taskType?: CrmTaskType;
    }>,
  ): Promise<CrmTask> => {
    const { data } = await api.patch(`/api/crm/contacts/${contactId}/tasks/${taskId}`, updates);
    const payload = data?.data || data;
    return payload.task || payload;
  },

  getAutomationEvents: async (contactId: string): Promise<CrmAutomationEvent[]> => {
    const { data } = await api.get(`/api/crm/contacts/${contactId}/automation-events`);
    const payload = data?.data || data;
    return payload.sessions || [];
  },

  getMessages: async (contactId: string): Promise<Message[]> => {
    const { data } = await api.get(`/api/crm/contacts/${contactId}/messages`);
    return data;
  },
};

// Knowledge API
export const knowledgeAPI = {
  getByWorkspace: async (workspaceId: string): Promise<KnowledgeItem[]> => {
    const { data } = await api.get(`/api/knowledge/workspace/${workspaceId}`);
    return data;
  },

  create: async (title: string, content: string, workspaceId: string, storageMode: 'vector' | 'text'): Promise<KnowledgeItem> => {
    const { data } = await api.post('/api/knowledge', { title, content, workspaceId, storageMode });
    return data;
  },

  update: async (
    id: string,
    updates: Partial<Pick<KnowledgeItem, 'title' | 'content' | 'storageMode' | 'active'>>,
  ): Promise<KnowledgeItem> => {
    const { data } = await api.put(`/api/knowledge/${id}`, updates);
    return data;
  },

  setActive: async (id: string, active: boolean): Promise<KnowledgeItem> => {
    const { data } = await api.put(`/api/knowledge/${id}`, { active });
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/knowledge/${id}`);
  },
};

// Automation API
export const automationAPI = {
  getByWorkspace: async (workspaceId: string): Promise<AutomationInstance[]> => {
    const { data } = await api.get(`/api/automations/workspace/${workspaceId}`);
    return data;
  },

  getById: async (id: string): Promise<AutomationInstance> => {
    const { data } = await api.get(`/api/automations/${id}`);
    return data;
  },

  create: async (
    automation: Omit<AutomationInstance, '_id' | 'stats' | 'createdAt' | 'updatedAt' | 'template' | 'templateVersion'>,
  ): Promise<AutomationInstance> => {
    const { data } = await api.post('/api/automations', automation);
    return data;
  },

  update: async (
    id: string,
    updates: Partial<Omit<AutomationInstance, '_id' | 'workspaceId' | 'stats' | 'createdAt' | 'updatedAt' | 'template' | 'templateVersion'>>,
  ): Promise<AutomationInstance> => {
    const { data } = await api.put(`/api/automations/${id}`, updates);
    return data;
  },

  toggle: async (id: string): Promise<AutomationInstance> => {
    const { data } = await api.patch(`/api/automations/${id}/toggle`);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/api/automations/${id}`);
  },

  createPreviewSession: async (
    id: string,
    payload?: { reset?: boolean; sessionId?: string; profileId?: string; persona?: AutomationPreviewPersona },
  ): Promise<AutomationPreviewSession> => {
    const { data } = await api.post(`/api/automations/${id}/preview-session`, payload);
    return data;
  },

  sendPreviewMessage: async (
    id: string,
    payload: { text: string; sessionId?: string; profileId?: string; persona?: AutomationPreviewPersona },
  ): Promise<AutomationPreviewSendResponse> => {
    const { data } = await api.post(`/api/automations/${id}/preview-session/message`, payload);
    return data;
  },

  getPreviewSessionStatus: async (
    id: string,
    sessionId?: string,
  ): Promise<AutomationPreviewSessionState> => {
    const { data } = await api.get(`/api/automations/${id}/preview-session/status`, {
      params: sessionId ? { sessionId } : undefined,
    });
    return data;
  },

  updatePreviewPersona: async (
    id: string,
    payload: { sessionId?: string; profileId?: string; persona?: AutomationPreviewPersona },
  ): Promise<AutomationPreviewSessionState> => {
    const { data } = await api.post(`/api/automations/${id}/preview-session/persona`, payload);
    return data;
  },

  listPreviewProfiles: async (id: string): Promise<AutomationPreviewProfile[]> => {
    const { data } = await api.get(`/api/automations/${id}/preview-profiles`);
    return data.profiles || [];
  },

  createPreviewProfile: async (
    id: string,
    payload: { name: string; handle?: string; userId?: string; avatarUrl?: string; isDefault?: boolean },
  ): Promise<AutomationPreviewProfile> => {
    const { data } = await api.post(`/api/automations/${id}/preview-profiles`, payload);
    return data.profile;
  },

  updatePreviewProfile: async (
    id: string,
    profileId: string,
    payload: { name?: string; handle?: string; userId?: string; avatarUrl?: string },
  ): Promise<AutomationPreviewProfile> => {
    const { data } = await api.put(`/api/automations/${id}/preview-profiles/${profileId}`, payload);
    return data.profile;
  },

  duplicatePreviewProfile: async (id: string, profileId: string): Promise<AutomationPreviewProfile> => {
    const { data } = await api.post(`/api/automations/${id}/preview-profiles/${profileId}/duplicate`);
    return data.profile;
  },

  setDefaultPreviewProfile: async (id: string, profileId: string): Promise<AutomationPreviewProfile> => {
    const { data } = await api.post(`/api/automations/${id}/preview-profiles/${profileId}/default`);
    return data.profile;
  },

  deletePreviewProfile: async (id: string, profileId: string): Promise<void> => {
    await api.delete(`/api/automations/${id}/preview-profiles/${profileId}`);
  },

  pausePreviewSession: async (
    id: string,
    payload: { sessionId: string; reason?: string },
  ): Promise<AutomationPreviewSessionResponse> => {
    const { data } = await api.post(`/api/automations/${id}/preview-session/pause`, payload);
    return data;
  },

  stopPreviewSession: async (
    id: string,
    payload: { sessionId: string; reason?: string },
  ): Promise<AutomationPreviewSessionResponse> => {
    const { data } = await api.post(`/api/automations/${id}/preview-session/stop`, payload);
    return data;
  },

  simulateMessage: async (payload: {
    workspaceId: string;
    text: string;
    triggerType?: TriggerType;
    sessionId?: string;
    reset?: boolean;
    profileId?: string;
    persona?: AutomationPreviewPersona;
  }): Promise<AutomationSimulationResponse> => {
    const { data } = await api.post('/api/automations/simulate/message', payload);
    return data;
  },
  getSimulationSession: async (workspaceId: string): Promise<AutomationSimulationSessionResponse> => {
    const { data } = await api.get('/api/automations/simulate/session', {
      params: { workspaceId },
    });
    return data;
  },
  resetSimulationSession: async (payload: {
    workspaceId: string;
    sessionId?: string;
  }): Promise<{ success: boolean }> => {
    const { data } = await api.post('/api/automations/simulate/reset', payload);
    return data;
  },
};

export const flowTemplateAPI = {
  list: async (): Promise<FlowTemplate[]> => {
    const { data } = await api.get('/api/flow-templates');
    return data;
  },

  get: async (templateId: string): Promise<FlowTemplate> => {
    const { data } = await api.get(`/api/flow-templates/${templateId}`);
    return data;
  },

  listVersions: async (templateId: string): Promise<FlowTemplateVersion[]> => {
    const { data } = await api.get(`/api/flow-templates/${templateId}/versions`);
    return data;
  },

  getVersion: async (templateId: string, versionId: string): Promise<FlowTemplateVersion> => {
    const { data } = await api.get(`/api/flow-templates/${templateId}/versions/${versionId}`);
    return data;
  },
};

// Instagram Sync API
export const instagramSyncAPI = {
  syncMessages: async (workspaceId: string, conversationId: string): Promise<{
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

// Integrations API
export const integrationsAPI = {
  testGoogleSheets: async (
    workspaceId: string,
    config: GoogleSheetsIntegration,
  ): Promise<{ success: boolean; preview?: { headers: string[]; rows: string[][]; range: string } }> => {
    const { data } = await api.post('/api/integrations/google-sheets/test', { workspaceId, config });
    return data;
  },
  getGoogleSheetsAuthUrl: async (workspaceId: string): Promise<{ url: string }> => {
    const { data } = await api.get('/api/integrations/google-sheets/oauth/start', { params: { workspaceId } });
    return data;
  },
  disconnectGoogleSheets: async (workspaceId: string): Promise<{ success: boolean }> => {
    const { data } = await api.post('/api/integrations/google-sheets/oauth/disconnect', { workspaceId });
    return data;
  },
  listGoogleSheetsFiles: async (workspaceId: string): Promise<{ files: Array<{ id: string; name: string }> }> => {
    const { data } = await api.get('/api/integrations/google-sheets/files', { params: { workspaceId } });
    return data;
  },
  listGoogleSheetsTabs: async (workspaceId: string, spreadsheetId: string): Promise<{ tabs: string[] }> => {
    const { data } = await api.get('/api/integrations/google-sheets/tabs', { params: { workspaceId, spreadsheetId } });
    return data;
  },
  analyzeGoogleSheets: async (
    workspaceId: string,
    config: GoogleSheetsIntegration,
  ): Promise<{ success: boolean; preview?: { headers: string[]; rows: string[][]; range: string }; mapping?: InventoryMapping }> => {
    const { data } = await api.post('/api/integrations/google-sheets/analyze', { workspaceId, config });
    return data;
  },
};

// Tiers API
export const tierAPI = {
  getMine: async (workspaceId?: string) => {
    const { data } = await api.get('/api/tiers/me', { params: workspaceId ? { workspaceId } : undefined });
    return data;
  },
  getWorkspace: async (workspaceId: string) => {
    const { data } = await api.get(`/api/tiers/workspace/${workspaceId}`);
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

// Dashboard API
export interface DashboardSummaryResponse {
  range: string;
  kpis: {
    newConversations: number;
    inboundMessages: number;
    aiHandledRate: number;
    humanAlerts: { open: number; critical: number };
    medianFirstResponseMs: number;
  };
  outcomes: {
    leads: number;
    bookings: number;
    orders: number;
    support: number;
    escalated: number;
    goal: { attempts: number; completions: number };
  };
  trend: { date: string; inboundMessages: number; aiReplies: number; escalationsOpened: number; kbBackedReplies: number }[];
}

export interface DashboardAttentionItem {
  id: string;
  conversationId: string;
  participantName?: string;
  handle?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  badges?: string[];
  actions?: { canAssign?: boolean; canResolve?: boolean; canSnooze?: boolean };
}

export interface DashboardAttentionResponse {
  filter: string;
  items: DashboardAttentionItem[];
}

export interface DashboardInsightsResponse {
  range: string;
  aiPerformance: {
    escalationRate: number;
    topReasons: { name: string; count: number }[];
  };
  knowledge: {
    kbBackedRate: number;
    topArticles: { name: string; count: number }[];
    missingTopics: string[];
  };
}

export const dashboardAPI = {
  getSummary: async (workspaceId: string, range: 'today' | '7d' | '30d'): Promise<DashboardSummaryResponse> => {
    const { data } = await api.get('/api/dashboard/summary', { params: { workspaceId, range } });
    return data;
  },
  getAttention: async (workspaceId: string, filter: string): Promise<DashboardAttentionResponse> => {
    const { data } = await api.get('/api/dashboard/attention', { params: { workspaceId, filter } });
    return data;
  },
  getInsights: async (workspaceId: string, range: '7d' | '30d'): Promise<DashboardInsightsResponse> => {
    const { data } = await api.get('/api/dashboard/insights', { params: { workspaceId, range } });
    return data;
  },
};

export interface SupportTicket {
  _id: string;
  workspaceId: string;
  instagramAccountId?: string;
  userId: string;
  type: 'bug' | 'support' | 'feature' | 'billing';
  severity?: 'low' | 'medium' | 'high' | 'blocking';
  subject?: string;
  description: string;
  status: 'open' | 'triage' | 'needs_user' | 'in_progress' | 'resolved' | 'closed';
  assigneeUserId?: string;
  tags: string[];
  context?: Record<string, any>;
  attachments?: { name: string; url?: string; type?: string }[];
  requestIds?: string[];
  breadcrumbs?: any[];
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketComment {
  _id: string;
  ticketId: string;
  authorType: 'user' | 'admin' | 'system';
  authorId?: string;
  message: string;
  attachments?: { name: string; url?: string; type?: string }[];
  createdAt: string;
}

export const supportAPI = {
  create: async (payload: any): Promise<SupportTicket> => {
    const { data } = await api.post('/api/support-tickets', payload);
    return data;
  },
  list: async (params: {
    workspaceId?: string;
    status?: string;
    type?: string;
    severity?: string;
    tag?: string;
  }): Promise<{ tickets: SupportTicket[] }> => {
    const { data } = await api.get('/api/support-tickets', { params });
    return data;
  },
  getById: async (
    ticketId: string
  ): Promise<{ ticket: SupportTicket; comments: SupportTicketComment[] }> => {
    const { data } = await api.get(`/api/support-tickets/${ticketId}`);
    return data;
  },
  update: async (
    ticketId: string,
    payload: Partial<Pick<SupportTicket, 'status' | 'tags' | 'severity' | 'assigneeUserId'>>
  ): Promise<SupportTicket> => {
    const { data } = await api.patch(`/api/support-tickets/${ticketId}`, payload);
    return data;
  },
  comment: async (
    ticketId: string,
    payload: { message: string; attachments?: { name: string; url?: string; type?: string }[] }
  ): Promise<SupportTicketComment> => {
    const { data } = await api.post(`/api/support-tickets/${ticketId}/comments`, payload);
    return data;
  },
};

export default api;
