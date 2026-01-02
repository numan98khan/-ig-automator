import mongoose, { Document, Schema } from 'mongoose';

export type UiTheme = 'legacy' | 'comic';

export interface IGlobalUiSettings extends Document {
  uiTheme?: UiTheme;
  createdAt: Date;
  updatedAt: Date;
}

const globalUiSettingsSchema = new Schema<IGlobalUiSettings>(
  {
    uiTheme: {
      type: String,
      trim: true,
      default: 'legacy',
      enum: ['legacy', 'comic'],
    },
  },
  { timestamps: true },
);

export default mongoose.model<IGlobalUiSettings>('GlobalUiSettings', globalUiSettingsSchema);
