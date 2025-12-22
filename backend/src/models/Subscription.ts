import mongoose, { Document, Schema } from 'mongoose';

export type SubscriptionStatus = 'active' | 'canceled' | 'paused';

export interface ISubscription extends Document {
  billingAccountId: mongoose.Types.ObjectId;
  tierId: mongoose.Types.ObjectId;
  status: SubscriptionStatus;
  startedAt: Date;
  canceledAt?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    billingAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'BillingAccount',
      required: true,
      index: true,
    },
    tierId: {
      type: Schema.Types.ObjectId,
      ref: 'Tier',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'canceled', 'paused'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    canceledAt: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ billingAccountId: 1, status: 1, createdAt: -1 });

export default mongoose.model<ISubscription>('Subscription', subscriptionSchema);
