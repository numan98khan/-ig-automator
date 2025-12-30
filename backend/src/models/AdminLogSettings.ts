import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminLogSettings extends Document {
  aiTimingEnabled: boolean;
  automationLogsEnabled: boolean;
  automationStepsEnabled: boolean;
  openaiApiLogsEnabled: boolean;
  consoleLogsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const adminLogSettingsSchema = new Schema<IAdminLogSettings>(
  {
    aiTimingEnabled: { type: Boolean, default: true },
    automationLogsEnabled: { type: Boolean, default: true },
    automationStepsEnabled: { type: Boolean, default: true },
    openaiApiLogsEnabled: { type: Boolean, default: false },
    consoleLogsEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<IAdminLogSettings>('AdminLogSettings', adminLogSettingsSchema);
