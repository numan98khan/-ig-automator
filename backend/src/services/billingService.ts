import { getDefaultTier } from './tierService';
import { getUserById, updateUser } from '../repositories/core/userRepository';
import { createBillingAccount, getBillingAccountById } from '../repositories/core/billingAccountRepository';
import {
  cancelActiveSubscriptions,
  createSubscription,
  getActiveSubscriptionForBillingAccount as fetchActiveSubscriptionForBillingAccount,
} from '../repositories/core/subscriptionRepository';

export const upsertActiveSubscription = async (billingAccountId: string, tierId: string) => {
  await cancelActiveSubscriptions(billingAccountId);

  const subscription = await createSubscription({
    billingAccountId,
    tierId,
    status: 'active',
    startedAt: new Date(),
  });

  return subscription;
};

export const ensureBillingAccountForUser = async (userId: string) => {
  const user = await getUserById(userId, { includePassword: true });
  if (!user) return null;

  if (user.billingAccountId) {
    return getBillingAccountById(user.billingAccountId);
  }

  const billingAccount = await createBillingAccount({
    ownerUserId: user._id,
    name: user.email ? `${user.email} Billing` : 'Billing Account',
  });

  const defaultTier = await getDefaultTier();
  if (defaultTier) {
    await upsertActiveSubscription(billingAccount._id, defaultTier._id);
    if (!user.tierId) {
      await updateUser(user._id, { tierId: defaultTier._id });
    }
  }

  await updateUser(user._id, { billingAccountId: billingAccount._id });

  return billingAccount;
};

export const getActiveSubscriptionForBillingAccount = async (billingAccountId: string) => {
  return fetchActiveSubscriptionForBillingAccount(billingAccountId);
};
