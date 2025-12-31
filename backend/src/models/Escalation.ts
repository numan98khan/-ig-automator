import mongoose, { Document, Schema } from 'mongoose';

export type EscalationStatus = 'pending' | 'in_progress' | 'resolved' | 'cancelled';

export interface IEscalationUpdate {
  from: 'customer' | 'ai' | 'human' | 'system';
  messageId?: mongoose.Types.ObjectId;
  text?: string;
  at: Date;
}

export interface IEscalation extends Document {
  conversationId: mongoose.Types.ObjectId;
  workspaceId?: mongoose.Types.ObjectId;
  topicSummary: string;
  reason?: string;
  severity?: 'normal' | 'high' | 'critical';
  status: EscalationStatus;
  createdBy: 'ai' | 'human' | 'system';
  createdAt: Date;
  updatedAt: Date;
  followUpCount: number;
  updates: IEscalationUpdate[];
  lastCustomerMessage?: string;
  lastCustomerAt?: Date;
  lastAiMessage?: string;
  lastAiAt?: Date;
}

const escalationUpdateSchema = new Schema<IEscalationUpdate>(
  {
    from: { type: String, enum: ['customer', 'ai', 'human', 'system'], required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    text: { type: String, trim: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const escalationSchema = new Schema<IEscalation>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },
    topicSummary: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
    severity: { type: String, enum: ['normal', 'high', 'critical'], default: 'normal' },
    status: { type: String, enum: ['pending', 'in_progress', 'resolved', 'cancelled'], default: 'pending', index: true },
    createdBy: { type: String, enum: ['ai', 'human', 'system'], default: 'ai' },
    followUpCount: { type: Number, default: 0 },
    updates: { type: [escalationUpdateSchema], default: [] },
    lastCustomerMessage: { type: String, trim: true },
    lastCustomerAt: { type: Date },
    lastAiMessage: { type: String, trim: true },
    lastAiAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

escalationSchema.index({ workspaceId: 1, status: 1, severity: 1, createdAt: -1 });

export default mongoose.model<IEscalation>('Escalation', escalationSchema);
