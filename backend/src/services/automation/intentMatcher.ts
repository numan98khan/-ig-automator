import { getLogSettingsSnapshot } from '../adminLogSettingsService';
import { AiProvider, getAiClient, hasGroqApiKey, normalizeAiProvider } from '../../utils/aiProvider';

const DEFAULT_INTENT_MODEL = 'gpt-4o-mini';
const DEFAULT_GROQ_INTENT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 200;

const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const logIntentDebug = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  if (details) {
    console.log('[AI] intent_match', details);
    return;
  }
  console.log('[AI] intent_match', message);
};

const supportsTemperature = (provider: AiProvider, model?: string): boolean =>
  provider === 'openai' ? !/^gpt-5/i.test(model || '') : true;

type IntentMatchSettings = {
  provider?: AiProvider;
  model?: string;
  temperature?: number;
};

export async function matchesIntent(
  messageText: string,
  intentText: string,
  settings?: IntentMatchSettings,
): Promise<boolean> {
  const trimmedMessage = messageText.trim();
  const trimmedIntent = intentText.trim();
  if (!trimmedMessage || !trimmedIntent) return false;
  const provider = normalizeAiProvider(settings?.provider);
  if (provider === 'groq' ? !hasGroqApiKey() : !process.env.OPENAI_API_KEY) {
    console.warn(`Intent match skipped: missing ${provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'}`);
    return false;
  }

  try {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        matches: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['matches', 'confidence'],
    };

    const model = settings?.model || (provider === 'groq' ? DEFAULT_GROQ_INTENT_MODEL : DEFAULT_INTENT_MODEL);
    const temperature = typeof settings?.temperature === 'number' ? settings.temperature : DEFAULT_TEMPERATURE;
    const temperatureSupported = supportsTemperature(provider, model);
    let responseText = '{}';

    if (provider === 'groq') {
      const response = await getAiClient('groq').chat.completions.create({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [
          {
            role: 'system',
            content: 'Decide if a customer message matches the provided intent. Return JSON only.',
          },
          {
            role: 'user',
            content: `Intent:\n"${trimmedIntent}"\n\nMessage:\n"${trimmedMessage}"\n\nReturn { "matches": boolean, "confidence": number }.`,
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
            content: 'Decide if a customer message matches the provided intent. Return JSON only.',
          },
          {
            role: 'user',
            content: `Intent:\n"${trimmedIntent}"\n\nMessage:\n"${trimmedMessage}"\n\nReturn { "matches": boolean, "confidence": number }.`,
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'intent_match',
            schema,
            strict: true,
          },
        },
        store: false,
      };

      if (temperatureSupported) {
        requestPayload.temperature = temperature;
      }

      const response = await getAiClient('openai').responses.create(requestPayload);
      responseText = response.output_text?.trim() || '{}';
    }

    let matches = false;
    try {
      const parsed = safeParseJson(responseText);
      matches = Boolean(parsed.matches);
      logIntentDebug('result', {
        matches,
        confidence: parsed.confidence,
        provider,
        model,
      });
    } catch (parseError) {
      console.error('Failed to parse intent match response:', responseText);
    }

    return matches;
  } catch (error: any) {
    console.error('Intent match failed:', error?.message || error);
    return false;
  }
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
