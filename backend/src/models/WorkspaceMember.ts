import mongoose, { Document, Schema } from 'mongoose';

export type WorkspaceMemberRole = 'owner' | 'admin' | 'agent' | 'viewer';

export interface IWorkspaceMember extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: WorkspaceMemberRole;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceMemberSchema = new Schema<IWorkspaceMember>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['owner', 'admin', 'agent', 'viewer'],
    default: 'agent',
    required: true,
  },
}, {
  timestamps: true,
});

// Compound index to ensure a user can only have one role per workspace
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export default mongoose.model<IWorkspaceMember>('WorkspaceMember', workspaceMemberSchema);
