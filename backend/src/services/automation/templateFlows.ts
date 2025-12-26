import mongoose from 'mongoose';
import WorkspaceSettings from '../../models/WorkspaceSettings';
import { getGoogleSheetRows, getOAuthAccessToken } from '../googleSheetsService';
import {
  AfterHoursCaptureConfig,
  BookingConciergeConfig,
  SalesConciergeConfig,
  SalesCatalogItem,
  SalesShippingRule,
} from '../../types/automation';
import { AutomationTestContext, TemplateFlowActions, TemplateFlowReply, TemplateFlowState } from './types';
import { formatNextOpenTime, normalizeText } from './utils';

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

function normalizeSheetHeader(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return undefined;
}

function parseList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function parseStock(value?: string): SalesCatalogItem['stock'] | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (/(out|sold|0|none)/.test(normalized)) return 'out';
  if (/(low|few|limited)/.test(normalized)) return 'low';
  if (/(in|yes|available|stock)/.test(normalized)) return 'in';
  return 'unknown';
}

function parsePriceRow(values: {
  priceRaw?: string;
  priceMinRaw?: string;
  priceMaxRaw?: string;
}): SalesCatalogItem['price'] | undefined {
  const minValue = parseNumber(values.priceMinRaw);
  const maxValue = parseNumber(values.priceMaxRaw);
  if (minValue !== undefined && maxValue !== undefined) {
    return { min: minValue, max: maxValue };
  }
  if (values.priceRaw) {
    const rangeMatch = values.priceRaw.split(/-|to/).map((part) => parseNumber(part));
    if (rangeMatch.length >= 2 && rangeMatch[0] !== undefined && rangeMatch[1] !== undefined) {
      return { min: rangeMatch[0], max: rangeMatch[1] };
    }
  }
  const single = parseNumber(values.priceRaw);
  return single !== undefined ? single : undefined;
}

function parseSalesSheetData(headers: string[], rows: string[][]): {
  catalog: SalesCatalogItem[];
  shippingRules: SalesShippingRule[];
} {
  const headerKeys = headers.map(normalizeSheetHeader);
  const catalog: SalesCatalogItem[] = [];
  const shippingRules: SalesShippingRule[] = [];

  rows.forEach((row) => {
    const rowData: Record<string, string> = {};
    headerKeys.forEach((key, index) => {
      rowData[key] = (row[index] || '').toString().trim();
    });

    const getValue = (keys: string[]) => keys.map((key) => rowData[key]).find((value) => value);

    const sku = getValue(['sku', 'product_id', 'id']);
    const name = getValue(['name', 'product', 'title']);
    const keywords = parseList(getValue(['keywords', 'tags', 'keywords_list']));
    const price = parsePriceRow({
      priceRaw: getValue(['price', 'amount', 'unit_price']),
      priceMinRaw: getValue(['price_min', 'min_price', 'min']),
      priceMaxRaw: getValue(['price_max', 'max_price', 'max']),
    });
    const currency = getValue(['currency', 'curr']);
    const stock = parseStock(getValue(['stock', 'availability']));
    const sizes = parseList(getValue(['size', 'sizes']));
    const colors = parseList(getValue(['color', 'colors']));

    if (sku || name) {
      const item: SalesCatalogItem = {
        sku: sku || name || 'SKU',
        name: name || sku || 'Item',
      };
      if (keywords) item.keywords = keywords;
      if (price !== undefined) item.price = price;
      if (currency) item.currency = currency;
      if (stock) item.stock = stock;
      if (sizes || colors) {
        item.variants = {};
        if (sizes) item.variants.size = sizes;
        if (colors) item.variants.color = colors;
      }
      catalog.push(item);
    }

    const city = getValue(['city', 'shipping_city', 'delivery_city']);
    const fee = parseNumber(getValue(['shipping_fee', 'delivery_fee', 'fee', 'shipping']));
    const eta = getValue(['eta', 'delivery_eta', 'shipping_eta']);
    const codAllowed = parseBoolean(getValue(['cod_allowed', 'cod', 'cash_on_delivery']));

    if (city && fee !== undefined && eta) {
      shippingRules.push({
        city,
        fee,
        eta,
        codAllowed: codAllowed ?? false,
      });
    }
  });

  return { catalog, shippingRules };
}

export async function resolveSalesConciergeConfig(
  workspaceId: string | mongoose.Types.ObjectId,
  config: SalesConciergeConfig,
): Promise<SalesConciergeConfig> {
  if (!config.useGoogleSheets) return config;

  const settings = await WorkspaceSettings.findOne({ workspaceId });
  const sheetsConfig = settings?.googleSheets;
  if (!sheetsConfig?.spreadsheetId) return config;

  try {
    let auth: { accessToken?: string; serviceAccountJson?: string } = {};
    if (sheetsConfig.oauthRefreshToken) {
      const token = await getOAuthAccessToken({ refreshToken: sheetsConfig.oauthRefreshToken });
      auth = { accessToken: token.accessToken };
    } else if (sheetsConfig.serviceAccountJson) {
      auth = { serviceAccountJson: sheetsConfig.serviceAccountJson };
    } else {
      return config;
    }

    const sheetData = await getGoogleSheetRows(
      {
        spreadsheetId: sheetsConfig.spreadsheetId,
        sheetName: sheetsConfig.sheetName || 'Sheet1',
        ...auth,
      },
      { headerRow: sheetsConfig.headerRow || 1 },
    );
    const parsed = parseSalesSheetData(sheetData.headers, sheetData.rows);
    if (!parsed.catalog.length && !parsed.shippingRules.length) {
      return config;
    }

    return {
      ...config,
      catalog: parsed.catalog.length ? parsed.catalog : config.catalog,
      shippingRules: parsed.shippingRules.length ? parsed.shippingRules : config.shippingRules,
    };
  } catch (error) {
    console.error('Sales concierge sheet load failed:', error);
    return config;
  }
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

export function buildBookingSummary(fields: Record<string, any>): string {
  return [
    `Name: ${fields.leadName || 'n/a'}`,
    `Phone: ${fields.phone || 'n/a'}`,
    `Service: ${fields.service || 'n/a'}`,
    fields.preferredDayTime ? `Preferred: ${fields.preferredDayTime}` : null,
  ].filter(Boolean).join('\n');
}

export function buildAfterHoursSummary(fields: Record<string, any>): string {
  return [
    fields.intent ? `Intent: ${fields.intent}` : null,
    fields.leadName ? `Name: ${fields.leadName}` : null,
    fields.phone ? `Phone: ${fields.phone}` : null,
    fields.preferredTime ? `Preferred time: ${fields.preferredTime}` : null,
  ].filter(Boolean).join('\n');
}

function buildSalesSummary(fields: Record<string, any>) {
  return [
    fields.productRef?.value ? `Ref: ${fields.productRef.value}` : null,
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

export function normalizeFlowState(state: Partial<TemplateFlowState>): TemplateFlowState {
  return {
    step: state.step,
    status: state.status || 'active',
    questionCount: state.questionCount ?? 0,
    collectedFields: state.collectedFields ? { ...state.collectedFields } : {},
  };
}

export function advanceBookingConciergeState(params: {
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

export function advanceAfterHoursCaptureState(params: {
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

export function advanceSalesConciergeState(params: {
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
    const candidates = findCatalogCandidates(config, messageText);
    if (candidates.length > 0) {
      fields.productRef = { type: 'text', value: messageText };
      fields.skuCandidates = candidates;
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
