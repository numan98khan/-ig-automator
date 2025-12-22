import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspace extends Document {
  name: string;
  userId: mongoose.Types.ObjectId;
  billingAccountId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const workspaceSchema = new Schema<IWorkspace>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  billingAccountId: {
    type: Schema.Types.ObjectId,
    ref: 'BillingAccount',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

workspaceSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model<IWorkspace>('Workspace', workspaceSchema);
