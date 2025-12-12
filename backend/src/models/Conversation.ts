import mongoose, { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
  participantName: string;
  participantHandle: string;
  workspaceId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  lastMessage?: string;

  // Instagram-specific fields
  instagramConversationId?: string;      // Instagram's conversation ID
  participantInstagramId?: string;       // Participant's Instagram ID
  platform: 'instagram' | 'mock';        // Platform identifier

  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>({
  participantName: {
    type: String,
    required: true,
  },
  participantHandle: {
    type: String,
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  instagramAccountId: {
    type: Schema.Types.ObjectId,
    ref: 'InstagramAccount',
    required: true,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  lastMessage: {
    type: String,
  },

  // Instagram-specific fields
  instagramConversationId: {
    type: String,
    sparse: true,
    index: true,
  },
  participantInstagramId: {
    type: String,
    sparse: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'mock'],
    default: 'mock',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Create compound index for efficient lookups
conversationSchema.index({ instagramAccountId: 1, instagramConversationId: 1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
