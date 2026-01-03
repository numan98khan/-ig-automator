import { postgresQuery } from '../../db/postgres';
import { generateObjectId } from '../../db/objectId';
import { TierLimits, TierStatus } from '../../models/Tier';

export interface CoreTier {
  _id: string;
  name: string;
  description?: string;
  limits: TierLimits;
  isDefault: boolean;
  isCustom: boolean;
  status: TierStatus;
  createdAt: Date;
  updatedAt: Date;
}

const mapTierRow = (row: any): CoreTier => ({
  _id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  limits: row.limits ?? {},
  isDefault: row.is_default,
  isCustom: row.is_custom,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listTiers = async (options?: { search?: string; status?: string; limit?: number; offset?: number }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (options?.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  params.push(limit);
  params.push(offset);
  const result = await postgresQuery(
    `SELECT * FROM core.tiers ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(mapTierRow);
};

export const countTiers = async (options?: { search?: string; status?: string }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  if (options?.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await postgresQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM core.tiers ${whereClause}`, params);
  return parseInt(result.rows[0]?.count || '0', 10);
};

export const getTierById = async (id: string) => {
  const result = await postgresQuery('SELECT * FROM core.tiers WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? mapTierRow(row) : null;
};

export const getTierByName = async (name: string) => {
  const result = await postgresQuery('SELECT * FROM core.tiers WHERE name = $1', [name]);
  const row = result.rows[0];
  return row ? mapTierRow(row) : null;
};

export const getDefaultActiveTier = async () => {
  const result = await postgresQuery(
    "SELECT * FROM core.tiers WHERE is_default = TRUE AND status = 'active' ORDER BY created_at DESC LIMIT 1"
  );
  const row = result.rows[0];
  return row ? mapTierRow(row) : null;
};

export const getFirstActiveTier = async () => {
  const result = await postgresQuery("SELECT * FROM core.tiers WHERE status = 'active' ORDER BY created_at DESC LIMIT 1");
  const row = result.rows[0];
  return row ? mapTierRow(row) : null;
};

export const listTiersByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const result = await postgresQuery('SELECT * FROM core.tiers WHERE id = ANY($1)', [ids]);
  return result.rows.map(mapTierRow);
};

const clearDefaultTier = async (excludeId?: string) => {
  if (excludeId) {
    await postgresQuery('UPDATE core.tiers SET is_default = FALSE WHERE id <> $1', [excludeId]);
  } else {
    await postgresQuery('UPDATE core.tiers SET is_default = FALSE');
  }
};

export const createTier = async (data: Partial<CoreTier>) => {
  const id = generateObjectId();
  if (data.isDefault) {
    await clearDefaultTier(id);
  }
  const result = await postgresQuery(
    `INSERT INTO core.tiers (id, name, description, limits, is_default, is_custom, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      id,
      data.name,
      data.description ?? null,
      JSON.stringify(data.limits || {}),
      data.isDefault ?? false,
      data.isCustom ?? false,
      data.status ?? 'active',
    ]
  );
  return mapTierRow(result.rows[0]);
};

export const updateTier = async (id: string, updates: Partial<CoreTier>) => {
  const fields: string[] = [];
  const params: any[] = [];

  const setField = (column: string, value: any) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if ('name' in updates && updates.name) setField('name', updates.name);
  if ('description' in updates) setField('description', updates.description ?? null);
  if ('limits' in updates) setField('limits', JSON.stringify(updates.limits || {}));
  if ('isDefault' in updates && typeof updates.isDefault === 'boolean') setField('is_default', updates.isDefault);
  if ('isCustom' in updates && typeof updates.isCustom === 'boolean') setField('is_custom', updates.isCustom);
  if ('status' in updates && updates.status) setField('status', updates.status);

  if (fields.length === 0) {
    return getTierById(id);
  }

  if (updates.isDefault) {
    await clearDefaultTier(id);
  }

  params.push(id);
  const result = await postgresQuery(
    `UPDATE core.tiers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  const row = result.rows[0];
  return row ? mapTierRow(row) : null;
};

export const deleteTier = async (id: string) => {
  await postgresQuery('DELETE FROM core.tiers WHERE id = $1', [id]);
};
