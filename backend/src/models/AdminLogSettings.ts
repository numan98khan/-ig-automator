import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminLogSettings extends Document {
  aiTimingEnabled: boolean;
  automationLogsEnabled: boolean;
  automationStepsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminLogSettingsSchema = new Schema<IAdminLogSettings>(
  {
    aiTimingEnabled: { type: Boolean, default: true },
    automationLogsEnabled: { type: Boolean, default: true },
    automationStepsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model<IAdminLogSettings>('AdminLogSettings', adminLogSettingsSchema);
