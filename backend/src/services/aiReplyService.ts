import OpenAI from 'openai';
import mongoose from 'mongoose';
import { IConversation } from '../models/Conversation';
import Message from '../models/Message';
import KnowledgeItem from '../models/KnowledgeItem';
import CategoryKnowledge from '../models/CategoryKnowledge';
import MessageCategory from '../models/MessageCategory';
import WorkspaceSettings from '../models/WorkspaceSettings';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIReplyResult {
  replyText: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  tags?: string[];
}

export interface AIReplyOptions {
  conversation: IConversation;
  workspaceId: mongoose.Types.ObjectId | string;
  latestCustomerMessage?: string;
  categoryId?: mongoose.Types.ObjectId | string;
  categorization?: { categoryName?: string; detectedLanguage?: string; translatedText?: string };
  historyLimit?: number;
}

/**
 * Centralized AI reply generator used by manual and automated flows.
 * Returns structured data with escalation and tagging signals.
 */
export async function generateAIReply(options: AIReplyOptions): Promise<AIReplyResult> {
  const {
    conversation,
    workspaceId,
    latestCustomerMessage,
    categoryId,
    categorization,
    historyLimit = 10,
  } = options;

  const [messages, knowledgeItems, workspaceSettings] = await Promise.all([
    Message.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(historyLimit),
    KnowledgeItem.find({ workspaceId }),
    WorkspaceSettings.findOne({ workspaceId }),
  ]);
  messages.reverse();

  const [categoryKnowledge, category] = categoryId
    ? await Promise.all([
        CategoryKnowledge.findOne({ workspaceId, categoryId }),
        MessageCategory.findById(categoryId),
      ])
    : [null, null];

  const categoryName = category?.nameEn || categorization?.categoryName;
  const aiPolicy = category?.aiPolicy || 'assist_only';
  const decisionMode = workspaceSettings?.decisionMode || 'assist';
  const allowHashtags = workspaceSettings?.allowHashtags ?? false;
  const allowEmojis = workspaceSettings?.allowEmojis ?? true;
  const maxReplySentences = workspaceSettings?.maxReplySentences || 3;
  const replyLanguage = workspaceSettings?.defaultReplyLanguage || workspaceSettings?.defaultLanguage || categorization?.detectedLanguage || 'en';

  // Build knowledge context
  let knowledgeContext = '';
  if (knowledgeItems.length > 0) {
    knowledgeContext += '\nGeneral Knowledge Base:\n';
    knowledgeContext += knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n');
  }

  if (categoryKnowledge?.content) {
    knowledgeContext += `\n\nCategory Guidance (${category?.nameEn || 'Unspecified'}):\n${categoryKnowledge.content}`;
  }

  // Category metadata for model
  const categoryPolicyText = `Category Policy: ${aiPolicy}. ${category?.escalationNote ? `Note: ${category.escalationNote}` : ''}`;

  const workspacePolicyText = `Workspace decision mode: ${decisionMode}. ${
    workspaceSettings?.escalationGuidelines ? `Escalation guidelines: ${workspaceSettings.escalationGuidelines}` : ''
  } ${
    workspaceSettings?.escalationExamples?.length
      ? `Escalation examples: ${workspaceSettings.escalationExamples.join(' | ')}`
      : ''
  }`;

  // Build conversation history
  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    return `${role}: ${msg.text}`;
  }).join('\n');

  const recentCustomerText =
    latestCustomerMessage ||
    [...messages].reverse().find((msg: any) => msg.from === 'customer')?.text ||
    '';

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
    required: ['replyText', 'shouldEscalate'],
  };

  const systemMessage = `
You are an AI assistant for a business inbox.
Global rules:
- Obey workspace and category policies.
- Never promise discounts, prices, contracts, or special deals unless policies explicitly allow it.
- Replies must be concise (1-3 sentences, ~60-80 words max).
- Avoid repeated questions or duplicated phrasing.
- Only use hashtags if allowed; only use emojis if allowed.
- Choose shouldEscalate=true when policy or situation indicates human involvement.
- Respond in ${getLanguageName(replyLanguage)}.`;

  const userMessage = `
Workspace policy: ${workspacePolicyText}
Hashtags allowed: ${allowHashtags}. Emojis allowed: ${allowEmojis}. Max sentences: ${maxReplySentences}.
Category: ${categoryName || 'General'}.
${categoryPolicyText}
Customer language: ${categorization?.detectedLanguage || 'unknown'}; Reply language: ${replyLanguage}.
${categorization?.translatedText ? `Translated message (English): "${categorization.translatedText}"` : ''}
${knowledgeContext ? `\n${knowledgeContext}\n` : ''}
Conversation history:
${conversationHistory || 'No prior messages.'}

Latest customer message:
"${recentCustomerText}"

Return JSON with: replyText, shouldEscalate (boolean), escalationReason (string if escalated), tags (string array).`;

  let parsed: AIReplyResult | null = null;

  try {
    console.log('🤖 Calling OpenAI API for AI reply generation...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 220,
      messages: [
        { role: 'system', content: systemMessage.trim() },
        { role: 'user', content: userMessage.trim() },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ai_reply',
          schema,
          strict: true,
        },
      },
    });

    const content = completion.choices[0].message.content || '{}';
    console.log('✅ OpenAI response received:', content);
    const raw = JSON.parse(content);
    parsed = {
      replyText: String(raw.replyText || '').trim(),
      shouldEscalate: Boolean(raw.shouldEscalate),
      escalationReason: raw.escalationReason ? String(raw.escalationReason).trim() : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
    console.log('✅ Parsed AI reply:', parsed);
  } catch (error: any) {
    console.error('❌ Failed to generate AI reply:', {
      error: error.message,
      stack: error.stack,
      openaiKey: process.env.OPENAI_API_KEY ? 'Set (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'NOT SET',
    });
  }

  let reply: AIReplyResult = parsed || {
    replyText: 'Thanks for reaching out! A teammate will follow up shortly.',
    shouldEscalate: true, // Changed from false - fallback should escalate
    escalationReason: 'AI reply generation failed - requires human review',
    tags: ['escalation', 'ai_error'],
  };

  // Enforce policy-based escalation
  if (aiPolicy === 'escalate') {
    reply.shouldEscalate = true;
    reply.escalationReason = reply.escalationReason || category?.escalationNote || 'Category requires human review';
    reply.replyText = ensureEscalationTone(reply.replyText);
  } else if (aiPolicy === 'assist_only' && decisionMode === 'info_only') {
    reply.shouldEscalate = true;
    reply.escalationReason = reply.escalationReason || 'Decision mode prefers human review for this category';
  }

  // Ensure tags include category + escalation hints
  const tagSet = new Set<string>(reply.tags || []);
  if (categoryName) {
    tagSet.add(categoryName.toLowerCase().replace(/\s+/g, '_'));
  }
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
    reply.replyText = 'Thanks for reaching out! A teammate will follow up shortly.';
  }

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

  // Sentence limit
  const sentences = text.match(/[^.!?]+[.!?]?/g) || [text];
  const trimmedSentences = sentences.slice(0, Math.max(1, maxSentences));

  // Avoid obvious repetition with previous AI message
  if (lastAiMessage && trimmedSentences.length > 1) {
    const currentStart = trimmedSentences[0].trim().toLowerCase();
    const previousStart = lastAiMessage.split(/\s+/).slice(0, 6).join(' ').toLowerCase();
    if (previousStart && currentStart.startsWith(previousStart)) {
      trimmedSentences.shift();
    }
  }

  return trimmedSentences.join(' ').trim();
}

function ensureEscalationTone(text: string): string {
  const base = text && text.length > 0 ? text : 'Thanks for your message. A specialist will follow up shortly.';
  const escalationNotice = 'A human teammate will review this and respond soon.';
  if (base.toLowerCase().includes('human') || base.toLowerCase().includes('teammate')) {
    return base;
  }
  return `${base} ${escalationNotice}`.trim();
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
