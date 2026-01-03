import { postgresQuery } from '../../db/postgres';
import { generateObjectId } from '../../db/objectId';

export interface CoreWorkspace {
  _id: string;
  name: string;
  userId: string;
  billingAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mapWorkspaceRow = (row: any): CoreWorkspace => ({
  _id: row.id,
  name: row.name,
  userId: row.user_id,
  billingAccountId: row.billing_account_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getWorkspaceById = async (id: string) => {
  const result = await postgresQuery('SELECT * FROM core.workspaces WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? mapWorkspaceRow(row) : null;
};

export const getWorkspaceByUserId = async (userId: string) => {
  const result = await postgresQuery('SELECT * FROM core.workspaces WHERE user_id = $1', [userId]);
  const row = result.rows[0];
  return row ? mapWorkspaceRow(row) : null;
};

export const listWorkspacesByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const result = await postgresQuery('SELECT * FROM core.workspaces WHERE id = ANY($1)', [ids]);
  return result.rows.map(mapWorkspaceRow);
};

export const listWorkspacesByUserId = async (userId: string) => {
  const result = await postgresQuery('SELECT * FROM core.workspaces WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows.map(mapWorkspaceRow);
};

export const listWorkspaces = async (options?: { search?: string; limit?: number; offset?: number }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  params.push(limit);
  params.push(offset);
  const result = await postgresQuery(
    `SELECT * FROM core.workspaces ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(mapWorkspaceRow);
};

export const countWorkspaces = async (options?: { search?: string }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await postgresQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM core.workspaces ${whereClause}`,
    params
  );
  return parseInt(result.rows[0]?.count || '0', 10);
};

export const listAllWorkspaceIds = async () => {
  const result = await postgresQuery('SELECT id FROM core.workspaces');
  return result.rows.map((row: any) => row.id as string);
};

export const createWorkspace = async (data: { name: string; userId: string; billingAccountId?: string | null }) => {
  const id = generateObjectId();
  const result = await postgresQuery(
    `INSERT INTO core.workspaces (id, name, user_id, billing_account_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [id, data.name, data.userId, data.billingAccountId ?? null]
  );
  return mapWorkspaceRow(result.rows[0]);
};

export const upsertWorkspaceFromLegacy = async (legacyWorkspace: {
  _id: string;
  name: string;
  userId: string;
  billingAccountId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}) => {
  const result = await postgresQuery(
    `INSERT INTO core.workspaces (id, name, user_id, billing_account_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      user_id = EXCLUDED.user_id,
      billing_account_id = EXCLUDED.billing_account_id,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      legacyWorkspace._id,
      legacyWorkspace.name,
      legacyWorkspace.userId,
      legacyWorkspace.billingAccountId ?? null,
      legacyWorkspace.createdAt ?? new Date(),
      legacyWorkspace.updatedAt ?? legacyWorkspace.createdAt ?? new Date(),
    ]
  );
  return mapWorkspaceRow(result.rows[0]);
};
