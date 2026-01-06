import { TierFeature, TierLimits, UsageResourceType } from '../types/core';
import { getActiveSubscriptionForBillingAccount } from './billingService';
import { getUserById, updateUser } from '../repositories/core/userRepository';
import {
  CoreTier,
  createTier,
  getDefaultActiveTier,
  getFirstActiveTier,
  getTierById,
  getTierByName,
  updateTier,
} from '../repositories/core/tierRepository';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';
import { getUsageCounter, upsertUsageCounter } from '../repositories/core/usageCounterRepository';
import { requireEnv } from '../utils/requireEnv';

const DEFAULT_PERIOD_DAYS = parseInt(requireEnv('TIER_USAGE_PERIOD_DAYS'), 10);

export interface TierSummary {
  tier: CoreTier | null;
  limits: TierLimits;
}

const isFeatureEnabled = (limits: TierLimits | undefined, feature: TierFeature) => {
  const value = limits?.[feature];
  if (value === undefined || value === null) return true;
  return Boolean(value);
};

export const getUsageWindow = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - DEFAULT_PERIOD_DAYS + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + DEFAULT_PERIOD_DAYS);
  return { periodStart: start, periodEnd: end };
};

export const getDefaultTier = async (): Promise<CoreTier | null> => {
  const defaultTier = await getDefaultActiveTier();
  if (defaultTier) return defaultTier;
  return getFirstActiveTier();
};

export const ensureUserTier = async (userId: string): Promise<CoreTier | null> => {
  const user = await getUserById(userId, { includePassword: true });
  if (!user) return null;

  if (user.tierId) {
    const tier = await getTierById(user.tierId);
    if (tier) return tier;
  }

  const defaultTier = await getDefaultTier();
  if (defaultTier && (!user.tierId || user.tierId !== defaultTier._id)) {
    await updateUser(user._id, { tierId: defaultTier._id });
    return defaultTier;
  }

  return defaultTier || null;
};

export const getTierForUser = async (userId: string): Promise<TierSummary> => {
  const user = await getUserById(userId, { includePassword: true });
  if (!user) {
    return { tier: null, limits: {} };
  }

  if (user.billingAccountId) {
    const subscription = await getActiveSubscriptionForBillingAccount(user.billingAccountId);
    if (subscription?.tierId) {
      const tier = await getTierById(subscription.tierId);
      if (tier) {
        const limits: TierLimits = { ...(tier.limits || {}) };
        if (user.tierLimitOverrides) {
          Object.assign(limits, user.tierLimitOverrides);
        }
        return { tier, limits };
      }
    }
  }

  const tier = user.tierId ? await getTierById(user.tierId) : await ensureUserTier(userId);
  const limits: TierLimits = { ...(tier?.limits || {}) };

  if (user.tierLimitOverrides) {
    Object.assign(limits, user.tierLimitOverrides);
  }

  return { tier: tier || null, limits };
};

export const getWorkspaceOwnerTier = async (
  workspaceId: string
): Promise<{ tier: CoreTier | null; limits: TierLimits; ownerId?: string; billingAccountId?: string }> => {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return { tier: null, limits: {} };
  }

  if (workspace.billingAccountId) {
    const subscription = await getActiveSubscriptionForBillingAccount(workspace.billingAccountId);
    if (subscription?.tierId) {
      const tier = await getTierById(subscription.tierId);
      if (tier) {
        return {
          tier,
          limits: tier.limits || {},
          ownerId: workspace.userId,
          billingAccountId: workspace.billingAccountId,
        };
      }
    }
  }

  const { tier, limits } = await getTierForUser(workspace.userId);
  return { tier, limits, ownerId: workspace.userId, billingAccountId: workspace.billingAccountId };
};

export const assertUsageLimit = async (
  userId: string,
  resource: UsageResourceType,
  increment = 1,
  workspaceId?: string,
  options?: { increment?: boolean }
) => {
  const shouldIncrement = options?.increment !== false;
  const { limits, tier } = await getTierForUser(userId);
  const limitValue = limits?.[resource];

  if (limitValue === undefined || limitValue === null) {
    return { allowed: true, current: 0, limit: undefined };
  }

  const { periodStart, periodEnd } = getUsageWindow();
  const usage = await getUsageCounter(userId, resource, periodStart);

  const current = usage?.count || 0;
  if (current + increment > limitValue) {
    return { allowed: false, current, limit: limitValue };
  }

  if (shouldIncrement) {
    await upsertUsageCounter({
      userId,
      resource,
      periodStart,
      periodEnd,
      increment,
      tierId: tier?._id,
      workspaceId,
    });
  }

  return { allowed: true, current: current + increment, limit: limitValue };
};

export const assertWorkspaceLimit = async (
  workspaceId: string,
  resource: UsageResourceType,
  projectedCount: number
) => {
  const { limits, tier } = await getWorkspaceOwnerTier(workspaceId);
  const limitValue = limits?.[resource];
  if (limitValue === undefined || limitValue === null) {
    return { allowed: true, limit: undefined, tier };
  }

  if (projectedCount > limitValue) {
    return { allowed: false, limit: limitValue, tier };
  }

  return { allowed: true, limit: limitValue, tier };
};

export const assertWorkspaceFeatureAccess = async (workspaceId: string, feature: TierFeature) => {
  const { limits, tier } = await getWorkspaceOwnerTier(workspaceId);
  return {
    allowed: isFeatureEnabled(limits, feature),
    tier,
  };
};

export const assignTierFromOwner = async (workspaceId: string, userId: string) => {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) return;

  const [owner, member, workspaceTier] = await Promise.all([
    getUserById(workspace.userId, { includePassword: true }),
    getUserById(userId, { includePassword: true }),
    getWorkspaceOwnerTier(workspaceId),
  ]);

  if (!member) return;

  if (
    workspaceTier.tier?._id &&
    owner &&
    (!owner.tierId || owner.tierId !== workspaceTier.tier._id)
  ) {
    await updateUser(owner._id, { tierId: workspaceTier.tier._id });
  }

  let fallbackTierId = owner?.tierId;
  if (!workspaceTier.tier?._id && !fallbackTierId) {
    const ensuredTier = await ensureUserTier(workspace.userId);
    if (ensuredTier?._id && owner) {
      await updateUser(owner._id, { tierId: ensuredTier._id });
    }
    fallbackTierId = ensuredTier?._id || owner?.tierId;
  }

  const tierIdToAssign = workspaceTier.tier?._id || fallbackTierId;
  if (tierIdToAssign && (!member.tierId || member.tierId !== tierIdToAssign)) {
    await updateUser(member._id, { tierId: tierIdToAssign });
  }
};

export const upsertTier = async (data: Partial<CoreTier>) => {
  if (!data.name) {
    throw new Error('Tier name is required');
  }
  const existing = await getTierByName(data.name);
  if (existing) {
    return updateTier(existing._id, data);
  }
  return createTier(data);
};
