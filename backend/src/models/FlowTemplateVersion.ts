import mongoose, { Document, Schema } from 'mongoose';
import {
  CompiledFlow,
  FlowDsl,
  FlowExposedField,
  FlowTemplateDisplay,
  FlowTemplateVersionStatus,
  FlowTriggerDefinition,
  AiSummarySettings,
} from '../types/flow';

export interface IFlowTemplateVersion extends Document {
  templateId: mongoose.Types.ObjectId;
  version: number;
  versionLabel?: string;
  status: FlowTemplateVersionStatus;
  compiled: CompiledFlow;
  dslSnapshot?: FlowDsl;
  triggers?: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  display?: FlowTemplateDisplay;
  aiSummarySettings?: AiSummarySettings;
  publishedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
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

const flowTemplateVersionSchema = new Schema<IFlowTemplateVersion>({
  templateId: { type: Schema.Types.ObjectId, ref: 'FlowTemplate', required: true, index: true },
  version: { type: Number, required: true },
  versionLabel: { type: String, trim: true },
  status: { type: String, enum: ['published', 'archived'], default: 'published' },
  compiled: { type: Schema.Types.Mixed, required: true },
  dslSnapshot: { type: Schema.Types.Mixed },
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
  aiSummarySettings: {
    enabled: { type: Boolean },
    provider: { type: String, enum: ['openai', 'groq'] },
    model: { type: String, trim: true },
    temperature: { type: Number },
    maxOutputTokens: { type: Number },
    historyLimit: { type: Number },
    systemPrompt: { type: String, trim: true },
  },
  publishedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

flowTemplateVersionSchema.index({ templateId: 1, version: -1 });
flowTemplateVersionSchema.index({ templateId: 1, status: 1, version: -1 });
flowTemplateVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });

export default mongoose.model<IFlowTemplateVersion>('FlowTemplateVersion', flowTemplateVersionSchema);
