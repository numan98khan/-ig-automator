import OpenAI from 'openai';
import mongoose from 'mongoose';
import { IConversation } from '../models/Conversation';
import Message from '../models/Message';
import KnowledgeItem from '../models/KnowledgeItem';
import { AutomationAiSettings } from '../types/automation';
import { searchWorkspaceKnowledge, RetrievedContext } from './vectorStore';
import { getLogSettingsSnapshot } from './adminLogSettingsService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AIAgentResult = {
  replyText: string;
  advanceStep: boolean;
  endConversation: boolean;
  stepSummary?: string;
  collectedFields?: Record<string, string | null>;
  missingFields?: string[];
  askedQuestion?: boolean;
  shouldStop?: boolean;
};

export type AIAgentOptions = {
  conversation: IConversation;
  workspaceId: mongoose.Types.ObjectId | string;
  latestCustomerMessage?: string;
  systemPrompt?: string;
  steps?: string[];
  stepIndex?: number;
  endCondition?: string;
  stopCondition?: string;
  slotDefinitions?: Array<{ key: string; question?: string; defaultValue?: string }>;
  slotValues?: Record<string, string>;
  maxQuestions?: number;
  questionsAsked?: number;
  maxQuestionsReached?: boolean;
  aiSettings?: AutomationAiSettings;
  knowledgeItemIds?: string[];
};

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const supportsReasoningEffort = (model?: string): boolean => /^(gpt-5|o)/i.test(model || '');
const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;

const logAiDebug = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  if (details) {
    console.log('[AI]', message, details);
    return;
  }
  console.log('[AI]', message);
};

const splitIntoSentences = (text: string): string[] => {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matches) return [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
};

export async function generateAIAgentReply(options: AIAgentOptions): Promise<AIAgentResult> {
  const {
    conversation,
    workspaceId,
    latestCustomerMessage,
    systemPrompt,
    steps,
    stepIndex,
    endCondition,
    stopCondition,
    slotDefinitions,
    slotValues,
    maxQuestions,
    questionsAsked,
    maxQuestionsReached,
    aiSettings,
    knowledgeItemIds,
  } = options;

  const historyLimit = typeof aiSettings?.historyLimit === 'number' ? aiSettings?.historyLimit : 10;
  const ragEnabled = aiSettings?.ragEnabled !== false;
  const model = aiSettings?.model || 'gpt-4o-mini';
  const temperature = typeof aiSettings?.temperature === 'number' ? aiSettings?.temperature : 0.35;
  const maxOutputTokens = typeof aiSettings?.maxOutputTokens === 'number'
    ? aiSettings?.maxOutputTokens
    : 420;
  const reasoningEffort = aiSettings?.reasoningEffort;
  const maxReplySentences = aiSettings?.maxReplySentences;

  const trimmedSteps = Array.isArray(steps)
    ? steps.map((step) => String(step).trim()).filter(Boolean)
    : [];
  const currentStepIndex = typeof stepIndex === 'number' && stepIndex >= 0
    ? stepIndex
    : 0;
  const currentStep = trimmedSteps[currentStepIndex] || '';
  const safeSlots = Array.isArray(slotDefinitions)
    ? slotDefinitions
      .map((slot) => ({
        key: String(slot?.key || '').trim(),
        question: slot?.question ? String(slot.question).trim() : undefined,
        defaultValue: slot?.defaultValue ? String(slot.defaultValue).trim() : undefined,
      }))
      .filter((slot) => slot.key)
    : [];
  const slotValueMap: Record<string, string> = slotValues && typeof slotValues === 'object'
    ? Object.entries(slotValues).reduce((acc, [key, value]) => {
        if (typeof value === 'string' && value.trim()) {
          acc[key] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>)
    : {};

  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .limit(historyLimit)
    .then(found => {
      const ordered = [...found];
      ordered.reverse();
      return ordered;
    });

  const recentCustomerMessage = [...messages].reverse().find((msg: any) => msg.from === 'customer');
  const recentCustomerText =
    latestCustomerMessage ||
    recentCustomerMessage?.text ||
    '';

  // Build knowledge context (Mongo + optional vector RAG)
  let knowledgeContext = '';
  let vectorContexts: RetrievedContext[] = [];

  const knowledgeQuery = Array.isArray(knowledgeItemIds) && knowledgeItemIds.length > 0
    ? { workspaceId, _id: { $in: knowledgeItemIds } }
    : { workspaceId };

  const knowledgeItems = await KnowledgeItem.find(knowledgeQuery);

  if (recentCustomerText && ragEnabled) {
    try {
      vectorContexts = await searchWorkspaceKnowledge(String(workspaceId), recentCustomerText, 5);
    } catch (error) {
      console.error('Vector search failed in aiAgentService:', error);
    }
  }

  if (knowledgeItems.length > 0) {
    knowledgeContext += '\nKnowledge Base:\n';
    knowledgeContext += knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n');
  }

  if (vectorContexts.length > 0) {
    knowledgeContext += '\n\nVector RAG Matches:\n';
    knowledgeContext += vectorContexts
      .map((ctx) => `- ${ctx.title}: ${ctx.content}`)
      .join('\n');
  }

  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    return `${role}: ${msg.text}`;
  }).join('\n');

  const systemMessage = [
    systemPrompt?.trim() || 'You are an AI agent.',
    '',
    'You are running inside a multi-step automation agent.',
    'Follow the system prompt above, then complete the current step before moving on.',
    'Use the end condition to decide when the agent should finish and allow the flow to continue.',
    stopCondition?.trim()
      ? 'Stop immediately when the stop condition is met. If stop condition is met, set shouldStop=true and endConversation=true.'
      : '',
    'Use slot tracking to avoid re-asking for information that is already collected.',
    'If a slot has a question defined, use it when asking for that slot.',
    'Ask at most one question at a time, only for missing slot values.',
    maxQuestionsReached ? 'Max questions reached: do NOT ask a question. Provide a brief closing response.' : '',
  ].filter(Boolean).join('\n');

  const stepsBlock = trimmedSteps.length > 0
    ? trimmedSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')
    : 'No steps defined.';

  const slotsBlock = safeSlots.length > 0
    ? safeSlots.map((slot) => {
      const details = [
        `- ${slot.key}`,
        slot.question ? `question: ${slot.question}` : null,
        slot.defaultValue ? `default: ${slot.defaultValue}` : null,
        slotValueMap[slot.key] ? `current: ${slotValueMap[slot.key]}` : null,
      ].filter(Boolean).join(' | ');
      return details;
    }).join('\n')
    : 'No slots defined.';

  const userMessage = `
STEPS:
${stepsBlock}

CURRENT STEP (${currentStepIndex + 1}):
${currentStep || 'No active step.'}

END CONDITION:
${endCondition?.trim() || 'No end condition defined.'}

STOP CONDITION:
${stopCondition?.trim() || 'No stop condition defined.'}

SLOTS:
${slotsBlock}

QUESTIONS ASKED:
${typeof questionsAsked === 'number' ? questionsAsked : 0} / ${typeof maxQuestions === 'number' ? maxQuestions : 'unlimited'}

KNOWLEDGE:
${knowledgeContext || 'No knowledge provided.'}

CONVERSATION HISTORY:
${conversationHistory || 'No prior messages.'}

LATEST CUSTOMER MESSAGE:
"${recentCustomerText}"

TASK:
Generate a helpful reply for the customer and evaluate progress.
Return JSON with:
- replyText: your message to the customer
- advanceStep: true if the current step has been completed; otherwise false
- endConversation: true only when the end condition is satisfied; otherwise false
- stepSummary: optional short summary of what was completed or learned in this step
- collectedFields: list of { key, value } entries for newly collected slot values (keys should match slot keys); use default values if defined and still missing
- missingFields: list of slot keys still missing after this turn
- askedQuestion: true if your reply asks the customer a question; otherwise false
- shouldStop: true if the stop condition is satisfied; otherwise false
`.trim();

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyText: { type: 'string' },
      advanceStep: { type: 'boolean' },
      endConversation: { type: 'boolean' },
      stepSummary: { type: ['string', 'null'] },
      collectedFields: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string' },
            value: { type: ['string', 'null'] },
          },
          required: ['key', 'value'],
        },
      },
      missingFields: {
        type: 'array',
        items: { type: 'string' },
      },
      askedQuestion: { type: 'boolean' },
      shouldStop: { type: 'boolean' },
    },
    required: [
      'replyText',
      'advanceStep',
      'endConversation',
      'stepSummary',
      'collectedFields',
      'missingFields',
      'askedQuestion',
      'shouldStop',
    ],
  };

  let responseContent: string | null = null;
  try {
    const requestPayload: any = {
      model,
      max_output_tokens: maxOutputTokens,
      input: [
        { role: 'system', content: systemMessage.trim() },
        { role: 'user', content: userMessage.trim() },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_agent_reply',
          schema,
          strict: true,
        },
      },
      store: true,
    };

    if (supportsTemperature(model)) {
      requestPayload.temperature = temperature;
    }
    if (supportsReasoningEffort(model) && reasoningEffort) {
      requestPayload.reasoning = { effort: reasoningEffort };
    }

    logAiDebug('agent_request', {
      conversationId: conversation._id?.toString(),
      workspaceId: String(workspaceId),
      model,
      temperature: supportsTemperature(model) ? temperature : undefined,
      reasoningEffort: supportsReasoningEffort(model) ? reasoningEffort : undefined,
      historyCount: messages.length,
      steps: trimmedSteps.length,
      stepIndex: currentStepIndex,
      ragEnabled,
      maxQuestions,
      questionsAsked: typeof questionsAsked === 'number' ? questionsAsked : 0,
      maxQuestionsReached,
    });

    const response = await openai.responses.create(requestPayload);
    responseContent = response.output_text || '{}';

    const structured = extractStructuredJson<AIAgentResult>(response);
    const raw = structured || safeParseJson(responseContent);
    const replyText = String(raw.replyText || '').trim();
    const advanceStep = Boolean(raw.advanceStep);
    const endConversation = Boolean(raw.endConversation);
    const stepSummary = raw.stepSummary ? String(raw.stepSummary).trim() : undefined;
    const collectedFields = Array.isArray(raw.collectedFields)
      ? raw.collectedFields.reduce((acc: Record<string, string | null>, entry: any) => {
          const key = typeof entry?.key === 'string' ? entry.key.trim() : '';
          if (!key) return acc;
          if (entry?.value === null) {
            acc[key] = null;
          } else if (typeof entry?.value === 'string') {
            acc[key] = entry.value.trim();
          }
          return acc;
        }, {} as Record<string, string | null>)
      : undefined;
    const missingFields = Array.isArray(raw.missingFields)
      ? raw.missingFields.map((item: any) => String(item).trim()).filter(Boolean)
      : [];
    const askedQuestion = Boolean(raw.askedQuestion);
    const shouldStop = Boolean(raw.shouldStop);

    let finalReply = replyText;
    if (finalReply && Number.isFinite(maxReplySentences) && maxReplySentences > 0) {
      const sentences = splitIntoSentences(finalReply);
      if (sentences.length > maxReplySentences) {
        finalReply = sentences.slice(0, maxReplySentences).join(' ').trim();
      }
    }

    return {
      replyText: finalReply,
      advanceStep,
      endConversation,
      stepSummary,
      collectedFields,
      missingFields,
      askedQuestion,
      shouldStop,
    };
  } catch (error: any) {
    console.error('AI agent generation failed:', error?.message || error);
    logAiDebug('agent_error', {
      error: error?.message || String(error),
      responsePreview: responseContent ? responseContent.slice(0, 200) : undefined,
    });
  }

  return {
    replyText: 'Thanks for your message! A teammate will follow up shortly.',
    advanceStep: false,
    endConversation: false,
    collectedFields: {},
    missingFields: [],
    askedQuestion: false,
    shouldStop: false,
  };
}

function safeParseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch (primaryError) {
    try {
      const repaired = repairJson(content);
      return JSON.parse(repaired);
    } catch (secondaryError) {
      throw primaryError;
    }
  }
}

function extractStructuredJson<T>(response: any): T | null {
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
