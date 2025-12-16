import mongoose, { Document, Schema } from 'mongoose';
import { GoalType } from '../types/automationGoals';

export interface ILeadCapture extends Document {
  workspaceId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  goalType: GoalType;
  participantName?: string;
  participantHandle?: string;
  name?: string;
  phone?: string;
  email?: string;
  customNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const leadCaptureSchema = new Schema<ILeadCapture>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  goalType: { type: String, required: true },
  participantName: { type: String },
  participantHandle: { type: String },
  name: { type: String },
  phone: { type: String },
  email: { type: String },
  customNote: { type: String },
}, { timestamps: true });

export default mongoose.model<ILeadCapture>('LeadCapture', leadCaptureSchema);
