// Trigger types for Instagram events
export type TriggerType =
  | 'post_comment'      // Post or Reel Comments
  | 'story_reply'       // Story Reply
  | 'dm_message'        // Instagram Message
  | 'story_share'       // User shares your Post or Reel as a Story (NEW)
  | 'instagram_ads'     // Instagram Ads (PRO)
  | 'live_comment'      // Live Comments
  | 'ref_url';          // Instagram Ref URL

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
  historyLimit?: number;
  ragEnabled?: boolean;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

// Trigger configuration (for future extensibility)
export interface TriggerConfig {
  // Could add specific filters or conditions per trigger type
  keywords?: string[]; // Optional keywords to filter on
  excludeKeywords?: string[]; // Optional keywords to exclude
  keywordMatch?: 'any' | 'all';
  categoryIds?: string[];
  triggerMode?: 'keywords' | 'categories' | 'any' | 'intent';
  intentText?: string;
  outsideBusinessHours?: boolean;
  businessHours?: BusinessHoursConfig;
  matchOn?: {
    link?: boolean;
    attachment?: boolean;
  };
}
