import mongoose, { Document, Schema } from 'mongoose';

export type SupportTicketStatus =
  | 'open'
  | 'triage'
  | 'needs_user'
  | 'in_progress'
  | 'resolved'
  | 'closed';

export interface ISupportTicket extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  instagramAccountId?: mongoose.Types.ObjectId;
  type: 'bug' | 'support' | 'feature' | 'billing';
  severity?: 'low' | 'medium' | 'high' | 'blocking';
  subject?: string;
  description: string;
  status: SupportTicketStatus;
  assigneeUserId?: mongoose.Types.ObjectId;
  tags: string[];
  context?: Record<string, any>;
  attachments?: { name: string; url?: string; type?: string }[];
  requestIds?: string[];
  breadcrumbs?: any[];
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    instagramAccountId: { type: Schema.Types.ObjectId, ref: 'InstagramAccount' },
    type: {
      type: String,
      enum: ['bug', 'support', 'feature', 'billing'],
      required: true,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'blocking'],
      default: 'medium',
    },
    subject: { type: String },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'triage', 'needs_user', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    assigneeUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    tags: { type: [String], default: [] },
    context: { type: Schema.Types.Mixed },
    attachments: [
      {
        name: String,
        url: String,
        type: String,
      },
    ],
    requestIds: { type: [String], default: [] },
    breadcrumbs: { type: Array, default: [] },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model<ISupportTicket>('SupportTicket', supportTicketSchema);
