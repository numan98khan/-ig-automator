import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportTicketComment extends Document {
  ticketId: mongoose.Types.ObjectId;
  authorType: 'user' | 'admin' | 'system';
  authorId?: mongoose.Types.ObjectId;
  message: string;
  attachments?: { name: string; url?: string; type?: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketCommentSchema = new Schema<ISupportTicketComment>(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket', required: true },
    authorType: { type: String, enum: ['user', 'admin', 'system'], required: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    attachments: [
      {
        name: String,
        url: String,
        type: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ISupportTicketComment>('SupportTicketComment', supportTicketCommentSchema);
