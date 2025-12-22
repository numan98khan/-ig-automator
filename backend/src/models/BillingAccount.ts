import mongoose, { Document, Schema } from 'mongoose';

export interface IBillingAccount extends Document {
  ownerUserId: mongoose.Types.ObjectId;
  name?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

const billingAccountSchema = new Schema<IBillingAccount>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

billingAccountSchema.index({ ownerUserId: 1, status: 1 });

export default mongoose.model<IBillingAccount>('BillingAccount', billingAccountSchema);
