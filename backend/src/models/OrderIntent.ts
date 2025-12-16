import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderIntent extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  catalogUrl?: string;
  productName?: string;
  quantity?: string;
  variant?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderIntentSchema = new Schema<IOrderIntent>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  catalogUrl: { type: String },
  productName: { type: String },
  quantity: { type: String },
  variant: { type: String },
  summary: { type: String },
}, { timestamps: true });

export default mongoose.model<IOrderIntent>('OrderIntent', orderIntentSchema);
