import OpenAI from 'openai';
import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { AutomationIntentSettings } from '../types/automation';
import { GoalConfigurations, GoalType } from '../types/automationGoals';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import {
  DEFAULT_AUTOMATION_INTENTS,
  listAutomationIntentLabels,
} from './automationIntentService';

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

const goalIntentLabels: Array<{ value: GoalType; description: string }> =
  DEFAULT_AUTOMATION_INTENTS as Array<{ value: GoalType; description: string }>;

const detectGoalIntentFallback = (text: string): GoalType => {
  const lower = text.toLowerCase();

  if (/(refund|exchange|return|replace|replacement)/.test(lower)) return 'refund_exchange';
  if (/(order status|track|tracking|where is my order|last order|shipment status|delivery status)/.test(lower)) {
    return 'order_status';
  }
  if (/(shipping|delivery|eta|when will|ship|cod|cash on delivery)/.test(lower)) return 'delivery';
  if (/(buy now|order now|checkout|place order|ready to buy|purchase now)/.test(lower)) return 'order_now';
  if (/(price|availability|in stock|variant|variants|size|color|colour|material|fabric)/.test(lower)) {
    return 'product_inquiry';
  }
  if (/(human|agent|representative|real person|someone|operator)/.test(lower)) return 'human';
  if (/(book|appointment|schedule|reserve|reservation)/.test(lower)) return 'book_appointment';
  if (/(interested|contact me|reach out|quote|more info|call me|email me)/.test(lower)) return 'capture_lead';
  if (/(late|broken|problem|issue|support|help with order|cancel|complaint)/.test(lower)) return 'handle_support';
  return 'none';
};

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const supportsReasoningEffort = (model?: string): boolean => /^(gpt-5|o)/i.test(model || '');
const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;

type IntentLabel = { value: string; description: string };

const detectIntentFromLabels = async (
  text: string,
  intentLabels: IntentLabel[],
  settings?: AutomationIntentSettings,
): Promise<string> => {
  const trimmed = text.trim();
  if (!trimmed) return 'none';

  const labels = Array.isArray(intentLabels)
    ? intentLabels.filter((label) => label?.value && typeof label.value === 'string')
    : [];
  if (labels.length === 0) return 'none';

  const allowedValues = labels.map((intent) => intent.value);
  const allowedSet = new Set(allowedValues);

  if (!process.env.OPENAI_API_KEY) {
    const fallback = detectGoalIntentFallback(trimmed);
    return allowedSet.has(fallback) ? fallback : 'none';
  }

  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { type: 'string', enum: allowedValues },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['intent', 'confidence'],
    };

    const intentText = labels
      .map((intent) => `- ${intent.value}: ${intent.description || ''}`)
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

    let intent: string | null = null;
    let confidence: number | null = null;
    try {
      const parsed = JSON.parse(responseText);
      if (allowedSet.has(parsed.intent)) {
        intent = parsed.intent as string;
      }
      if (typeof parsed.confidence === 'number') {
        confidence = parsed.confidence;
      }
      if (shouldLogAutomation()) {
        console.log('[AI] intent_detect', {
          intent,
          confidence,
          model,
          reasoningEffort,
        });
      }
    } catch (parseError) {
      console.error('Failed to parse intent detection response:', responseText);
    }

    if (intent && allowedSet.has(intent)) return intent;
    const fallback = detectGoalIntentFallback(trimmed);
    return allowedSet.has(fallback) ? fallback : 'none';
  } catch (error: any) {
    console.error('AI intent detection failed:', error?.message || error);
    const fallback = detectGoalIntentFallback(trimmed);
    return allowedSet.has(fallback) ? fallback : 'none';
  }
};

const normalizeGoalType = (value?: string | null): GoalType | 'none' => {
  if (!value) return 'none';
  if (value === 'start_order') return 'order_now';
  if (value === 'drive_to_channel') return 'none';
  return value as GoalType;
};

export async function detectGoalIntent(
  text: string,
  settings?: AutomationIntentSettings,
): Promise<GoalType> {
  const intent = await detectIntentFromLabels(text, goalIntentLabels, settings);
  return (goalIntentLabels.some((label) => label.value === intent)
    ? intent
    : 'none') as GoalType;
}

export async function detectAutomationIntent(
  text: string,
  settings?: AutomationIntentSettings,
): Promise<string> {
  const labels = await listAutomationIntentLabels();
  return detectIntentFromLabels(text, labels, settings);
}

export function goalMatchesWorkspace(goal: GoalType, primary?: GoalType, secondary?: GoalType): boolean {
  const normalizedGoal = normalizeGoalType(goal);
  if (!normalizedGoal || normalizedGoal === 'none') return false;
  const normalizedPrimary = normalizeGoalType(primary);
  const normalizedSecondary = normalizeGoalType(secondary);
  return normalizedGoal === normalizedPrimary || normalizedGoal === normalizedSecondary;
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
