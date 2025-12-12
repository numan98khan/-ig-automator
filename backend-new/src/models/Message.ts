import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  text: string;
  from: 'customer' | 'user' | 'ai';
  createdAt: Date;
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IMessage>('Message', messageSchema);
