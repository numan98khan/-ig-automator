import OpenAI from 'openai';
import mongoose from 'mongoose';
import { IConversation } from '../models/Conversation';
import Message from '../models/Message';
import KnowledgeItem from '../models/KnowledgeItem';
import CategoryKnowledge from '../models/CategoryKnowledge';
import MessageCategory from '../models/MessageCategory';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AIReplyOptions {
  conversation: IConversation;
  workspaceId: mongoose.Types.ObjectId | string;
  latestCustomerMessage?: string;
  categoryId?: mongoose.Types.ObjectId | string;
  defaultLanguage?: string;
  categorization?: { categoryName?: string; detectedLanguage?: string; translatedText?: string };
  historyLimit?: number;
}

/**
 * Centralized AI reply generator used by manual and automated flows.
 * Builds context from conversation history, general knowledge, optional category knowledge,
 * and language preferences before calling OpenAI.
 */
export async function generateAIReply(options: AIReplyOptions): Promise<string> {
  const {
    conversation,
    workspaceId,
    latestCustomerMessage,
    categoryId,
    defaultLanguage,
    categorization,
    historyLimit = 10,
  } = options;

  // Fetch recent conversation history
  const messages = await Message.find({ conversationId: conversation._id })
    .sort({ createdAt: -1 })
    .limit(historyLimit);
  messages.reverse();

  // Gather knowledge base
  const knowledgeItems = await KnowledgeItem.find({ workspaceId });

  let knowledgeContext = '';
  if (knowledgeItems.length > 0) {
    knowledgeContext += '\n\nGeneral Knowledge Base:\n';
    knowledgeContext += knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n');
  }

  // Category-specific context (if available)
  let categoryName: string | undefined;
  if (categoryId) {
    const [categoryKnowledge, category] = await Promise.all([
      CategoryKnowledge.findOne({ workspaceId, categoryId }),
      MessageCategory.findById(categoryId),
    ]);

    categoryName = category?.nameEn;
    if (categoryKnowledge?.content) {
      knowledgeContext += `\n\nInstructions for "${category?.nameEn || 'this category'}" messages:\n`;
      knowledgeContext += categoryKnowledge.content;
    }
  }

  // Build conversation history text
  const conversationHistory = messages.map((msg: any) => {
    const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'Business';
    return `${role}: ${msg.text}`;
  }).join('\n');

  // Determine the latest customer message to emphasize
  const recentCustomerText =
    latestCustomerMessage ||
    [...messages].reverse().find((msg: any) => msg.from === 'customer')?.text ||
    '';

  const languageInstruction = defaultLanguage && defaultLanguage !== 'en'
    ? `\nIMPORTANT: Always respond in ${getLanguageName(defaultLanguage)}.`
    : '';

  const prompt = `You are an AI assistant for a business's Instagram inbox. Your job is to help respond to customer messages professionally and helpfully.
${knowledgeContext}

${categoryName || categorization?.categoryName ? `Message Category: ${categoryName || categorization?.categoryName}` : ''}
${categorization?.detectedLanguage ? `Customer's Language: ${getLanguageName(categorization.detectedLanguage)}` : ''}
${categorization?.translatedText ? `Translated message (English): "${categorization.translatedText}"` : ''}${languageInstruction}

Conversation History:
${conversationHistory || 'No prior messages.'}

Latest Customer Message: "${recentCustomerText}"

Based on the conversation history, knowledge base, and any category instructions, generate a concise, friendly, and helpful reply.

Response:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 250,
  });

  const aiResponse = completion.choices[0].message.content?.trim();
  if (!aiResponse) {
    throw new Error('AI returned an empty response');
  }

  return aiResponse;
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
