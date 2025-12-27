import mongoose, { Document, Schema } from 'mongoose';
import { AutomationTemplateId } from '../types/automation';

export interface AutomationTemplateAiReplyConfig {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AutomationTemplateCategorizationConfig {
  model?: string;
  temperature?: number;
}

export interface IAutomationTemplate extends Document {
  templateId: AutomationTemplateId | string;
  aiReply?: AutomationTemplateAiReplyConfig;
  categorization?: AutomationTemplateCategorizationConfig;
  createdAt: Date;
  updatedAt: Date;
}

const automationTemplateSchema = new Schema<IAutomationTemplate>(
  {
    templateId: { type: String, required: true, unique: true, index: true },
    aiReply: {
      model: { type: String, trim: true, default: 'gpt-4o-mini' },
      temperature: { type: Number, default: 0.35, min: 0, max: 2 },
      maxOutputTokens: { type: Number, default: 420, min: 1 },
    },
    categorization: {
      model: { type: String, trim: true, default: 'gpt-4o-mini' },
      temperature: { type: Number, default: 0.1, min: 0, max: 2 },
    },
  },
  { timestamps: true },
);

export default mongoose.model<IAutomationTemplate>('AutomationTemplate', automationTemplateSchema);
