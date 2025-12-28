import AdminAutomationDefaults from '../models/AdminAutomationDefaults';
import { AutomationTemplateId } from '../types/automation';

export type AutomationDefaultsConfig = {
  lockMode: 'none' | 'session_only';
  lockTtlMinutes: number;
  releaseKeywords: string[];
  faqInterruptEnabled: boolean;
  faqIntentKeywords: string[];
  faqResponseSuffix: string;
  aiInterpretationEnabled: boolean;
  aiRephraseEnabled: boolean;
  aiConfidenceThresholds: {
    intent?: number;
    productRef?: number;
    sku?: number;
    variant?: number;
    quantity?: number;
    city?: number;
  };
};

export type AutomationDefaultsSnapshot = AutomationDefaultsConfig & { templateId: AutomationTemplateId };

const DEFAULTS: Record<AutomationTemplateId, AutomationDefaultsConfig> = {
  sales_concierge: {
    lockMode: 'session_only',
    lockTtlMinutes: 45,
    releaseKeywords: ['agent', 'human', 'stop', 'cancel'],
    faqInterruptEnabled: true,
    faqIntentKeywords: [
      'return',
      'refund',
      'policy',
      'exchange',
      'warranty',
      'shipping',
      'delivery',
      'hours',
      'location',
    ],
    faqResponseSuffix: 'Want to continue with the product details?',
    aiInterpretationEnabled: true,
    aiRephraseEnabled: true,
    aiConfidenceThresholds: {
      intent: 0.55,
      productRef: 0.6,
      sku: 0.65,
      variant: 0.6,
      quantity: 0.6,
      city: 0.6,
    },
  },
};

const CACHE_TTL_MS = 30000;
const cache = new Map<AutomationTemplateId, { data: AutomationDefaultsConfig; fetchedAt: number }>();

const normalizeStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const normalizeDefaults = (
  templateId: AutomationTemplateId,
  doc: any,
): AutomationDefaultsConfig => {
  const base = DEFAULTS[templateId];
  const defaultThresholds = base.aiConfidenceThresholds || {};
  const inputThresholds = doc?.aiConfidenceThresholds || {};
  return {
    lockMode: doc?.lockMode === 'none'
      ? 'none'
      : doc?.lockMode === 'session_only'
        ? 'session_only'
        : base.lockMode,
    lockTtlMinutes: typeof doc?.lockTtlMinutes === 'number' ? doc.lockTtlMinutes : base.lockTtlMinutes,
    releaseKeywords: normalizeStringArray(doc?.releaseKeywords).length
      ? normalizeStringArray(doc?.releaseKeywords)
      : base.releaseKeywords,
    faqInterruptEnabled: typeof doc?.faqInterruptEnabled === 'boolean'
      ? doc.faqInterruptEnabled
      : base.faqInterruptEnabled,
    faqIntentKeywords: normalizeStringArray(doc?.faqIntentKeywords).length
      ? normalizeStringArray(doc?.faqIntentKeywords)
      : base.faqIntentKeywords,
    faqResponseSuffix: typeof doc?.faqResponseSuffix === 'string' && doc.faqResponseSuffix.trim()
      ? doc.faqResponseSuffix.trim()
      : base.faqResponseSuffix,
    aiInterpretationEnabled: typeof doc?.aiInterpretationEnabled === 'boolean'
      ? doc.aiInterpretationEnabled
      : base.aiInterpretationEnabled,
    aiRephraseEnabled: typeof doc?.aiRephraseEnabled === 'boolean'
      ? doc.aiRephraseEnabled
      : base.aiRephraseEnabled,
    aiConfidenceThresholds: {
      intent: typeof inputThresholds.intent === 'number' ? inputThresholds.intent : defaultThresholds.intent,
      productRef: typeof inputThresholds.productRef === 'number' ? inputThresholds.productRef : defaultThresholds.productRef,
      sku: typeof inputThresholds.sku === 'number' ? inputThresholds.sku : defaultThresholds.sku,
      variant: typeof inputThresholds.variant === 'number' ? inputThresholds.variant : defaultThresholds.variant,
      quantity: typeof inputThresholds.quantity === 'number' ? inputThresholds.quantity : defaultThresholds.quantity,
      city: typeof inputThresholds.city === 'number' ? inputThresholds.city : defaultThresholds.city,
    },
  };
};

const refreshTemplateDefaults = async (templateId: AutomationTemplateId): Promise<AutomationDefaultsConfig> => {
  const base = DEFAULTS[templateId];
  const defaults = await AdminAutomationDefaults.findOneAndUpdate(
    { templateId },
    { $setOnInsert: { templateId, ...base } },
    { new: true, upsert: true },
  ).lean();

  const normalized = normalizeDefaults(templateId, defaults);
  cache.set(templateId, { data: normalized, fetchedAt: Date.now() });
  return normalized;
};

export const getAutomationDefaults = async (templateId: AutomationTemplateId): Promise<AutomationDefaultsConfig> => {
  const cached = cache.get(templateId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  return refreshTemplateDefaults(templateId);
};

export const listAutomationDefaults = async (): Promise<AutomationDefaultsSnapshot[]> => {
  const templateIds = Object.keys(DEFAULTS) as AutomationTemplateId[];
  const docs = await AdminAutomationDefaults.find({ templateId: { $in: templateIds } }).lean();
  const docMap = new Map(docs.map((doc: any) => [doc.templateId, doc]));

  return templateIds.map((templateId) => ({
    templateId,
    ...normalizeDefaults(templateId, docMap.get(templateId)),
  }));
};

export const updateAutomationDefaults = async (
  templateId: AutomationTemplateId,
  updates: Partial<AutomationDefaultsConfig>,
): Promise<AutomationDefaultsConfig> => {
  const updatePayload: Partial<AutomationDefaultsConfig> = {};
  if (updates.lockMode === 'none' || updates.lockMode === 'session_only') {
    updatePayload.lockMode = updates.lockMode;
  }
  if (typeof updates.lockTtlMinutes === 'number' && Number.isFinite(updates.lockTtlMinutes)) {
    updatePayload.lockTtlMinutes = Math.max(1, Math.round(updates.lockTtlMinutes));
  }
  if (Array.isArray(updates.releaseKeywords)) {
    updatePayload.releaseKeywords = normalizeStringArray(updates.releaseKeywords);
  }
  if (typeof updates.faqInterruptEnabled === 'boolean') {
    updatePayload.faqInterruptEnabled = updates.faqInterruptEnabled;
  }
  if (Array.isArray(updates.faqIntentKeywords)) {
    updatePayload.faqIntentKeywords = normalizeStringArray(updates.faqIntentKeywords);
  }
  if (typeof updates.faqResponseSuffix === 'string') {
    updatePayload.faqResponseSuffix = updates.faqResponseSuffix.trim();
  }
  if (typeof updates.aiInterpretationEnabled === 'boolean') {
    updatePayload.aiInterpretationEnabled = updates.aiInterpretationEnabled;
  }
  if (typeof updates.aiRephraseEnabled === 'boolean') {
    updatePayload.aiRephraseEnabled = updates.aiRephraseEnabled;
  }
  if (updates.aiConfidenceThresholds && typeof updates.aiConfidenceThresholds === 'object') {
    updatePayload.aiConfidenceThresholds = {
      ...DEFAULTS[templateId].aiConfidenceThresholds,
      ...updates.aiConfidenceThresholds,
    };
  }

  const base = DEFAULTS[templateId];
  const insertPayload = { templateId, ...base };
  const saved = await AdminAutomationDefaults.findOneAndUpdate(
    { templateId },
    { $set: updatePayload, $setOnInsert: insertPayload },
    { new: true, upsert: true },
  ).lean();

  const normalized = normalizeDefaults(templateId, saved);
  cache.set(templateId, { data: normalized, fetchedAt: Date.now() });
  return normalized;
};
