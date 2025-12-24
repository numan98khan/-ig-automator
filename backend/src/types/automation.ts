import { GoalType } from './automationGoals';

// Trigger types for Instagram events
export type TriggerType =
  | 'post_comment'      // Post or Reel Comments
  | 'story_reply'       // Story Reply
  | 'dm_message'        // Instagram Message
  | 'story_share'       // User shares your Post or Reel as a Story (NEW)
  | 'instagram_ads'     // Instagram Ads (PRO)
  | 'live_comment'      // Live Comments
  | 'ref_url';          // Instagram Ref URL

export type AutomationTemplateId =
  | 'booking_concierge'
  | 'after_hours_capture';

export interface BusinessHoursConfig {
  startTime: string; // 24h "HH:mm"
  endTime: string;   // 24h "HH:mm"
  timezone?: string; // IANA name, e.g. "America/New_York"
  daysOfWeek?: number[]; // 0=Sun..6=Sat, defaults to all
}

export interface AutomationRateLimit {
  maxMessages: number;
  perMinutes: number;
}

export interface BookingConciergeConfig {
  quickReplies: string[];
  serviceOptions: string[];
  priceRanges?: string;
  locationLink?: string;
  locationHours?: string;
  minPhoneLength?: number;
  maxQuestions?: number;
  rateLimit?: AutomationRateLimit;
  handoffTeam?: string;
  tags?: string[];
  outputs?: {
    sheetRow?: string;
    notify?: string[];
    createContact?: boolean;
  };
}

export interface AfterHoursCaptureConfig {
  businessHours: BusinessHoursConfig;
  closedMessageTemplate: string;
  intentOptions: string[];
  followupMessage?: string;
  maxQuestions?: number;
  rateLimit?: AutomationRateLimit;
  tags?: string[];
  outputs?: {
    sheetRow?: string;
    notify?: string[];
    digestInclude?: boolean;
  };
}

export interface TemplateFlowConfig {
  templateId: AutomationTemplateId;
  config: BookingConciergeConfig | AfterHoursCaptureConfig;
}

// Reply step configuration
export interface ReplyStep {
  type: 'constant_reply' | 'ai_reply' | 'template_flow';

  // For constant_reply
  constantReply?: {
    message: string;
  };

  // For ai_reply
  aiReply?: {
    goalType: GoalType;
    goalDescription?: string; // Natural language description of the goal
    knowledgeItemIds: string[]; // IDs of knowledge items to use
  };

  // For template_flow
  templateFlow?: TemplateFlowConfig;
}

// Trigger configuration (for future extensibility)
export interface TriggerConfig {
  // Could add specific filters or conditions per trigger type
  keywords?: string[]; // Optional keywords to filter on
  excludeKeywords?: string[]; // Optional keywords to exclude
  keywordMatch?: 'any' | 'all';
  outsideBusinessHours?: boolean;
  businessHours?: BusinessHoursConfig;
}

// Automation statistics
export interface AutomationStats {
  totalTriggered: number;
  totalRepliesSent: number;
  lastTriggeredAt?: Date;
  lastReplySentAt?: Date;
}
