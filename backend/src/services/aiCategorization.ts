import OpenAI from 'openai';
import MessageCategory, { DEFAULT_CATEGORIES } from '../models/MessageCategory';
import mongoose from 'mongoose';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CategorizationResult {
  categoryName: string;
  detectedLanguage: string;
  translatedText?: string;
  confidence: number;
}

/**
 * Detect language and categorize a message using OpenAI
 */
export async function categorizeMessage(
  messageText: string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<CategorizationResult> {
  try {
    const categories = await MessageCategory.find({ workspaceId });
    const categoryMeta = (categories.length > 0 ? categories : DEFAULT_CATEGORIES).map(cat => ({
      name: cat.nameEn,
      description: cat.descriptionEn || '',
      examples: (cat.exampleMessages || []).slice(0, 3),
    }));

    const categoryNames = categoryMeta.map(c => c.name);

    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        detectedLanguage: { type: 'string', description: 'ISO 639-1 code' },
        categoryName: { type: 'string', description: 'Must be one of the provided categories' },
        translatedText: { type: ['string', 'null'], description: 'English translation if message not in English' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['detectedLanguage', 'categoryName', 'translatedText', 'confidence'],
    };

    const categoriesText = categoryMeta.map(cat => {
      const examplesText = cat.examples.length > 0 ? ` Examples: ${cat.examples.join(' | ')}` : '';
      return `- ${cat.name}: ${cat.description || 'No description.'}${examplesText}`;
    }).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'Classify Instagram DMs for a business. Choose the best category and detect language. Return structured JSON only.',
        },
        {
          role: 'user',
          content: `Categories:\n${categoriesText}\n\nCustomer message:\n"""${messageText}"""\nReturn detectedLanguage, categoryName (must be from the list), translatedText (English translation or null if already English), and confidence (0-1).`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'categorization_result',
          schema,
          strict: true,
        },
      },
    });

    const responseText = completion.choices[0].message.content?.trim() || '{}';

    let result: CategorizationResult = {
      categoryName: 'General',
      detectedLanguage: 'en',
      translatedText: undefined,
      confidence: 0.0,
    };

    try {
      const parsed = JSON.parse(responseText);
      result = {
        categoryName: parsed.categoryName || 'General',
        detectedLanguage: parsed.detectedLanguage || 'en',
        translatedText: parsed.translatedText || undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (parseError) {
      console.error('Failed to parse categorization response:', responseText);
    }

    if (!categoryNames.includes(result.categoryName)) {
      result.categoryName = 'General';
    }

    // Confidence clamp for short or weakly-described categories
    let confidence = result.confidence ?? 0.5;
    const trimmedLength = messageText.trim().length;
    if (trimmedLength < 20) {
      confidence = Math.min(confidence, 0.45);
    }

    const categoryInfo = categoryMeta.find(c => c.name === result.categoryName);
    const genericDescription = !categoryInfo?.description || categoryInfo.description.length < 30;
    if (genericDescription) {
      confidence = Math.min(confidence, 0.6);
    }

    result.confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
    return result;
  } catch (error) {
    console.error('Error categorizing message:', error);
    return {
      categoryName: 'General',
      detectedLanguage: 'en',
      confidence: 0.0,
    };
  }
}

/**
 * Detect language only (lighter operation)
 */
export async function detectLanguage(messageText: string): Promise<string> {
  try {
    const prompt = `Detect the language of the following text and respond with ONLY the ISO 639-1 language code (e.g., "en", "ar", "es", "fr", "de"):

"${messageText}"`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    });

    const languageCode = completion.choices[0].message.content?.trim().toLowerCase() || 'en';

    // Validate it's a reasonable ISO code (2 letters)
    if (/^[a-z]{2}$/.test(languageCode)) {
      return languageCode;
    }
    return 'en';
  } catch (error) {
    console.error('Error detecting language:', error);
    return 'en';
  }
}

/**
 * Initialize default categories for a workspace
 */
export async function initializeDefaultCategories(
  workspaceId: mongoose.Types.ObjectId | string
): Promise<void> {
  try {
    // Check if categories already exist
    const existingCount = await MessageCategory.countDocuments({ workspaceId });
    if (existingCount > 0) {
      return;
    }

    // Create default categories
    const categoriesToCreate = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      workspaceId,
    }));

    await MessageCategory.insertMany(categoriesToCreate);
  } catch (error) {
    console.error('Error initializing default categories:', error);
    throw error;
  }
}

/**
 * Get or create a category by name
 */
export async function getOrCreateCategory(
  workspaceId: mongoose.Types.ObjectId | string,
  categoryName: string
): Promise<mongoose.Types.ObjectId> {
  // Try to find existing category
  let category = await MessageCategory.findOne({
    workspaceId,
    nameEn: categoryName,
  });

  if (!category) {
    // Create new category
    category = await MessageCategory.create({
      workspaceId,
      nameEn: categoryName,
      isSystem: false,
    });
  }

  return category._id as mongoose.Types.ObjectId;
}

/**
 * Update message count for a category
 */
export async function incrementCategoryCount(categoryId: mongoose.Types.ObjectId): Promise<void> {
  await MessageCategory.findByIdAndUpdate(categoryId, {
    $inc: { messageCount: 1 },
  });
}
