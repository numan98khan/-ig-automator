import OpenAI from 'openai';
import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { AutomationIntentSettings } from '../types/automation';
import { GoalConfigurations, GoalType } from '../types/automationGoals';
import { getLogSettingsSnapshot } from './adminLogSettingsService';

const DEFAULT_GOAL_CONFIGS: GoalConfigurations = {
  leadCapture: {
    collectName: true,
    collectPhone: true,
    collectEmail: false,
    collectCustomNote: false,
  },
  booking: {
    bookingLink: '',
    collectDate: true,
    collectTime: true,
    collectServiceType: false,
  },
  order: {
    catalogUrl: '',
    collectProductName: true,
    collectQuantity: true,
    collectVariant: false,
  },
  support: {
    askForOrderId: true,
    askForPhoto: false,
  },
  drive: {
    targetType: 'website',
    targetLink: '',
  },
};

export function getGoalConfigs(settings: any): GoalConfigurations {
  return {
    leadCapture: { ...DEFAULT_GOAL_CONFIGS.leadCapture, ...(settings?.goalConfigs?.leadCapture || {}) },
    booking: { ...DEFAULT_GOAL_CONFIGS.booking, ...(settings?.goalConfigs?.booking || {}) },
    order: { ...DEFAULT_GOAL_CONFIGS.order, ...(settings?.goalConfigs?.order || {}) },
    support: { ...DEFAULT_GOAL_CONFIGS.support, ...(settings?.goalConfigs?.support || {}) },
    drive: { ...DEFAULT_GOAL_CONFIGS.drive, ...(settings?.goalConfigs?.drive || {}) },
  };
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const INTENT_MODEL = process.env.OPENAI_INTENT_MODEL || 'gpt-4o-mini';
const INTENT_TEMPERATURE = 0;
const INTENT_REASONING_EFFORT: AutomationIntentSettings['reasoningEffort'] = 'none';

const intentLabels: Array<{ value: GoalType; description: string }> = [
  {
    value: 'book_appointment',
    description: 'Scheduling or booking a service, appointment, or reservation.',
  },
  {
    value: 'start_order',
    description: 'Buying or placing a new order, pricing, product availability, or catalog inquiries.',
  },
  {
    value: 'handle_support',
    description: 'Problems, complaints, refunds, cancellations, order status, delivery delays, or issues with an existing order.',
  },
  {
    value: 'capture_lead',
    description: 'Asking for a quote, requesting a call/email, or leaving contact details.',
  },
  {
    value: 'drive_to_channel',
    description: 'Asking for location, address, website, store hours, WhatsApp, or app links.',
  },
  {
    value: 'none',
    description: 'Greeting, unclear, or does not match any intent.',
  },
];

const detectGoalIntentFallback = (text: string): GoalType => {
  const lower = text.toLowerCase();

  if (/(book|appointment|schedule|reserve|reservation)/.test(lower)) return 'book_appointment';
  if (/(buy|price|order|purchase|checkout|cart|start order|place order)/.test(lower)) return 'start_order';
  if (/(interested|contact me|reach out|quote|more info|call me|email me)/.test(lower)) return 'capture_lead';
  if (/(late|broken|refund|problem|issue|support|help with order|cancel)/.test(lower)) return 'handle_support';
  if (/(where are you|location|address|website|site|link|whatsapp|app|store)/.test(lower)) return 'drive_to_channel';
  return 'none';
};

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const supportsReasoningEffort = (model?: string): boolean => /^(gpt-5|o)/i.test(model || '');
const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;

export async function detectGoalIntent(
  text: string,
  settings?: AutomationIntentSettings,
): Promise<GoalType> {
  const trimmed = text.trim();
  if (!trimmed) return 'none';
  if (!process.env.OPENAI_API_KEY) {
    return detectGoalIntentFallback(trimmed);
  }

  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { type: 'string', enum: intentLabels.map((item) => item.value) },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['intent', 'confidence'],
    };

    const intentText = intentLabels
      .map((intent) => `- ${intent.value}: ${intent.description}`)
      .join('\n');

    const model = settings?.model || INTENT_MODEL;
    const temperature = typeof settings?.temperature === 'number'
      ? settings?.temperature
      : INTENT_TEMPERATURE;
    const reasoningEffort = settings?.reasoningEffort || INTENT_REASONING_EFFORT;

    const requestPayload: any = {
      model,
      input: [
        {
          role: 'system',
          content: 'Classify the message into one intent from the list. Return JSON only.',
        },
        {
          role: 'user',
          content: `Intents:\n${intentText}\n\nMessage:\n"${trimmed}"\n\nReturn { "intent": "<intent>", "confidence": 0-1 }.`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'intent_detection',
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

    let intent: GoalType | null = null;
    try {
      const parsed = JSON.parse(responseText);
      if (intentLabels.some((item) => item.value === parsed.intent)) {
        intent = parsed.intent as GoalType;
      }
    if (shouldLogAutomation()) {
      console.log('[AI] intent_detect', {
        intent,
        confidence: parsed.confidence,
        model,
        reasoningEffort,
      });
    }
    } catch (parseError) {
      console.error('Failed to parse intent detection response:', responseText);
    }

    return intent || detectGoalIntentFallback(trimmed);
  } catch (error: any) {
    console.error('AI intent detection failed:', error?.message || error);
    return detectGoalIntentFallback(trimmed);
  }
}

export function goalMatchesWorkspace(goal: GoalType, primary?: GoalType, secondary?: GoalType): boolean {
  if (!goal || goal === 'none') return false;
  return goal === primary || goal === secondary;
}

export async function getWorkspaceSettings(
  workspaceId: mongoose.Types.ObjectId | string,
): Promise<any> {
  let settings = await WorkspaceSettings.findOne({ workspaceId });

  if (!settings) {
    settings = await WorkspaceSettings.create({ workspaceId });
  }

  return settings;
}
