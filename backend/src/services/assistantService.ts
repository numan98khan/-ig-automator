import OpenAI from 'openai';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { logOpenAiUsage } from './openAiUsageService';
import { requireEnv } from '../utils/requireEnv';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const getDurationMs = (startNs: bigint) => Number(process.hrtime.bigint() - startNs) / 1e6;
const logAiTiming = (label: string, model: string | undefined, startNs: bigint, success: boolean) => {
  if (!getLogSettingsSnapshot().aiTimingEnabled) return;
  const ms = getDurationMs(startNs);
  console.log('[AI] timing', { label, model, ms: Number(ms.toFixed(2)), success });
};

const SYSTEM_PROMPT = `You are SendFx Assistant, a concise in-app guide for SendFx (Instagram DM automation with guardrails).
- Audience: prospects on the marketing site and authenticated customers in the product.
- Be concise (<= 5 sentences), concrete, and confident. Prefer bullets.
- Always keep safety/compliance in scope: approvals and escalation.
- If pricing is asked, explain there are Starter, Pro, and Business tiers with increasing workspaces, seats, guardrails, and priority support; direct the user to request a demo for detailed pricing.
- Capabilities to highlight: Instagram DM inbox automation, suggested replies with approvals, routing to sales/support/humans, knowledge/FAQ grounding, dashboards/alerts, and webhook logging.
- Limitations: only works for Instagram DMs today; depends on provided workspace data for perfect on-brand replies.
- Tone: helpful operator—not salesy, not flowery.`;

export interface AssistantRequest {
  question: string;
  workspaceName?: string;
  workspaceId?: string;
  userEmail?: string;
  locationHint?: string;
  contexts?: {
    id: string;
    title: string;
    content: string;
    score?: number;
  }[];
}

export interface AssistantResponse {
  answer: string;
  model?: string;
}

export async function askAssistant(request: AssistantRequest): Promise<AssistantResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      answer: 'SendFx Assistant is temporarily unavailable (missing OpenAI API key). Please try again after setup.',
    };
  }

  const { question, workspaceName, userEmail, locationHint, contexts } = request;

  const userContext: string[] = [];
  if (workspaceName) userContext.push(`Workspace: ${workspaceName}`);
  if (userEmail) userContext.push(`User: ${userEmail}`);
  if (locationHint) userContext.push(`Location: ${locationHint}`);

  const contextBlock = userContext.length ? `Context: ${userContext.join(' • ')}` : 'Context: anonymous visitor';

  const knowledgeSection = contexts?.length
    ? `Use the following workspace knowledge when relevant:\n${contexts
      .map((ctx) => {
        const preview = ctx.content.length > 800 ? `${ctx.content.slice(0, 800)}...` : ctx.content;
        return `- ${ctx.title}: ${preview}`;
      })
      .join('\n')}`
    : 'No workspace knowledge available.';

  const model = requireEnv('OPENAI_MODEL');
  const requestPayload: any = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\n${knowledgeSection}\nQuestion: ${question}`,
      },
    ],
    max_tokens: 320,
  };

  if (supportsTemperature(model)) {
    requestPayload.temperature = 0.4;
  }

  const requestStart = process.hrtime.bigint();
  let completion;
  try {
    completion = await openai.chat.completions.create(requestPayload);
    logAiTiming('assistant', model, requestStart, true);
  } catch (error) {
    logAiTiming('assistant', model, requestStart, false);
    throw error;
  }

  await logOpenAiUsage({
    workspaceId: request.workspaceId ? String(request.workspaceId) : null,
    model: completion.model || model,
    usage: completion.usage,
    requestId: completion.id,
  });

  const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate a response right now.';

  return {
    answer,
    model: completion.model,
  };
}
