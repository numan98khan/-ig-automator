import mongoose, { Document, Schema } from 'mongoose';

export type CrmTaskStatus = 'open' | 'completed' | 'cancelled';
export type CrmTaskType = 'follow_up' | 'general';

export interface ICrmTask extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId?: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  taskType: CrmTaskType;
  status: CrmTaskStatus;
  dueAt?: Date;
  reminderAt?: Date;
  assignedTo?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const crmTaskSchema = new Schema<ICrmTask>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    index: true,
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  taskType: {
    type: String,
    enum: ['follow_up', 'general'],
    default: 'follow_up',
  },
  status: {
    type: String,
    enum: ['open', 'completed', 'cancelled'],
    default: 'open',
  },
  dueAt: {
    type: Date,
  },
  reminderAt: {
    type: Date,
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  completedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

crmTaskSchema.index({ workspaceId: 1, conversationId: 1 });
crmTaskSchema.index({ workspaceId: 1, contactId: 1 });
crmTaskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });

export default mongoose.model<ICrmTask>('CrmTask', crmTaskSchema);
