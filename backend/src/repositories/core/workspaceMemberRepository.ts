import { postgresQuery } from '../../db/postgres';

export interface CoreWorkspaceMember {
  id: number;
  workspaceId: string;
  userId: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
}

const mapWorkspaceMemberRow = (row: any): CoreWorkspaceMember => ({
  id: row.id,
  workspaceId: row.workspace_id,
  userId: row.user_id,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getWorkspaceMember = async (workspaceId: string, userId: string) => {
  const result = await postgresQuery(
    'SELECT * FROM core.workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  const row = result.rows[0];
  return row ? mapWorkspaceMemberRow(row) : null;
};

export const listWorkspaceMembersByUserId = async (userId: string) => {
  const result = await postgresQuery(
    'SELECT * FROM core.workspace_members WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map(mapWorkspaceMemberRow);
};

export const listWorkspaceMembersByUserIds = async (userIds: string[]) => {
  if (userIds.length === 0) return [];
  const result = await postgresQuery(
    'SELECT * FROM core.workspace_members WHERE user_id = ANY($1)',
    [userIds]
  );
  return result.rows.map(mapWorkspaceMemberRow);
};

export const listWorkspaceMembersByWorkspaceId = async (workspaceId: string) => {
  const result = await postgresQuery(
    'SELECT * FROM core.workspace_members WHERE workspace_id = $1 ORDER BY created_at ASC',
    [workspaceId]
  );
  return result.rows.map(mapWorkspaceMemberRow);
};

export const createWorkspaceMember = async (data: { workspaceId: string; userId: string; role: string }) => {
  const result = await postgresQuery(
    `INSERT INTO core.workspace_members (workspace_id, user_id, role)
    VALUES ($1, $2, $3)
    RETURNING *`,
    [data.workspaceId, data.userId, data.role]
  );
  return mapWorkspaceMemberRow(result.rows[0]);
};

export const upsertWorkspaceMemberFromLegacy = async (legacyMember: {
  workspaceId: string;
  userId: string;
  role: string;
  createdAt?: Date;
  updatedAt?: Date;
}) => {
  const result = await postgresQuery(
    `INSERT INTO core.workspace_members (workspace_id, user_id, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at
    RETURNING *`,
    [
      legacyMember.workspaceId,
      legacyMember.userId,
      legacyMember.role,
      legacyMember.createdAt ?? new Date(),
      legacyMember.updatedAt ?? legacyMember.createdAt ?? new Date(),
    ]
  );
  return mapWorkspaceMemberRow(result.rows[0]);
};

export const deleteWorkspaceMember = async (workspaceId: string, userId: string) => {
  await postgresQuery('DELETE FROM core.workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
};

export const updateWorkspaceMemberRole = async (workspaceId: string, userId: string, role: string) => {
  const result = await postgresQuery(
    `UPDATE core.workspace_members
    SET role = $3, updated_at = NOW()
    WHERE workspace_id = $1 AND user_id = $2
    RETURNING *`,
    [workspaceId, userId, role]
  );
  const row = result.rows[0];
  return row ? mapWorkspaceMemberRow(row) : null;
};

export const countWorkspaceMembers = async (workspaceId: string) => {
  const result = await postgresQuery<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM core.workspace_members WHERE workspace_id = $1',
    [workspaceId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
};

export const existsWorkspaceMember = async (workspaceId: string, userId: string) => {
  const result = await postgresQuery('SELECT 1 FROM core.workspace_members WHERE workspace_id = $1 AND user_id = $2', [
    workspaceId,
    userId,
  ]);
  return result.rowCount > 0;
};

export const countWorkspaceMembersByWorkspaceIds = async (workspaceIds: string[]) => {
  if (workspaceIds.length === 0) return {} as Record<string, number>;
  const result = await postgresQuery(
    `SELECT workspace_id, COUNT(*)::int AS count
    FROM core.workspace_members
    WHERE workspace_id = ANY($1)
    GROUP BY workspace_id`,
    [workspaceIds]
  );
  return Object.fromEntries(result.rows.map((row: any) => [row.workspace_id, row.count]));
};
