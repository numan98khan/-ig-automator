import mongoose, { Document, Schema } from 'mongoose';

export interface ICommentDMLog extends Document {
  workspaceId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  commentId: string;            // Instagram comment ID
  commenterId: string;          // Instagram user ID of the commenter
  commenterUsername?: string;   // Username of the commenter
  commentText: string;          // Original comment text
  mediaId: string;              // Instagram media/post ID
  dmSent: boolean;              // Whether DM was sent
  dmMessageId?: string;         // Instagram message ID of the sent DM
  dmText?: string;              // Text of the DM that was sent
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  errorMessage?: string;        // Error message if failed
  processedAt?: Date;           // When the comment was processed
  createdAt: Date;
  updatedAt: Date;
}

const commentDMLogSchema = new Schema<ICommentDMLog>({
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
  commentId: {
    type: String,
    required: true,
    unique: true,
  },
  commenterId: {
    type: String,
    required: true,
  },
  commenterUsername: {
    type: String,
  },
  commentText: {
    type: String,
    required: true,
  },
  mediaId: {
    type: String,
    required: true,
  },
  dmSent: {
    type: Boolean,
    default: false,
  },
  dmMessageId: {
    type: String,
  },
  dmText: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending',
  },
  errorMessage: {
    type: String,
  },
  processedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Index for efficient lookups
commentDMLogSchema.index({ workspaceId: 1, commentId: 1 });
commentDMLogSchema.index({ commenterId: 1 });
commentDMLogSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ICommentDMLog>('CommentDMLog', commentDMLogSchema);
