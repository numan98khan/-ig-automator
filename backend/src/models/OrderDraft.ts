import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderDraft extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  productRef?: {
    type?: 'text' | 'link' | 'image';
    value?: string;
  };
  sku?: string;
  productName?: string;
  variant?: {
    size?: string;
    color?: string;
  };
  quantity?: number;
  city?: string;
  address?: string;
  phone?: string;
  paymentMethod?: 'online' | 'cod';
  quote?: {
    price?: string;
    stock?: string;
    shippingFee?: number;
    eta?: string;
    currency?: string;
  };
  status: 'draft' | 'queued' | 'payment_sent' | 'needs_confirmation';
  createdAt: Date;
  updatedAt: Date;
}

const orderDraftSchema = new Schema<IOrderDraft>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  productRef: {
    type: {
      type: String,
      enum: ['text', 'link', 'image'],
    },
    value: { type: String, trim: true },
  },
  sku: { type: String, trim: true },
  productName: { type: String, trim: true },
  variant: {
    size: { type: String, trim: true },
    color: { type: String, trim: true },
  },
  quantity: { type: Number, min: 1 },
  city: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  paymentMethod: { type: String, enum: ['online', 'cod'] },
  quote: {
    price: { type: String, trim: true },
    stock: { type: String, trim: true },
    shippingFee: { type: Number },
    eta: { type: String, trim: true },
    currency: { type: String, trim: true },
  },
  status: {
    type: String,
    enum: ['draft', 'queued', 'payment_sent', 'needs_confirmation'],
    default: 'draft',
  },
}, { timestamps: true });

orderDraftSchema.index({ workspaceId: 1, createdAt: -1 });
orderDraftSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model<IOrderDraft>('OrderDraft', orderDraftSchema);
