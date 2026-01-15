import mongoose, { Document, Schema } from 'mongoose';
import { TriggerType } from '../types/automation';

export interface IAutomationMessageBuffer extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  triggerType: TriggerType;
  platform?: string;
  source?: 'live' | 'simulate';
  sessionId?: mongoose.Types.ObjectId;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  bufferStartedAt: Date;
  bufferUntil: Date;
  lastMessageAt?: Date;
  messageCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const automationMessageBufferSchema = new Schema<IAutomationMessageBuffer>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  instagramAccountId: { type: Schema.Types.ObjectId, ref: 'InstagramAccount', required: true },
  triggerType: {
    type: String,
    enum: ['post_comment', 'story_reply', 'story_mention', 'dm_message', 'story_share', 'instagram_ads', 'live_comment', 'ref_url'],
    required: true,
  },
  platform: { type: String, trim: true },
  source: {
    type: String,
    enum: ['live', 'simulate'],
    default: 'live',
  },
  sessionId: { type: Schema.Types.ObjectId, ref: 'AutomationSession' },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
  },
  bufferStartedAt: { type: Date, required: true },
  bufferUntil: { type: Date, required: true },
  lastMessageAt: { type: Date },
  messageCount: { type: Number, default: 0 },
  errorMessage: { type: String },
}, {
  timestamps: true,
});

automationMessageBufferSchema.index({ status: 1, bufferUntil: 1 });
automationMessageBufferSchema.index({ conversationId: 1, status: 1 });

export default mongoose.model<IAutomationMessageBuffer>('AutomationMessageBuffer', automationMessageBufferSchema);
