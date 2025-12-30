import mongoose, { Schema } from 'mongoose';

export interface IAdminLogEvent {
  workspaceId?: mongoose.Types.ObjectId;
  category: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: Record<string, any>;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const adminLogEventSchema = new Schema<IAdminLogEvent>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    category: { type: String, required: true, index: true },
    level: { type: String, required: true, default: 'info', index: true },
    message: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    source: { type: String },
  },
  { timestamps: true },
);

adminLogEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export default mongoose.model<IAdminLogEvent>('AdminLogEvent', adminLogEventSchema);
