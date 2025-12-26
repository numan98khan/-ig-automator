import mongoose, { Document, Schema } from 'mongoose';
import { AutomationTemplateId } from '../types/automation';

export interface IAutomationSession extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  automationId: mongoose.Types.ObjectId;
  templateId: AutomationTemplateId;
  status: 'active' | 'paused' | 'completed' | 'handoff';
  step?: string;
  questionCount: number;
  collectedFields?: Record<string, any>;
  rateLimit?: {
    windowStart: Date;
    count: number;
  };
  lastAutomationMessageAt?: Date;
  lastCustomerMessageAt?: Date;
  pausedAt?: Date;
  pauseReason?: string;
  followupTaskId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const automationSessionSchema = new Schema<IAutomationSession>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  automationId: { type: Schema.Types.ObjectId, ref: 'Automation', required: true },
  templateId: {
    type: String,
    enum: ['booking_concierge', 'after_hours_capture', 'sales_concierge'],
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'handoff'],
    default: 'active',
  },
  step: { type: String },
  questionCount: { type: Number, default: 0 },
  collectedFields: { type: Schema.Types.Mixed },
  rateLimit: {
    windowStart: { type: Date },
    count: { type: Number, default: 0 },
  },
  lastAutomationMessageAt: { type: Date },
  lastCustomerMessageAt: { type: Date },
  pausedAt: { type: Date },
  pauseReason: { type: String, trim: true },
  followupTaskId: { type: Schema.Types.ObjectId, ref: 'FollowupTask' },
}, {
  timestamps: true,
});

automationSessionSchema.index({ workspaceId: 1, conversationId: 1, automationId: 1 });
automationSessionSchema.index({ conversationId: 1, status: 1, updatedAt: -1 });

export default mongoose.model<IAutomationSession>('AutomationSession', automationSessionSchema);
