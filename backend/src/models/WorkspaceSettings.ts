import mongoose, { Document, Schema } from 'mongoose';

export interface IWorkspaceSettings extends Document {
  workspaceId: mongoose.Types.ObjectId;

  // Language settings
  defaultLanguage: string;        // AI response language (e.g., "en", "ar", "es")
  uiLanguage: string;             // Platform UI language (for future use)

  // Feature 1: Comment → DM Automation
  commentDmEnabled: boolean;
  commentDmTemplate: string;      // Default DM template for comment automation

  // Feature 2: Inbound DM Auto-Reply
  dmAutoReplyEnabled: boolean;

  // Feature 3: 24h Follow-up
  followupEnabled: boolean;
  followupHoursBeforeExpiry: number;  // Hours before 24h window to send follow-up (default: 2)
  followupTemplate: string;           // Follow-up message template

  createdAt: Date;
  updatedAt: Date;
}

const workspaceSettingsSchema = new Schema<IWorkspaceSettings>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    unique: true,
  },

  // Language settings
  defaultLanguage: {
    type: String,
    default: 'en',
    trim: true,
  },
  uiLanguage: {
    type: String,
    default: 'en',
    trim: true,
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
}, {
  timestamps: true,
});

// Index for efficient lookups
workspaceSettingsSchema.index({ workspaceId: 1 });

export default mongoose.model<IWorkspaceSettings>('WorkspaceSettings', workspaceSettingsSchema);
