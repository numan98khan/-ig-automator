import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationPreviewProfile extends Document {
  workspaceId: mongoose.Types.ObjectId;
  name: string;
  handle?: string;
  userId?: string;
  avatarUrl?: string;
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const automationPreviewProfileSchema = new Schema<IAutomationPreviewProfile>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  name: {
    type: String,
    trim: true,
    default: 'Mock Tester',
  },
  handle: {
    type: String,
    trim: true,
  },
  userId: {
    type: String,
    trim: true,
  },
  avatarUrl: {
    type: String,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

automationPreviewProfileSchema.index({ workspaceId: 1, isDefault: 1 });
automationPreviewProfileSchema.index({ workspaceId: 1, name: 1 });

export default mongoose.model<IAutomationPreviewProfile>('AutomationPreviewProfile', automationPreviewProfileSchema);
