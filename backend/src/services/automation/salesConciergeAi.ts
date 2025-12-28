import OpenAI from 'openai';
import Message from '../../models/Message';
import {
  AutomationAiSettings,
  SalesConciergeConfig,
} from '../../types/automation';
import { TemplateFlowState } from './types';
import { getLogSettingsSnapshot } from '../adminLogSettingsService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const supportsReasoningEffort = (model?: string): boolean => /^(gpt-5|o)/i.test(model || '');

export type SalesConciergeAiConfidence = {
  intent?: number;
  productRef?: number;
  sku?: number;
  variant?: number;
  quantity?: number;
  city?: number;
};

export type SalesConciergeAiResult = {
  intent?: string | null;
  productRef?: {
    type?: 'link' | 'text' | 'image' | null;
    value?: string | null;
  } | null;
  sku?: string | null;
  variant?: {
    size?: string | null;
    color?: string | null;
  } | null;
  quantity?: number | null;
  city?: string | null;
  confidences?: SalesConciergeAiConfidence;
};

const logSalesConciergeAi = (message: string, details?: Record<string, any>) => {
  if (!getLogSettingsSnapshot().automationLogsEnabled) return;
  if (details) {
    console.log(message, details);
    return;
  }
  console.log(message);
};

const buildConversationHistory = async (
  conversationId: string,
  limit = 12,
): Promise<string> => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .then(found => {
      const ordered = [...found];
      ordered.reverse();
      return ordered;
    });

  return messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    const text = msg.text ? msg.text.trim() : '';
    return `${role}: ${text}`;
  }).join('\n');
};

const getMissingFieldHints = (state: TemplateFlowState): string[] => {
  const fields = state.collectedFields || {};
  const missing: string[] = [];
  if (!fields.productRef) missing.push('productRef');
  if (!fields.sku) missing.push('sku');
  if (fields.variant) {
    if (!fields.variant.size) missing.push('variant.size');
    if (!fields.variant.color) missing.push('variant.color');
  }
  if (!fields.quantity) missing.push('quantity');
  return missing;
};

const extractStructuredJson = <T>(response: any): T | null => {
  if (!response?.output) {
    return null;
  }

  for (const item of response.output) {
    if (!item?.content) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && content.parsed) {
        return content.parsed as T;
      }
    }
  }

  return null;
};

const safeParseJson = (content: string): any => {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse JSON content', content);
    return {};
  }
};

export async function interpretSalesConciergeMessage(params: {
  conversationId: string;
  messageText: string;
  state: TemplateFlowState;
  config: SalesConciergeConfig;
  aiSettings?: AutomationAiSettings;
}): Promise<SalesConciergeAiResult | null> {
  const {
    conversationId,
    messageText,
    state,
    config,
    aiSettings,
  } = params;

  const model = aiSettings?.model || 'gpt-4o-mini';
  const temperature = typeof aiSettings?.temperature === 'number' ? aiSettings.temperature : 0.2;
  const reasoningEffort = aiSettings?.reasoningEffort;
  const history = await buildConversationHistory(conversationId);
  const missingFields = getMissingFieldHints(state);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: { type: ['string', 'null'], enum: ['price', 'availability', 'delivery', 'order', 'support', 'other', null] },
      productRef: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          type: { type: ['string', 'null'], enum: ['link', 'text', 'image', null] },
          value: { type: ['string', 'null'] },
        },
        required: ['type', 'value'],
      },
      sku: { type: ['string', 'null'] },
      variant: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          size: { type: ['string', 'null'] },
          color: { type: ['string', 'null'] },
        },
        required: ['size', 'color'],
      },
      quantity: { type: ['number', 'null'] },
      city: { type: ['string', 'null'] },
      confidences: {
        type: 'object',
        additionalProperties: false,
        properties: {
          intent: { type: ['number', 'null'] },
          productRef: { type: ['number', 'null'] },
          sku: { type: ['number', 'null'] },
          variant: { type: ['number', 'null'] },
          quantity: { type: ['number', 'null'] },
          city: { type: ['number', 'null'] },
        },
        required: ['intent', 'productRef', 'sku', 'variant', 'quantity', 'city'],
      },
    },
    required: ['intent', 'productRef', 'sku', 'variant', 'quantity', 'city', 'confidences'],
  };

  const prompt = `
You are assisting a Sales Concierge flow. Extract intent and fields from the customer's latest message.

Conversation history:
${history || 'No prior messages.'}

Current state:
- Step: ${state.step || 'unknown'}
- Collected fields: ${Object.keys(state.collectedFields || {}).length ? JSON.stringify(state.collectedFields) : 'none'}
- Missing fields: ${missingFields.length ? missingFields.join(', ') : 'none'}

Latest customer message:
"${messageText}"

Rules:
- Use intent: price, availability, delivery, order, support, or other.
- productRef is a link/photo/text reference to the product.
- Only provide fields you can infer with confidence.
- Provide confidences (0-1) for each field.
`;

  try {
    const requestPayload: any = {
      model,
      input: [
        { role: 'system', content: 'Return structured JSON only.' },
        { role: 'user', content: prompt.trim() },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'sales_concierge_interpretation',
          schema,
          strict: true,
        },
      },
      store: false,
    };

    if (supportsTemperature(model)) {
      requestPayload.temperature = temperature;
    }
    if (supportsReasoningEffort(model) && reasoningEffort) {
      requestPayload.reasoning = { effort: reasoningEffort };
    }

    const response = await openai.responses.create(requestPayload);
    const responseText = response.output_text?.trim() || '{}';
    const structured = extractStructuredJson<SalesConciergeAiResult>(response);
    const parsed = structured || safeParseJson(responseText);

    logSalesConciergeAi('[SalesConcierge] AI interpretation', {
      model,
      intent: parsed.intent,
      confidences: parsed.confidences,
    });

    return parsed;
  } catch (error) {
    console.error('[SalesConcierge] AI interpretation failed', error);
    return null;
  }
}

export async function rephraseSalesConciergePrompt(params: {
  originalPrompt: string;
  conversationId: string;
  state: TemplateFlowState;
  aiSettings?: AutomationAiSettings;
}): Promise<string> {
  const { originalPrompt, conversationId, state, aiSettings } = params;
  const model = aiSettings?.model || 'gpt-4o-mini';
  const temperature = typeof aiSettings?.temperature === 'number' ? aiSettings.temperature : 0.3;
  const reasoningEffort = aiSettings?.reasoningEffort;
  const history = await buildConversationHistory(conversationId);
  const missingFields = getMissingFieldHints(state);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyText: { type: 'string' },
    },
    required: ['replyText'],
  };

  const prompt = `
Rewrite the following prompt so it sounds natural and friendly, but do not change its meaning.

Conversation history:
${history || 'No prior messages.'}

Current state:
- Step: ${state.step || 'unknown'}
- Collected fields: ${Object.keys(state.collectedFields || {}).length ? JSON.stringify(state.collectedFields) : 'none'}
- Missing fields: ${missingFields.length ? missingFields.join(', ') : 'none'}

Prompt to rephrase:
"${originalPrompt}"
`;

  try {
    const requestPayload: any = {
      model,
      input: [
        { role: 'system', content: 'Return structured JSON only.' },
        { role: 'user', content: prompt.trim() },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'sales_concierge_rephrase',
          schema,
          strict: true,
        },
      },
      store: false,
    };

    if (supportsTemperature(model)) {
      requestPayload.temperature = temperature;
    }
    if (supportsReasoningEffort(model) && reasoningEffort) {
      requestPayload.reasoning = { effort: reasoningEffort };
    }

    const response = await openai.responses.create(requestPayload);
    const responseText = response.output_text?.trim() || '{}';
    const structured = extractStructuredJson<{ replyText: string }>(response);
    const parsed = structured || safeParseJson(responseText);

    if (parsed?.replyText && typeof parsed.replyText === 'string') {
      return parsed.replyText.trim();
    }
  } catch (error) {
    console.error('[SalesConcierge] AI rephrase failed', error);
  }

  return originalPrompt;
}
