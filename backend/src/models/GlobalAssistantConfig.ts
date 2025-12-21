import mongoose, { Document, Schema } from 'mongoose';

export interface IGlobalAssistantConfig extends Document {
  assistantName?: string;
  assistantDescription?: string;
  systemPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

const globalAssistantConfigSchema = new Schema<IGlobalAssistantConfig>(
  {
    assistantName: { type: String, trim: true, default: 'SendFx Assistant' },
    assistantDescription: {
      type: String,
      trim: true,
      default: 'Ask about product, pricing, or guardrails',
    },
    systemPrompt: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

export default mongoose.model<IGlobalAssistantConfig>('GlobalAssistantConfig', globalAssistantConfigSchema);
