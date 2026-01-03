import { postgresQuery } from '../../db/postgres';
import { generateObjectId } from '../../db/objectId';

export interface CoreSubscription {
  _id: string;
  billingAccountId: string;
  tierId: string;
  status: 'active' | 'canceled' | 'paused';
  startedAt: Date;
  canceledAt?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const mapSubscriptionRow = (row: any): CoreSubscription => ({
  _id: row.id,
  billingAccountId: row.billing_account_id,
  tierId: row.tier_id,
  status: row.status,
  startedAt: row.started_at,
  canceledAt: row.canceled_at ?? undefined,
  currentPeriodEnd: row.current_period_end ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const cancelActiveSubscriptions = async (billingAccountId: string, excludeId?: string) => {
  if (excludeId) {
    await postgresQuery(
      `UPDATE core.subscriptions
      SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
      WHERE billing_account_id = $1 AND status = 'active' AND id <> $2`,
      [billingAccountId, excludeId]
    );
    return;
  }
  await postgresQuery(
    `UPDATE core.subscriptions
    SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
    WHERE billing_account_id = $1 AND status = 'active'`,
    [billingAccountId]
  );
};

export const createSubscription = async (data: {
  billingAccountId: string;
  tierId: string;
  status?: 'active' | 'canceled' | 'paused';
  startedAt?: Date;
  currentPeriodEnd?: Date | null;
}) => {
  const id = generateObjectId();
  const result = await postgresQuery(
    `INSERT INTO core.subscriptions (id, billing_account_id, tier_id, status, started_at, current_period_end)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      id,
      data.billingAccountId,
      data.tierId,
      data.status ?? 'active',
      data.startedAt ?? new Date(),
      data.currentPeriodEnd ?? null,
    ]
  );
  return mapSubscriptionRow(result.rows[0]);
};

export const getActiveSubscriptionForBillingAccount = async (billingAccountId: string) => {
  const result = await postgresQuery(
    `SELECT * FROM core.subscriptions
    WHERE billing_account_id = $1 AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1`,
    [billingAccountId]
  );
  const row = result.rows[0];
  return row ? mapSubscriptionRow(row) : null;
};
