import mongoose, { Document, Schema } from 'mongoose';

export interface IConversation extends Document {
  participantName: string;
  participantHandle: string;
  participantProfilePictureUrl?: string;
  contactId?: mongoose.Types.ObjectId;
  contactEmail?: string;
  contactPhone?: string;
  tags?: string[];
  stage?: 'new' | 'engaged' | 'qualified' | 'won' | 'lost';
  ownerId?: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  lastMessage?: string;

  // Instagram-specific fields
  instagramConversationId?: string;      // Instagram's conversation ID
  participantInstagramId?: string;       // Participant's Instagram ID
  platform: 'instagram' | 'mock';        // Platform identifier

  // Phase 2: Automation tracking
  lastCustomerMessageAt?: Date;          // Last message from customer (for 24h window)
  lastBusinessMessageAt?: Date;          // Last message from business/AI
  autoReplyDisabled?: boolean;           // Manually disable auto-reply for this conversation

  // Human-in-the-loop / escalation tracking
  humanRequired?: boolean;
  humanRequiredReason?: string;
  humanTriggeredAt?: Date;
  humanTriggeredByMessageId?: mongoose.Types.ObjectId;
  humanHoldUntil?: Date;

  // AI summary (audit + automation context)
  aiSummary?: string;
  aiSummaryUpdatedAt?: Date;

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
  participantProfilePictureUrl: {
    type: String,
  },
  contactId: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    index: true,
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  contactPhone: {
    type: String,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  stage: {
    type: String,
    enum: ['new', 'engaged', 'qualified', 'won', 'lost'],
    default: 'new',
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
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

  // Phase 2: Automation tracking
  lastCustomerMessageAt: {
    type: Date,
  },
  lastBusinessMessageAt: {
    type: Date,
  },
  autoReplyDisabled: {
    type: Boolean,
    default: false,
  },

  // Human-in-the-loop / escalation tracking
  humanRequired: {
    type: Boolean,
    default: false,
  },
  humanRequiredReason: {
    type: String,
    trim: true,
  },
  humanTriggeredAt: {
    type: Date,
  },
  humanTriggeredByMessageId: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
  },
  humanHoldUntil: {
    type: Date,
  },

  aiSummary: {
    type: String,
    trim: true,
  },
  aiSummaryUpdatedAt: {
    type: Date,
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
conversationSchema.index({ workspaceId: 1, updatedAt: -1 });
conversationSchema.index({ workspaceId: 1, stage: 1 });
conversationSchema.index({ workspaceId: 1, tags: 1 });
conversationSchema.index({ workspaceId: 1, ownerId: 1 });
conversationSchema.index({ contactId: 1, lastMessageAt: -1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
