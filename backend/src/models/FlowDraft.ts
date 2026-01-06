import mongoose, { Document, Schema } from 'mongoose';
import {
  FlowDsl,
  FlowDraftStatus,
  FlowExposedField,
  FlowTemplateDisplay,
  FlowTriggerDefinition,
} from '../types/flow';

export interface IFlowDraft extends Document {
  name: string;
  description?: string;
  status: FlowDraftStatus;
  templateId?: mongoose.Types.ObjectId;
  dsl: FlowDsl;
  triggers?: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  display?: FlowTemplateDisplay;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flowFieldOptionSchema = new Schema({
  label: { type: String, required: true },
  value: { type: String, required: true },
}, { _id: false });

const flowFieldSchema = new Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'select', 'multi_select', 'json', 'text'],
    required: true,
  },
  description: { type: String, trim: true },
  required: { type: Boolean, default: false },
  defaultValue: { type: Schema.Types.Mixed },
  options: { type: [flowFieldOptionSchema], default: [] },
  ui: {
    placeholder: { type: String, trim: true },
    helpText: { type: String, trim: true },
    group: { type: String, trim: true },
    order: { type: Number },
    widget: { type: String, trim: true },
  },
  validation: {
    min: { type: Number },
    max: { type: Number },
    pattern: { type: String, trim: true },
  },
  source: {
    nodeId: { type: String, trim: true },
    path: { type: String, trim: true },
  },
}, { _id: false });

const triggerDefinitionSchema = new Schema({
  type: {
    type: String,
    enum: ['post_comment', 'story_reply', 'story_mention', 'dm_message', 'story_share', 'instagram_ads', 'live_comment', 'ref_url'],
    required: true,
  },
  config: { type: Schema.Types.Mixed },
  label: { type: String, trim: true },
  description: { type: String, trim: true },
}, { _id: false });

const previewMessageSchema = new Schema({
  from: { type: String, enum: ['bot', 'customer'], required: true },
  message: { type: String, required: true, trim: true },
}, { _id: false });

const flowDraftSchema = new Schema<IFlowDraft>({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  status: { type: String, enum: ['draft', 'archived'], default: 'draft' },
  templateId: { type: Schema.Types.ObjectId, ref: 'FlowTemplate' },
  dsl: { type: Schema.Types.Mixed, required: true },
  triggers: { type: [triggerDefinitionSchema], default: [] },
  exposedFields: { type: [flowFieldSchema], default: [] },
  display: {
    outcome: { type: String, trim: true },
    goal: { type: String, enum: ['Bookings', 'Sales', 'Leads', 'Support', 'General'] },
    industry: {
      type: String,
      enum: ['Clinics', 'Salons', 'Retail', 'Restaurants', 'Real Estate', 'General'],
    },
    setupTime: { type: String, trim: true },
    collects: { type: [String], default: [] },
    icon: { type: String, trim: true },
    previewConversation: { type: [previewMessageSchema], default: [] },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

flowDraftSchema.index({ templateId: 1, updatedAt: -1 });
flowDraftSchema.index({ status: 1, updatedAt: -1 });

export default mongoose.model<IFlowDraft>('FlowDraft', flowDraftSchema);
