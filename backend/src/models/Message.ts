import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  text: string;
  from: 'customer' | 'user' | 'ai';

  // Instagram-specific fields
  instagramMessageId?: string;           // Instagram's message ID
  platform: 'instagram' | 'mock';        // Platform identifier
  attachments?: {
    type: string;                        // 'image', 'video', 'audio', 'file'
    url: string;
    previewUrl?: string;
  }[];
  metadata?: Record<string, any>;       // Additional Instagram data

  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  from: {
    type: String,
    enum: ['customer', 'user', 'ai'],
    required: true,
  },

  // Instagram-specific fields
  instagramMessageId: {
    type: String,
    sparse: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['instagram', 'mock'],
    default: 'mock',
  },
  attachments: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'file'],
    },
    url: String,
    previewUrl: String,
  }],
  metadata: {
    type: Schema.Types.Mixed,
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
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ instagramMessageId: 1 }, { sparse: true });

export default mongoose.model<IMessage>('Message', messageSchema);
