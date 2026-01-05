import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
  workspaceId: mongoose.Types.ObjectId;
  participantName: string;
  participantHandle: string;
  contactEmail?: string;
  contactPhone?: string;
  tags?: string[];
  stage?: 'new' | 'engaged' | 'qualified' | 'won' | 'lost';
  ownerId?: mongoose.Types.ObjectId;
  profilePictureUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContact>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true,
  },
  participantName: {
    type: String,
    required: true,
    trim: true,
  },
  participantHandle: {
    type: String,
    required: true,
    trim: true,
  },
  contactEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  contactPhone: {
    type: String,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  stage: {
    type: String,
    enum: ['new', 'engaged', 'qualified', 'won', 'lost'],
    default: 'new',
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  profilePictureUrl: {
    type: String,
  },
}, {
  timestamps: true,
});

contactSchema.index({ workspaceId: 1, updatedAt: -1 });
contactSchema.index({ workspaceId: 1, stage: 1 });
contactSchema.index({ workspaceId: 1, tags: 1 });
contactSchema.index({ workspaceId: 1, ownerId: 1 });

export default mongoose.model<IContact>('Contact', contactSchema);
