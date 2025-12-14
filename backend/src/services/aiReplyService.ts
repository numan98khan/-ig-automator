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

  // Build conversation history with media context
  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    let text = `${role}: ${msg.text}`;

    // Add media context to conversation history
    if (msg.attachments && msg.attachments.length > 0) {
      const mediaTypes = msg.attachments.map((a: any) => a.type).join(', ');
      text += ` [Sent ${mediaTypes}]`;
    }

    return text;
  }).join('\n');

  const recentCustomerMessage = [...messages].reverse().find((msg: any) => msg.from === 'customer');
  const recentCustomerText =
    latestCustomerMessage ||
    recentCustomerMessage?.text ||
    '';

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

Global rules that ALWAYS apply:
- Strictly obey workspace and category policies provided in the context.
- NEVER promise discounts, prices, contracts, special deals, or commitments unless the business's knowledge base explicitly authorizes you to do so.
- Keep replies short and natural: 1–3 sentences, maximum 60–80 words.
- Be helpful and professional, but not overly salesy or full of marketing fluff.
- Avoid asking the same question twice in the same conversation.
- Do not repeat the opening phrase from your previous reply if there is one.
- Only use hashtags if the business allows them AND the customer used hashtags first.
- Use emojis only if the business allows them.
- When policy or situation is complex/risky/high-stakes, set shouldEscalate=true so a human can handle it.
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
Workspace decision mode: ${decisionMode}
- full_auto: AI can answer most things confidently within knowledge base
- assist: AI should help but be cautious on complex/risky topics
- info_only: AI should be very conservative and escalate more often

Workspace rules:
- Hashtags allowed: ${allowHashtags}
- Emojis allowed: ${allowEmojis}
- Max sentences: ${maxReplySentences}
- Default reply language: ${getLanguageName(replyLanguage)}
${workspaceSettings?.escalationGuidelines ? `- Escalation guidelines: ${workspaceSettings.escalationGuidelines}` : ''}
${workspaceSettings?.escalationExamples?.length ? `- Escalation examples: ${workspaceSettings.escalationExamples.join(' | ')}` : ''}

KNOWLEDGE BASE:
${knowledgeContext || 'No specific knowledge provided. Use general business courtesy.'}

CURRENT MESSAGE CATEGORY: ${categoryName || 'General'}
Category policy: ${aiPolicy}
${aiPolicy === 'full_auto' ? '→ Safe to answer completely if you have the information.' : ''}
${aiPolicy === 'assist_only' ? '→ Help informationally, but do NOT commit to prices, discounts, contracts, or binding decisions.' : ''}
${aiPolicy === 'escalate' ? '→ ALWAYS escalate to human. Acknowledge request politely, state a human will follow up, do not make commitments.' : ''}
${category?.escalationNote ? `Note: ${category.escalationNote}` : ''}

CONVERSATION CONTEXT:
Customer language detected: ${categorization?.detectedLanguage || 'unknown'}
${categorization?.translatedText ? `(Translated to English: "${categorization.translatedText}")` : ''}
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
- tags: semantic labels like ["pricing", "bulk_request", "urgent", "complaint"] to help categorize this interaction`;

  let parsed: AIReplyResult | null = null;

  try {
    // Build user message content (text + images if present)
    const userContent: any[] = [
      { type: 'text', text: userMessage.trim() },
    ];

    // Add image attachments to the message for vision analysis
    if (recentCustomerAttachments.length > 0) {
      for (const attachment of recentCustomerAttachments) {
        // Only add image and video types (GPT-4 Vision supports these)
        if (attachment.type === 'image') {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: attachment.url,
              detail: 'auto', // 'low', 'high', or 'auto'
            },
          });
        }
        // Note: For videos, we could add the thumbnail or first frame
        else if (attachment.type === 'video' && (attachment.thumbnailUrl || attachment.previewUrl)) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: attachment.thumbnailUrl || attachment.previewUrl,
              detail: 'auto',
            },
          });
          // Add context that this is a video thumbnail
          userContent.push({
            type: 'text',
            text: `[Note: The above image is a thumbnail from a video. The customer sent a video message.]`,
          });
        }
      }
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 220,
      messages: [
        { role: 'system', content: systemMessage.trim() },
        { role: 'user', content: userContent },
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
    const raw = JSON.parse(content);
    parsed = {
      replyText: String(raw.replyText || '').trim(),
      shouldEscalate: Boolean(raw.shouldEscalate),
      escalationReason: raw.escalationReason ? String(raw.escalationReason).trim() : undefined,
      tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t).trim()).filter(Boolean) : [],
    };
  } catch (error: any) {
    console.error('AI reply generation failed:', error.message);
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
