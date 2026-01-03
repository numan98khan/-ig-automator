import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { ensureCoreSchema } from '../db/coreSchema';
import { closePostgresPool, postgresQuery } from '../db/postgres';
import User from '../models/User';
import Workspace from '../models/Workspace';
import WorkspaceMember from '../models/WorkspaceMember';
import Tier from '../models/Tier';
import BillingAccount from '../models/BillingAccount';
import Subscription from '../models/Subscription';
import UsageCounter from '../models/UsageCounter';

const insertUser = async (user: any) => {
  await postgresQuery(
    `INSERT INTO core.users (
      id, email, password, first_name, last_name, role, instagram_user_id, instagram_username,
      is_provisional, email_verified, default_workspace_id, billing_account_id, tier_id, tier_limit_overrides,
      created_at, updated_at
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
      updated_at = EXCLUDED.updated_at`,
    [
      user._id.toString(),
      user.email?.toLowerCase() ?? null,
      user.password ?? null,
      user.firstName ?? null,
      user.lastName ?? null,
      user.role ?? 'user',
      user.instagramUserId ?? null,
      user.instagramUsername ?? null,
      user.isProvisional ?? true,
      user.emailVerified ?? false,
      user.defaultWorkspaceId?.toString() ?? null,
      user.billingAccountId?.toString() ?? null,
      user.tierId?.toString() ?? null,
      user.tierLimitOverrides ? JSON.stringify(user.tierLimitOverrides) : null,
      user.createdAt ?? new Date(),
      user.updatedAt ?? user.createdAt ?? new Date(),
    ]
  );
};

const insertWorkspace = async (workspace: any) => {
  await postgresQuery(
    `INSERT INTO core.workspaces (id, name, user_id, billing_account_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      user_id = EXCLUDED.user_id,
      billing_account_id = EXCLUDED.billing_account_id,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      workspace._id.toString(),
      workspace.name,
      workspace.userId?.toString(),
      workspace.billingAccountId?.toString() ?? null,
      workspace.createdAt ?? new Date(),
      workspace.updatedAt ?? workspace.createdAt ?? new Date(),
    ]
  );
};

const insertWorkspaceMember = async (member: any) => {
  await postgresQuery(
    `INSERT INTO core.workspace_members (workspace_id, user_id, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      member.workspaceId.toString(),
      member.userId.toString(),
      member.role,
      member.createdAt ?? new Date(),
      member.updatedAt ?? member.createdAt ?? new Date(),
    ]
  );
};

const insertTier = async (tier: any) => {
  await postgresQuery(
    `INSERT INTO core.tiers (id, name, description, limits, is_default, is_custom, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      limits = EXCLUDED.limits,
      is_default = EXCLUDED.is_default,
      is_custom = EXCLUDED.is_custom,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      tier._id.toString(),
      tier.name,
      tier.description ?? null,
      JSON.stringify(tier.limits || {}),
      tier.isDefault ?? false,
      tier.isCustom ?? false,
      tier.status ?? 'active',
      tier.createdAt ?? new Date(),
      tier.updatedAt ?? tier.createdAt ?? new Date(),
    ]
  );
};

const insertBillingAccount = async (account: any) => {
  await postgresQuery(
    `INSERT INTO core.billing_accounts (id, owner_user_id, name, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      account._id.toString(),
      account.ownerUserId?.toString(),
      account.name ?? null,
      account.status ?? 'active',
      account.createdAt ?? new Date(),
      account.updatedAt ?? account.createdAt ?? new Date(),
    ]
  );
};

const insertSubscription = async (subscription: any) => {
  await postgresQuery(
    `INSERT INTO core.subscriptions (
      id, billing_account_id, tier_id, status, started_at, canceled_at, current_period_end, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (id) DO UPDATE SET
      billing_account_id = EXCLUDED.billing_account_id,
      tier_id = EXCLUDED.tier_id,
      status = EXCLUDED.status,
      started_at = EXCLUDED.started_at,
      canceled_at = EXCLUDED.canceled_at,
      current_period_end = EXCLUDED.current_period_end,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      subscription._id.toString(),
      subscription.billingAccountId?.toString(),
      subscription.tierId?.toString(),
      subscription.status ?? 'active',
      subscription.startedAt ?? new Date(),
      subscription.canceledAt ?? null,
      subscription.currentPeriodEnd ?? null,
      subscription.createdAt ?? new Date(),
      subscription.updatedAt ?? subscription.createdAt ?? new Date(),
    ]
  );
};

const insertUsageCounter = async (counter: any) => {
  await postgresQuery(
    `INSERT INTO core.usage_counters (
      user_id, tier_id, workspace_id, resource, period_start, period_end, count, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (user_id, resource, period_start) DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      workspace_id = EXCLUDED.workspace_id,
      period_end = EXCLUDED.period_end,
      count = EXCLUDED.count,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at`,
    [
      counter.userId.toString(),
      counter.tierId?.toString() ?? null,
      counter.workspaceId?.toString() ?? null,
      counter.resource,
      counter.periodStart,
      counter.periodEnd,
      counter.count ?? 0,
      counter.createdAt ?? new Date(),
      counter.updatedAt ?? counter.createdAt ?? new Date(),
    ]
  );
};

const migrate = async () => {
  await ensureCoreSchema();
  await connectDB();

  const [users, workspaces, members, tiers, billingAccounts, subscriptions, usageCounters] = await Promise.all([
    User.find({}).lean(),
    Workspace.find({}).lean(),
    WorkspaceMember.find({}).lean(),
    Tier.find({}).lean(),
    BillingAccount.find({}).lean(),
    Subscription.find({}).lean(),
    UsageCounter.find({}).lean(),
  ]);

  for (const tier of tiers) {
    await insertTier(tier);
  }

  for (const user of users) {
    await insertUser(user);
  }

  for (const billingAccount of billingAccounts) {
    await insertBillingAccount(billingAccount);
  }

  for (const subscription of subscriptions) {
    await insertSubscription(subscription);
  }

  for (const workspace of workspaces) {
    await insertWorkspace(workspace);
  }

  for (const member of members) {
    await insertWorkspaceMember(member);
  }

  for (const counter of usageCounters) {
    await insertUsageCounter(counter);
  }

  await mongoose.disconnect();
  await closePostgresPool();
};

migrate()
  .then(() => {
    console.log('✅ Core data migration complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Core data migration failed', error);
    process.exit(1);
  });
