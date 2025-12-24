import mongoose, { Document, Schema } from 'mongoose';
import { TriggerType, ReplyStep, TriggerConfig, AutomationStats } from '../types/automation';

export interface IAutomation extends Document {
  name: string;
  description?: string;
  workspaceId: mongoose.Types.ObjectId;

  // Trigger configuration
  triggerType: TriggerType;
  triggerConfig?: TriggerConfig;

  // Reply steps (for now supporting single step, but designed for future multi-step)
  replySteps: ReplyStep[];

  // Status
  isActive: boolean;

  // Statistics
  stats: AutomationStats;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const triggerConfigSchema = new Schema<TriggerConfig>({
  keywords: [{ type: String }],
  excludeKeywords: [{ type: String }],
  keywordMatch: { type: String, enum: ['any', 'all'] },
  outsideBusinessHours: { type: Boolean },
  businessHours: {
    startTime: { type: String },
    endTime: { type: String },
    timezone: { type: String },
    daysOfWeek: [{ type: Number }],
  },
}, { _id: false });

const replyStepSchema = new Schema<ReplyStep>({
  type: {
    type: String,
    enum: ['constant_reply', 'ai_reply', 'template_flow'],
    required: true,
  },
  constantReply: {
    message: { type: String },
  },
  aiReply: {
    goalType: {
      type: String,
      enum: ['none', 'capture_lead', 'book_appointment', 'start_order', 'handle_support', 'drive_to_channel'],
    },
    goalDescription: { type: String },
    knowledgeItemIds: [{ type: String }],
  },
  templateFlow: {
    templateId: { type: String },
    config: { type: Schema.Types.Mixed },
  },
}, { _id: false });

const automationStatsSchema = new Schema<AutomationStats>({
  totalTriggered: { type: Number, default: 0 },
  totalRepliesSent: { type: Number, default: 0 },
  lastTriggeredAt: { type: Date },
  lastReplySentAt: { type: Date },
}, { _id: false });

const automationSchema = new Schema<IAutomation>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  triggerType: {
    type: String,
    enum: ['post_comment', 'story_reply', 'dm_message', 'story_share', 'instagram_ads', 'live_comment', 'ref_url'],
    required: true,
  },
  triggerConfig: {
    type: triggerConfigSchema,
    default: {},
  },
  replySteps: {
    type: [replyStepSchema],
    required: true,
    validate: {
      validator: function(steps: ReplyStep[]) {
        return steps.length > 0;
      },
      message: 'At least one reply step is required',
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  stats: {
    type: automationStatsSchema,
    default: () => ({
      totalTriggered: 0,
      totalRepliesSent: 0,
    }),
  },
}, {
  timestamps: true,
});

// Index for efficient queries
automationSchema.index({ workspaceId: 1, isActive: 1 });
automationSchema.index({ workspaceId: 1, triggerType: 1 });

export default mongoose.model<IAutomation>('Automation', automationSchema);
