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

// Reply step configuration
export interface ReplyStep {
  type: 'constant_reply' | 'ai_reply';

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
}

// Trigger configuration (for future extensibility)
export interface TriggerConfig {
  // Could add specific filters or conditions per trigger type
  keywords?: string[]; // Optional keywords to filter on
  excludeKeywords?: string[]; // Optional keywords to exclude
}

// Automation statistics
export interface AutomationStats {
  totalTriggered: number;
  totalRepliesSent: number;
  lastTriggeredAt?: Date;
  lastReplySentAt?: Date;
}
