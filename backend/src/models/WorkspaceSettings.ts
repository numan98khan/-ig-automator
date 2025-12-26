import mongoose, { Document, Schema } from 'mongoose';
import {
  BookingGoalConfig,
  DriveGoalConfig,
  GoalConfigurations,
  GoalType,
  OrderGoalConfig,
  SupportGoalConfig,
  LeadCaptureConfig,
} from '../types/automationGoals';

export interface IWorkspaceSettings extends Document {
  workspaceId: mongoose.Types.ObjectId;
  assistantName?: string;
  assistantDescription?: string;
  systemPrompt?: string;

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
  skipTypingPauseInSandbox?: boolean;

  // Feature 1: Comment → DM Automation
  commentDmEnabled: boolean;
  commentDmTemplate: string;      // Default DM template for comment automation

  // Feature 2: Inbound DM Auto-Reply
  dmAutoReplyEnabled: boolean;

  // Feature 3: 24h Follow-up
  followupEnabled: boolean;
  followupHoursBeforeExpiry: number;  // Hours before 24h window to send follow-up (default: 2)
  followupTemplate: string;           // Follow-up message template

  // Conversation goals
  primaryGoal?: GoalType;
  secondaryGoal?: GoalType;
  goalConfigs?: GoalConfigurations;
  googleSheets?: {
    enabled?: boolean;
    spreadsheetId?: string;
    sheetName?: string;
    serviceAccountJson?: string;
    headerRow?: number;
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

const leadCaptureConfigSchema = new Schema<LeadCaptureConfig>({
  collectName: { type: Boolean, default: true },
  collectPhone: { type: Boolean, default: true },
  collectEmail: { type: Boolean, default: false },
  collectCustomNote: { type: Boolean, default: false },
}, { _id: false });

const bookingGoalConfigSchema = new Schema<BookingGoalConfig>({
  bookingLink: { type: String, trim: true },
  collectDate: { type: Boolean, default: true },
  collectTime: { type: Boolean, default: true },
  collectServiceType: { type: Boolean, default: false },
}, { _id: false });

const orderGoalConfigSchema = new Schema<OrderGoalConfig>({
  catalogUrl: { type: String, trim: true },
  collectProductName: { type: Boolean, default: true },
  collectQuantity: { type: Boolean, default: true },
  collectVariant: { type: Boolean, default: false },
}, { _id: false });

const supportGoalConfigSchema = new Schema<SupportGoalConfig>({
  askForOrderId: { type: Boolean, default: true },
  askForPhoto: { type: Boolean, default: false },
}, { _id: false });

const driveGoalConfigSchema = new Schema<DriveGoalConfig>({
  targetType: { type: String, enum: ['website', 'WhatsApp', 'store', 'app'], default: 'website' },
  targetLink: { type: String, trim: true },
}, { _id: false });

const googleSheetsConfigSchema = new Schema({
  enabled: { type: Boolean, default: false },
  spreadsheetId: { type: String, trim: true },
  sheetName: { type: String, trim: true },
  serviceAccountJson: { type: String },
  headerRow: { type: Number, min: 1, default: 1 },
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
  skipTypingPauseInSandbox: {
    type: Boolean,
    default: false,
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

  // Feature 1: Comment → DM Automation
  commentDmEnabled: {
    type: Boolean,
    default: false,
  },
  commentDmTemplate: {
    type: String,
    default: "Thanks for your comment! We'd love to help you with more information. Feel free to ask any questions here.",
  },

  // Feature 2: Inbound DM Auto-Reply
  dmAutoReplyEnabled: {
    type: Boolean,
    default: false,
  },

  // Feature 3: 24h Follow-up
  followupEnabled: {
    type: Boolean,
    default: false,
  },
  followupHoursBeforeExpiry: {
    type: Number,
    default: 2,
    min: 1,
    max: 23,
  },
  followupTemplate: {
    type: String,
    default: "Just checking in to see if you had any other questions before we close this chat. We're here to help!",
  },

  // Conversation goals
  primaryGoal: {
    type: String,
    enum: ['none', 'capture_lead', 'book_appointment', 'start_order', 'handle_support', 'drive_to_channel'],
    default: 'none',
  },
  secondaryGoal: {
    type: String,
    enum: ['none', 'capture_lead', 'book_appointment', 'start_order', 'handle_support', 'drive_to_channel'],
    default: 'none',
  },
  goalConfigs: {
    type: new Schema<GoalConfigurations>({
      leadCapture: { type: leadCaptureConfigSchema, default: () => ({}) },
      booking: { type: bookingGoalConfigSchema, default: () => ({}) },
      order: { type: orderGoalConfigSchema, default: () => ({}) },
      support: { type: supportGoalConfigSchema, default: () => ({}) },
      drive: { type: driveGoalConfigSchema, default: () => ({}) },
    }, { _id: false }),
    default: undefined,
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
