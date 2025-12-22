import mongoose from 'mongoose';
import BillingAccount from '../models/BillingAccount';
import Subscription from '../models/Subscription';
import User from '../models/User';
import { getDefaultTier } from './tierService';

export const ensureBillingAccountForUser = async (userId: mongoose.Types.ObjectId | string) => {
  const user = await User.findById(userId);
  if (!user) return null;

  if (user.billingAccountId) {
    return BillingAccount.findById(user.billingAccountId);
  }

  const billingAccount = await BillingAccount.create({
    ownerUserId: user._id,
    name: user.email ? `${user.email} Billing` : 'Billing Account',
  });

  const defaultTier = await getDefaultTier();
  if (defaultTier) {
    await Subscription.create({
      billingAccountId: billingAccount._id,
      tierId: defaultTier._id,
      status: 'active',
      startedAt: new Date(),
    });
    user.tierId = user.tierId || defaultTier._id;
  }

  user.billingAccountId = billingAccount._id;
  await user.save();

  return billingAccount;
};

export const getActiveSubscriptionForBillingAccount = async (billingAccountId: mongoose.Types.ObjectId | string) => {
  return Subscription.findOne({ billingAccountId, status: 'active' }).sort({ createdAt: -1 });
};
