import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationSession extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  automationInstanceId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  templateVersionId: mongoose.Types.ObjectId;
  status: 'active' | 'paused' | 'completed' | 'handoff';
  state?: {
    stepIndex?: number;
    nodeId?: string;
    nodeQueue?: string[];
    vars?: Record<string, any>;
    agent?: {
      nodeId?: string;
      stepIndex?: number;
      stepCount?: number;
      lastStepSummary?: string;
      slots?: Record<string, string>;
      questionsAsked?: number;
    };
  };
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
  automationInstanceId: { type: Schema.Types.ObjectId, ref: 'AutomationInstance', required: true },
  templateId: { type: Schema.Types.ObjectId, ref: 'FlowTemplate', required: true },
  templateVersionId: { type: Schema.Types.ObjectId, ref: 'FlowTemplateVersion', required: true },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'handoff'],
    default: 'active',
  },
  state: { type: Schema.Types.Mixed, default: {} },
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

automationSessionSchema.index({ workspaceId: 1, conversationId: 1, automationInstanceId: 1 });
automationSessionSchema.index({ conversationId: 1, status: 1, updatedAt: -1 });

export default mongoose.model<IAutomationSession>('AutomationSession', automationSessionSchema);
