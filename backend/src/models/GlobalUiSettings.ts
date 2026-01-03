import mongoose, { Document, Schema } from 'mongoose';

export type UiTheme = 'legacy' | 'comic';

export interface IGlobalUiSettings extends Document {
  key: string;
  uiTheme?: UiTheme;
  createdAt: Date;
  updatedAt: Date;
}

const globalUiSettingsSchema = new Schema<IGlobalUiSettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global',
      trim: true,
    },
    uiTheme: {
      type: String,
      trim: true,
      default: 'legacy',
      enum: ['legacy', 'comic'],
    },
  },
  { timestamps: true },
);

globalUiSettingsSchema.index({ key: 1 }, { unique: true });

export default mongoose.model<IGlobalUiSettings>('GlobalUiSettings', globalUiSettingsSchema);
