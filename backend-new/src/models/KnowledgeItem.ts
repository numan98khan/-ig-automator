import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeItem extends Document {
  title: string;
  content: string;
  workspaceId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const knowledgeItemSchema = new Schema<IKnowledgeItem>({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IKnowledgeItem>('KnowledgeItem', knowledgeItemSchema);
