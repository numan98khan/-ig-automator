import OpenAI from 'openai';

export type AiProvider = 'openai' | 'groq';

export const DEFAULT_AI_PROVIDER: AiProvider = 'openai';

const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let groqClient: OpenAI | null = null;

const getGroqApiKey = (): string =>
  process.env.GROQ_API_KEY || process.env.GROQ_API || '';

export const hasGroqApiKey = (): boolean => Boolean(getGroqApiKey());

export const normalizeAiProvider = (provider?: string): AiProvider =>
  provider === 'groq' ? 'groq' : DEFAULT_AI_PROVIDER;

export const getOpenAiClient = (): OpenAI => openaiClient;

export const getGroqClient = (): OpenAI => {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('missing GROQ API key (set GROQ_API_KEY or GROQ_API)');
  }
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return groqClient;
};

export const getAiClient = (provider: AiProvider): OpenAI =>
  provider === 'groq' ? getGroqClient() : getOpenAiClient();
