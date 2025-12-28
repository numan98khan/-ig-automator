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
  | 'sales_concierge';

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

export interface AutomationAiSettings {
  tone?: string;
  maxReplySentences?: number;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

export interface SalesCatalogVariantOptions {
  size?: string[];
  color?: string[];
}

export interface SalesCatalogItem {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  keywords?: string[];
  price?: number | { min: number; max: number };
  currency?: string;
  stock?: 'in' | 'low' | 'out' | 'unknown';
  variants?: SalesCatalogVariantOptions;
}

export interface SalesShippingRule {
  city: string;
  fee: number;
  eta: string;
  codAllowed: boolean;
}

export interface SalesConciergeConfig {
  catalog?: SalesCatalogItem[];
  shippingRules?: SalesShippingRule[];
  cityAliases?: Record<string, string>;
  synonyms?: Record<string, string[]>;
  matchThreshold?: number;
  minPhoneLength?: number;
  useGoogleSheets?: boolean;
  knowledgeItemIds?: string[];
  lockMode?: 'none' | 'session_only';
  lockTtlMinutes?: number;
  releaseKeywords?: string[];
  faqInterruptEnabled?: boolean;
  faqIntentKeywords?: string[];
  faqResponseSuffix?: string;
  aiInterpretationEnabled?: boolean;
  aiRephraseEnabled?: boolean;
  aiConfidenceThresholds?: {
    intent?: number;
    productRef?: number;
    sku?: number;
    variant?: number;
    quantity?: number;
    city?: number;
  };
  maxQuestions?: number;
  rateLimit?: AutomationRateLimit;
  tags?: string[];
  aiSettings?: AutomationAiSettings;
  outputs?: {
    notify?: string[];
    createContact?: boolean;
  };
}

export interface TemplateFlowConfig {
  templateId: AutomationTemplateId;
  config: SalesConciergeConfig;
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
    tone?: string;
    maxReplySentences?: number;
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
  categoryIds?: string[];
  triggerMode?: 'keywords' | 'categories' | 'any';
  outsideBusinessHours?: boolean;
  businessHours?: BusinessHoursConfig;
  matchOn?: {
    link?: boolean;
    attachment?: boolean;
  };
}

// Automation statistics
export interface AutomationStats {
  totalTriggered: number;
  totalRepliesSent: number;
  lastTriggeredAt?: Date;
  lastReplySentAt?: Date;
}
