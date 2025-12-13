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
    // Get available categories for the workspace
    const categories = await MessageCategory.find({ workspaceId });
    const categoryNames = categories.length > 0
      ? categories.map(c => c.nameEn)
      : DEFAULT_CATEGORIES.map(c => c.nameEn);

    const prompt = `You are a message classifier for a business inbox. Analyze the following customer message and provide:
1. The detected language (ISO 639-1 code, e.g., "en", "ar", "es", "fr", "de")
2. The most appropriate category from the list
3. If the message is NOT in English, provide an English translation
4. A confidence score (0.0 to 1.0)

Available categories: ${categoryNames.join(', ')}

Customer message:
"${messageText}"

Respond in JSON format only:
{
  "detectedLanguage": "ISO language code",
  "categoryName": "Category name from the list",
  "translatedText": "English translation if not English, otherwise null",
  "confidence": 0.0 to 1.0
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const responseText = completion.choices[0].message.content?.trim() || '{}';

    // Parse JSON response
    let result: CategorizationResult;
    try {
      // Handle potential markdown code blocks
      const jsonText = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      result = {
        categoryName: parsed.categoryName || 'General',
        detectedLanguage: parsed.detectedLanguage || 'en',
        translatedText: parsed.translatedText || undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      };
    } catch (parseError) {
      console.error('Failed to parse categorization response:', responseText);
      result = {
        categoryName: 'General',
        detectedLanguage: 'en',
        confidence: 0.0,
      };
    }

    // Validate category name exists
    if (!categoryNames.includes(result.categoryName)) {
      result.categoryName = 'General';
    }

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
      model: 'gpt-3.5-turbo',
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
      console.log(`Categories already exist for workspace ${workspaceId}`);
      return;
    }

    // Create default categories
    const categoriesToCreate = DEFAULT_CATEGORIES.map(cat => ({
      ...cat,
      workspaceId,
    }));

    await MessageCategory.insertMany(categoriesToCreate);
    console.log(`Created ${categoriesToCreate.length} default categories for workspace ${workspaceId}`);
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
    console.log(`Created new category "${categoryName}" for workspace ${workspaceId}`);
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
