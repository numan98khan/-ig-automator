import mongoose, { Schema, Document } from 'mongoose';

export interface AutomationIntentionDocument extends Document {
  name: string;
  description: string;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const automationIntentionSchema = new Schema<AutomationIntentionDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

automationIntentionSchema.index({ name: 1 }, { unique: true });

export default mongoose.model<AutomationIntentionDocument>(
  'AutomationIntention',
  automationIntentionSchema,
);
