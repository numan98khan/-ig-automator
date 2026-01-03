import { postgresQuery } from '../../db/postgres';
import { generateObjectId } from '../../db/objectId';

export interface CoreBillingAccount {
  _id: string;
  ownerUserId: string;
  name?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const mapBillingAccountRow = (row: any): CoreBillingAccount => ({
  _id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getBillingAccountById = async (id: string) => {
  const result = await postgresQuery('SELECT * FROM core.billing_accounts WHERE id = $1', [id]);
  const row = result.rows[0];
  return row ? mapBillingAccountRow(row) : null;
};

export const getBillingAccountByOwner = async (ownerUserId: string) => {
  const result = await postgresQuery('SELECT * FROM core.billing_accounts WHERE owner_user_id = $1', [ownerUserId]);
  const row = result.rows[0];
  return row ? mapBillingAccountRow(row) : null;
};

export const createBillingAccount = async (data: { ownerUserId: string; name?: string; status?: 'active' | 'inactive' }) => {
  const id = generateObjectId();
  const result = await postgresQuery(
    `INSERT INTO core.billing_accounts (id, owner_user_id, name, status)
    VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [id, data.ownerUserId, data.name ?? null, data.status ?? 'active']
  );
  return mapBillingAccountRow(result.rows[0]);
};
