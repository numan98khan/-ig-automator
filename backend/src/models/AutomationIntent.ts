import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationIntent extends Document {
  value: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const automationIntentSchema = new Schema<IAutomationIntent>({
  value: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

automationIntentSchema.index({ value: 1 }, { unique: true });

export default mongoose.model<IAutomationIntent>('AutomationIntent', automationIntentSchema);
