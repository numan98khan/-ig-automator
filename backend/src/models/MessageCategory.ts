import mongoose, { Document, Schema } from 'mongoose';

export interface IMessageCategory extends Document {
  workspaceId: mongoose.Types.ObjectId;
  nameEn: string;               // Category name in English (e.g., "Pricing", "Booking", "Support")
  description?: string;         // Optional description of the category
  isSystem: boolean;            // System-created vs user-defined
  autoReplyEnabled: boolean;    // Whether auto-reply is enabled for this category
  messageCount: number;         // Count of messages in this category
  createdAt: Date;
  updatedAt: Date;
}

const messageCategorySchema = new Schema<IMessageCategory>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  nameEn: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  isSystem: {
    type: Boolean,
    default: false,
  },
  autoReplyEnabled: {
    type: Boolean,
    default: true,
  },
  messageCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Compound index for workspace + category name (unique within workspace)
messageCategorySchema.index({ workspaceId: 1, nameEn: 1 }, { unique: true });

// Default system categories
export const DEFAULT_CATEGORIES = [
  { nameEn: 'General', description: 'General inquiries and questions', isSystem: true },
  { nameEn: 'Pricing', description: 'Questions about prices, costs, and payment', isSystem: true },
  { nameEn: 'Booking', description: 'Appointment scheduling and reservations', isSystem: true },
  { nameEn: 'Support', description: 'Help requests and problem resolution', isSystem: true },
  { nameEn: 'Order Status', description: 'Questions about order tracking and delivery', isSystem: true },
  { nameEn: 'Product Info', description: 'Questions about products and services', isSystem: true },
  { nameEn: 'Opening Hours', description: 'Questions about business hours and availability', isSystem: true },
  { nameEn: 'Location', description: 'Questions about addresses and directions', isSystem: true },
  { nameEn: 'Feedback', description: 'Reviews, complaints, and suggestions', isSystem: true },
  { nameEn: 'Other', description: 'Messages that do not fit other categories', isSystem: true },
];

export default mongoose.model<IMessageCategory>('MessageCategory', messageCategorySchema);
