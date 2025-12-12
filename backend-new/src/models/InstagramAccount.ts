import mongoose, { Document, Schema } from 'mongoose';

export interface IInstagramAccount extends Document {
  username: string;
  workspaceId: mongoose.Types.ObjectId;
  status: 'connected' | 'mock';
  createdAt: Date;
}

const instagramAccountSchema = new Schema<IInstagramAccount>({
  username: {
    type: String,
    required: true,
    trim: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  status: {
    type: String,
    enum: ['connected', 'mock'],
    default: 'mock',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IInstagramAccount>('InstagramAccount', instagramAccountSchema);
