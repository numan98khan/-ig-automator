import mongoose, { Document, Schema } from 'mongoose';

export interface IKnowledgeItem extends Document {
  title: string;
  content: string;
  workspaceId?: mongoose.Types.ObjectId;
  storageMode: 'vector' | 'text';
  active: boolean;
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
    required: false,
  },
  storageMode: {
    type: String,
    enum: ['vector', 'text'],
    default: 'vector',
  },
  active: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IKnowledgeItem>('KnowledgeItem', knowledgeItemSchema);
