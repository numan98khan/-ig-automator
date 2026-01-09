import OpenAI from 'openai';
import mongoose from 'mongoose';
import { IConversation } from '../models/Conversation';
import Message, { IMessage } from '../models/Message';
import KnowledgeItem from '../models/KnowledgeItem';
import { searchWorkspaceKnowledge, RetrievedContext } from './vectorStore';
import { getLogSettingsSnapshot } from './adminLogSettingsService';
import { logOpenAiUsage } from './openAiUsageService';
import { normalizeReasoningEffort } from '../utils/aiReasoning';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIReplyResult {
  replyText: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  tags?: string[];
  knowledgeItemsUsed?: { id: string; title: string }[];
}

export interface AIReplyOptions {
  conversation: IConversation;
  workspaceId: mongoose.Types.ObjectId | string;
  latestCustomerMessage?: string;
  knowledgeItemIds?: string[];
  historyLimit?: number;
  messageHistory?: Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>[];
  tone?: string;
  maxReplySentences?: number;
  ragEnabled?: boolean;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

const splitIntoSentences = (text: string): string[] => {
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matches) return [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
};

const supportsTemperature = (model?: string): boolean => !/^gpt-5/i.test(model || '');
const supportsReasoningEffort = (model?: string): boolean => /^(gpt-5|o)/i.test(model || '');
const getDurationMs = (startNs: bigint) => Number(process.hrtime.bigint() - startNs) / 1e6;
const logAiTiming = (label: string, model: string | undefined, startNs: bigint, success: boolean) => {
  if (!getLogSettingsSnapshot().aiTimingEnabled) return;
  const ms = getDurationMs(startNs);
  console.log('[AI] timing', { label, model, ms: Number(ms.toFixed(2)), success });
};
const shouldLogAutomation = () => getLogSettingsSnapshot().automationLogsEnabled;
const logAiDebug = (message: string, details?: Record<string, any>) => {
  if (!shouldLogAutomation()) return;
  if (details) {
    console.log('[AI]', message, details);
    return;
  }
  console.log('[AI]', message);
};
const shouldLogOpenAiApi = () => getLogSettingsSnapshot().openaiApiLogsEnabled;
const logOpenAiApi = (message: string, details?: Record<string, any>) => {
  if (!shouldLogOpenAiApi()) return;
  if (details) {
    console.log('[OpenAI]', message, details);
    return;
  }
  console.log('[OpenAI]', message);
};

const truncateText = (value: any, max = 800): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const sanitizeOpenAiOutput = (output: any[]) => output.map((item) => {
  const content = Array.isArray(item?.content) ? item.content : [];
  const sanitizedContent = content.map((entry: any) => {
    const base = { type: entry?.type };
    if (entry?.type === 'output_text') {
      return { ...base, text: truncateText(entry?.text, 800) };
    }
    if (entry?.type === 'refusal') {
      return { ...base, refusal: truncateText(entry?.refusal, 300) };
    }
    if (entry?.type === 'tool_call') {
      return { ...base, name: entry?.name || entry?.tool_name };
    }
    return base;
  });
  return {
    type: item?.type,
    role: item?.role,
    content: sanitizedContent,
  };
});

const summarizeOpenAiResponse = (response: any) => {
  const output = Array.isArray(response?.output) ? response.output : [];
  const outputSummary = output.map((item: any) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    const contentTypes = content.map((entry: any) => entry?.type).filter(Boolean);
    const outputText = content.find((entry: any) => entry?.type === 'output_text')?.text;
    const refusal = content.find((entry: any) => entry?.type === 'refusal');
    const toolCall = content.find((entry: any) => entry?.type === 'tool_call');
    return {
      type: item?.type,
      role: item?.role,
      contentTypes,
      outputTextPreview: outputText ? String(outputText).slice(0, 200) : undefined,
      refusal: refusal ? String(refusal?.refusal || '').slice(0, 200) : undefined,
      toolCall: toolCall ? (toolCall?.name || toolCall?.tool_name || 'tool_call') : undefined,
    };
  });

  return {
    id: response?.id,
    model: response?.model,
    status: response?.status,
    incompleteDetails: response?.incomplete_details,
    outputTextLength: response?.output_text?.length || 0,
    outputTextPreview: truncateText(response?.output_text, 200),
    outputCount: output.length,
    outputSummary,
    outputRaw: sanitizeOpenAiOutput(output),
    usage: response?.usage,
    error: response?.error,
  };
};

/**
 * Centralized AI reply generator used by manual and automated flows.
 * Returns structured data with escalation and tagging signals.
 */
export async function generateAIReply(options: AIReplyOptions): Promise<AIReplyResult> {
  const {
    conversation,
    workspaceId,
    latestCustomerMessage,
    historyLimit = 10,
    messageHistory,
  } = options;

  const knowledgeBaseQuery = {
    workspaceId,
    active: { $ne: false },
  };
  const knowledgeQuery = Array.isArray(options.knowledgeItemIds) && options.knowledgeItemIds.length > 0
    ? { ...knowledgeBaseQuery, _id: { $in: options.knowledgeItemIds } }
    : knowledgeBaseQuery;

  const knowledgeItems = await KnowledgeItem.find(knowledgeQuery);

  const model = options.model || 'gpt-4o-mini';
  const temperature = typeof options.temperature === 'number' ? options.temperature : 0.35;
  const maxOutputTokens = typeof options.maxOutputTokens === 'number'
    ? options.maxOutputTokens
    : 420;
  const reasoningEffort = normalizeReasoningEffort(model, options.reasoningEffort);
  const ragEnabled = options.ragEnabled !== false;
  const messages: Pick<IMessage, 'from' | 'text' | 'attachments' | 'createdAt'>[] = messageHistory
    ? [...messageHistory].slice(-historyLimit)
    : await Message.find({ conversationId: conversation._id })
        .sort({ createdAt: -1 })
        .limit(historyLimit)
        .then(found => {
          const ordered = [...found];
          ordered.reverse();
          return ordered;
        });

  const allowHashtags = false;
  const allowEmojis = true;
  const maxReplySentences = options.maxReplySentences ?? 3;
  const replyLanguage = 'en';
  const tone = options.tone?.trim();
  let knowledgeItemsUsed = knowledgeItems.slice(0, 5).map(item => ({
    id: item._id.toString(),
    title: item.title,
  }));

  // Build knowledge context (Mongo + optional vector RAG)
  let knowledgeContext = '';
  let vectorContexts: RetrievedContext[] = [];

  const recentCustomerMessage = [...messages].reverse().find((msg: any) => msg.from === 'customer');
  const recentCustomerText =
    latestCustomerMessage ||
    recentCustomerMessage?.text ||
    '';

  // Semantic RAG if available
  if (recentCustomerText && ragEnabled) {
    try {
      vectorContexts = await searchWorkspaceKnowledge(String(workspaceId), recentCustomerText, 5);
    } catch (error) {
      console.error('Vector search failed in aiReplyService:', error);
    }
  }

  if (knowledgeItems.length > 0) {
    knowledgeContext += '\nGeneral Knowledge Base:\n';
    knowledgeContext += knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n');
  }

  if (vectorContexts.length > 0) {
    knowledgeContext += '\n\nVector RAG Matches:\n';
    knowledgeContext += vectorContexts
      .map((ctx) => `- ${ctx.title}: ${ctx.content}`)
      .join('\n');

    const ragUsed = vectorContexts.slice(0, 5).map((ctx) => ({
      id: ctx.id,
      title: `${ctx.title} (RAG)`,
    }));
    knowledgeItemsUsed = [...ragUsed, ...knowledgeItemsUsed];
  }

  const ragMatchPreview = vectorContexts.slice(0, 3).map((ctx) => ({
    id: ctx.id,
    title: ctx.title,
    contentSnippet: truncateText(ctx.content, 240),
  }));

  // Build conversation history with media context and transcriptions
  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    let text = `${role}: ${msg.text}`;

    // Add media context to conversation history
    if (msg.attachments && msg.attachments.length > 0) {
      const attachmentDetails: string[] = [];

      for (const attachment of msg.attachments) {
        // For voice/audio with transcription, show the transcription
        if ((attachment.type === 'voice' || attachment.type === 'audio') && attachment.transcription) {
          attachmentDetails.push(`${attachment.type} (transcribed)`);
        } else {
          attachmentDetails.push(attachment.type);
        }
      }

      text += ` [Sent ${attachmentDetails.join(', ')}]`;
    }

    return text;
  }).join('\n');

  // Extract attachments from the latest customer message
  const recentCustomerAttachments = recentCustomerMessage?.attachments || [];

  const lastAiMessage = [...messages].reverse().find((msg: any) => msg.from === 'ai')?.text;

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      replyText: { type: 'string' },
      shouldEscalate: { type: 'boolean' },
      escalationReason: { type: ['string', 'null'] },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['replyText', 'shouldEscalate', 'escalationReason', 'tags'],
  };

  const systemMessage = `
You are an AI assistant for a business inbox. You help businesses respond to customer messages on Instagram.

You can see and analyze images and videos that customers send. When responding to media:
- Describe what you see when relevant to the conversation
- Answer questions about the images/videos
- Provide helpful information based on the visual content
- If the image/video is unclear or you can't help, acknowledge it and suggest the customer provide more details

Voice notes and audio messages are automatically transcribed. The transcribed text is included in the message content. Treat transcribed voice notes naturally in your response - you don't need to mention that it was a voice note unless relevant.

Global rules that ALWAYS apply:
- Strictly obey the reply rules provided in the context.
- NEVER promise discounts, prices, contracts, special deals, or commitments unless the business's knowledge base explicitly authorizes you to do so.
- Keep replies short and natural: ${Math.max(1, maxReplySentences)} sentence${maxReplySentences === 1 ? '' : 's'} max, maximum 60–80 words.
- Use a${tone ? ` ${tone}` : ' professional and friendly'} tone that fits the brand voice.
- Be helpful and professional, but not overly salesy or full of marketing fluff.
- Avoid asking the same question twice in the same conversation.
- Do not repeat the opening phrase from your previous reply if there is one.
- Only use hashtags if the business allows them AND the customer used hashtags first.
- Use emojis only if the business allows them.
- When a situation is complex/risky/high-stakes, set shouldEscalate=true so a human can handle it.
- Always respond in the language specified in the context (which may differ from the language of the instructions).
- For escalations: acknowledge the request clearly, explain a human will handle it, avoid making commitments, and keep the door open for other questions.

Your response must be valid JSON matching this schema:
{
  "replyText": "the message to send",
  "shouldEscalate": true or false,
  "escalationReason": "brief explanation if escalating, or null",
  "tags": ["optional", "semantic", "labels"]
}`;

  const userMessage = `
BUSINESS CONTEXT:
Reply rules:
- Hashtags allowed: ${allowHashtags}
- Emojis allowed: ${allowEmojis}
- Max sentences: ${maxReplySentences}
- Desired tone: ${tone || 'professional and friendly'}
- Default reply language: ${getLanguageName(replyLanguage)}

KNOWLEDGE BASE:
${knowledgeContext || 'No specific knowledge provided. Use general business courtesy.'}

CONVERSATION CONTEXT:
You must reply in: ${getLanguageName(replyLanguage)}

Recent conversation history:
${conversationHistory || 'No prior messages.'}

LATEST CUSTOMER MESSAGE:
"${recentCustomerText}"

TASK:
Generate a response following all rules above. Return JSON with:
- replyText: your message to the customer
- shouldEscalate: true if human review needed, false otherwise
- escalationReason: brief reason if escalating (e.g., "Pricing negotiation requires approval", "Complex custom request"), or null
- tags: semantic labels like ["pricing", "bulk_request", "urgent", "complaint"] to help categorize this interaction.`;

  let parsed: AIReplyResult | null = null;
  let responseContent: string | null = null;
  let usedFallback = false;
  let requestError: Record<string, any> | null = null;

  let requestStart: bigint | null = null;
  try {
    // Build user message content (text + images if present)
    // Note: Responses API uses 'input_text' and 'input_image' instead of 'text' and 'image_url'
    const userContent: any[] = [
      { type: 'input_text', text: userMessage.trim() },
    ];

    // Add image attachments to the message for vision analysis
    if (recentCustomerAttachments.length > 0) {
      for (const attachment of recentCustomerAttachments) {
        // Only add image and video types (GPT-4 Vision supports these)
        if (attachment.type === 'image') {
          userContent.push({
            type: 'input_image',
            source: {
              type: 'url',
              url: attachment.url,
            },
          });
        }
        // Note: For videos, we could add the thumbnail or first frame
        else if (attachment.type === 'video' && (attachment.thumbnailUrl || attachment.previewUrl)) {
          userContent.push({
            type: 'input_image',
            source: {
              type: 'url',
              url: attachment.thumbnailUrl || attachment.previewUrl,
            },
          });
          // Add context that this is a video thumbnail
          userContent.push({
            type: 'input_text',
            text: `[Note: The above image is a thumbnail from a video. The customer sent a video message.]`,
          });
        }
      }
    }

    const requestPayload: any = {
      model,
      max_output_tokens: maxOutputTokens,
      input: [
        { role: 'system', content: systemMessage.trim() },
        { role: 'user', content: userContent },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'ai_reply',
          schema,
          strict: true,
        },
      },
      store: true, // Enable stateful context for better multi-turn conversations
    };

    if (supportsTemperature(model)) {
      requestPayload.temperature = temperature;
    }
    if (supportsReasoningEffort(model) && reasoningEffort) {
      requestPayload.reasoning = { effort: reasoningEffort };
    }

    logAiDebug('reply_request', {
      conversationId: conversation._id?.toString(),
      workspaceId: workspaceId.toString(),
      model,
      temperature: supportsTemperature(model) ? temperature : undefined,
      temperatureOmitted: !supportsTemperature(model),
      reasoningEffort: supportsReasoningEffort(model) ? reasoningEffort : undefined,
      maxOutputTokens,
      ragEnabled,
      tone: tone || 'default',
      maxReplySentences,
      historyCount: messages.length,
      attachments: recentCustomerAttachments.length,
      knowledgeItems: knowledgeItems.length,
      knowledgeItemFilter: options.knowledgeItemIds?.length || 0,
      ragMatches: vectorContexts.length,
      ragMatchPreview: ragMatchPreview.length ? ragMatchPreview : undefined,
    });

    requestStart = process.hrtime.bigint();
    const response = await openai.responses.create(requestPayload);
    await logOpenAiUsage({
      workspaceId: String(workspaceId),
      model: response?.model || model,
      usage: response?.usage,
      requestId: response?.id,
    });
    logAiTiming('ai_reply', model, requestStart, true);
    logOpenAiApi('response', summarizeOpenAiResponse(response));

    responseContent = response.output_text || '{}';
    const structured = extractStructuredJson<AIReplyResult>(response);
    const raw = structured || safeParseJson(responseContent);
    logAiDebug('reply_parse', {
      responseChars: responseContent.length,
      usedStructured: Boolean(structured),
      replyPreview: String(raw.replyText || '').trim().slice(0, 160),
      shouldEscalate: Boolean(raw.shouldEscalate),
      tagsCount: Array.isArray(raw.tags) ? raw.tags.length : 0,
    });

    parsed = {
      replyText: String(raw.replyText || '').trim(),
      shouldEscalate: Boolean(raw.shouldEscalate),
      escalationReason: raw.escalationReason ? String(raw.escalationReason).trim() : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
  } catch (error: any) {
    if (requestStart) {
      logAiTiming('ai_reply', model, requestStart, false);
    }
    const details: Record<string, any> = {
      message: error?.message,
      status: error?.status,
      type: error?.error?.type,
    };

    if (error?.error?.message) {
      details.apiMessage = error.error.message;
    }

    if (responseContent) {
      details.partialResponse = responseContent.slice(0, 800);
    }

    requestError = details;
    logOpenAiApi('response_error', details);
    logAiDebug('reply_error', details);
    console.error('AI reply generation failed:', details);
  }

  let reply: AIReplyResult = parsed || {
    replyText: 'Thanks for reaching out! A teammate will follow up shortly.',
    shouldEscalate: true, // Changed from false - fallback should escalate
    escalationReason: 'AI reply generation failed - requires human review',
    tags: ['escalation', 'ai_error'],
  };

  if (reply.replyText && Number.isFinite(maxReplySentences) && maxReplySentences > 0) {
    const sentences = splitIntoSentences(reply.replyText);
    if (sentences.length > maxReplySentences) {
      reply.replyText = sentences.slice(0, maxReplySentences).join(' ').trim();
    }
  }

  if (!parsed) {
    usedFallback = true;
    logAiDebug('reply_fallback', {
      reason: requestError?.message || 'parse_failed',
      responsePreview: responseContent ? responseContent.slice(0, 200) : null,
    });
    console.warn('Falling back to escalation reply after AI generation failure', {
      conversationId: conversation._id?.toString(),
      workspaceId: workspaceId.toString(),
    });
  }

  // Ensure tags include escalation hints
  const tagSet = new Set<string>(reply.tags || []);
  if (reply.shouldEscalate) {
    tagSet.add('escalation');
  }
  reply.tags = Array.from(tagSet).slice(0, 10);

  reply.replyText = postProcessReply({
    text: reply.replyText,
    allowHashtags,
    allowEmojis,
    maxSentences: maxReplySentences,
    lastAiMessage,
  });

  // Final safeguard: never send empty text
  if (!reply.replyText.trim()) {
    reply.replyText = 'Thanks for reaching out! We\'ll be with you shortly';
  }

  reply.knowledgeItemsUsed = knowledgeItemsUsed;

  logAiDebug('reply_generated', {
    conversationId: conversation._id?.toString(),
    workspaceId: workspaceId.toString(),
    model,
    replyConfig: {
      maxReplySentences,
      tone: tone || 'default',
      allowHashtags,
      allowEmojis,
    },
    usedFallback,
    shouldEscalate: reply.shouldEscalate,
    replyPreview: reply.replyText?.slice(0, 120),
  });

  return reply;
}

function postProcessReply(params: {
  text: string;
  allowHashtags: boolean;
  allowEmojis: boolean;
  maxSentences: number;
  lastAiMessage?: string;
}): string {
  const { allowHashtags, allowEmojis, maxSentences, lastAiMessage } = params;
  let text = params.text || '';

  // Remove hashtags if disallowed
  if (!allowHashtags) {
    text = text.replace(/#[\w]+/g, '').replace(/\s{2,}/g, ' ');
  }

  // Remove emojis if disallowed (basic range strip)
  if (!allowEmojis) {
    text = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  }

  // Sentence limit - be more sophisticated about sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let trimmedSentences = sentences.slice(0, Math.max(1, maxSentences));

  // Avoid repetition with previous AI message
  if (lastAiMessage && trimmedSentences.length > 0) {
    const currentFirst = trimmedSentences[0].trim().toLowerCase();
    const previousFirst = lastAiMessage.split(/[.!?]/)[0].trim().toLowerCase();

    // Check if opening phrases are too similar (>70% overlap in first 8 words)
    const currentWords = currentFirst.split(/\s+/).slice(0, 8);
    const previousWords = previousFirst.split(/\s+/).slice(0, 8);
    const overlap = currentWords.filter(w => previousWords.includes(w)).length;
    const similarity = overlap / Math.max(currentWords.length, previousWords.length);

    // If very similar opening (>70%), try to rephrase or skip first sentence
    if (similarity > 0.7 && trimmedSentences.length > 1) {
      trimmedSentences.shift(); // Remove repetitive opening
    }
  }

  // Clean up spacing and return
  return trimmedSentences.join(' ').trim().replace(/\s{2,}/g, ' ');
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
    // remove trailing commas before closing braces/brackets
    .replace(/,\s*([}\]])/g, '$1')
    // collapse duplicate commas that can appear after line breaks
    .replace(/,\s*,/g, ',')
    // replace missing values before a closing brace with null
    .replace(/:\s*(\r?\n)*\s*([}\]])/g, ': null$2')
    .trim();

  // If a property is left dangling at the end (e.g., "targetChannel": ), set it to null
  const danglingField = /"([A-Za-z0-9_]+)"\s*:\s*$/m;
  if (danglingField.test(repaired)) {
    repaired = repaired.replace(danglingField, '"$1": null');
  }

  // Balance braces/brackets if the model response was truncated
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

function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    ar: 'Arabic',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    hi: 'Hindi',
    tr: 'Turkish',
    nl: 'Dutch',
    pl: 'Polish',
    vi: 'Vietnamese',
    th: 'Thai',
    id: 'Indonesian',
    ms: 'Malay',
    tl: 'Filipino',
  };
  return languages[code] || code;
}
