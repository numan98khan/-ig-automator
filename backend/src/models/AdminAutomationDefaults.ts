import mongoose, { Document, Schema } from 'mongoose';
import { AutomationTemplateId } from '../types/automation';

export interface IAdminAutomationDefaults extends Document {
  templateId: AutomationTemplateId | string;
  lockMode: 'none' | 'session_only';
  lockTtlMinutes: number;
  releaseKeywords: string[];
  faqInterruptEnabled: boolean;
  faqIntentKeywords: string[];
  faqResponseSuffix: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminAutomationDefaultsSchema = new Schema<IAdminAutomationDefaults>(
  {
    templateId: { type: String, required: true, unique: true, index: true },
    lockMode: { type: String, enum: ['none', 'session_only'], default: 'session_only' },
    lockTtlMinutes: { type: Number, default: 45, min: 1 },
    releaseKeywords: { type: [String], default: ['agent', 'human', 'stop', 'cancel'] },
    faqInterruptEnabled: { type: Boolean, default: true },
    faqIntentKeywords: {
      type: [String],
      default: ['return', 'refund', 'policy', 'exchange', 'warranty', 'shipping', 'delivery', 'hours', 'location'],
    },
    faqResponseSuffix: {
      type: String,
      default: 'Want to continue with the product details?',
      trim: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IAdminAutomationDefaults>(
  'AdminAutomationDefaults',
  adminAutomationDefaultsSchema,
);
