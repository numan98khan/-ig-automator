import mongoose, { Document, Schema } from 'mongoose';

export interface IFollowupTask extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  participantInstagramId: string;

  // Timing
  lastCustomerMessageAt: Date;    // When the customer last sent a message
  lastBusinessMessageAt?: Date;   // When business/AI last sent a message
  windowExpiresAt: Date;          // 24h window expiry time
  scheduledFollowupAt: Date;      // When follow-up should be sent

  // Status
  status: 'scheduled' | 'sent' | 'cancelled' | 'expired' | 'customer_replied';

  // Result
  followupMessageId?: string;     // Instagram message ID if sent
  followupText?: string;          // Text that was sent
  sentAt?: Date;                  // When follow-up was actually sent
  errorMessage?: string;          // Error if failed

  createdAt: Date;
  updatedAt: Date;
}

const followupTaskSchema = new Schema<IFollowupTask>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  instagramAccountId: {
    type: Schema.Types.ObjectId,
    ref: 'InstagramAccount',
    required: true,
  },
  participantInstagramId: {
    type: String,
    required: true,
  },

  // Timing
  lastCustomerMessageAt: {
    type: Date,
    required: true,
  },
  lastBusinessMessageAt: {
    type: Date,
  },
  windowExpiresAt: {
    type: Date,
    required: true,
  },
  scheduledFollowupAt: {
    type: Date,
    required: true,
  },

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'sent', 'cancelled', 'expired', 'customer_replied'],
    default: 'scheduled',
  },

  // Result
  followupMessageId: {
    type: String,
  },
  followupText: {
    type: String,
  },
  sentAt: {
    type: Date,
  },
  errorMessage: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for efficient lookups
followupTaskSchema.index({ workspaceId: 1, conversationId: 1 });
followupTaskSchema.index({ status: 1, scheduledFollowupAt: 1 });
followupTaskSchema.index({ conversationId: 1, status: 1 });

export default mongoose.model<IFollowupTask>('FollowupTask', followupTaskSchema);
