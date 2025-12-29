import mongoose, { Document, Schema } from 'mongoose';
import { FlowTemplateStatus } from '../types/flow';

export interface IFlowTemplate extends Document {
  name: string;
  description?: string;
  status: FlowTemplateStatus;
  currentVersionId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flowTemplateSchema = new Schema<IFlowTemplate>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  currentVersionId: { type: Schema.Types.ObjectId, ref: 'FlowTemplateVersion' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

flowTemplateSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model<IFlowTemplate>('FlowTemplate', flowTemplateSchema);
