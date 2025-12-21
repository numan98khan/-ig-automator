import { Pool } from 'pg';
import OpenAI from 'openai';
import KnowledgeItem from '../models/KnowledgeItem';

const connectionString = process.env.PGVECTOR_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDINGS_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIMENSION = 1536;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let pool: Pool | null = null;
let initialized = false;
let loggedMissingPg = false;

const getPool = (): Pool | null => {
  if (!connectionString) {
    if (!loggedMissingPg) {
      console.warn('PGVECTOR_URL/POSTGRES_URL/DATABASE_URL not set; vector store disabled.');
      loggedMissingPg = true;
    }
    return null;
  }

  const sslEnabled = process.env.PGSSL === 'true';

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
};

const embeddingToSql = (embedding: number[]) => `[${embedding.join(',')}]`;

const ensureStore = async () => {
  if (initialized) return true;
  const client = getPool();
  if (!client) return false;

  const conn = await client.connect();
  try {
    await conn.query('CREATE EXTENSION IF NOT EXISTS vector');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT,
        content TEXT,
        embedding vector(${EMBEDDING_DIMENSION}),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    initialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize vector store:', error);
    return false;
  } finally {
    conn.release();
  }
};

const embedText = async (text: string): Promise<number[]> => {
  try {
    if (!process.env.OPENAI_API_KEY) return [];
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0]?.embedding || [];
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return [];
  }
};

export interface KnowledgeDocument {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
}

export interface RetrievedContext {
  id: string;
  title: string;
  content: string;
  score: number;
}

export const upsertKnowledgeEmbedding = async (doc: KnowledgeDocument) => {
  try {
    const client = getPool();
    if (!client) return;
    const ready = await ensureStore();
    if (!ready) return;

    const embedding = await embedText(`${doc.title}\n${doc.content}`);
    if (!embedding.length) {
      console.warn('Skipping embedding upsert due to missing embedding result.');
      return;
    }

    await client.query(
      `
        INSERT INTO knowledge_embeddings (id, workspace_id, title, content, embedding, updated_at)
        VALUES ($1, $2, $3, $4, $5::vector, NOW())
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
      `,
      [doc.id, doc.workspaceId, doc.title, doc.content, embeddingToSql(embedding)],
    );
  } catch (error) {
    console.error('Vector upsert failed:', error);
  }
};

export const deleteKnowledgeEmbedding = async (id: string) => {
  try {
    const client = getPool();
    if (!client) return;
    const ready = await ensureStore();
    if (!ready) return;
    await client.query('DELETE FROM knowledge_embeddings WHERE id = $1', [id]);
  } catch (error) {
    console.error('Vector delete failed:', error);
  }
};

export const searchWorkspaceKnowledge = async (workspaceId: string, query: string, topK = 5): Promise<RetrievedContext[]> => {
  try {
    const client = getPool();
    if (!client) return [];
    const ready = await ensureStore();
    if (!ready) return [];

    const queryEmbedding = await embedText(query);
    if (!queryEmbedding.length) return [];

    const result = await client.query(
      `
        SELECT id, title, content, 1 - (embedding <=> $2::vector) AS score
        FROM knowledge_embeddings
        WHERE workspace_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3
      `,
      [workspaceId, embeddingToSql(queryEmbedding), topK],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      score: Number(row.score),
    }));
  } catch (error) {
    console.error('Vector search failed:', error);
    return [];
  }
};

export const reindexWorkspaceKnowledge = async (workspaceId: string) => {
  const items = await KnowledgeItem.find({
    workspaceId,
    $or: [{ storageMode: { $exists: false } }, { storageMode: 'vector' }],
  });
  for (const item of items) {
    await upsertKnowledgeEmbedding({
      id: item._id.toString(),
      workspaceId,
      title: item.title,
      content: item.content,
    });
  }
};
