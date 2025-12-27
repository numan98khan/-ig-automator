import { AutomationTemplateId } from '../../types/automation';

export type AutomationTestContext = {
  forceOutsideBusinessHours?: boolean;
  hasLink?: boolean;
  hasAttachment?: boolean;
  linkUrl?: string;
  attachmentUrls?: string[];
  testMode?: 'self_chat' | 'test_user';
};

export type TemplateFlowState = {
  step?: string;
  status?: 'active' | 'completed' | 'handoff';
  questionCount: number;
  collectedFields: Record<string, any>;
};

export type TemplateFlowReply = {
  text: string;
  buttons?: Array<{ title: string }>;
};

export type TemplateFlowActions = {
  handoffReason?: string;
  createLead?: boolean;
  createBooking?: boolean;
  scheduleFollowup?: boolean;
  createDraft?: boolean;
  draftPayload?: Record<string, any>;
  paymentLinkRequired?: boolean;
  handoffSummary?: string;
  handoffTopic?: string;
  recommendedNextAction?: string;
};

export type AutomationTestHistoryItem = {
  from: 'customer' | 'ai';
  text: string;
  createdAt?: string;
};

export type AutomationTestState = {
  history?: AutomationTestHistoryItem[];
  testConversationId?: string;
  testInstagramAccountId?: string;
  testParticipantInstagramId?: string;
  testMode?: 'self_chat' | 'test_user';
  template?: {
    templateId: AutomationTemplateId;
    step?: string;
    status?: 'active' | 'completed' | 'handoff' | 'paused';
    questionCount: number;
    collectedFields?: Record<string, any>;
    followup?: {
      status: 'scheduled' | 'sent' | 'cancelled';
      scheduledAt?: string;
      message?: string;
    };
    lastCustomerMessageAt?: string;
    lastBusinessMessageAt?: string;
  };
  [key: string]: any;
};
