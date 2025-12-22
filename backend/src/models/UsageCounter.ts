import mongoose, { Document, Schema } from 'mongoose';
import { TierLimits } from './Tier';

export type UsageResourceType = keyof TierLimits;

export interface IUsageCounter extends Document {
  userId: mongoose.Types.ObjectId;
  tierId?: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  resource: UsageResourceType;
  periodStart: Date;
  periodEnd: Date;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const usageCounterSchema = new Schema<IUsageCounter>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tierId: {
      type: Schema.Types.ObjectId,
      ref: 'Tier',
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      index: true,
    },
    resource: {
      type: String,
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

usageCounterSchema.index({ userId: 1, resource: 1, periodStart: 1 });
usageCounterSchema.index({ resource: 1, periodStart: 1 });

export default mongoose.model<IUsageCounter>('UsageCounter', usageCounterSchema);
