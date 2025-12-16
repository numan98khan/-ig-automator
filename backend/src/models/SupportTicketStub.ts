import mongoose, { Document, Schema } from 'mongoose';

export interface ISupportTicketStub extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  orderId?: string;
  photoUrl?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const supportTicketStubSchema = new Schema<ISupportTicketStub>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  orderId: { type: String },
  photoUrl: { type: String },
  summary: { type: String },
}, { timestamps: true });

export default mongoose.model<ISupportTicketStub>('SupportTicketStub', supportTicketStubSchema);
