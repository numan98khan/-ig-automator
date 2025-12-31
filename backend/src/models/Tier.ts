import mongoose, { Document, Schema } from 'mongoose';

export type TierStatus = 'active' | 'inactive' | 'deprecated';

export interface TierLimits {
  aiMessages?: number;
  instagramAccounts?: number;
  teamMembers?: number;
  automations?: number;
  knowledgeItems?: number;
}

export interface ITier extends Document {
  name: string;
  description?: string;
  limits: TierLimits;
  isDefault: boolean;
  isCustom: boolean;
  status: TierStatus;
  createdAt: Date;
  updatedAt: Date;
}

const limitsSchema = new Schema<TierLimits>(
  {
    aiMessages: { type: Number },
    instagramAccounts: { type: Number },
    teamMembers: { type: Number },
    automations: { type: Number },
    knowledgeItems: { type: Number },
  },
  { _id: false }
);

const tierSchema = new Schema<ITier>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    limits: {
      type: limitsSchema,
      default: {},
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isCustom: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deprecated'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

tierSchema.index({ isDefault: 1, status: 1 });

tierSchema.pre('save', async function (next) {
  if (this.isModified('isDefault') && this.isDefault) {
    await mongoose.model<ITier>('Tier').updateMany(
      { _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

export default mongoose.model<ITier>('Tier', tierSchema);
