import mongoose, { Document, Schema } from 'mongoose';
import { WorkspaceMemberRole } from './WorkspaceMember';

export interface IWorkspaceInvite extends Document {
  workspaceId: mongoose.Types.ObjectId;
  email: string;
  role: WorkspaceMemberRole;
  invitedBy: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  accepted: boolean;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const workspaceInviteSchema = new Schema<IWorkspaceInvite>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'agent', 'viewer'],
      default: 'agent',
      required: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    accepted: {
      type: Boolean,
      default: false,
    },
    acceptedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate pending invites for the same email to the same workspace
workspaceInviteSchema.index(
  { workspaceId: 1, email: 1, accepted: 1 },
  {
    unique: true,
    partialFilterExpression: { accepted: false }
  }
);

// Index for cleanup queries
workspaceInviteSchema.index({ expiresAt: 1 });

export const WorkspaceInvite = mongoose.model<IWorkspaceInvite>('WorkspaceInvite', workspaceInviteSchema);
