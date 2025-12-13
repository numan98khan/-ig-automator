import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryKnowledge extends Document {
  workspaceId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  content: string;              // Instructions/knowledge for how to answer this category
  language: string;             // Language of the content (default: English)
  createdAt: Date;
  updatedAt: Date;
}

const categoryKnowledgeSchema = new Schema<ICategoryKnowledge>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'MessageCategory',
    required: true,
  },
  content: {
    type: String,
    required: true,
    default: '',
  },
  language: {
    type: String,
    default: 'en',
  },
}, {
  timestamps: true,
});

// Index for efficient lookups
categoryKnowledgeSchema.index({ workspaceId: 1, categoryId: 1 }, { unique: true });

export default mongoose.model<ICategoryKnowledge>('CategoryKnowledge', categoryKnowledgeSchema);
