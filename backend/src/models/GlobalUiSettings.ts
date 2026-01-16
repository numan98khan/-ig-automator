import mongoose, { Document, Schema } from 'mongoose';

export type UiTheme = 'legacy' | 'comic' | 'studio';

export interface IGlobalUiSettings extends Document {
  key?: string;
  uiTheme?: UiTheme;
  createdAt: Date;
  updatedAt: Date;
}

const globalUiSettingsSchema = new Schema<IGlobalUiSettings>(
  {
    key: {
      type: String,
      trim: true,
      default: 'global',
      unique: true,
      index: true,
    },
    uiTheme: {
      type: String,
      trim: true,
      default: 'legacy',
      enum: ['legacy', 'comic', 'studio'],
    },
  },
  { timestamps: true },
);

export default mongoose.model<IGlobalUiSettings>('GlobalUiSettings', globalUiSettingsSchema);
