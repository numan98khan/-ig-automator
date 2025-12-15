import mongoose, { Document, Schema } from 'mongoose';

export interface IMessageCategory extends Document {
  workspaceId: mongoose.Types.ObjectId;
  nameEn: string;               // Category name in English (e.g., "Pricing", "Booking", "Support")
  description?: string;         // Legacy description
  descriptionEn?: string;       // English description with clearer guidance
  exampleMessages?: string[];   // Short example customer messages that fit this category
  aiPolicy?: 'full_auto' | 'assist_only' | 'escalate';
  escalationNote?: string;
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
  descriptionEn: {
    type: String,
    trim: true,
  },
  exampleMessages: {
    type: [String],
    default: [],
  },
  aiPolicy: {
    type: String,
    enum: ['full_auto', 'assist_only', 'escalate'],
    default: 'full_auto',
  },
  escalationNote: {
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
  {
    nameEn: 'General',
    descriptionEn: 'General inquiries and questions that do not fit other categories',
    exampleMessages: ['Thanks!', 'Got it.', 'Can you help me?'],
    aiPolicy: 'assist_only',
    isSystem: true,
  },
  {
    nameEn: 'Pricing',
    descriptionEn: 'Questions about prices, costs, discounts, or payment methods',
    exampleMessages: ['How much is it?', 'Do you have any discounts?', 'What payment methods do you accept?'],
    aiPolicy: 'assist_only',
    escalationNote: 'Do not promise discounts or commit pricing without approval.',
    isSystem: true,
  },
  {
    nameEn: 'Booking',
    descriptionEn: 'Appointment scheduling, availability, and reservation requests',
    exampleMessages: ['Can I book for tomorrow?', 'Are you free this weekend?', 'How do I schedule an appointment?'],
    aiPolicy: 'assist_only',
    isSystem: true,
  },
  {
    nameEn: 'Support',
    descriptionEn: 'Help requests, troubleshooting, and issue resolution',
    exampleMessages: ['My order is wrong', 'I need help with the app', 'Something is not working'],
    aiPolicy: 'assist_only',
    isSystem: true,
  },
  {
    nameEn: 'Order Status',
    descriptionEn: 'Tracking, delivery timing, and order progress updates',
    exampleMessages: ['Where is my order?', 'When will it arrive?', 'Has my package shipped?'],
    aiPolicy: 'full_auto',
    isSystem: true,
  },
  {
    nameEn: 'Product Info',
    descriptionEn: 'Details about products or services, features, sizing, or materials',
    exampleMessages: ['What colors are available?', 'Is this vegan?', 'Does it come in size M?'],
    aiPolicy: 'full_auto',
    isSystem: true,
  },
  {
    nameEn: 'Opening Hours',
    descriptionEn: 'Business hours, holidays, and availability windows',
    exampleMessages: ['What time do you close?', 'Are you open on Sunday?', 'When are you available?'],
    aiPolicy: 'full_auto',
    isSystem: true,
  },
  {
    nameEn: 'Location',
    descriptionEn: 'Addresses, directions, delivery zones, or service areas',
    exampleMessages: ['Where are you located?', 'Do you deliver to my area?', 'What is your address?'],
    aiPolicy: 'full_auto',
    isSystem: true,
  },
  {
    nameEn: 'Feedback',
    descriptionEn: 'Reviews, complaints, compliments, and suggestions',
    exampleMessages: ['Great service!', 'I want to complain', 'Can you improve this feature?'],
    aiPolicy: 'assist_only',
    isSystem: true,
  },
  {
    nameEn: 'Other',
    descriptionEn: 'Messages that do not fit other categories',
    exampleMessages: ['Random request', 'Off-topic message'],
    aiPolicy: 'assist_only',
    isSystem: true,
  },
];

export default mongoose.model<IMessageCategory>('MessageCategory', messageCategorySchema);
