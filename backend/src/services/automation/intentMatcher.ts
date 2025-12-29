import OpenAI from 'openai';
import { getLogSettingsSnapshot } from '../adminLogSettingsService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_INTENT_MODEL = 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0;

const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const logIntentDebug = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  if (details) {
    console.log('[AI] intent_match', details);
    return;
  }
  console.log('[AI] intent_match', message);
};

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');

export async function matchesIntent(messageText: string, intentText: string): Promise<boolean> {
  const trimmedMessage = messageText.trim();
  const trimmedIntent = intentText.trim();
  if (!trimmedMessage || !trimmedIntent) return false;
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Intent match skipped: missing OPENAI_API_KEY');
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

    const model = DEFAULT_INTENT_MODEL;
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

    if (supportsTemperature(model)) {
      requestPayload.temperature = DEFAULT_TEMPERATURE;
    }

    const response = await openai.responses.create(requestPayload);
    const responseText = response.output_text?.trim() || '{}';

    let matches = false;
    try {
      const parsed = JSON.parse(responseText);
      matches = Boolean(parsed.matches);
      logIntentDebug('result', { matches, confidence: parsed.confidence });
    } catch (parseError) {
      console.error('Failed to parse intent match response:', responseText);
    }

    return matches;
  } catch (error: any) {
    console.error('Intent match failed:', error?.message || error);
    return false;
  }
}
