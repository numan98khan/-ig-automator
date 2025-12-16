import mongoose, { Document, Schema } from 'mongoose';
import { DriveTargetType } from '../types/automationGoals';

export interface IChannelDriveEvent extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  targetType: DriveTargetType;
  targetLink?: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const channelDriveEventSchema = new Schema<IChannelDriveEvent>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  targetType: { type: String, enum: ['website', 'WhatsApp', 'store', 'app'], required: true },
  targetLink: { type: String },
  note: { type: String },
}, { timestamps: true });

export default mongoose.model<IChannelDriveEvent>('ChannelDriveEvent', channelDriveEventSchema);
