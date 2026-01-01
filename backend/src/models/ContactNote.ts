import mongoose, { Document, Schema } from 'mongoose';

export interface IContactNote extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactNoteSchema = new Schema<IContactNote>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  },
  authorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  body: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true,
});

contactNoteSchema.index({ workspaceId: 1, conversationId: 1, createdAt: -1 });

export default mongoose.model<IContactNote>('ContactNote', contactNoteSchema);
