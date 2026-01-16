import mongoose from 'mongoose';
import { IConversation } from '../models/Conversation';
import Message, { IMessage } from '../models/Message';
import KnowledgeItem from '../models/KnowledgeItem';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { AutomationAiSettings } from '../types/automation';
import { searchWorkspaceKnowledge, RetrievedContext } from './vectorStore';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { logOpenAiUsage } from './openAiUsageService';
import { normalizeReasoningEffort } from '../utils/aiReasoning';
import { AiProvider, getAiClient, normalizeAiProvider } from '../utils/aiProvider';
import { buildBusinessProfileContext } from './businessProfileKnowledge';

const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

export type LangchainAgentTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
};

export type LangchainAgentResult = {
  replyText: string;
  shouldContinue: boolean;
  shouldStop: boolean;
  toolCalls?: Array<{ name: string; input?: Record<string, any>; rationale?: string }>;
  actionSummary?: string;
  askedQuestion?: boolean;
};

export type LangchainAgentOptions = {
  conversation: IConversation;
  workspaceId: mongoose.Types.ObjectId | string;
  latestCustomerMessage?: string;
  conversationSummary?: string;
  messageHistory?: Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>[];
  historyLimit?: number;
  systemPrompt?: string;
  tools?: LangchainAgentTool[];
  preferredTool?: string;
  endCondition?: string;
  stopCondition?: string;
  maxIterations?: number;
  iteration?: number;
  maxIterationsReached?: boolean;
  toolChoice?: 'auto' | 'required' | 'none';
  returnIntermediateSteps?: boolean;
  aiSettings?: AutomationAiSettings;
  knowledgeItemIds?: string[];
};

const supportsTemperature = (provider: AiProvider, model?: string): boolean =>
  provider === 'openai' ? !/^gpt-5/i.test(model || '') : true;
const supportsReasoningEffort = (provider: AiProvider, model?: string): boolean =>
  provider === 'openai' && /^(gpt-5|o)/i.test(model || '');
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

const formatToolList = (tools: LangchainAgentTool[]): string => {
  if (!tools.length) return 'No tools available.';
  return tools
    .map((tool) => {
      const details = [
        `- ${tool.name}`,
        tool.description ? `description: ${tool.description}` : null,
        tool.inputSchema ? `inputSchema: ${JSON.stringify(tool.inputSchema)}` : null,
      ].filter(Boolean).join(' | ');
      return details;
    })
    .join('\n');
};

export async function generateLangchainAgentReply(
  options: LangchainAgentOptions,
): Promise<LangchainAgentResult> {
  const {
    conversation,
    workspaceId,
    latestCustomerMessage,
    conversationSummary,
    messageHistory,
    historyLimit,
    systemPrompt,
    tools,
    preferredTool,
    endCondition,
    stopCondition,
    maxIterations,
    iteration,
    maxIterationsReached,
    toolChoice,
    returnIntermediateSteps,
    aiSettings,
    knowledgeItemIds,
  } = options;

  const historyLimitValue = typeof historyLimit === 'number'
    ? historyLimit
    : typeof aiSettings?.historyLimit === 'number'
      ? aiSettings?.historyLimit
      : 10;
  const ragEnabled = aiSettings?.ragEnabled !== false;
  const provider = normalizeAiProvider(aiSettings?.provider);
  const model = aiSettings?.model || (provider === 'groq' ? DEFAULT_GROQ_MODEL : DEFAULT_OPENAI_MODEL);
  const temperature = typeof aiSettings?.temperature === 'number' ? aiSettings?.temperature : 0.2;
  const maxOutputTokens = typeof aiSettings?.maxOutputTokens === 'number'
    ? aiSettings?.maxOutputTokens
    : 420;
  const reasoningEffort = provider === 'openai'
    ? normalizeReasoningEffort(model, aiSettings?.reasoningEffort)
    : undefined;
  const maxReplySentences = aiSettings?.maxReplySentences;

  const safeTools = Array.isArray(tools)
    ? tools
      .map((tool) => ({
        name: String(tool?.name || '').trim(),
        description: tool?.description ? String(tool.description).trim() : undefined,
        inputSchema: tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : undefined,
      }))
      .filter((tool) => tool.name)
    : [];
  const toolChoiceValue = toolChoice === 'required' || toolChoice === 'none' ? toolChoice : 'auto';
  const preferredToolName = typeof preferredTool === 'string' ? preferredTool.trim() : '';
  const resolvedPreferredTool = preferredToolName && safeTools.some((tool) => tool.name === preferredToolName)
    ? preferredToolName
    : '';

  const messages = messageHistory
    ? [...messageHistory].slice(-historyLimitValue)
    : await Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(historyLimitValue)
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

  let knowledgeContext = '';
  let vectorContexts: RetrievedContext[] = [];
  const appendKnowledgeBlock = (label: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    if (knowledgeContext) {
      knowledgeContext += '\n\n';
    }
    knowledgeContext += `${label}:\n${trimmed}`;
  };

  const knowledgeBaseQuery = {
    workspaceId,
    active: { $ne: false },
  };
  const knowledgeQuery = Array.isArray(knowledgeItemIds) && knowledgeItemIds.length > 0
    ? { ...knowledgeBaseQuery, _id: { $in: knowledgeItemIds } }
    : knowledgeBaseQuery;

  const knowledgeItems = await KnowledgeItem.find(knowledgeQuery);
  const workspaceSettings = await WorkspaceSettings.findOne({ workspaceId }).lean();
  const businessProfile = buildBusinessProfileContext(workspaceSettings);

  if (recentCustomerText && ragEnabled) {
    try {
      vectorContexts = await searchWorkspaceKnowledge(String(workspaceId), recentCustomerText, 5);
    } catch (error) {
      console.error('Vector search failed in langchainAgentService:', error);
    }
  }

  if (businessProfile) {
    appendKnowledgeBlock('Business Profile', businessProfile.content);
  }

  if (knowledgeItems.length > 0) {
    appendKnowledgeBlock(
      'Knowledge Base',
      knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n'),
    );
  }

  if (vectorContexts.length > 0) {
    appendKnowledgeBlock(
      'Vector RAG Matches',
      vectorContexts.map((ctx) => `- ${ctx.title}: ${ctx.content}`).join('\n'),
    );
  }

  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    return `${role}: ${msg.text}`;
  }).join('\n');

  const systemMessage = [
    systemPrompt?.trim() || 'You are an agent that can decide whether to call tools.',
    '',
    'You are running inside a flow builder node. Be concise, helpful, and safe.',
    'Follow the tool usage guidelines and return only the JSON schema described.',
    'Do not expose chain-of-thought or internal reasoning.',
    endCondition?.trim()
      ? `End condition: ${endCondition.trim()}`
      : 'End condition: none provided.',
    stopCondition?.trim()
      ? `Stop immediately when stop condition is met: ${stopCondition.trim()}`
      : '',
    maxIterationsReached ? 'Max iterations reached: do not continue.' : '',
  ].filter(Boolean).join('\n');

  const userMessage = `
TOOLS:
${formatToolList(safeTools)}

TOOL CHOICE:
${toolChoiceValue}${resolvedPreferredTool ? ` (preferred: ${resolvedPreferredTool})` : ''}

INTERMEDIATE STEPS:
${returnIntermediateSteps ? 'Include actionSummary and tool rationale for observability.' : 'Keep actionSummary brief.'}

ITERATION:
${typeof iteration === 'number' ? iteration : 0} / ${typeof maxIterations === 'number' ? maxIterations : 'unlimited'}

KNOWLEDGE:
${knowledgeContext || 'No knowledge provided.'}

CONVERSATION HISTORY:
${conversationHistory || 'No prior messages.'}

CONVERSATION SUMMARY:
${conversationSummary?.trim() || 'No summary available.'}

LATEST CUSTOMER MESSAGE:
"${recentCustomerText}"

TASK:
Decide if you need to call a tool. If so, include toolCalls with the tool name and input.
If no tool is required, keep toolCalls empty. Respond with a helpful reply to the customer.

Return JSON with:
- replyText: string
- shouldContinue: boolean (true if the node should stay active and wait for the next user reply)
- shouldStop: boolean (true if the stop condition is met)
- actionSummary: short optional summary of the agent decision
- toolCalls: array of { name, input, rationale } (may be empty)
- askedQuestion: boolean (true if you asked a direct question)
`.trim();

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyText: { type: 'string' },
      shouldContinue: { type: 'boolean' },
      shouldStop: { type: 'boolean' },
      actionSummary: { type: ['string', 'null'] },
      toolCalls: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            input: { type: ['object', 'null'] },
            rationale: { type: ['string', 'null'] },
          },
          required: ['name', 'input', 'rationale'],
        },
      },
      askedQuestion: { type: 'boolean' },
    },
    required: ['replyText', 'shouldContinue', 'shouldStop', 'toolCalls', 'askedQuestion'],
  };

  let responseContent: string | null = null;
  try {
    const temperatureSupported = supportsTemperature(provider, model);
    const reasoningSupported = supportsReasoningEffort(provider, model);

    logAiDebug('langchain_agent_request', {
      conversationId: conversation._id?.toString(),
      workspaceId: String(workspaceId),
      provider,
      model,
      temperature: temperatureSupported ? temperature : undefined,
      reasoningEffort: reasoningSupported ? reasoningEffort : undefined,
      historyCount: messages.length,
      tools: safeTools.length,
      iteration,
      maxIterations,
      ragEnabled,
      toolChoice: toolChoiceValue,
    });

    let raw: any;
    if (provider === 'groq') {
      const response = await getAiClient('groq').chat.completions.create({
        model,
        max_tokens: maxOutputTokens,
        messages: [
          { role: 'system', content: systemMessage.trim() },
          { role: 'user', content: userMessage.trim() },
        ],
        ...(temperatureSupported ? { temperature } : {}),
      });
      responseContent = response.choices?.[0]?.message?.content || '{}';
      raw = safeParseJson(responseContent);
    } else {
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
            name: 'langchain_agent_reply',
            schema,
            strict: true,
          },
        },
        store: true,
      };

      if (temperatureSupported) {
        requestPayload.temperature = temperature;
      }
      if (reasoningSupported && reasoningEffort) {
        requestPayload.reasoning = { effort: reasoningEffort };
      }

      const response = await getAiClient('openai').responses.create(requestPayload);
      await logOpenAiUsage({
        workspaceId: String(workspaceId),
        model: response?.model || model,
        usage: response?.usage,
        requestId: response?.id,
      });
      responseContent = response.output_text || '{}';
      const structured = extractStructuredJson<LangchainAgentResult>(response);
      raw = structured || safeParseJson(responseContent);
    }

    const replyText = String(raw.replyText || '').trim();
    const shouldContinue = Boolean(raw.shouldContinue);
    const shouldStop = Boolean(raw.shouldStop);
    const actionSummary = raw.actionSummary ? String(raw.actionSummary).trim() : undefined;
    const toolCalls = Array.isArray(raw.toolCalls)
      ? raw.toolCalls
        .map((call: any) => ({
          name: typeof call?.name === 'string' ? call.name.trim() : '',
          input: call?.input && typeof call.input === 'object' ? call.input : undefined,
          rationale: call?.rationale ? String(call.rationale).trim() : undefined,
        }))
        .filter((call: any) => call.name)
      : [];
    const askedQuestion = Boolean(raw.askedQuestion);

    let finalReply = replyText;
    if (finalReply && typeof maxReplySentences === 'number' && Number.isFinite(maxReplySentences) && maxReplySentences > 0) {
      const sentences = splitIntoSentences(finalReply);
      if (sentences.length > maxReplySentences) {
        finalReply = sentences.slice(0, maxReplySentences).join(' ').trim();
      }
    }

    if (!finalReply) {
      logAiDebug('langchain_agent_empty_reply', {
        model,
        responsePreview: responseContent ? responseContent.slice(0, 200) : undefined,
      });
      return {
        replyText: 'Thanks for your message! A teammate will follow up shortly.',
        shouldContinue,
        shouldStop,
        actionSummary,
        toolCalls,
        askedQuestion,
      };
    }

    return {
      replyText: finalReply,
      shouldContinue: Boolean(shouldContinue && !maxIterationsReached),
      shouldStop,
      actionSummary,
      toolCalls,
      askedQuestion,
    };
  } catch (error: any) {
    console.error('LangChain agent generation failed:', error?.message || error);
    logAiDebug('langchain_agent_error', {
      error: error?.message || String(error),
      responsePreview: responseContent ? responseContent.slice(0, 200) : undefined,
    });
  }

  return {
    replyText: 'Thanks for your message! A teammate will follow up shortly.',
    shouldContinue: false,
    shouldStop: false,
    toolCalls: [],
    askedQuestion: false,
  };
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
