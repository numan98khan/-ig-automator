import mongoose, { Document, Schema } from 'mongoose';

export interface AutomationInstanceStats {
  totalTriggered: number;
  totalRepliesSent: number;
  lastTriggeredAt?: Date;
  lastReplySentAt?: Date;
}

export interface IAutomationInstance extends Document {
  name: string;
  description?: string;
  workspaceId: mongoose.Types.ObjectId;
  templateId: mongoose.Types.ObjectId;
  templateVersionId: mongoose.Types.ObjectId;
  userConfig?: Record<string, any>;
  isActive: boolean;
  stats: AutomationInstanceStats;
  createdAt: Date;
  updatedAt: Date;
}

const automationStatsSchema = new Schema<AutomationInstanceStats>({
  totalTriggered: { type: Number, default: 0 },
  totalRepliesSent: { type: Number, default: 0 },
  lastTriggeredAt: { type: Date },
  lastReplySentAt: { type: Date },
}, { _id: false });

const automationInstanceSchema = new Schema<IAutomationInstance>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  templateId: { type: Schema.Types.ObjectId, ref: 'FlowTemplate', required: true },
  templateVersionId: { type: Schema.Types.ObjectId, ref: 'FlowTemplateVersion', required: true },
  userConfig: { type: Schema.Types.Mixed, default: {} },
  isActive: { type: Boolean, default: true },
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

automationInstanceSchema.index({ workspaceId: 1, isActive: 1 });
automationInstanceSchema.index({ workspaceId: 1, templateId: 1 });

export default mongoose.model<IAutomationInstance>('AutomationInstance', automationInstanceSchema);
