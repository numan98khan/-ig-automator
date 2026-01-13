import mongoose from 'mongoose';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { AutomationIntentSettings } from '../types/automation';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { listAutomationIntentLabels } from './automationIntentService';
import { requireEnv } from '../utils/requireEnv';
import { normalizeReasoningEffort } from '../utils/aiReasoning';
import { AiProvider, getAiClient, hasGroqApiKey, normalizeAiProvider } from '../utils/aiProvider';

const DEFAULT_GROQ_INTENT_MODEL = 'openai/gpt-oss-20b';

const INTENT_MODEL = requireEnv('OPENAI_INTENT_MODEL');
const INTENT_TEMPERATURE = 0;
const INTENT_REASONING_EFFORT: AutomationIntentSettings['reasoningEffort'] = 'none';
const INTENT_MAX_TOKENS = 200;

const supportsTemperature = (provider: AiProvider, model?: string): boolean =>
  provider === 'openai' ? !/^gpt-5/i.test(model || '') : true;
const supportsReasoningEffort = (provider: AiProvider, model?: string): boolean =>
  provider === 'openai' && /^(gpt-5|o)/i.test(model || '');
const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;

type IntentLabel = { value: string; description: string };
const DEFAULT_INTENT_FALLBACK = 'none';

const resolveIntentFallback = (allowedValues: string[]): string => {
  if (allowedValues.includes('other')) return 'other';
  if (allowedValues.includes('none')) return 'none';
  return allowedValues[0] || DEFAULT_INTENT_FALLBACK;
};

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
  const provider = normalizeAiProvider(settings?.provider);

  if (provider === 'groq' ? !hasGroqApiKey() : !process.env.OPENAI_API_KEY) {
    return resolveIntentFallback(allowedValues);
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

    const model = settings?.model || (provider === 'groq' ? DEFAULT_GROQ_INTENT_MODEL : INTENT_MODEL);
    const temperature = typeof settings?.temperature === 'number'
      ? settings?.temperature
      : INTENT_TEMPERATURE;
    const reasoningEffort = provider === 'openai'
      ? normalizeReasoningEffort(model, settings?.reasoningEffort || INTENT_REASONING_EFFORT)
      : undefined;
    const temperatureSupported = supportsTemperature(provider, model);
    const reasoningSupported = supportsReasoningEffort(provider, model);

    let responseText = '{}';
    if (provider === 'groq') {
      const response = await getAiClient('groq').chat.completions.create({
        model,
        max_tokens: INTENT_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: 'Classify the message into one intent from the list. Return JSON only.',
          },
          {
            role: 'user',
            content: `Intents:\n${intentText}\n\nMessage:\n"${trimmed}"\n\nReturn { "intent": "<intent>", "confidence": 0-1 }.`,
          },
        ],
        ...(temperatureSupported ? { temperature } : {}),
      });
      responseText = response.choices?.[0]?.message?.content?.trim() || '{}';
    } else {
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

      if (temperatureSupported) {
        requestPayload.temperature = temperature;
      }
      if (reasoningSupported && reasoningEffort) {
        requestPayload.reasoning = { effort: reasoningEffort };
      }

      const response = await getAiClient('openai').responses.create(requestPayload);
      responseText = response.output_text?.trim() || '{}';
    }

    let intent: string | null = null;
    let confidence: number | null = null;
    try {
      const parsed = safeParseJson(responseText);
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
          provider,
          model,
          reasoningEffort,
        });
      }
    } catch (parseError) {
      console.error('Failed to parse intent detection response:', responseText);
    }

    if (intent && allowedSet.has(intent)) return intent;
    return resolveIntentFallback(allowedValues);
  } catch (error: any) {
    console.error('AI intent detection failed:', error?.message || error);
    return resolveIntentFallback(allowedValues);
  }
};

export async function detectAutomationIntent(
  text: string,
  settings?: AutomationIntentSettings,
): Promise<string> {
  const result = await detectAutomationIntentDetailed(text, settings);
  return result.value;
}

export async function detectAutomationIntentDetailed(
  text: string,
  settings?: AutomationIntentSettings,
): Promise<{ value: string; description?: string }> {
  const labels = await listAutomationIntentLabels();
  const value = await detectIntentFromLabels(text, labels, settings);
  const match = labels.find((label) => label.value === value);
  return { value, description: match?.description };
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

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

function safeParseJson(content: string): any {
  try {
    return JSON.parse(stripJsonFence(content));
  } catch (primaryError) {
    try {
      const repaired = repairJson(stripJsonFence(content));
      return JSON.parse(repaired);
    } catch (secondaryError) {
      throw primaryError;
    }
  }
}

function repairJson(content: string): string {
  let repaired = content
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/:\s*(\r?\n)*\s*([}\]])/g, ': null$2')
    .trim();

  const danglingField = /"([A-Za-z0-9_]+)"\s*:\s*$/m;
  if (danglingField.test(repaired)) {
    repaired = repaired.replace(danglingField, '"$1": null');
  }

  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  if (closeBraces < openBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (closeBrackets < openBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }

  return repaired;
}
