import mongoose, { Document, Schema } from 'mongoose';
import { GoalType } from '../types/automationGoals';

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

  // Phase 2: Automation tracking
  lastCustomerMessageAt?: Date;          // Last message from customer (for 24h window)
  lastBusinessMessageAt?: Date;          // Last message from business/AI
  autoReplyDisabled?: boolean;           // Manually disable auto-reply for this conversation

  // AI Categorization
  categoryId?: mongoose.Types.ObjectId;
  detectedLanguage?: string;
  categoryConfidence?: number;

  // Human-in-the-loop / escalation tracking
  humanRequired?: boolean;
  humanRequiredReason?: string;
  humanTriggeredAt?: Date;
  humanTriggeredByMessageId?: mongoose.Types.ObjectId;
  humanHoldUntil?: Date;

  // DM Goal flows
  activeGoalType?: GoalType;
  goalState?: 'idle' | 'collecting' | 'completed';
  goalCollectedFields?: Record<string, any>;
  goalSummary?: string;
  goalLastInteractionAt?: Date;

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

  // AI Categorization
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'MessageCategory',
  },
  detectedLanguage: {
    type: String,
  },
  categoryConfidence: {
    type: Number,
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

  // DM Goals
  activeGoalType: {
    type: String,
    enum: ['none', 'capture_lead', 'book_appointment', 'start_order', 'handle_support', 'drive_to_channel'],
  },
  goalState: {
    type: String,
    enum: ['idle', 'collecting', 'completed'],
    default: 'idle',
  },
  goalCollectedFields: {
    type: Schema.Types.Mixed,
  },
  goalSummary: {
    type: String,
  },
  goalLastInteractionAt: {
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

export default mongoose.model<IConversation>('Conversation', conversationSchema);
