import { Pool } from 'pg';

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
let pool: Pool | null = null;

export const getPostgresPool = (): Pool => {
  if (!pool) {
    if (!connectionString) {
      throw new Error('POSTGRES_URL/DATABASE_URL is not set');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
};

export const postgresQuery = async <T = any>(text: string, params?: any[]) => {
  const pgPool = getPostgresPool();
  return pgPool.query<T>(text, params);
};

export const closePostgresPool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};
