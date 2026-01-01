import mongoose, { Document, Schema } from 'mongoose';

export interface IInstagramAccount extends Document {
  username: string;
  workspaceId: mongoose.Types.ObjectId;
  status: 'connected';

  // OAuth & Account Details
  instagramAccountId?: string;  // Business Account ID (for webhooks)
  instagramUserId?: string;     // App-scoped User ID
  name?: string;
  profilePictureUrl?: string;
  followersCount?: number;
  followsCount?: number;
  mediaCount?: number;
  accountType?: string;

  // Access Token
  accessToken?: string;
  tokenExpiresAt?: Date;
  lastSyncedAt?: Date;

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
    enum: ['connected'],
    default: 'connected',
  },

  // OAuth & Account Details
  instagramAccountId: {
    type: String,
    sparse: true,
  },
  instagramUserId: {
    type: String,
    sparse: true,
  },
  name: {
    type: String,
  },
  profilePictureUrl: {
    type: String,
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  followsCount: {
    type: Number,
    default: 0,
  },
  mediaCount: {
    type: Number,
    default: 0,
  },
  accountType: {
    type: String,
  },

  // Access Token
  accessToken: {
    type: String,
    select: false, // Don't include in queries by default for security
  },
  tokenExpiresAt: {
    type: Date,
  },
  lastSyncedAt: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IInstagramAccount>('InstagramAccount', instagramAccountSchema);
