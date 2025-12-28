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
  aiInterpretationEnabled: boolean;
  aiRephraseEnabled: boolean;
  aiConfidenceThresholds: {
    intent?: number;
    productRef?: number;
    sku?: number;
    variant?: number;
    quantity?: number;
    city?: number;
  };
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
    aiInterpretationEnabled: { type: Boolean, default: true },
    aiRephraseEnabled: { type: Boolean, default: true },
    aiConfidenceThresholds: {
      intent: { type: Number, default: 0.55 },
      productRef: { type: Number, default: 0.6 },
      sku: { type: Number, default: 0.65 },
      variant: { type: Number, default: 0.6 },
      quantity: { type: Number, default: 0.6 },
      city: { type: Number, default: 0.6 },
    },
  },
  { timestamps: true },
);

export default mongoose.model<IAdminAutomationDefaults>(
  'AdminAutomationDefaults',
  adminAutomationDefaultsSchema,
);
