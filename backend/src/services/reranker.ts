import OpenAI from 'openai';
import { getLogSettingsSnapshot } from './adminLogSettingsService';

export type RerankCandidate = {
  id: string;
  title: string;
  content: string;
  score: number;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_EMBEDDINGS_MODEL = 'text-embedding-3-small';
let loggedMissingEmbeddingsModel = false;

const getDurationMs = (startNs: bigint) => Number(process.hrtime.bigint() - startNs) / 1e6;
const logAiTiming = (label: string, model: string | undefined, startNs: bigint, success: boolean) => {
  if (!getLogSettingsSnapshot().aiTimingEnabled) return;
  const ms = getDurationMs(startNs);
  console.log('[AI] timing', { label, model, ms: Number(ms.toFixed(2)), success });
};

const embedTexts = async (texts: string[]): Promise<number[][]> => {
  if (!process.env.OPENAI_API_KEY) return [];
  const envModel = process.env.OPENAI_EMBEDDINGS_MODEL;
  const model = envModel || DEFAULT_EMBEDDINGS_MODEL;
  if (!envModel && !loggedMissingEmbeddingsModel) {
    console.warn('OPENAI_EMBEDDINGS_MODEL not set; using default embeddings model.');
    loggedMissingEmbeddingsModel = true;
  }
  let requestStart: bigint | null = null;
  try {
    requestStart = process.hrtime.bigint();
    const response = await openai.embeddings.create({
      model,
      input: texts,
    });
    logAiTiming('rerank_embeddings', model, requestStart, true);
    return response.data.map((item) => item.embedding || []);
  } catch (error) {
    if (requestStart) {
      logAiTiming('rerank_embeddings', model, requestStart, false);
    }
    console.error('Reranker embeddings failed:', error);
    return [];
  }
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const rerankCandidates = async (
  query: string,
  candidates: RerankCandidate[],
  topK?: number,
): Promise<RerankCandidate[]> => {
  if (!candidates.length) return [];
  const limit = typeof topK === 'number' && topK > 0 ? topK : candidates.length;
  if (!process.env.OPENAI_API_KEY) {
    return [...candidates].slice(0, limit);
  }

  try {
    const texts = [query, ...candidates.map((candidate) => `${candidate.title}\n${candidate.content}`)];
    const embeddings = await embedTexts(texts);
    if (embeddings.length !== texts.length) {
      return [...candidates].slice(0, limit);
    }

    const [queryEmbedding, ...candidateEmbeddings] = embeddings;
    const reranked = candidates.map((candidate, index) => {
      const similarity = cosineSimilarity(queryEmbedding, candidateEmbeddings[index] || []);
      return {
        ...candidate,
        score: Number.isFinite(similarity) && similarity !== 0 ? similarity : candidate.score,
      };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, limit);
  } catch (error) {
    console.error('Reranking failed:', error);
    return [...candidates].slice(0, limit);
  }
};
