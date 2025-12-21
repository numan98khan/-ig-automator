import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are SendFx Assistant, a concise in-app guide for SendFx (Instagram DM automation with guardrails).
- Audience: prospects on the marketing site and authenticated customers in the product.
- Be concise (<= 5 sentences), concrete, and confident. Prefer bullets.
- Always keep safety/compliance in scope: approvals, policies, escalation.
- If pricing is asked, explain there are Starter, Pro, and Business tiers with increasing workspaces, seats, guardrails, and priority support; direct the user to request a demo for detailed pricing.
- Capabilities to highlight: Instagram DM inbox automation, suggested replies with approvals, routing to sales/support/humans, knowledge/FAQ grounding, policy checks, sandbox testing, dashboards/alerts, and webhook logging.
- Limitations: only works for Instagram DMs today; depends on provided workspace data for perfect on-brand replies.
- Tone: helpful operator—not salesy, not flowery.`;

export interface AssistantRequest {
  question: string;
  workspaceName?: string;
  userEmail?: string;
  locationHint?: string;
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

  const { question, workspaceName, userEmail, locationHint } = request;

  const userContext: string[] = [];
  if (workspaceName) userContext.push(`Workspace: ${workspaceName}`);
  if (userEmail) userContext.push(`User: ${userEmail}`);
  if (locationHint) userContext.push(`Location: ${locationHint}`);

  const contextBlock = userContext.length ? `Context: ${userContext.join(' • ')}` : 'Context: anonymous visitor';

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextBlock}\nQuestion: ${question}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 320,
  });

  const answer = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate a response right now.';

  return {
    answer,
    model: completion.model,
  };
}
