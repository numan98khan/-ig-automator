import bcrypt from 'bcryptjs';
import { postgresQuery } from '../../db/postgres';
import { generateObjectId } from '../../db/objectId';
import { TierLimits } from '../../models/Tier';

export interface CoreUser {
  _id: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role: 'user' | 'admin';
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional: boolean;
  emailVerified: boolean;
  defaultWorkspaceId?: string;
  billingAccountId?: string;
  tierId?: string;
  tierLimitOverrides?: TierLimits;
  createdAt: Date;
  updatedAt: Date;
}

const mapUserRow = (row: any): CoreUser => ({
  _id: row.id,
  email: row.email ?? undefined,
  password: row.password ?? undefined,
  firstName: row.first_name ?? undefined,
  lastName: row.last_name ?? undefined,
  role: row.role,
  instagramUserId: row.instagram_user_id ?? undefined,
  instagramUsername: row.instagram_username ?? undefined,
  isProvisional: row.is_provisional,
  emailVerified: row.email_verified,
  defaultWorkspaceId: row.default_workspace_id ?? undefined,
  billingAccountId: row.billing_account_id ?? undefined,
  tierId: row.tier_id ?? undefined,
  tierLimitOverrides: row.tier_limit_overrides ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const hashPassword = async (password: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async (password: string, hash: string) => bcrypt.compare(password, hash);

export const getUserById = async (id: string, options?: { includePassword?: boolean }) => {
  const fields = options?.includePassword
    ? '*'
    : 'id, email, first_name, last_name, role, instagram_user_id, instagram_username, is_provisional, email_verified, default_workspace_id, billing_account_id, tier_id, tier_limit_overrides, created_at, updated_at';
  const result = await postgresQuery(`SELECT ${fields} FROM core.users WHERE id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  return mapUserRow(row);
};

export const getUserByEmail = async (email: string, options?: { includePassword?: boolean }) => {
  const fields = options?.includePassword
    ? '*'
    : 'id, email, first_name, last_name, role, instagram_user_id, instagram_username, is_provisional, email_verified, default_workspace_id, billing_account_id, tier_id, tier_limit_overrides, created_at, updated_at';
  const result = await postgresQuery(`SELECT ${fields} FROM core.users WHERE email = $1`, [email.toLowerCase()]);
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
};

export const getUserByEmailExcludingId = async (email: string, excludeId: string) => {
  const result = await postgresQuery(
    'SELECT * FROM core.users WHERE email = $1 AND id <> $2',
    [email.toLowerCase(), excludeId]
  );
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
};

export const getUserByInstagramUserId = async (instagramUserId: string) => {
  const result = await postgresQuery('SELECT * FROM core.users WHERE instagram_user_id = $1', [instagramUserId]);
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
};

export const listUsersByIds = async (ids: string[]) => {
  if (ids.length === 0) return [];
  const result = await postgresQuery('SELECT * FROM core.users WHERE id = ANY($1)', [ids]);
  return result.rows.map(mapUserRow);
};

export const countUsers = async (options?: { search?: string; tierId?: string }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`);
  }
  if (options?.tierId) {
    params.push(options.tierId);
    conditions.push(`tier_id = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await postgresQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM core.users ${whereClause}`, params);
  return parseInt(result.rows[0]?.count || '0', 10);
};

export const listUsers = async (options?: { search?: string; limit?: number; offset?: number }) => {
  const conditions: string[] = [];
  const params: any[] = [];
  if (options?.search) {
    params.push(`%${options.search}%`);
    conditions.push(`(email ILIKE $${params.length} OR first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  params.push(limit);
  params.push(offset);
  const result = await postgresQuery(
    `SELECT * FROM core.users ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows.map(mapUserRow);
};

export const createUser = async (data: {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin';
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional?: boolean;
  emailVerified?: boolean;
  defaultWorkspaceId?: string;
  billingAccountId?: string;
  tierId?: string;
  tierLimitOverrides?: TierLimits;
}) => {
  const id = generateObjectId();
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  const result = await postgresQuery(
    `INSERT INTO core.users
    (id, email, password, first_name, last_name, role, instagram_user_id, instagram_username, is_provisional, email_verified, default_workspace_id, billing_account_id, tier_id, tier_limit_overrides)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      id,
      data.email?.toLowerCase() ?? null,
      passwordHash ?? null,
      data.firstName ?? null,
      data.lastName ?? null,
      data.role ?? 'user',
      data.instagramUserId ?? null,
      data.instagramUsername ?? null,
      data.isProvisional ?? true,
      data.emailVerified ?? false,
      data.defaultWorkspaceId ?? null,
      data.billingAccountId ?? null,
      data.tierId ?? null,
      data.tierLimitOverrides ? JSON.stringify(data.tierLimitOverrides) : null,
    ]
  );
  return mapUserRow(result.rows[0]);
};

export const updateUser = async (id: string, updates: {
  email?: string | null;
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: 'user' | 'admin';
  instagramUserId?: string | null;
  instagramUsername?: string | null;
  isProvisional?: boolean;
  emailVerified?: boolean;
  defaultWorkspaceId?: string | null;
  billingAccountId?: string | null;
  tierId?: string | null;
  tierLimitOverrides?: TierLimits | null;
}) => {
  const fields: string[] = [];
  const params: any[] = [];

  const setField = (column: string, value: any) => {
    params.push(value);
    fields.push(`${column} = $${params.length}`);
  };

  if ('email' in updates) setField('email', updates.email ? updates.email.toLowerCase() : null);
  if ('password' in updates) {
    const hashed = updates.password ? await hashPassword(updates.password) : null;
    setField('password', hashed);
  }
  if ('firstName' in updates) setField('first_name', updates.firstName ?? null);
  if ('lastName' in updates) setField('last_name', updates.lastName ?? null);
  if ('role' in updates && updates.role) setField('role', updates.role);
  if ('instagramUserId' in updates) setField('instagram_user_id', updates.instagramUserId ?? null);
  if ('instagramUsername' in updates) setField('instagram_username', updates.instagramUsername ?? null);
  if ('isProvisional' in updates && typeof updates.isProvisional === 'boolean') setField('is_provisional', updates.isProvisional);
  if ('emailVerified' in updates && typeof updates.emailVerified === 'boolean') setField('email_verified', updates.emailVerified);
  if ('defaultWorkspaceId' in updates) setField('default_workspace_id', updates.defaultWorkspaceId ?? null);
  if ('billingAccountId' in updates) setField('billing_account_id', updates.billingAccountId ?? null);
  if ('tierId' in updates) setField('tier_id', updates.tierId ?? null);
  if ('tierLimitOverrides' in updates) {
    setField('tier_limit_overrides', updates.tierLimitOverrides ? JSON.stringify(updates.tierLimitOverrides) : null);
  }

  if (fields.length === 0) {
    return getUserById(id, { includePassword: true });
  }

  params.push(id);
  const result = await postgresQuery(
    `UPDATE core.users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
};

export const upsertUserFromLegacy = async (legacyUser: {
  _id: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin';
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional?: boolean;
  emailVerified?: boolean;
  defaultWorkspaceId?: string;
  billingAccountId?: string;
  tierId?: string;
  tierLimitOverrides?: TierLimits;
  createdAt?: Date;
  updatedAt?: Date;
}) => {
  const instagramUserId = legacyUser.instagramUserId ?? null;
  if (instagramUserId) {
    const existingByInstagram = await postgresQuery('SELECT * FROM core.users WHERE instagram_user_id = $1', [
      instagramUserId,
    ]);
    if (existingByInstagram.rows[0]) {
      const existingId = existingByInstagram.rows[0].id as string;
      const updated = await postgresQuery(
        `UPDATE core.users SET
          email = $2,
          password = $3,
          first_name = $4,
          last_name = $5,
          role = $6,
          instagram_user_id = $7,
          instagram_username = $8,
          is_provisional = $9,
          email_verified = $10,
          default_workspace_id = $11,
          billing_account_id = $12,
          tier_id = $13,
          tier_limit_overrides = $14,
          created_at = $15,
          updated_at = $16
        WHERE id = $1
        RETURNING *`,
        [
          existingId,
          legacyUser.email?.toLowerCase() ?? null,
          legacyUser.password ?? null,
          legacyUser.firstName ?? null,
          legacyUser.lastName ?? null,
          legacyUser.role ?? 'user',
          legacyUser.instagramUserId ?? null,
          legacyUser.instagramUsername ?? null,
          legacyUser.isProvisional ?? true,
          legacyUser.emailVerified ?? false,
          legacyUser.defaultWorkspaceId ?? null,
          legacyUser.billingAccountId ?? null,
          legacyUser.tierId ?? null,
          legacyUser.tierLimitOverrides ? JSON.stringify(legacyUser.tierLimitOverrides) : null,
          legacyUser.createdAt ?? new Date(),
          legacyUser.updatedAt ?? legacyUser.createdAt ?? new Date(),
        ]
      );
      return mapUserRow(updated.rows[0]);
    }
  }

  const result = await postgresQuery(
    `INSERT INTO core.users (
      id,
      email,
      password,
      first_name,
      last_name,
      role,
      instagram_user_id,
      instagram_username,
      is_provisional,
      email_verified,
      default_workspace_id,
      billing_account_id,
      tier_id,
      tier_limit_overrides,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      password = EXCLUDED.password,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      role = EXCLUDED.role,
      instagram_user_id = EXCLUDED.instagram_user_id,
      instagram_username = EXCLUDED.instagram_username,
      is_provisional = EXCLUDED.is_provisional,
      email_verified = EXCLUDED.email_verified,
      default_workspace_id = EXCLUDED.default_workspace_id,
      billing_account_id = EXCLUDED.billing_account_id,
      tier_id = EXCLUDED.tier_id,
      tier_limit_overrides = EXCLUDED.tier_limit_overrides,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      legacyUser._id,
      legacyUser.email?.toLowerCase() ?? null,
      legacyUser.password ?? null,
      legacyUser.firstName ?? null,
      legacyUser.lastName ?? null,
      legacyUser.role ?? 'user',
      legacyUser.instagramUserId ?? null,
      legacyUser.instagramUsername ?? null,
      legacyUser.isProvisional ?? true,
      legacyUser.emailVerified ?? false,
      legacyUser.defaultWorkspaceId ?? null,
      legacyUser.billingAccountId ?? null,
      legacyUser.tierId ?? null,
      legacyUser.tierLimitOverrides ? JSON.stringify(legacyUser.tierLimitOverrides) : null,
      legacyUser.createdAt ?? new Date(),
      legacyUser.updatedAt ?? legacyUser.createdAt ?? new Date(),
    ]
  );
  return mapUserRow(result.rows[0]);
};
