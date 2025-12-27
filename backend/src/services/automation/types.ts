export type AutomationTestContext = {
  forceOutsideBusinessHours?: boolean;
  hasLink?: boolean;
  hasAttachment?: boolean;
  linkUrl?: string;
  attachmentUrls?: string[];
  categoryId?: string;
  categoryName?: string;
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
