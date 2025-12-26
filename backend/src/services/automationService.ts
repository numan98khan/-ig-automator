import mongoose from 'mongoose';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import InstagramAccount from '../models/InstagramAccount';
import FollowupTask from '../models/FollowupTask';
import Automation from '../models/Automation';
import AutomationSession from '../models/AutomationSession';
import LeadCapture from '../models/LeadCapture';
import BookingRequest from '../models/BookingRequest';
import OrderDraft from '../models/OrderDraft';
import {
  sendMessage as sendInstagramMessage,
  sendButtonMessage,
} from '../utils/instagram-api';
import { createTicket } from './escalationService';
import { addCountIncrement, trackDailyMetric } from './reportingService';
import {
  AfterHoursCaptureConfig,
  AutomationRateLimit,
  AutomationTemplateId,
  BookingConciergeConfig,
  BusinessHoursConfig,
  SalesConciergeConfig,
  SalesCatalogItem,
  TemplateFlowConfig,
  TriggerConfig,
  TriggerType,
} from '../types/automation';

const HUMAN_TYPING_PAUSE_MS = 3500; // Small pause to mimic human response timing
const SKIP_TYPING_PAUSE_IN_SANDBOX =
  process.env.SANDBOX_SKIP_TYPING_PAUSE === 'true' || process.env.SANDBOX_SKIP_TYPING_PAUSE === '1';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function shouldPauseForTyping(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean },
): boolean {
  const isSandboxMock = platform === 'mock';
  const skipTypingPause = isSandboxMock && (SKIP_TYPING_PAUSE_IN_SANDBOX || settings?.skipTypingPauseInSandbox);

  return HUMAN_TYPING_PAUSE_MS > 0 && !skipTypingPause;
}

export async function pauseForTypingIfNeeded(
  platform?: string,
  settings?: { skipTypingPauseInSandbox?: boolean },
): Promise<void> {
  if (shouldPauseForTyping(platform, settings)) {
    await wait(HUMAN_TYPING_PAUSE_MS);
  }
}

const DEFAULT_RATE_LIMIT: AutomationRateLimit = {
  maxMessages: 5,
  perMinutes: 1,
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function matchesKeywords(text: string, keywords: string[] = [], match: 'any' | 'all' = 'any'): boolean {
  if (!keywords.length) return true;
  const normalized = normalizeText(text);
  const checks = keywords.map(keyword => normalized.includes(normalizeText(keyword)));
  return match === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function getTimezoneParts(timezone?: string, date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  parts.forEach(part => {
    partMap[part.type] = part.value;
  });
  return {
    weekday: partMap.weekday,
    hour: Number(partMap.hour),
    minute: Number(partMap.minute),
  };
}

function getWeekdayIndex(weekday: string | undefined): number {
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekday && map[weekday] !== undefined ? map[weekday] : 0;
}

function isOutsideBusinessHours(config?: BusinessHoursConfig, referenceDate: Date = new Date()): boolean {
  if (!config?.startTime || !config?.endTime) {
    return false;
  }
  const start = parseTimeToMinutes(config.startTime);
  const end = parseTimeToMinutes(config.endTime);
  if (start === null || end === null) {
    return false;
  }
  const parts = getTimezoneParts(config.timezone, referenceDate);
  const weekdayIndex = getWeekdayIndex(parts.weekday);
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  if (!activeDays.includes(weekdayIndex)) {
    return true;
  }
  const nowMinutes = parts.hour * 60 + parts.minute;
  if (start === end) {
    return false;
  }
  if (start < end) {
    return nowMinutes < start || nowMinutes >= end;
  }
  return nowMinutes >= end && nowMinutes < start;
}

function getNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): Date {
  const startMinutes = parseTimeToMinutes(config.startTime) || 0;
  const endMinutes = parseTimeToMinutes(config.endTime) || 0;
  const activeDays = config.daysOfWeek && config.daysOfWeek.length > 0 ? config.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];

  const now = new Date(referenceDate);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let candidate = new Date(now);
  for (let i = 0; i < 8; i += 1) {
    const weekdayIndex = candidate.getDay();
    const isActiveDay = activeDays.includes(weekdayIndex);

    if (isActiveDay) {
      const withinWindow = startMinutes < endMinutes
        ? nowMinutes >= startMinutes && nowMinutes < endMinutes
        : nowMinutes >= startMinutes || nowMinutes < endMinutes;

      if (withinWindow && i === 0) {
        return candidate;
      }

      candidate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      if (i === 0 && nowMinutes < startMinutes && startMinutes < endMinutes) {
        return candidate;
      }
      if (i > 0) {
        return candidate;
      }
    }

    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }

  return new Date(referenceDate);
}

function formatNextOpenTime(config: BusinessHoursConfig, referenceDate: Date = new Date()): string {
  const nextOpen = getNextOpenTime(config, referenceDate);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(nextOpen);
  } catch (error) {
    return nextOpen.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

type AutomationTestContext = {
  forceOutsideBusinessHours?: boolean;
  hasLink?: boolean;
  hasAttachment?: boolean;
  linkUrl?: string;
  attachmentUrls?: string[];
};

function matchesTriggerConfig(
  messageText: string,
  triggerConfig?: TriggerConfig,
  context?: AutomationTestContext,
): boolean {
  if (!triggerConfig) return true;
  const keywordMatch = triggerConfig.keywordMatch || 'any';
  if (
    triggerConfig.excludeKeywords &&
    triggerConfig.excludeKeywords.length > 0 &&
    matchesKeywords(messageText, triggerConfig.excludeKeywords, 'any')
  ) {
    return false;
  }
  if (
    triggerConfig.outsideBusinessHours &&
    !context?.forceOutsideBusinessHours &&
    !isOutsideBusinessHours(triggerConfig.businessHours)
  ) {
    return false;
  }
  const linkMatched = !!triggerConfig.matchOn?.link && !!context?.hasLink;
  const attachmentMatched = !!triggerConfig.matchOn?.attachment && !!context?.hasAttachment;
  if (linkMatched || attachmentMatched) {
    return true;
  }
  if (triggerConfig.keywords && !matchesKeywords(messageText, triggerConfig.keywords, keywordMatch)) {
    return false;
  }
  return true;
}

async function getTemplateSession(params: {
  automationId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  templateId: AutomationTemplateId;
}): Promise<any | null> {
  const latest = await AutomationSession.findOne({
    automationId: params.automationId,
    conversationId: params.conversationId,
  }).sort({ createdAt: -1 });

  if (latest && latest.status === 'paused') {
    return null;
  }

  if (latest && latest.status === 'active') {
    return latest;
  }

  return AutomationSession.create({
    workspaceId: params.workspaceId,
    conversationId: params.conversationId,
    automationId: params.automationId,
    templateId: params.templateId,
    status: 'active',
    questionCount: 0,
    collectedFields: {},
  });
}

function updateRateLimit(session: any, rateLimit: AutomationRateLimit): boolean {
  const now = new Date();
  const windowMs = rateLimit.perMinutes * 60 * 1000;
  const windowStart = session.rateLimit?.windowStart ? new Date(session.rateLimit.windowStart) : null;
  const elapsed = windowStart ? now.getTime() - windowStart.getTime() : windowMs + 1;

  if (!windowStart || elapsed > windowMs) {
    session.rateLimit = { windowStart: now, count: 1 };
    return true;
  }

  if (session.rateLimit.count >= rateLimit.maxMessages) {
    return false;
  }

  session.rateLimit.count += 1;
  return true;
}

async function sendTemplateMessage(params: {
  conversation: any;
  automation: any;
  igAccount: any;
  recipientId: string;
  text: string;
  buttons?: Array<{ title: string; actionType?: 'postback'; payload?: string }>;
  platform?: string;
  tags?: string[];
}): Promise<void> {
  const { conversation, automation, igAccount, recipientId, text, buttons, platform, tags } = params;

  await pauseForTypingIfNeeded(platform);

  let result;
  if (buttons && buttons.length > 0 && igAccount.instagramAccountId) {
    result = await sendButtonMessage(
      igAccount.instagramAccountId,
      recipientId,
      text,
      buttons.map((button) => ({
        type: 'postback',
        title: button.title,
        payload: button.payload || `button_${button.title}`,
      })),
      igAccount.accessToken,
    );
  } else {
    result = await sendInstagramMessage(recipientId, text, igAccount.accessToken);
  }

  if (!result || (!result.message_id && !result.recipient_id)) {
    throw new Error('Instagram API did not return a valid response.');
  }

  const sentAt = new Date();
  await Message.create({
    conversationId: conversation._id,
    workspaceId: conversation.workspaceId,
    text,
    from: 'ai',
    platform: platform || 'instagram',
    instagramMessageId: result.message_id,
    automationSource: 'template_flow',
    aiTags: tags,
    metadata: buttons ? { buttons } : undefined,
    createdAt: sentAt,
  });

  conversation.lastMessage = text;
  conversation.lastMessageAt = sentAt;
  conversation.lastBusinessMessageAt = sentAt;
  await conversation.save();

  automation.stats.totalTriggered += 1;
  automation.stats.totalRepliesSent += 1;
  automation.stats.lastTriggeredAt = sentAt;
  automation.stats.lastReplySentAt = sentAt;
  await automation.save();

  const increments: Record<string, number> = {
    outboundMessages: 1,
    aiReplies: 1,
  };

  if (tags && tags.length > 0) {
    tags.forEach(tag => addCountIncrement(increments, 'tagCounts', tag));
  }

  const responseMetrics = calculateResponseTime(conversation, sentAt);
  Object.assign(increments, responseMetrics);

  await trackDailyMetric(conversation.workspaceId, sentAt, increments);
}

function detectBookingMenuChoice(text: string): 'book' | 'prices' | 'location' | 'talk' | null {
  const normalized = normalizeText(text);
  if (/(book|booking|appointment|slot|available|availability|حجز|موعد)/.test(normalized)) return 'book';
  if (/(price|prices|cost|سعر)/.test(normalized)) return 'prices';
  if (/(location|address|where|hours|map|directions)/.test(normalized)) return 'location';
  if (/(talk|staff|human|agent|reception|team)/.test(normalized)) return 'talk';
  return null;
}

function detectAfterHoursIntent(text: string): string {
  const normalized = normalizeText(text);
  if (/(book|booking|appointment|reserve)/.test(normalized)) return 'Booking';
  if (/(price|prices|cost|سعر)/.test(normalized)) return 'Prices';
  if (/(order|purchase|buy)/.test(normalized)) return 'Order';
  return 'Other';
}

type TemplateFlowState = {
  step?: string;
  status?: 'active' | 'completed' | 'handoff';
  questionCount: number;
  collectedFields: Record<string, any>;
};

type TemplateFlowReply = {
  text: string;
  buttons?: Array<{ title: string }>;
};

type TemplateFlowActions = {
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

function normalizeFlowState(state: Partial<TemplateFlowState>): TemplateFlowState {
  return {
    step: state.step,
    status: state.status || 'active',
    questionCount: state.questionCount ?? 0,
    collectedFields: state.collectedFields ? { ...state.collectedFields } : {},
  };
}

function buildBookingSummary(fields: Record<string, any>): string {
  return [
    `Name: ${fields.leadName || 'n/a'}`,
    `Phone: ${fields.phone || 'n/a'}`,
    `Service: ${fields.service || 'n/a'}`,
    fields.preferredDayTime ? `Preferred: ${fields.preferredDayTime}` : null,
  ].filter(Boolean).join('\n');
}

function buildAfterHoursSummary(fields: Record<string, any>): string {
  return [
    fields.intent ? `Intent: ${fields.intent}` : null,
    fields.leadName ? `Name: ${fields.leadName}` : null,
    fields.phone ? `Phone: ${fields.phone}` : null,
    fields.preferredTime ? `Preferred time: ${fields.preferredTime}` : null,
  ].filter(Boolean).join('\n');
}

function advanceBookingConciergeState(params: {
  state: TemplateFlowState;
  messageText: string;
  config: BookingConciergeConfig;
}): { replies: TemplateFlowReply[]; state: TemplateFlowState; actions?: TemplateFlowActions } {
  const { messageText, config } = params;
  const nextState = normalizeFlowState(params.state);
  const replies: TemplateFlowReply[] = [];
  const actions: TemplateFlowActions = {};
  const quickReplies = config.quickReplies || ['Book appointment', 'Prices', 'Location', 'Talk to staff'];
  const maxQuestions = config.maxQuestions ?? 5;
  const minPhoneLength = config.minPhoneLength ?? 8;

  if (nextState.status && nextState.status !== 'active') {
    replies.push({ text: 'This flow is complete. Reset to start again.' });
    return { replies, state: nextState };
  }

  if (!nextState.step) {
    replies.push({ text: `Hi! I can help with bookings. Choose an option: ${quickReplies.join(', ')}.` });
    nextState.step = 'menu';
    nextState.questionCount += 1;
    return { replies, state: nextState };
  }

  if (nextState.questionCount >= maxQuestions) {
    replies.push({ text: "Thanks for the details. I'm handing this to our reception team to finish up." });
    nextState.status = 'handoff';
    actions.handoffReason = 'Booking handoff (max questions reached)';
    return { replies, state: nextState, actions };
  }

  if (nextState.step === 'menu') {
    const choice = detectBookingMenuChoice(messageText);
    if (choice === 'prices') {
      const priceMessage = config.priceRanges
        ? `Here are our price ranges:\n${config.priceRanges}\n\nReply \"Book appointment\" to grab a slot.`
        : "Our pricing depends on the service. Reply with the service you're interested in and I can help you book.";
      replies.push({ text: priceMessage });
      return { replies, state: nextState };
    }
    if (choice === 'location') {
      const locationParts = [
        config.locationLink ? `Map: ${config.locationLink}` : null,
        config.locationHours ? `Hours: ${config.locationHours}` : null,
      ].filter(Boolean);
      replies.push({ text: locationParts.length ? locationParts.join('\n') : "We can share location details - reply with your preferred branch and we'll send directions." });
      return { replies, state: nextState };
    }
    if (choice === 'talk') {
      replies.push({ text: 'Connecting you to our reception team now.' });
      nextState.status = 'handoff';
      actions.handoffReason = 'Booking handoff requested';
      return { replies, state: nextState, actions };
    }

    nextState.step = 'collect_name';
    nextState.questionCount += 1;
    replies.push({ text: "Great! What's your name?" });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_name') {
    nextState.collectedFields.leadName = messageText.trim();
    nextState.step = 'collect_phone';
    nextState.questionCount += 1;
    replies.push({ text: "Thanks! What's the best phone number to reach you?" });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_phone') {
    const digits = messageText.replace(/\D/g, '');
    if (digits.length < minPhoneLength) {
      nextState.questionCount += 1;
      replies.push({ text: `Could you share a valid phone number (at least ${minPhoneLength} digits)?` });
      return { replies, state: nextState };
    }
    nextState.collectedFields.phone = digits;
    nextState.step = 'collect_service';
    nextState.questionCount += 1;
    const serviceOptions = config.serviceOptions || [];
    const buttons = serviceOptions.slice(0, 2).map((option) => ({ title: option }));
    if (buttons.length > 0) {
      buttons.push({ title: 'Other' });
    }
    const servicePrompt = serviceOptions.length
      ? `Which service would you like? ${serviceOptions.join(', ')}`
      : 'Which service would you like to book?';
    replies.push({ text: servicePrompt, buttons: buttons.length ? buttons : undefined });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_service') {
    const normalized = normalizeText(messageText);
    if (normalized === 'other') {
      if (nextState.questionCount + 1 > maxQuestions) {
        replies.push({ text: "Thanks! I'm handing this to our reception team to finish up." });
        nextState.status = 'handoff';
        actions.handoffReason = 'Booking handoff (max questions reached)';
        return { replies, state: nextState, actions };
      }
      nextState.step = 'collect_service_other';
      nextState.questionCount += 1;
      replies.push({ text: 'Sure - what service are you interested in?' });
      return { replies, state: nextState };
    }

    nextState.collectedFields.service = messageText.trim();
    nextState.step = 'collect_preferred_time';
    nextState.questionCount += 1;
    replies.push({ text: 'Any preferred day or time? (Optional)' });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_service_other') {
    nextState.collectedFields.service = messageText.trim();
    nextState.step = 'collect_preferred_time';
    nextState.questionCount += 1;
    replies.push({ text: 'Any preferred day or time? (Optional)' });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_preferred_time') {
    nextState.collectedFields.preferredDayTime = messageText.trim();
    nextState.step = 'confirm';
    const summary = buildBookingSummary(nextState.collectedFields);
    replies.push({ text: `Got it! Here's a quick summary:\n${summary}\n\nWe'll have our reception team follow up shortly.` });
    nextState.status = 'handoff';
    actions.handoffReason = 'Booking lead handoff';
    actions.createLead = true;
    actions.createBooking = true;
    return { replies, state: nextState, actions };
  }

  replies.push({ text: "I'm not sure how to continue this flow. Reset to try again." });
  return { replies, state: nextState };
}

function advanceAfterHoursCaptureState(params: {
  state: TemplateFlowState;
  messageText: string;
  config: AfterHoursCaptureConfig;
}): { replies: TemplateFlowReply[]; state: TemplateFlowState; actions?: TemplateFlowActions } {
  const { messageText, config } = params;
  const nextState = normalizeFlowState(params.state);
  const replies: TemplateFlowReply[] = [];
  const actions: TemplateFlowActions = {};
  const maxQuestions = config.maxQuestions ?? 4;
  const intentOptions = config.intentOptions && config.intentOptions.length > 0
    ? config.intentOptions
    : ['Booking', 'Prices', 'Order', 'Other'];

  if (nextState.status && nextState.status !== 'active') {
    replies.push({ text: 'This flow is complete. Reset to start again.' });
    return { replies, state: nextState };
  }

  if (!nextState.step) {
    const closedTemplate = config.closedMessageTemplate || "We're closed - leave details, we'll contact you at {next_open_time}.";
    const nextOpen = formatNextOpenTime(config.businessHours);
    replies.push({ text: closedTemplate.replace('{next_open_time}', nextOpen) });
    nextState.collectedFields.message = messageText.trim();

    const detectedIntent = detectAfterHoursIntent(messageText);
    const intentMatch = detectedIntent !== 'Other'
      && intentOptions.map((option) => option.toLowerCase()).includes(detectedIntent.toLowerCase());

    if (intentMatch) {
      nextState.collectedFields.intent = detectedIntent;
      nextState.step = 'collect_name';
      nextState.questionCount += 1;
      replies.push({ text: 'May I have your name? (Optional)' });
    } else {
      nextState.step = 'collect_intent';
      nextState.questionCount += 1;
      replies.push({
        text: `What can we help with? ${intentOptions.join(', ')}.`,
        buttons: intentOptions.slice(0, 3).map((option) => ({ title: option })),
      });
    }
    return { replies, state: nextState };
  }

  if (nextState.questionCount >= maxQuestions) {
    replies.push({ text: "Thanks for the details. You're in the queue and a teammate will follow up." });
    nextState.status = 'completed';
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_intent') {
    nextState.collectedFields.intent = detectAfterHoursIntent(messageText);
    nextState.step = 'collect_name';
    nextState.questionCount += 1;
    replies.push({ text: 'May I have your name? (Optional)' });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_name') {
    const trimmed = messageText.trim();
    const leadName = /^(skip|no|n\/a|na|none)$/i.test(trimmed) ? undefined : trimmed;
    nextState.collectedFields.leadName = leadName;
    nextState.step = 'collect_phone';
    nextState.questionCount += 1;
    replies.push({ text: "What's the best phone number to reach you?" });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_phone') {
    const digits = messageText.replace(/\D/g, '');
    nextState.collectedFields.phone = digits || messageText.trim();
    nextState.step = 'collect_preferred_time';
    nextState.questionCount += 1;
    replies.push({ text: 'Any preferred time for a callback? (Optional)' });
    return { replies, state: nextState };
  }

  if (nextState.step === 'collect_preferred_time') {
    const trimmed = messageText.trim();
    const preferredTime = /^(skip|no|n\/a|na|none)$/i.test(trimmed) ? undefined : trimmed;
    nextState.collectedFields.preferredTime = preferredTime;
    nextState.step = 'confirm';
    const summary = buildAfterHoursSummary(nextState.collectedFields);
    replies.push({ text: `You're in the queue. Here's what I captured:\n${summary}` });
    nextState.status = 'completed';
    actions.handoffReason = 'After-hours lead capture';
    actions.createLead = true;
    actions.scheduleFollowup = true;
    return { replies, state: nextState, actions };
  }

  replies.push({ text: "I'm not sure how to continue this flow. Reset to try again." });
  return { replies, state: nextState };
}

type SalesIntent = 'price' | 'availability' | 'delivery' | 'order' | 'support' | 'other';
type SalesPaymentMethod = 'online' | 'cod';

const SALES_INTENT_OPTIONS = ['Price', 'Availability', 'Delivery', 'Order', 'Support'];
const SALES_NEGOTIATION_PATTERNS = /(discount|cheaper|too expensive|drop price|lower price|deal|offer)/i;
const SALES_ANGER_PATTERNS = /(angry|scam|fraud|bad service|terrible|worst|refund|complain|hate)/i;
const SALES_SPAM_PATTERNS = /(http.*free money|crypto|click here|earn \$)/i;

function detectSalesIntent(text: string): SalesIntent {
  const normalized = normalizeText(text);
  if (/(refund|complain|problem|issue|support|cancel)/.test(normalized)) return 'support';
  if (/(delivery|ship|shipping|eta|arrive)/.test(normalized)) return 'delivery';
  if (/(availability|available|in stock|stock)/.test(normalized)) return 'availability';
  if (/(buy|order|checkout|cod|cash on delivery|payment)/.test(normalized)) return 'order';
  if (/(price|cost|how much|pricing)/.test(normalized)) return 'price';
  return 'other';
}

function detectPaymentMethod(text: string): SalesPaymentMethod | undefined {
  const normalized = normalizeText(text);
  if (/(cod|cash on delivery|cash)/.test(normalized)) return 'cod';
  if (/(online|card|link|pay|payment)/.test(normalized)) return 'online';
  return undefined;
}

function extractQuantity(text: string): number | undefined {
  const digitsOnly = text.replace(/\D/g, '');
  if (digitsOnly.length >= 6) return undefined;
  const match = text.match(/\b(\d{1,3})\b/);
  if (!match) return undefined;
  const qty = Number(match[1]);
  if (Number.isNaN(qty) || qty <= 0) return undefined;
  return qty;
}

function extractPhone(text: string): string | undefined {
  const digits = text.replace(/\D/g, '');
  if (digits.length < 6) return undefined;
  return digits;
}

function looksLikeAddress(text: string): boolean {
  const normalized = normalizeText(text);
  const hasNumber = /\d/.test(text);
  const hasKeyword = /(street|st|road|rd|block|area|building|apt|avenue|unit)/.test(normalized);
  return normalized.length >= 10 && (hasNumber || hasKeyword);
}

function normalizeCityName(input: string, config: SalesConciergeConfig): string | undefined {
  if (!input) return undefined;
  const normalized = normalizeText(input);
  const aliasMap = {
    riyadh: 'Riyadh',
    jeddah: 'Jeddah',
    dammam: 'Dammam',
    ...config.cityAliases,
  } as Record<string, string>;

  if (aliasMap[normalized]) {
    return aliasMap[normalized];
  }

  const cityRules = config.shippingRules || [];
  for (const rule of cityRules) {
    const cityNormalized = normalizeText(rule.city);
    if (normalized === cityNormalized || normalized.includes(cityNormalized) || cityNormalized.includes(normalized)) {
      return rule.city;
    }
  }

  return undefined;
}

function findCatalogCandidates(config: SalesConciergeConfig, query: string): SalesCatalogItem[] {
  if (!query) return [];
  const normalizedQuery = normalizeText(query);
  const scored = config.catalog.map((item) => {
    let score = 0;
    const name = normalizeText(item.name);
    if (name && normalizedQuery.includes(name)) score += 3;
    if (item.sku && normalizedQuery.includes(normalizeText(item.sku))) score += 4;
    (item.keywords || []).forEach((keyword) => {
      if (normalizedQuery.includes(normalizeText(keyword))) score += 2;
    });
    return { item, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((entry) => entry.item);
}

function selectCatalogCandidate(messageText: string, candidates: SalesCatalogItem[]): SalesCatalogItem | undefined {
  if (!candidates.length) return undefined;
  const normalized = normalizeText(messageText);
  const indexMatch = normalized.match(/\b(1|2|3)\b/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    if (candidates[index]) return candidates[index];
  }
  return candidates.find((candidate) => {
    const name = normalizeText(candidate.name);
    const sku = normalizeText(candidate.sku || '');
    return (name && normalized.includes(name)) || (sku && normalized.includes(sku));
  });
}

function extractVariant(messageText: string, item?: SalesCatalogItem) {
  if (!item?.variants) return {};
  const normalized = normalizeText(messageText);
  const size = item.variants.size?.find((option) => normalized.includes(normalizeText(option)));
  const color = item.variants.color?.find((option) => normalized.includes(normalizeText(option)));
  return { size, color };
}

function formatPrice(price: SalesCatalogItem['price'], currency: string): string | undefined {
  if (!price) return undefined;
  if (typeof price === 'number') {
    return `${price} ${currency}`;
  }
  if (price.min && price.max) {
    return `${price.min}-${price.max} ${currency}`;
  }
  return undefined;
}

function formatStock(stock?: SalesCatalogItem['stock']): string | undefined {
  if (!stock) return undefined;
  if (stock === 'in') return 'In stock';
  if (stock === 'low') return 'Low stock';
  if (stock === 'out') return 'Out of stock';
  return 'Confirming';
}

function buildSalesQuote(item: SalesCatalogItem, city: string, config: SalesConciergeConfig) {
  const currency = item.currency || 'SAR';
  const shippingRule = config.shippingRules.find((rule) => normalizeText(rule.city) === normalizeText(city));
  return {
    priceText: formatPrice(item.price, currency),
    stockText: formatStock(item.stock),
    shippingFee: shippingRule?.fee,
    eta: shippingRule?.eta,
    currency,
    codAllowed: shippingRule?.codAllowed ?? false,
  };
}

function buildSalesSummary(fields: Record<string, any>) {
  return [
    fields.sku ? `SKU: ${fields.sku}` : null,
    fields.productName ? `Product: ${fields.productName}` : null,
    fields.variant?.size ? `Size: ${fields.variant.size}` : null,
    fields.variant?.color ? `Color: ${fields.variant.color}` : null,
    fields.quantity ? `Qty: ${fields.quantity}` : null,
    fields.city ? `City: ${fields.city}` : null,
    fields.address ? `Address: ${fields.address}` : null,
    fields.phone ? `Phone: ${fields.phone}` : null,
    fields.paymentMethod ? `Payment: ${fields.paymentMethod.toUpperCase()}` : null,
    fields.quote?.priceText ? `Price: ${fields.quote.priceText}` : null,
    fields.quote?.stockText ? `Stock: ${fields.quote.stockText}` : null,
    fields.quote?.shippingFee !== undefined ? `Shipping: ${fields.quote.shippingFee}` : null,
    fields.quote?.eta ? `ETA: ${fields.quote.eta}` : null,
  ].filter(Boolean).join('\n');
}

function incrementAttempt(fields: Record<string, any>, key: string): number {
  const attempts = fields.attempts || {};
  attempts[key] = (attempts[key] || 0) + 1;
  fields.attempts = attempts;
  return attempts[key];
}

function extractProductRef(messageText: string, context?: AutomationTestContext) {
  const linkMatch = messageText.match(/https?:\/\/\S+/i);
  if (linkMatch) {
    return { type: 'link', value: linkMatch[0] };
  }
  if (context?.linkUrl) {
    return { type: 'link', value: context.linkUrl };
  }
  if (context?.attachmentUrls && context.attachmentUrls.length > 0) {
    return { type: 'image', value: context.attachmentUrls[0] };
  }
  return undefined;
}

function advanceSalesConciergeState(params: {
  state: TemplateFlowState;
  messageText: string;
  config: SalesConciergeConfig;
  context?: AutomationTestContext;
}): { replies: TemplateFlowReply[]; state: TemplateFlowState; actions?: TemplateFlowActions } {
  const { messageText, config, context } = params;
  const nextState = normalizeFlowState(params.state);
  const replies: TemplateFlowReply[] = [];
  const actions: TemplateFlowActions = {};
  const maxQuestions = config.maxQuestions ?? 6;
  const minPhoneLength = config.minPhoneLength ?? 8;
  const fields = nextState.collectedFields || {};

  if (nextState.status && nextState.status !== 'active') {
    replies.push({ text: 'This flow is complete. Reset to start again.' });
    return { replies, state: nextState };
  }

  const intent = detectSalesIntent(messageText);
  if (intent && !fields.intent) {
    fields.intent = intent;
  }
  const paymentHint = detectPaymentMethod(messageText);
  if (paymentHint && !fields.paymentMethod) {
    fields.paymentMethod = paymentHint;
  }

  fields.flags = {
    isAngry: SALES_ANGER_PATTERNS.test(messageText),
    isNegotiation: SALES_NEGOTIATION_PATTERNS.test(messageText),
    isSpam: SALES_SPAM_PATTERNS.test(messageText),
  };

  if (fields.flags.isSpam || fields.flags.isAngry || fields.flags.isNegotiation || intent === 'support') {
    nextState.status = 'handoff';
    actions.handoffReason = 'Sales concierge handoff requested';
    actions.handoffTopic = 'Sales concierge handoff';
    actions.handoffSummary = buildSalesSummary(fields);
    actions.recommendedNextAction = 'Review intent and reply manually.';
    nextState.collectedFields = fields;
    return { replies: [{ text: "Thanks for the details. We'll have our team follow up shortly." }], state: nextState, actions };
  }

  if (nextState.questionCount >= maxQuestions) {
    nextState.status = 'handoff';
    actions.handoffReason = 'Sales concierge handoff (max questions)';
    actions.handoffTopic = 'Sales concierge handoff';
    actions.handoffSummary = buildSalesSummary(fields);
    actions.recommendedNextAction = 'Follow up with customer details.';
    replies.push({ text: "Thanks for the details. We'll have our team follow up shortly." });
    nextState.collectedFields = fields;
    return { replies, state: nextState, actions };
  }

  if (!fields.productRef) {
    const productRef = extractProductRef(messageText, context);
    if (productRef) {
      fields.productRef = productRef;
    }
  }

  if (!fields.productRef) {
    if (!fields.intentPrompted && intent === 'other') {
      fields.intentPrompted = true;
      nextState.questionCount += 1;
      replies.push({
        text: 'What can we help with?',
        buttons: SALES_INTENT_OPTIONS.map((option) => ({ title: option })),
      });
      nextState.step = 'NEED_PRODUCT_REF';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }

    nextState.step = 'NEED_PRODUCT_REF';
    nextState.questionCount += 1;
    replies.push({ text: 'Got it. Please share the product link or photo so we can check the details.' });
    nextState.collectedFields = fields;
    return { replies, state: nextState };
  }

  if (!fields.sku) {
    const searchQuery = [fields.productRef?.value, messageText].filter(Boolean).join(' ');
    const candidates = Array.isArray(fields.skuCandidates) && fields.skuCandidates.length > 0
      ? fields.skuCandidates
      : findCatalogCandidates(config, searchQuery);
    if (!candidates.length) {
      const attempt = incrementAttempt(fields, 'sku');
      if (attempt > 2) {
        nextState.status = 'handoff';
        actions.handoffReason = 'Sales concierge handoff (product unclear)';
        actions.handoffTopic = 'Sales concierge handoff';
        actions.handoffSummary = buildSalesSummary(fields);
        actions.recommendedNextAction = 'Clarify product reference.';
        replies.push({ text: "We're not fully sure which item you mean. We'll have our team follow up." });
        nextState.collectedFields = fields;
        return { replies, state: nextState, actions };
      }
      nextState.questionCount += 1;
      replies.push({ text: 'Which product are you asking about? A link or exact name helps.' });
      nextState.step = 'NEED_PRODUCT_REF';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }

    if (candidates.length > 1) {
      const selected = selectCatalogCandidate(messageText, candidates);
      if (!selected) {
        const attempt = incrementAttempt(fields, 'sku');
        if (attempt > 2) {
          nextState.status = 'handoff';
          actions.handoffReason = 'Sales concierge handoff (low SKU confidence)';
          actions.handoffTopic = 'Sales concierge handoff';
          actions.handoffSummary = buildSalesSummary(fields);
          actions.recommendedNextAction = 'Confirm SKU with customer.';
          replies.push({ text: "We're not fully sure which item you mean. We'll have our team follow up." });
          nextState.collectedFields = fields;
          return { replies, state: nextState, actions };
        }
        nextState.questionCount += 1;
        replies.push({
          text: 'Which one do you mean?',
          buttons: candidates.map((candidate) => ({ title: candidate.name })),
        });
        nextState.step = 'NEED_PRODUCT_REF';
        nextState.collectedFields = { ...fields, skuCandidates: candidates };
        return { replies, state: nextState };
      }
      fields.sku = selected.sku;
      fields.productName = selected.name;
      fields.skuCandidates = undefined;
    } else {
      fields.sku = candidates[0].sku;
      fields.productName = candidates[0].name;
      fields.skuCandidates = undefined;
    }
  }

  const item = config.catalog.find((catalogItem) => catalogItem.sku === fields.sku);
  if (!item) {
    nextState.status = 'handoff';
    actions.handoffReason = 'Sales concierge handoff (missing SKU)';
    actions.handoffTopic = 'Sales concierge handoff';
    actions.handoffSummary = buildSalesSummary(fields);
    actions.recommendedNextAction = 'Confirm SKU in catalog.';
    replies.push({ text: "We're checking the product details and will follow up shortly." });
    nextState.collectedFields = fields;
    return { replies, state: nextState, actions };
  }

  if (item.variants) {
    const variantUpdate = extractVariant(messageText, item);
    fields.variant = { ...(fields.variant || {}), ...variantUpdate };

    const needsSize = item.variants.size && !fields.variant?.size;
    const needsColor = item.variants.color && !fields.variant?.color;

    if (needsSize || needsColor) {
      const attempt = incrementAttempt(fields, 'variant');
      if (attempt > 2) {
        nextState.status = 'handoff';
        actions.handoffReason = 'Sales concierge handoff (variant unclear)';
        actions.handoffTopic = 'Sales concierge handoff';
        actions.handoffSummary = buildSalesSummary(fields);
        actions.recommendedNextAction = 'Confirm size/color options.';
        replies.push({ text: "We'll have our team confirm the right variant for you." });
        nextState.collectedFields = fields;
        return { replies, state: nextState, actions };
      }
      nextState.questionCount += 1;
      const prompt = needsSize ? 'Which size do you need?' : 'Which color do you prefer?';
      const options = needsSize ? item.variants.size : item.variants.color;
      replies.push({
        text: prompt,
        buttons: (options || []).slice(0, 3).map((option) => ({ title: option })),
      });
      nextState.step = 'NEED_VARIANT';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }
  }

  if (!fields.quantity) {
    const quantity = extractQuantity(messageText);
    if (quantity) {
      fields.quantity = quantity;
    } else {
      fields.quantity = 1;
    }
  }

  if (!fields.city) {
    const city = normalizeCityName(messageText, config);
    if (city) {
      fields.city = city;
    } else {
      const attempt = incrementAttempt(fields, 'city');
      if (attempt > 2) {
        nextState.status = 'handoff';
        actions.handoffReason = 'Sales concierge handoff (city unclear)';
        actions.handoffTopic = 'Sales concierge handoff';
        actions.handoffSummary = buildSalesSummary(fields);
        actions.recommendedNextAction = 'Confirm delivery city.';
        replies.push({ text: "We'll have our team confirm delivery details with you." });
        nextState.collectedFields = fields;
        return { replies, state: nextState, actions };
      }
      nextState.questionCount += 1;
      replies.push({ text: 'Which city for delivery?' });
      nextState.step = 'NEED_CITY';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }
  }

  fields.quote = buildSalesQuote(item, fields.city, config);
  if (fields.quote.stockText === 'Out of stock') {
    nextState.status = 'handoff';
    actions.handoffReason = 'Sales concierge handoff (out of stock)';
    actions.handoffTopic = 'Sales concierge out of stock';
    actions.handoffSummary = buildSalesSummary(fields);
    actions.recommendedNextAction = 'Offer alternatives or restock timeline.';
    replies.push({ text: "That item is currently out of stock. We'll have our team share alternatives." });
    nextState.collectedFields = fields;
    return { replies, state: nextState, actions };
  }
  if (!fields.quote.priceText || fields.quote.shippingFee === undefined || !fields.quote.eta) {
    nextState.status = 'handoff';
    actions.handoffReason = 'Sales concierge handoff (quote missing)';
    actions.handoffTopic = 'Sales concierge handoff';
    actions.handoffSummary = buildSalesSummary(fields);
    actions.recommendedNextAction = 'Provide price or shipping details.';
    replies.push({ text: "We're confirming pricing and delivery details with our team." });
    nextState.collectedFields = fields;
    return { replies, state: nextState, actions };
  }

  if (!fields.paymentMethod) {
    const paymentMethod = detectPaymentMethod(messageText);
    if (paymentMethod) {
      fields.paymentMethod = paymentMethod;
    } else {
      nextState.questionCount += 1;
      const paymentButtons = [{ title: 'Online payment' }];
      if (fields.quote.codAllowed) {
        paymentButtons.push({ title: 'Cash on delivery' });
      }
      const currency = fields.quote.currency || 'SAR';
      const quoteLines = [
        `Price: ${fields.quote.priceText}`,
        `Availability: ${fields.quote.stockText || 'Confirming'}`,
        `Delivery: ${fields.quote.shippingFee} ${currency}, ${fields.quote.eta}`,
      ];
      replies.push({ text: `${quoteLines.join(' • ')}\n\nDo you want COD or online payment?`, buttons: paymentButtons });
      nextState.step = 'NEED_PAYMENT_METHOD';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }
  }

  if (fields.paymentMethod === 'cod' && !fields.quote.codAllowed) {
    nextState.questionCount += 1;
    replies.push({ text: 'COD is not available for your area. Do you want the payment link instead?', buttons: [{ title: 'Online payment' }] });
    nextState.step = 'NEED_PAYMENT_METHOD';
    nextState.collectedFields = fields;
    return { replies, state: nextState };
  }

  if (fields.paymentMethod === 'online') {
    nextState.step = 'DRAFT_CREATED';
    nextState.status = 'completed';
    actions.createDraft = true;
    actions.paymentLinkRequired = true;
    actions.draftPayload = { ...fields };
    replies.push({ text: 'Perfect. Here is your payment link: {payment_link}' });
    nextState.collectedFields = fields;
    return { replies, state: nextState, actions };
  }

  if (!fields.phone) {
    const phone = extractPhone(messageText);
    if (phone && phone.length >= minPhoneLength) {
      fields.phone = phone;
    } else {
      const attempt = incrementAttempt(fields, 'phone');
      if (attempt > 2) {
        nextState.status = 'handoff';
        actions.handoffReason = 'Sales concierge handoff (phone invalid)';
        actions.handoffTopic = 'Sales concierge handoff';
        actions.handoffSummary = buildSalesSummary(fields);
        actions.recommendedNextAction = 'Collect phone manually.';
        replies.push({ text: "We'll have our team reach out to confirm details." });
        nextState.collectedFields = fields;
        return { replies, state: nextState, actions };
      }
      nextState.questionCount += 1;
      replies.push({ text: `Please share a valid phone number (at least ${minPhoneLength} digits).` });
      nextState.step = 'NEED_ADDRESS';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }
  }

  if (!fields.address) {
    if (looksLikeAddress(messageText)) {
      fields.address = messageText.trim();
    } else {
      const attempt = incrementAttempt(fields, 'address');
      if (attempt > 2) {
        nextState.status = 'handoff';
        actions.handoffReason = 'Sales concierge handoff (address invalid)';
        actions.handoffTopic = 'Sales concierge handoff';
        actions.handoffSummary = buildSalesSummary(fields);
        actions.recommendedNextAction = 'Collect address manually.';
        replies.push({ text: "We'll have our team confirm your address." });
        nextState.collectedFields = fields;
        return { replies, state: nextState, actions };
      }
      nextState.questionCount += 1;
      replies.push({ text: 'Please share the delivery address (area + street).', buttons: undefined });
      nextState.step = 'NEED_ADDRESS';
      nextState.collectedFields = fields;
      return { replies, state: nextState };
    }
  }

  nextState.step = 'DRAFT_CREATED';
  nextState.status = 'handoff';
  actions.createDraft = true;
  actions.draftPayload = { ...fields };
  actions.handoffReason = 'Sales concierge handoff (COD confirmation)';
  actions.handoffTopic = 'Sales concierge draft ready';
  actions.handoffSummary = buildSalesSummary(fields);
  actions.recommendedNextAction = 'Confirm COD order and delivery address.';
  replies.push({ text: "Thanks! You're in the queue — our team will confirm your COD order shortly." });
  nextState.collectedFields = fields;
  return { replies, state: nextState, actions };
}

async function handoffToTeam(params: {
  conversation: any;
  reason: string;
  customerMessage?: string;
}): Promise<void> {
  const { conversation, reason, customerMessage } = params;
  const ticket = await createTicket({
    conversationId: conversation._id,
    topicSummary: reason.slice(0, 140),
    reason,
    createdBy: 'system',
    customerMessage,
  });

  conversation.humanRequired = true;
  conversation.humanRequiredReason = reason;
  conversation.humanTriggeredAt = ticket.createdAt;
  conversation.humanTriggeredByMessageId = undefined;
  conversation.humanHoldUntil = new Date(Date.now() + 60 * 60 * 1000);
  await conversation.save();
}

async function handoffSalesConcierge(params: {
  conversation: any;
  topic: string;
  summary: string;
  recommendedNextAction?: string;
  customerMessage?: string;
}): Promise<void> {
  const { conversation, topic, summary, recommendedNextAction, customerMessage } = params;
  const details = [summary, recommendedNextAction ? `Next: ${recommendedNextAction}` : null]
    .filter(Boolean)
    .join('\n');

  await createTicket({
    conversationId: conversation._id,
    topicSummary: topic.slice(0, 140),
    reason: details,
    createdBy: 'system',
    customerMessage,
  });

  conversation.humanRequired = true;
  conversation.humanRequiredReason = topic;
  conversation.humanTriggeredAt = new Date();
  conversation.humanTriggeredByMessageId = undefined;
  conversation.humanHoldUntil = new Date(Date.now() + 60 * 60 * 1000);
  await conversation.save();
}

async function createSalesOrderDraft(params: {
  conversation: any;
  fields: Record<string, any>;
}): Promise<any> {
  const { conversation, fields } = params;
  const existingDraft = await OrderDraft.findOne({
    conversationId: conversation._id,
    status: { $in: ['draft', 'queued', 'payment_sent', 'needs_confirmation'] },
  }).sort({ createdAt: -1 });

  if (existingDraft) {
    return existingDraft;
  }

  return OrderDraft.create({
    workspaceId: conversation.workspaceId,
    conversationId: conversation._id,
    sku: fields.sku,
    productName: fields.productName,
    variant: fields.variant,
    quantity: fields.quantity,
    city: fields.city,
    address: fields.address,
    phone: fields.phone,
    paymentMethod: fields.paymentMethod,
    quote: {
      price: fields.quote?.priceText,
      stock: fields.quote?.stockText,
      shippingFee: fields.quote?.shippingFee,
      eta: fields.quote?.eta,
      currency: fields.quote?.currency,
    },
    status: fields.paymentMethod === 'online' ? 'payment_sent' : 'queued',
  });
}

function createPaymentLink(params: { amountText?: string; draftId: string }) {
  const base = process.env.PAYMENTS_BASE_URL || process.env.APP_BASE_URL || 'https://pay.sendfx.ai';
  const safeBase = base.replace(/\/$/, '');
  const amountParam = params.amountText ? `?amount=${encodeURIComponent(params.amountText)}` : '';
  return `${safeBase}/pay/${params.draftId}${amountParam}`;
}

function hydratePaymentLink(text: string, paymentLink?: string): string {
  if (!paymentLink) return text;
  return text.replace('{payment_link}', paymentLink);
}

async function trackSalesStep(workspaceId: mongoose.Types.ObjectId, step?: string) {
  if (!step) return;
  await trackDailyMetric(workspaceId, new Date(), { [`salesConciergeStepCounts.${step}`]: 1 });
}

async function handleBookingConciergeFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { automation, replyStep, session, conversation, igAccount, messageText, platform } = params;
  const config = replyStep.templateFlow.config as BookingConciergeConfig;
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_booking', 'template_booking_concierge'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceBookingConciergeState({
    state: currentState,
    messageText,
    config,
  });

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: reply.text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.createLead || actions?.createBooking) {
    const fields = nextState.collectedFields || {};
    const summary = buildBookingSummary(fields);
    if (actions.createLead) {
      const existingLead = await LeadCapture.findOne({ conversationId: conversation._id, goalType: 'capture_lead' });
      if (!existingLead) {
        await LeadCapture.create({
          workspaceId: conversation.workspaceId,
          conversationId: conversation._id,
          goalType: 'capture_lead',
          participantName: conversation.participantName,
          participantHandle: conversation.participantHandle,
          name: fields.leadName,
          phone: fields.phone,
          customNote: fields.service ? `Service: ${fields.service}. ${fields.preferredDayTime || ''}`.trim() : undefined,
        });
      }
    }
    if (actions.createBooking) {
      const existingBooking = await BookingRequest.findOne({ conversationId: conversation._id });
      if (!existingBooking) {
        await BookingRequest.create({
          workspaceId: conversation.workspaceId,
          conversationId: conversation._id,
          serviceType: fields.service,
          summary,
        });
      }
    }
  }

  if (actions?.handoffReason) {
    await handoffToTeam({ conversation, reason: actions.handoffReason, customerMessage: messageText });
  }

  await session.save();
  return { success: true };
}

async function handleAfterHoursCaptureFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { automation, replyStep, session, conversation, igAccount, messageText, platform } = params;
  const config = replyStep.templateFlow.config as AfterHoursCaptureConfig;
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['after_hours_lead', 'template_after_hours_capture'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceAfterHoursCaptureState({
    state: currentState,
    messageText,
    config,
  });

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text: reply.text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.createLead) {
    const fields = nextState.collectedFields || {};
    const existingLead = await LeadCapture.findOne({ conversationId: conversation._id, goalType: 'capture_lead' });
    if (!existingLead) {
      const noteParts = [
        fields.intent ? `Intent: ${fields.intent}` : null,
        fields.preferredTime ? `Preferred time: ${fields.preferredTime}` : null,
        fields.message ? `Message: ${fields.message}` : null,
      ].filter(Boolean);
      await LeadCapture.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        goalType: 'capture_lead',
        participantName: conversation.participantName,
        participantHandle: conversation.participantHandle,
        name: fields.leadName,
        phone: fields.phone,
        customNote: noteParts.length ? noteParts.join(' | ') : undefined,
      });
    }
  }

  if (actions?.handoffReason) {
    await handoffToTeam({ conversation, reason: actions.handoffReason, customerMessage: messageText });
  }

  if (actions?.scheduleFollowup) {
    const nextOpen = getNextOpenTime(config.businessHours);
    const lastCustomerMessageAt = conversation.lastCustomerMessageAt || new Date();
    const windowExpiresAt = new Date(lastCustomerMessageAt.getTime() + 24 * 60 * 60 * 1000);
    if (nextOpen > new Date() && nextOpen <= windowExpiresAt) {
      const task = await FollowupTask.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation._id,
        instagramAccountId: conversation.instagramAccountId,
        participantInstagramId: conversation.participantInstagramId,
        lastCustomerMessageAt,
        lastBusinessMessageAt: conversation.lastBusinessMessageAt,
        windowExpiresAt,
        scheduledFollowupAt: nextOpen,
        status: 'scheduled',
        followupType: 'after_hours',
        customMessage: config.followupMessage || "We're open now if you'd like to continue. Reply anytime.",
      });
      session.followupTaskId = task._id;
    }
  }

  await session.save();
  return { success: true };
}

async function handleSalesConciergeFlow(params: {
  automation: any;
  replyStep: { templateFlow: TemplateFlowConfig };
  session: any;
  conversation: any;
  igAccount: any;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const {
    automation,
    replyStep,
    session,
    conversation,
    igAccount,
    messageText,
    platform,
    messageContext,
  } = params;
  const config = replyStep.templateFlow.config as SalesConciergeConfig;
  const rateLimit = config.rateLimit || DEFAULT_RATE_LIMIT;
  const tags = config.tags || ['intent_purchase', 'template_sales_concierge'];

  session.lastCustomerMessageAt = new Date();

  const currentState = normalizeFlowState({
    step: session.step,
    status: session.status,
    questionCount: session.questionCount,
    collectedFields: session.collectedFields || {},
  });

  const { replies, state: nextState, actions } = advanceSalesConciergeState({
    state: currentState,
    messageText,
    config,
    context: messageContext,
  });

  let draftId = nextState.collectedFields?.draftId;
  let paymentLink: string | undefined;

  if (actions?.createDraft) {
    const draft = await createSalesOrderDraft({
      conversation,
      fields: nextState.collectedFields || {},
    });
    draftId = draft?._id?.toString();
    if (draftId) {
      nextState.collectedFields = {
        ...nextState.collectedFields,
        draftId,
      };
    }
  }

  if (actions?.paymentLinkRequired && draftId) {
    paymentLink = createPaymentLink({
      amountText: nextState.collectedFields?.quote?.priceText,
      draftId,
    });
    nextState.collectedFields = {
      ...nextState.collectedFields,
      paymentLink,
    };
  }

  let sentAny = false;
  for (const reply of replies) {
    if (!updateRateLimit(session, rateLimit)) {
      if (!sentAny) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      break;
    }
    const text = hydratePaymentLink(reply.text, paymentLink);
    await sendTemplateMessage({
      conversation,
      automation,
      igAccount,
      recipientId: conversation.participantInstagramId,
      text,
      buttons: reply.buttons,
      platform,
      tags,
    });
    sentAny = true;
  }

  if (sentAny) {
    session.lastAutomationMessageAt = new Date();
  }

  session.step = nextState.step;
  session.status = nextState.status;
  session.questionCount = nextState.questionCount;
  session.collectedFields = nextState.collectedFields;

  if (actions?.handoffReason && actions?.handoffSummary) {
    await handoffSalesConcierge({
      conversation,
      topic: actions.handoffTopic || actions.handoffReason,
      summary: actions.handoffSummary,
      recommendedNextAction: actions.recommendedNextAction,
      customerMessage: messageText,
    });
  }

  await trackSalesStep(conversation.workspaceId, nextState.step);
  await session.save();
  return { success: true };
}

async function executeTemplateFlow(params: {
  automation: any;
  replyStep: any;
  conversationId: string;
  workspaceId: string;
  instagramAccountId: string;
  messageText: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; error?: string }> {
  const {
    automation,
    replyStep,
    conversationId,
    workspaceId,
    instagramAccountId,
    messageText,
    platform,
    messageContext,
  } = params;

  const templateFlow = replyStep.templateFlow as TemplateFlowConfig | undefined;
  if (!templateFlow) {
    return { success: false, error: 'Template flow configuration missing' };
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found' };
  }

  if (conversation.humanHoldUntil && new Date(conversation.humanHoldUntil) > new Date()) {
    return { success: false, error: 'Conversation is on human hold' };
  }

  const session = await getTemplateSession({
    automationId: automation._id,
    conversationId: conversation._id,
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    templateId: templateFlow.templateId,
  });

  if (!session) {
    return { success: false, error: 'Automation paused for human response' };
  }

  const igAccount = await InstagramAccount.findById(instagramAccountId).select('+accessToken');
  if (!igAccount || !igAccount.accessToken) {
    return { success: false, error: 'Instagram account not found or not connected' };
  }

  if (!conversation.participantInstagramId) {
    return { success: false, error: 'Missing participant Instagram ID' };
  }

  if (templateFlow.templateId === 'booking_concierge') {
    return handleBookingConciergeFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
    });
  }

  if (templateFlow.templateId === 'after_hours_capture') {
    return handleAfterHoursCaptureFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
    });
  }

  if (templateFlow.templateId === 'sales_concierge') {
    return handleSalesConciergeFlow({
      automation,
      replyStep,
      session,
      conversation,
      igAccount,
      messageText,
      platform,
      messageContext,
    });
  }

  return { success: false, error: 'Unknown template flow' };
}

/**
 * Execute an automation based on trigger type
 */
export async function executeAutomation(params: {
  workspaceId: string;
  triggerType: TriggerType;
  conversationId: string;
  participantInstagramId: string;
  messageText?: string;
  instagramAccountId: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ success: boolean; automationExecuted?: string; error?: string }> {
  try {
    const {
      workspaceId,
      triggerType,
      conversationId,
      participantInstagramId,
      messageText,
      instagramAccountId,
      platform,
      messageContext,
    } = params;

    console.log('🤖 [AUTOMATION] Starting automation execution:', {
      workspaceId,
      triggerType,
      conversationId,
      participantInstagramId,
      instagramAccountId,
      messageTextPreview: messageText?.slice(0, 50),
      platform,
    });

    const automations = await Automation.find({
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      triggerType,
      isActive: true,
    }).sort({ createdAt: 1 });

    console.log(`🔍 [AUTOMATION] Found ${automations.length} active automation(s) for trigger: ${triggerType}`);

    if (automations.length === 0) {
      console.log('⚠️  [AUTOMATION] No active automations found');
      return { success: false, error: 'No active automations found for this trigger' };
    }

    const normalizedMessage = messageText || '';
    const matchingAutomations: typeof automations = [];

    for (const candidate of automations) {
      const replyStep = candidate.replySteps[0];
      if (replyStep?.type === 'template_flow') {
        const activeSession = await AutomationSession.findOne({
          automationId: candidate._id,
          conversationId: new mongoose.Types.ObjectId(conversationId),
          status: 'active',
        });
        if (activeSession) {
          matchingAutomations.push(candidate);
          continue;
        }
      }

      if (matchesTriggerConfig(normalizedMessage, candidate.triggerConfig, messageContext)) {
        matchingAutomations.push(candidate);
      }
    }

    if (matchingAutomations.length === 0) {
      console.log('⚠️  [AUTOMATION] No automations matched trigger filters');
      return { success: false, error: 'No automations matched trigger filters' };
    }

    const automation = matchingAutomations[0];
    console.log(`✅ [AUTOMATION] Executing automation: "${automation.name}" (ID: ${automation._id})`);

    const replyStep = automation.replySteps[0];

    if (!replyStep || replyStep.type !== 'template_flow') {
      console.log('❌ [AUTOMATION] Only template_flow automations are supported');
      return { success: false, error: 'Only template_flow automations are supported' };
    }

    const templateResult = await executeTemplateFlow({
      automation,
      replyStep,
      conversationId,
      workspaceId,
      instagramAccountId,
      messageText: normalizedMessage,
      platform,
      messageContext,
    });

    if (templateResult.success) {
      return { success: true, automationExecuted: automation.name };
    }

    return { success: false, error: templateResult.error || 'Template flow not executed' };
  } catch (error: any) {
    console.error('❌ [AUTOMATION] Error executing automation:', error);
    console.error('❌ [AUTOMATION] Error stack:', error.stack);
    return { success: false, error: `Failed to execute automation: ${error.message}` };
  }
}

/**
 * Check and execute automations for a specific trigger type
 * This is a helper function that can be called from webhook handlers
 */
export async function checkAndExecuteAutomations(params: {
  workspaceId: string;
  triggerType: TriggerType;
  conversationId: string;
  participantInstagramId: string;
  messageText?: string;
  instagramAccountId: string;
  platform?: string;
  messageContext?: AutomationTestContext;
}): Promise<{ executed: boolean; automationName?: string }> {
  const result = await executeAutomation(params);
  return {
    executed: result.success,
    automationName: result.automationExecuted,
  };
}

type AutomationTestHistoryItem = {
  from: 'customer' | 'ai';
  text: string;
  createdAt?: string;
};

type AutomationTestState = {
  history?: AutomationTestHistoryItem[];
  template?: {
    templateId: AutomationTemplateId;
    step?: string;
    status?: 'active' | 'completed' | 'handoff';
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

function appendTestHistory(history: AutomationTestHistoryItem[], from: 'customer' | 'ai', text: string) {
  history.push({
    from,
    text,
    createdAt: new Date().toISOString(),
  });
}

function createTemplateState(templateId: AutomationTemplateId): NonNullable<AutomationTestState['template']> {
  return {
    templateId,
    step: undefined,
    questionCount: 0,
    collectedFields: {},
    status: 'active',
    followup: undefined,
    lastCustomerMessageAt: undefined,
    lastBusinessMessageAt: undefined,
  };
}

function ensureTemplateState(templateId: AutomationTemplateId, state?: AutomationTestState): AutomationTestState['template'] {
  if (state?.template && state.template.templateId === templateId) {
    const status = state.template.status || 'active';
    if (status === 'active') {
      return {
        ...state.template,
        questionCount: state.template.questionCount ?? 0,
        collectedFields: state.template.collectedFields || {},
        status,
        followup: state.template.followup,
        lastCustomerMessageAt: state.template.lastCustomerMessageAt,
        lastBusinessMessageAt: state.template.lastBusinessMessageAt,
      };
    }
  }
  return createTemplateState(templateId);
}

function scheduleAfterHoursFollowup(
  templateState: NonNullable<AutomationTestState['template']>,
  config: AfterHoursCaptureConfig,
  now: Date,
) {
  const lastCustomerMessageAt = templateState.lastCustomerMessageAt
    ? new Date(templateState.lastCustomerMessageAt)
    : now;
  const windowExpiresAt = new Date(lastCustomerMessageAt.getTime() + 24 * 60 * 60 * 1000);
  const nextOpen = getNextOpenTime(config.businessHours, now);
  if (nextOpen > now && nextOpen <= windowExpiresAt) {
    templateState.followup = {
      status: 'scheduled',
      scheduledAt: nextOpen.toISOString(),
      message: config.followupMessage || "We're open now if you'd like to continue. Reply anytime.",
    };
  }
}

function simulateBookingConciergeTest(
  messageText: string,
  templateState: NonNullable<AutomationTestState['template']>,
  config: BookingConciergeConfig,
): { replies: string[]; templateState: NonNullable<AutomationTestState['template']>; actions?: TemplateFlowActions } {
  const currentState = normalizeFlowState({
    step: templateState.step,
    status: templateState.status,
    questionCount: templateState.questionCount,
    collectedFields: templateState.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceBookingConciergeState({
    state: currentState,
    messageText,
    config,
  });

  return {
    replies: replies.map((reply) => reply.text),
    templateState: {
      ...templateState,
      step: nextState.step,
      status: nextState.status,
      questionCount: nextState.questionCount,
      collectedFields: nextState.collectedFields,
    },
    actions,
  };
}

function simulateAfterHoursCaptureTest(
  messageText: string,
  templateState: NonNullable<AutomationTestState['template']>,
  config: AfterHoursCaptureConfig,
): { replies: string[]; templateState: NonNullable<AutomationTestState['template']>; actions?: TemplateFlowActions } {
  const currentState = normalizeFlowState({
    step: templateState.step,
    status: templateState.status,
    questionCount: templateState.questionCount,
    collectedFields: templateState.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceAfterHoursCaptureState({
    state: currentState,
    messageText,
    config,
  });

  return {
    replies: replies.map((reply) => reply.text),
    templateState: {
      ...templateState,
      step: nextState.step,
      status: nextState.status,
      questionCount: nextState.questionCount,
      collectedFields: nextState.collectedFields,
    },
    actions,
  };
}

function simulateSalesConciergeTest(
  messageText: string,
  templateState: NonNullable<AutomationTestState['template']>,
  config: SalesConciergeConfig,
  context?: AutomationTestContext,
): { replies: string[]; templateState: NonNullable<AutomationTestState['template']>; actions?: TemplateFlowActions } {
  const currentState = normalizeFlowState({
    step: templateState.step,
    status: templateState.status,
    questionCount: templateState.questionCount,
    collectedFields: templateState.collectedFields || {},
  });
  const { replies, state: nextState, actions } = advanceSalesConciergeState({
    state: currentState,
    messageText,
    config,
    context,
  });

  return {
    replies: replies.map((reply) => reply.text),
    templateState: {
      ...templateState,
      step: nextState.step,
      status: nextState.status,
      questionCount: nextState.questionCount,
      collectedFields: nextState.collectedFields,
    },
    actions,
  };
}

export async function runAutomationTest(params: {
  automationId: string;
  workspaceId: string;
  messageText?: string;
  state?: AutomationTestState;
  action?: 'simulate_followup';
  context?: AutomationTestContext;
}): Promise<{
  replies: string[];
  state: AutomationTestState;
  meta?: Record<string, any>;
}> {
  const { automationId, workspaceId, messageText, action, context } = params;
  const automation = await Automation.findById(automationId);
  if (!automation) {
    throw new Error('Automation not found');
  }

  const replyStep = automation.replySteps[0];
  if (!replyStep) {
    throw new Error('No reply step configured');
  }

  console.log('🧪 [AUTOMATION TEST] Run', {
    automationId,
    workspaceId,
    action,
    messageTextPreview: messageText?.slice(0, 160),
    replyType: replyStep.type,
    templateId: replyStep.templateFlow?.templateId,
    triggerConfig: automation.triggerConfig,
    context,
  });

  const nextState: AutomationTestState = params.state ? { ...params.state } : {};
  const history = nextState.history ? [...nextState.history] : [];
  if (action === 'simulate_followup') {
    if (!nextState.template?.followup || nextState.template.followup.status !== 'scheduled') {
      return {
        replies: [],
        state: {
          ...nextState,
          history,
        },
        meta: { error: 'No follow-up scheduled' },
      };
    }

    const followupMessage = nextState.template.followup.message || "We're open now if you'd like to continue. Reply anytime.";
    appendTestHistory(history, 'ai', followupMessage);
    return {
      replies: [followupMessage],
      state: {
        ...nextState,
        history,
        template: {
          ...nextState.template,
          followup: {
            ...nextState.template.followup,
            status: 'sent',
          },
          lastBusinessMessageAt: new Date().toISOString(),
        },
      },
      meta: { action: 'simulate_followup' },
    };
  }

  if (!messageText) {
    throw new Error('messageText is required');
  }

  const triggerMatched = matchesTriggerConfig(messageText, automation.triggerConfig, context);
  console.log('🧪 [AUTOMATION TEST] Trigger match', {
    automationId,
    triggerMatched,
    context,
  });
  appendTestHistory(history, 'customer', messageText);

  if (replyStep.type !== 'template_flow' || !replyStep.templateFlow) {
    return {
      replies: [],
      state: {
        ...nextState,
        history,
      },
      meta: {
        triggerMatched,
        error: 'Only template_flow automations are supported',
      },
    };
  }

  const templateId = replyStep.templateFlow.templateId;
  const existingTemplateState = nextState.template?.templateId === templateId
    ? { ...nextState.template }
    : undefined;
  if (existingTemplateState?.followup?.status === 'scheduled') {
    existingTemplateState.followup = {
      ...existingTemplateState.followup,
      status: 'cancelled',
    };
  }

  const hasActiveSession = existingTemplateState
    ? (existingTemplateState.status || 'active') === 'active'
    : false;
  const shouldProcess = hasActiveSession || triggerMatched;
  console.log('🧪 [AUTOMATION TEST] Template routing', {
    automationId,
    templateId,
    hasActiveSession,
    shouldProcess,
  });

  if (!shouldProcess) {
    return {
      replies: [],
      state: {
        ...nextState,
        history,
        template: existingTemplateState,
      },
      meta: {
        triggerMatched: false,
      },
    };
  }

  const templateState = ensureTemplateState(templateId, { ...nextState, template: existingTemplateState });
  if (templateState.followup?.status === 'scheduled') {
    templateState.followup.status = 'cancelled';
  }
  templateState.lastCustomerMessageAt = new Date().toISOString();
  let result: { replies: string[]; templateState: NonNullable<AutomationTestState['template']>; actions?: TemplateFlowActions };

  if (templateId === 'booking_concierge') {
    result = simulateBookingConciergeTest(messageText, templateState, replyStep.templateFlow.config as BookingConciergeConfig);
  } else if (templateId === 'after_hours_capture') {
    result = simulateAfterHoursCaptureTest(messageText, templateState, replyStep.templateFlow.config as AfterHoursCaptureConfig);
    if (
      (result.actions?.scheduleFollowup || result.templateState.status === 'completed') &&
      !result.templateState.followup
    ) {
      scheduleAfterHoursFollowup(result.templateState, replyStep.templateFlow.config as AfterHoursCaptureConfig, new Date());
    }
  } else if (templateId === 'sales_concierge') {
    result = simulateSalesConciergeTest(
      messageText,
      templateState,
      replyStep.templateFlow.config as SalesConciergeConfig,
      context,
    );
    if (result.actions?.createDraft) {
      const existingDraftId = result.templateState.collectedFields?.draftId as string | undefined;
      const draftId = existingDraftId || `draft_${Date.now()}`;
      result.templateState.collectedFields = {
        ...result.templateState.collectedFields,
        draftId,
      };
      if (result.actions.paymentLinkRequired) {
        const paymentLink = createPaymentLink({
          amountText: result.templateState.collectedFields?.quote?.priceText,
          draftId,
        });
        result.templateState.collectedFields = {
          ...result.templateState.collectedFields,
          paymentLink,
        };
        result.replies = result.replies.map((reply) => hydratePaymentLink(reply, paymentLink));
      }
    }
  } else {
    return {
      replies: [],
      state: {
        ...nextState,
        history,
      },
      meta: {
        triggerMatched: shouldProcess,
        error: 'Unsupported template flow',
      },
    };
  }

  result.replies.forEach((reply) => appendTestHistory(history, 'ai', reply));

  return {
    replies: result.replies,
    state: {
      ...nextState,
      history,
      template: result.templateState,
    },
    meta: {
      triggerMatched: shouldProcess,
    },
  };
}

/**
 * Process due follow-up tasks
 * This should be called by a background job
 */
export async function processDueFollowups(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  const stats = { processed: 0, sent: 0, failed: 0, cancelled: 0 };

  try {
    const dueTasks = await FollowupTask.find({
      status: 'scheduled',
      scheduledFollowupAt: { $lte: new Date() },
    });

    for (const task of dueTasks) {
      stats.processed++;

      if (task.followupType !== 'after_hours') {
        task.status = 'cancelled';
        task.errorMessage = 'Deprecated follow-up type';
        await task.save();
        stats.cancelled++;
        continue;
      }

      try {
        const conversation = await Conversation.findById(task.conversationId);
        if (!conversation) {
          task.status = 'cancelled';
          task.errorMessage = 'Conversation not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const customerMessageSince = await Message.findOne({
          conversationId: task.conversationId,
          from: 'customer',
          createdAt: { $gt: task.lastCustomerMessageAt },
        });

        if (customerMessageSince) {
          task.status = 'customer_replied';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const businessMessageSince = await Message.findOne({
          conversationId: task.conversationId,
          from: 'user',
          createdAt: { $gt: task.lastBusinessMessageAt || task.createdAt },
        });

        if (businessMessageSince) {
          task.status = 'cancelled';
          task.errorMessage = 'Staff replied';
          await task.save();
          stats.cancelled++;
          continue;
        }

        if (new Date() > task.windowExpiresAt) {
          task.status = 'expired';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const igAccount = await InstagramAccount.findById(task.instagramAccountId).select('+accessToken');
        if (!igAccount || !igAccount.accessToken) {
          task.status = 'cancelled';
          task.errorMessage = 'Instagram account not found';
          await task.save();
          stats.cancelled++;
          continue;
        }

        const followupText = task.customMessage || "We're open now if you'd like to continue. Reply anytime.";

        const result = await sendInstagramMessage(
          task.participantInstagramId,
          followupText,
          igAccount.accessToken,
        );

        if (!result || (!result.message_id && !result.recipient_id)) {
          task.status = 'cancelled';
          task.errorMessage = 'Failed to send message';
          await task.save();
          stats.failed++;
          continue;
        }

        const sentAt = new Date();
        await Message.create({
          conversationId: conversation._id,
          workspaceId: conversation.workspaceId,
          text: followupText,
          from: 'ai',
          platform: 'instagram',
          instagramMessageId: result.message_id,
          automationSource: 'followup',
          createdAt: sentAt,
        });

        conversation.lastMessageAt = new Date();
        conversation.lastMessage = followupText;
        conversation.lastBusinessMessageAt = new Date();
        await conversation.save();

        task.status = 'sent';
        task.followupMessageId = result.message_id;
        task.followupText = followupText;
        task.sentAt = new Date();
        await task.save();

        stats.sent++;

        await trackDailyMetric(task.workspaceId, sentAt, {
          outboundMessages: 1,
          aiReplies: 1,
          followupsSent: 1,
        });
      } catch (taskError: any) {
        console.error(`Error processing follow-up task ${task._id}:`, taskError);
        task.status = 'cancelled';
        task.errorMessage = taskError.message;
        await task.save();
        stats.failed++;
      }
    }

    console.log(`Follow-up processing complete: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    console.error('Error processing due follow-ups:', error);
    return stats;
  }
}

/**
 * Cancel follow-up when customer replies
 */
export async function cancelFollowupOnCustomerReply(
  conversationId: mongoose.Types.ObjectId | string,
): Promise<void> {
  await FollowupTask.updateMany(
    {
      conversationId,
      status: 'scheduled',
    },
    { status: 'customer_replied' },
  );
}

function calculateResponseTime(conversation: any, sentAt: Date): Record<string, number> {
  if (
    conversation.lastCustomerMessageAt &&
    (!conversation.lastBusinessMessageAt || new Date(conversation.lastBusinessMessageAt) < new Date(conversation.lastCustomerMessageAt))
  ) {
    const diff = sentAt.getTime() - new Date(conversation.lastCustomerMessageAt).getTime();
    if (diff > 0) {
      return {
        firstResponseTimeSumMs: diff,
        firstResponseTimeCount: 1,
      };
    }
  }

  return {};
}
