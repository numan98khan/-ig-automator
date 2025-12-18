import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface TranscriptionOptions {
  model?: 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe' | 'whisper-1';
  prompt?: string;
  temperature?: number;
}

/**
 * Transcribe an audio file from a URL using OpenAI's transcription API.
 * Supports mixed-language voice notes (English + Arabic/Urdu/etc).
 *
 * @param audioUrl - URL to the audio file
 * @param options - Transcription options
 * @returns Transcribed text
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  options: TranscriptionOptions = {}
): Promise<string> {
  try {
    const {
      model = 'gpt-4o-mini-transcribe', // Best cost/latency for mixed languages
      prompt = 'This audio may contain multiple languages including English, Arabic, Urdu, and others. Please transcribe exactly as spoken, preserving all languages.',
      temperature = 0.0, // Use 0 for most accurate transcription
    } = options;

    console.log(`🎤 Transcribing audio from: ${audioUrl.substring(0, 100)}...`);

    // Download the audio file from the URL
    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
    });

    const audioBuffer = Buffer.from(response.data);
    console.log(`📥 Downloaded audio file: ${audioBuffer.length} bytes`);

    // Determine file extension from URL or content-type
    const contentType = response.headers['content-type'] || '';
    let extension = 'mp4'; // Default for Instagram voice notes

    if (contentType.includes('mpeg')) {
      extension = 'mp3';
    } else if (contentType.includes('ogg')) {
      extension = 'ogg';
    } else if (contentType.includes('wav')) {
      extension = 'wav';
    } else if (contentType.includes('webm')) {
      extension = 'webm';
    } else if (contentType.includes('m4a')) {
      extension = 'm4a';
    }

    // For gpt-4o-transcribe and gpt-4o-mini-transcribe, we need to use the file object
    // OpenAI SDK expects a File-like object
    const audioFile = new File(
      [audioBuffer],
      `audio.${extension}`,
      { type: contentType || 'audio/mp4' }
    );

    console.log(`🔄 Sending to OpenAI (model: ${model})...`);

    // Call OpenAI's transcription API
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: model,
      prompt: prompt,
      temperature: temperature,
      response_format: 'text', // Get plain text response
    });

    const transcribedText = typeof transcription === 'string'
      ? transcription
      : (transcription as any).text || '';

    console.log(`✅ Transcription complete: ${transcribedText.substring(0, 100)}...`);

    return transcribedText.trim();
  } catch (error: any) {
    console.error('❌ Transcription failed:', error.message);

    // Return a fallback message if transcription fails
    if (error.response?.status === 400) {
      console.error('Bad request - audio format may not be supported');
    } else if (error.response?.status === 413) {
      console.error('Audio file too large');
    }

    throw new Error(`Transcription failed: ${error.message}`);
  }
}

/**
 * Transcribe audio with automatic language detection and translation.
 * If the audio is not in English, also returns a translation.
 *
 * @param audioUrl - URL to the audio file
 * @returns Object with transcription and optional translation
 */
export async function transcribeAndTranslate(
  audioUrl: string
): Promise<{ transcription: string; translation?: string; detectedLanguage?: string }> {
  try {
    // First, transcribe the audio
    const transcription = await transcribeAudioFromUrl(audioUrl, {
      model: 'gpt-4o-mini-transcribe',
      prompt: 'This audio may contain multiple languages including English, Arabic, Urdu, Hindi, Spanish, French, and others. Please transcribe exactly as spoken, preserving all languages.',
    });

    // If transcription is empty or very short, return early
    if (!transcription || transcription.length < 3) {
      return { transcription: transcription || '[Empty audio]' };
    }

    // Use OpenAI to detect language and translate if needed
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: `Analyze this transcribed text and:
1. Detect the primary language (ISO 639-1 code)
2. If it's not English, provide an English translation
3. If it's already English, set translation to null

Transcribed text: "${transcription}"

Return JSON with: { "detectedLanguage": "xx", "translation": "..." or null }`,
      text: {
        format: {
          type: 'json_schema',
          name: 'language_detection',
          schema: {
            type: 'object',
            properties: {
              detectedLanguage: { type: 'string' },
              translation: { type: ['string', 'null'] },
            },
            required: ['detectedLanguage', 'translation'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      temperature: 0.1,
      max_output_tokens: 500,
      store: false,
    });

    const structured = extractStructuredJson<{ detectedLanguage?: string; translation?: string | null }>(response);
    const result = structured || safeParseJson(response.output_text || '{}');

    return {
      transcription,
      translation: result.translation || undefined,
      detectedLanguage: result.detectedLanguage || 'en',
    };
  } catch (error: any) {
    console.error('Error in transcribeAndTranslate:', error.message);
    throw error;
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

function safeParseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse JSON content', content);
    return {};
  }
}
