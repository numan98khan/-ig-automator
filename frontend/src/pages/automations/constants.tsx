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
  Calendar,
  Clock,
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
    serviceList?: boolean;
    priceRanges?: boolean;
    locationLink?: boolean;
    locationHours?: boolean;
    phoneMinLength?: boolean;
    triggerKeywords?: boolean;
  salesTriggerKeywords?: boolean;
  triggerCategories?: boolean;
  salesTriggerCategories?: boolean;
  triggerMatchMode?: boolean;
  salesTriggerMatchMode?: boolean;
    salesCatalog?: boolean;
    salesShipping?: boolean;
    salesPhoneMinLength?: boolean;
    salesCityAliases?: boolean;
    salesUseGoogleSheets?: boolean;
    salesKnowledgeItems?: boolean;
    businessHoursTime?: boolean;
    businessTimezone?: boolean;
    afterHoursMessage?: boolean;
    followupMessage?: boolean;
  };
}

export const BOOKING_TRIGGER_KEYWORDS = [
  'book',
  'booking',
  'appointment',
  'slot',
  'available',
  'availability',
  'price',
  'pricing',
  'حجز',
  'موعد',
  'سعر',
];

export const SALES_TRIGGER_KEYWORDS = [
  'price',
  'pricing',
  'available',
  'availability',
  'stock',
  'buy',
  'order',
  'checkout',
  'cod',
  'delivery',
];

export const getDefaultSetupData = () => ({
  serviceList: '',
  priceRanges: '',
  locationLink: '',
  locationHours: '',
  phoneMinLength: '8',
  aiTone: 'friendly',
  aiMaxSentences: '3',
  triggerKeywords: 'book, booking, appointment, slot, available, availability, price, حجز, موعد, سعر',
  triggerKeywordMatch: 'any' as 'any' | 'all',
  triggerCategoryIds: [] as string[],
  triggerMatchMode: 'any' as 'any' | 'keywords' | 'categories',
  salesTriggerKeywords: 'price, pricing, stock, available, buy, order, checkout, cod, delivery',
  salesTriggerKeywordMatch: 'any' as 'any' | 'all',
  salesTriggerCategoryIds: [] as string[],
  salesTriggerMatchMode: 'any' as 'any' | 'keywords' | 'categories',
  salesPhoneMinLength: '8',
  salesUseGoogleSheets: false,
  salesKnowledgeItemIds: [] as string[],
  salesCatalogJson: JSON.stringify([
    {
      sku: 'SKU-1001',
      name: 'Classic Abaya',
      keywords: ['abaya', 'classic'],
      price: 180,
      currency: 'SAR',
      stock: 'in',
      variants: { size: ['S', 'M', 'L'], color: ['black', 'navy'] },
    },
    {
      sku: 'SKU-1002',
      name: 'Linen Shirt',
      keywords: ['linen', 'shirt'],
      price: { min: 120, max: 150 },
      currency: 'SAR',
      stock: 'low',
      variants: { size: ['M', 'L', 'XL'], color: ['white', 'beige'] },
    },
  ], null, 2),
  salesShippingJson: JSON.stringify([
    { city: 'Riyadh', fee: 15, eta: '1-2 days', codAllowed: true },
    { city: 'Jeddah', fee: 25, eta: '2-3 days', codAllowed: false },
  ], null, 2),
  salesCityAliasesJson: JSON.stringify({
    'riyadh north': 'Riyadh',
    'riyadh south': 'Riyadh',
  }, null, 2),
  businessHoursStart: '09:00',
  businessHoursEnd: '17:00',
  businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  afterHoursMessage: "We're closed - leave details, we'll contact you at {next_open_time}.",
  followupMessage: "We're open now if you'd like to continue. Reply anytime.",
});

export type SetupData = ReturnType<typeof getDefaultSetupData>;

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'booking_concierge',
    name: 'Instant Booking Concierge',
    outcome: 'Capture booking leads in under 60 seconds',
    goal: 'Bookings',
    industry: 'Clinics',
    triggers: ['dm_message'],
    setupTime: '~2 min',
    collects: ['lead name', 'phone', 'service', 'preferred day/time'],
    icon: <Calendar className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      keywordMatch: 'any',
      keywords: ['book', 'booking', 'appointment', 'slot', 'available', 'availability', 'حجز', 'موعد', 'سعر', 'price'],
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Do you have availability this week?' },
      { from: 'bot', message: 'Hi! I can help with bookings. Choose: Book appointment, Prices, Location, Talk to staff.' },
      { from: 'customer', message: 'Book appointment' },
      { from: 'bot', message: "Great! What's your name?" },
    ],
    setupFields: {
      serviceList: true,
      priceRanges: true,
      locationLink: true,
      locationHours: true,
      phoneMinLength: true,
      triggerKeywords: true,
      triggerCategories: true,
      triggerMatchMode: true,
    },
  },
  {
    id: 'after_hours_capture',
    name: 'After-Hours Lead Capture',
    outcome: "Capture leads when you're closed and follow up next open",
    goal: 'Leads',
    industry: 'General',
    triggers: ['dm_message'],
    setupTime: '~2 min',
    collects: ['phone', 'intent', 'preferred time'],
    icon: <Clock className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      outsideBusinessHours: true,
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Are you open now?' },
      { from: 'bot', message: "We're closed - leave details, we'll contact you at 9:00 AM." },
      { from: 'bot', message: 'What can we help with? Booking, Prices, Order, Other.' },
      { from: 'customer', message: 'Booking' },
    ],
    setupFields: {
      businessHoursTime: true,
      businessTimezone: true,
      afterHoursMessage: true,
      followupMessage: true,
    },
  },
  {
    id: 'sales_concierge',
    name: 'Sales Concierge',
    outcome: 'Turn product inquiries into structured checkout drafts',
    goal: 'Sales',
    industry: 'Retail',
    triggers: ['dm_message'],
    setupTime: '~5 min',
    collects: ['product', 'variant', 'city', 'payment method'],
    icon: <MessageSquare className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      keywordMatch: 'any',
      keywords: ['price', 'pricing', 'stock', 'available', 'buy', 'order', 'checkout', 'cod', 'delivery'],
      matchOn: { link: true, attachment: true },
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Price for the linen shirt?' },
      { from: 'bot', message: 'Sure — checking. Which city for delivery?' },
      { from: 'customer', message: 'Riyadh' },
      { from: 'bot', message: 'Price is 120-150 SAR depending on size. COD or online payment?' },
    ],
    setupFields: {
      salesTriggerKeywords: true,
      salesTriggerCategories: true,
      salesTriggerMatchMode: true,
      salesPhoneMinLength: true,
      salesUseGoogleSheets: true,
      salesKnowledgeItems: true,
    },
  },
];
