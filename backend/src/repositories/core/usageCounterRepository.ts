import { postgresQuery } from '../../db/postgres';
import { UsageResourceType } from '../../types/core';

export interface CoreUsageCounter {
  id: number;
  userId: string;
  tierId?: string;
  workspaceId?: string;
  resource: UsageResourceType;
  periodStart: Date;
  periodEnd: Date;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const mapUsageCounterRow = (row: any): CoreUsageCounter => ({
  id: row.id,
  userId: row.user_id,
  tierId: row.tier_id ?? undefined,
  workspaceId: row.workspace_id ?? undefined,
  resource: row.resource,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  count: row.count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getUsageCounter = async (userId: string, resource: UsageResourceType, periodStart: Date) => {
  const result = await postgresQuery(
    'SELECT * FROM core.usage_counters WHERE user_id = $1 AND resource = $2 AND period_start = $3',
    [userId, resource, periodStart]
  );
  const row = result.rows[0];
  return row ? mapUsageCounterRow(row) : null;
};

export const upsertUsageCounter = async (data: {
  userId: string;
  tierId?: string;
  workspaceId?: string;
  resource: UsageResourceType;
  periodStart: Date;
  periodEnd: Date;
  increment: number;
}) => {
  const result = await postgresQuery(
    `INSERT INTO core.usage_counters (user_id, tier_id, workspace_id, resource, period_start, period_end, count)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, resource, period_start)
    DO UPDATE SET count = core.usage_counters.count + EXCLUDED.count, updated_at = NOW()
    RETURNING *`,
    [
      data.userId,
      data.tierId ?? null,
      data.workspaceId ?? null,
      data.resource,
      data.periodStart,
      data.periodEnd,
      data.increment,
    ]
  );
  return mapUsageCounterRow(result.rows[0]);
};
