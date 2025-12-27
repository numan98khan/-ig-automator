import React from 'react';
import {
  TriggerType,
  GoalType,
  TriggerConfig,
  AutomationTemplateId,
} from '../../services/api';
import {
  MessageSquare,
  MessageCircle,
  Send,
  Share2,
  Megaphone,
  Video,
  ExternalLink,
} from 'lucide-react';

export const TRIGGER_METADATA: Record<TriggerType, { icon: React.ReactNode; label: string; description: string; badge?: string }> = {
  post_comment: {
    icon: <MessageSquare className="w-5 h-5" />,
    label: 'Post or Reel Comments',
    description: 'User comments on your Post or Reel',
  },
  story_reply: {
    icon: <MessageCircle className="w-5 h-5" />,
    label: 'Story Reply',
    description: 'User replies to your Story',
  },
  dm_message: {
    icon: <Send className="w-5 h-5" />,
    label: 'Instagram Message',
    description: 'User sends a message',
  },
  story_share: {
    icon: <Share2 className="w-5 h-5" />,
    label: 'Story Share',
    description: 'User shares your Post or Reel as a Story',
    badge: 'NEW',
  },
  instagram_ads: {
    icon: <Megaphone className="w-5 h-5" />,
    label: 'Instagram Ads',
    description: 'User clicks an Instagram Ad',
    badge: 'PRO',
  },
  live_comment: {
    icon: <Video className="w-5 h-5" />,
    label: 'Live Comments',
    description: 'User comments on your Live',
  },
  ref_url: {
    icon: <ExternalLink className="w-5 h-5" />,
    label: 'Instagram Ref URL',
    description: 'User clicks a referral link',
  },
};

export const GOAL_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'none', label: 'No specific goal', description: 'Just have a conversation' },
  { value: 'capture_lead', label: 'Capture Lead', description: 'Collect customer information' },
  { value: 'book_appointment', label: 'Book Appointment', description: 'Schedule a booking' },
  { value: 'start_order', label: 'Start Order', description: 'Begin order process' },
  { value: 'handle_support', label: 'Handle Support', description: 'Provide customer support' },
  { value: 'drive_to_channel', label: 'Drive to Channel', description: 'Direct to external link' },
];

export const AI_TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'direct', label: 'Direct' },
  { value: 'playful', label: 'Playful' },
];

export interface AutomationTemplate {
  id: AutomationTemplateId;
  name: string;
  outcome: string;
  goal: 'Bookings' | 'Sales' | 'Leads' | 'Support';
  industry: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  triggers: TriggerType[];
  setupTime: string;
  collects: string[];
  icon: React.ReactNode;
  triggerType: TriggerType;
  triggerConfig?: TriggerConfig;
  replyType: 'constant_reply' | 'ai_reply' | 'template_flow';
  aiGoalType?: GoalType;
  previewConversation: { from: 'bot' | 'customer'; message: string }[];
  setupFields: {
    salesTriggerKeywords?: boolean;
    salesTriggerCategories?: boolean;
    salesTriggerMatchMode?: boolean;
    salesUseGoogleSheets?: boolean;
    salesKnowledgeItems?: boolean;
  };
}

export const SALES_TRIGGER_KEYWORDS = [
  'price',
  'pricing',
  'available',
  'availability',
  'stock',
  'buy',
  'order',
  'checkout',
  'delivery',
];

export const getDefaultSetupData = () => ({
  aiTone: 'friendly',
  aiMaxSentences: '3',
  salesTriggerKeywords: 'price, pricing, stock, available, buy, order, checkout, delivery',
  salesTriggerKeywordMatch: 'any' as 'any' | 'all',
  salesTriggerCategoryIds: [] as string[],
  salesTriggerMatchMode: 'any' as 'any' | 'keywords' | 'categories',
  salesUseGoogleSheets: false,
  salesKnowledgeItemIds: [] as string[],
});

export type SetupData = ReturnType<typeof getDefaultSetupData>;

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'sales_concierge',
    name: 'Sales Concierge',
    outcome: 'Turn product inquiries into tailored sales replies',
    goal: 'Sales',
    industry: 'Retail',
    triggers: ['dm_message'],
    setupTime: '~5 min',
    collects: ['product', 'variant', 'city'],
    icon: <MessageSquare className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      keywordMatch: 'any',
      keywords: ['price', 'pricing', 'stock', 'available', 'buy', 'order', 'checkout', 'delivery'],
      matchOn: { link: true, attachment: true },
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Price for the linen shirt?' },
      { from: 'bot', message: 'Sure — checking. Which city for delivery?' },
      { from: 'customer', message: 'Riyadh' },
      { from: 'bot', message: 'Price is 120-150 SAR depending on size. Want sizing or stock details?' },
    ],
    setupFields: {
      salesTriggerKeywords: true,
      salesTriggerCategories: true,
      salesTriggerMatchMode: true,
      salesUseGoogleSheets: true,
      salesKnowledgeItems: true,
    },
  },
];
