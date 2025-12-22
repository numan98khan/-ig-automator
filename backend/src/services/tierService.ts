import mongoose from 'mongoose';
import Tier, { ITier, TierLimits } from '../models/Tier';
import User from '../models/User';
import Workspace from '../models/Workspace';
import UsageCounter, { UsageResourceType } from '../models/UsageCounter';
import { getActiveSubscriptionForBillingAccount } from './billingService';

const DEFAULT_PERIOD_DAYS = parseInt(process.env.TIER_USAGE_PERIOD_DAYS || '30', 10);

export interface TierSummary {
  tier: ITier | null;
  limits: TierLimits;
}

export const getUsageWindow = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - DEFAULT_PERIOD_DAYS + 1);

  const end = new Date(start);
  end.setDate(start.getDate() + DEFAULT_PERIOD_DAYS);
  return { periodStart: start, periodEnd: end };
};

export const getDefaultTier = async (): Promise<ITier | null> => {
  const existing = await Tier.findOne({ isDefault: true, status: 'active' });
  if (existing) return existing;
  return Tier.findOne({ status: 'active' });
};

export const ensureUserTier = async (userId: mongoose.Types.ObjectId | string): Promise<ITier | null> => {
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.tierId) {
    const tier = await Tier.findById(user.tierId);
    if (tier) return tier;
  }

  const defaultTier = await getDefaultTier();
  if (defaultTier && (!user.tierId || user.tierId.toString() !== defaultTier._id.toString())) {
    user.tierId = defaultTier._id;
    await user.save();
    return defaultTier;
  }

  return defaultTier;
};

export const getTierForUser = async (userId: mongoose.Types.ObjectId | string): Promise<TierSummary> => {
  const user = await User.findById(userId);
  if (!user) {
    return { tier: null, limits: {} };
  }

  // Prefer billing account subscription
  if (user.billingAccountId) {
    const subscription = await getActiveSubscriptionForBillingAccount(user.billingAccountId);
    if (subscription?.tierId) {
      const tier = await Tier.findById(subscription.tierId);
      if (tier) {
        const limits: TierLimits = { ...(tier.limits || {}) };
        if (user.tierLimitOverrides) {
          Object.assign(limits, user.tierLimitOverrides);
        }
        return { tier, limits };
      }
    }
  }

  const tier = user.tierId ? await Tier.findById(user.tierId) : await ensureUserTier(userId);
  const limits: TierLimits = { ...(tier?.limits || {}) };

  if (user.tierLimitOverrides) {
    Object.assign(limits, user.tierLimitOverrides);
  }

  return { tier: tier || null, limits };
};

export const getWorkspaceOwnerTier = async (
  workspaceId: mongoose.Types.ObjectId | string
): Promise<{ tier: ITier | null; limits: TierLimits; ownerId?: mongoose.Types.ObjectId; billingAccountId?: mongoose.Types.ObjectId }> => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return { tier: null, limits: {} };
  }

  if (workspace.billingAccountId) {
    const subscription = await getActiveSubscriptionForBillingAccount(workspace.billingAccountId);
    if (subscription?.tierId) {
      const tier = await Tier.findById(subscription.tierId);
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
  userId: mongoose.Types.ObjectId | string,
  resource: UsageResourceType,
  increment = 1,
  workspaceId?: mongoose.Types.ObjectId | string,
  options?: { increment?: boolean }
) => {
  const shouldIncrement = options?.increment !== false;
  const { limits, tier } = await getTierForUser(userId);
  const limitValue = limits?.[resource];

  if (limitValue === undefined || limitValue === null) {
    return { allowed: true, current: 0, limit: undefined };
  }

  const { periodStart, periodEnd } = getUsageWindow();
  const usage = await UsageCounter.findOne({
    userId,
    resource,
    periodStart,
  });

  const current = usage?.count || 0;
  if (current + increment > limitValue) {
    return { allowed: false, current, limit: limitValue };
  }

  if (shouldIncrement) {
    await UsageCounter.findOneAndUpdate(
      { userId, resource, periodStart },
      {
        $setOnInsert: { periodStart, periodEnd, tierId: tier?._id, workspaceId },
        $inc: { count: increment },
      },
      { upsert: true }
    );
  }

  return { allowed: true, current: current + increment, limit: limitValue };
};

export const assertWorkspaceLimit = async (
  workspaceId: mongoose.Types.ObjectId | string,
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

export const assignTierFromOwner = async (
  workspaceId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string
) => {
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return;

  const [owner, member, workspaceTier] = await Promise.all([
    User.findById(workspace.userId),
    User.findById(userId),
    getWorkspaceOwnerTier(workspaceId),
  ]);

  if (!member) return;

  // Persist the workspace's billing tier on the owner if it's not already set
  if (
    workspaceTier.tier?._id &&
    owner &&
    (!owner.tierId || owner.tierId.toString() !== workspaceTier.tier._id.toString())
  ) {
    owner.tierId = workspaceTier.tier._id;
    await owner.save();
  }

  let fallbackTierId = owner?.tierId;
  if (!workspaceTier.tier?._id && !fallbackTierId) {
    const ensuredTier = await ensureUserTier(workspace.userId);
    if (ensuredTier?._id && owner) {
      owner.tierId = ensuredTier._id;
      await owner.save();
    }
    fallbackTierId = ensuredTier?._id || owner?.tierId;
  }

  const tierIdToAssign = workspaceTier.tier?._id || fallbackTierId;
  if (tierIdToAssign && (!member.tierId || member.tierId.toString() !== tierIdToAssign.toString())) {
    member.tierId = tierIdToAssign;
    await member.save();
  }
};
