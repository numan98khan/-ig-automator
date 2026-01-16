import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspaceSettings extends Document {
  workspaceId: mongoose.Types.ObjectId;
  assistantName?: string;
  assistantDescription?: string;
  systemPrompt?: string;
  businessName?: string;
  businessDescription?: string;
  businessHours?: string;
  businessTone?: string;
  businessLocation?: string;
  businessWebsite?: string;
  businessCatalog?: Array<{
    name: string;
    description?: string;
    price?: string;
  }>;
  businessDocuments?: Array<{
    title: string;
    url?: string;
  }>;
  demoModeEnabled?: boolean;
  onboarding?: {
    connectCompletedAt?: Date;
    templateSelectedAt?: Date;
    basicsCompletedAt?: Date;
    simulatorCompletedAt?: Date;
    publishCompletedAt?: Date;
  };

  // Language settings
  defaultLanguage: string;        // Legacy default
  defaultReplyLanguage?: string;  // Preferred reply language
  uiLanguage: string;             // Platform UI language (for future use)
  allowHashtags?: boolean;
  allowEmojis?: boolean;
  maxReplySentences?: number;
  decisionMode?: 'full_auto' | 'assist' | 'info_only';
  escalationGuidelines?: string;
  escalationExamples?: string[];
  humanEscalationBehavior?: 'ai_silent' | 'ai_allowed';
  humanHoldMinutes?: number;

  googleSheets?: {
    enabled?: boolean;
    spreadsheetId?: string;
    sheetName?: string;
    serviceAccountJson?: string;
    headerRow?: number;
    inventoryMapping?: {
      fields?: Record<string, {
        header?: string;
        confidence?: number;
        notes?: string;
      }>;
      summary?: string;
      updatedAt?: Date;
      sourceRange?: string;
      sourceHeaders?: string[];
    };
    oauthConnected?: boolean;
    oauthConnectedAt?: Date;
    oauthEmail?: string;
    oauthRefreshToken?: string;
    lastTestedAt?: Date;
    lastTestStatus?: 'success' | 'failed';
    lastTestMessage?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const googleSheetsConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  spreadsheetId: { type: String, trim: true },
  sheetName: { type: String, trim: true },
  serviceAccountJson: { type: String },
  headerRow: { type: Number, min: 1, default: 1 },
  inventoryMapping: {
    type: new Schema({
      fields: { type: Schema.Types.Mixed, default: {} },
      summary: { type: String, trim: true },
      updatedAt: { type: Date },
      sourceRange: { type: String, trim: true },
      sourceHeaders: { type: [String], default: [] },
    }, { _id: false }),
    default: undefined,
  },
  oauthConnected: { type: Boolean, default: false },
  oauthConnectedAt: { type: Date },
  oauthEmail: { type: String, trim: true },
  oauthRefreshToken: { type: String },
  lastTestedAt: { type: Date },
  lastTestStatus: { type: String, enum: ['success', 'failed'] },
  lastTestMessage: { type: String, trim: true },
}, { _id: false });

const workspaceSettingsSchema = new Schema<IWorkspaceSettings>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    unique: true,
  },
  assistantName: {
    type: String,
    trim: true,
  },
  assistantDescription: {
    type: String,
    trim: true,
  },
  systemPrompt: {
    type: String,
    trim: true,
  },
  businessName: {
    type: String,
    trim: true,
  },
  businessDescription: {
    type: String,
    trim: true,
  },
  businessHours: {
    type: String,
    trim: true,
  },
  businessTone: {
    type: String,
    trim: true,
  },
  businessLocation: {
    type: String,
    trim: true,
  },
  businessWebsite: {
    type: String,
    trim: true,
  },
  businessCatalog: {
    type: [
      new Schema({
        name: { type: String, trim: true, required: true },
        description: { type: String, trim: true },
        price: { type: String, trim: true },
      }, { _id: false }),
    ],
    default: [],
  },
  businessDocuments: {
    type: [
      new Schema({
        title: { type: String, trim: true, required: true },
        url: { type: String, trim: true },
      }, { _id: false }),
    ],
    default: [],
  },
  demoModeEnabled: {
    type: Boolean,
    default: true,
  },
  onboarding: {
    type: new Schema({
      connectCompletedAt: { type: Date },
      templateSelectedAt: { type: Date },
      basicsCompletedAt: { type: Date },
      simulatorCompletedAt: { type: Date },
      publishCompletedAt: { type: Date },
    }, { _id: false }),
    default: undefined,
  },

  // Language settings
  defaultLanguage: {
    type: String,
    default: 'en',
    trim: true,
  },
  defaultReplyLanguage: {
    type: String,
    trim: true,
  },
  uiLanguage: {
    type: String,
    default: 'en',
    trim: true,
  },
  allowHashtags: {
    type: Boolean,
    default: false,
  },
  allowEmojis: {
    type: Boolean,
    default: true,
  },
  maxReplySentences: {
    type: Number,
    default: 3,
    min: 1,
    max: 5,
  },
  decisionMode: {
    type: String,
    enum: ['full_auto', 'assist', 'info_only'],
    default: 'assist',
  },
  escalationGuidelines: {
    type: String,
    trim: true,
  },
  escalationExamples: {
    type: [String],
    default: [],
  },
  humanEscalationBehavior: {
    type: String,
    enum: ['ai_silent', 'ai_allowed'],
    default: 'ai_silent',
  },
  humanHoldMinutes: {
    type: Number,
    default: 60,
    min: 5,
    max: 720,
  },

  googleSheets: {
    type: googleSheetsConfigSchema,
    default: undefined,
  },
}, {
  timestamps: true,
});

// Index for efficient lookups
// workspaceSettingsSchema.index({ workspaceId: 1 });

export default mongoose.model<IWorkspaceSettings>('WorkspaceSettings', workspaceSettingsSchema);
