import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  text: string;
  from: 'customer' | 'user' | 'ai';

  // Instagram-specific fields
  instagramMessageId?: string;           // Instagram's message ID
  platform: 'instagram' | 'mock';        // Platform identifier
  attachments?: {
    type: 'image' | 'video' | 'audio' | 'voice' | 'file';
    url: string;
    previewUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    fileSize?: number;
    duration?: number;                   // Duration in seconds for audio/video
    width?: number;                      // Width for images/videos
    height?: number;                     // Height for images/videos
    fileName?: string;
    transcription?: string;              // Transcribed text for voice/audio messages
  }[];
  linkPreview?: {
    url: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
  };
  metadata?: Record<string, any>;       // Additional Instagram data

  // Categorization fields (Phase 2)
  categoryId?: mongoose.Types.ObjectId;  // Reference to MessageCategory
  detectedLanguage?: string;             // ISO language code (e.g., 'en', 'ar', 'es')
  translatedText?: string;               // English translation for analysis
  aiTags?: string[];                     // Semantic labels returned by AI
  aiShouldEscalate?: boolean;            // Escalation flag from AI
  aiEscalationReason?: string;           // Short reason for escalation

  // Automation source tracking
  automationSource?: 'comment_dm' | 'auto_reply' | 'followup';  // Source of automated message

  // Read receipts
  seenAt?: Date;                         // When the message was seen by the recipient

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
      enum: ['image', 'video', 'audio', 'voice', 'file'],
    },
    url: String,
    previewUrl: String,
    thumbnailUrl: String,
    mimeType: String,
    fileSize: Number,
    duration: Number,
    width: Number,
    height: Number,
    fileName: String,
    transcription: String,
  }],
  linkPreview: {
    url: String,
    title: String,
    description: String,
    imageUrl: String,
    siteName: String,
  },
  metadata: {
    type: Schema.Types.Mixed,
  },

  // Categorization fields (Phase 2)
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'MessageCategory',
    sparse: true,
  },
  detectedLanguage: {
    type: String,
    sparse: true,
  },
  translatedText: {
    type: String,
    sparse: true,
  },
  aiTags: {
    type: [String],
    default: [],
  },
  aiShouldEscalate: {
    type: Boolean,
  },
  aiEscalationReason: {
    type: String,
    trim: true,
  },

  // Automation source tracking
  automationSource: {
    type: String,
    enum: ['comment_dm', 'auto_reply', 'followup'],
    sparse: true,
  },

  // Read receipts
  seenAt: {
    type: Date,
    sparse: true,
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

export default mongoose.model<IMessage>('Message', messageSchema);
