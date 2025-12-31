import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspaceAutomationIntent extends Document {
  workspaceId: mongoose.Types.ObjectId;
  value: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceAutomationIntentSchema = new Schema<IWorkspaceAutomationIntent>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  value: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

workspaceAutomationIntentSchema.index({ workspaceId: 1, value: 1 }, { unique: true });

export default mongoose.model<IWorkspaceAutomationIntent>(
  'WorkspaceAutomationIntent',
  workspaceAutomationIntentSchema
);
