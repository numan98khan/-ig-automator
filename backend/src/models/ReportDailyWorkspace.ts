import mongoose, { Document, Schema } from 'mongoose';

export interface IReportDailyWorkspace extends Document {
  workspaceId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  newConversations: number;
  inboundMessages: number;
  outboundMessages: number;
  aiReplies: number;
  humanReplies: number;
  escalationsOpened: number;
  escalationsClosed: number;
  followupsSent: number;
  kbBackedReplies: number;
  goalAttempts: Record<string, number>;
  goalCompletions: Record<string, number>;
  firstResponseTimeSumMs: number;
  firstResponseTimeCount: number;
  categoryCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  escalationReasonCounts: Record<string, number>;
  kbArticleCounts: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const reportDailyWorkspaceSchema = new Schema<IReportDailyWorkspace>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  date: { type: String, required: true },
  newConversations: { type: Number, default: 0 },
  inboundMessages: { type: Number, default: 0 },
  outboundMessages: { type: Number, default: 0 },
  aiReplies: { type: Number, default: 0 },
  humanReplies: { type: Number, default: 0 },
  escalationsOpened: { type: Number, default: 0 },
  escalationsClosed: { type: Number, default: 0 },
  followupsSent: { type: Number, default: 0 },
  kbBackedReplies: { type: Number, default: 0 },
  goalAttempts: { type: Map, of: Number, default: {} },
  goalCompletions: { type: Map, of: Number, default: {} },
  firstResponseTimeSumMs: { type: Number, default: 0 },
  firstResponseTimeCount: { type: Number, default: 0 },
  categoryCounts: { type: Map, of: Number, default: {} },
  tagCounts: { type: Map, of: Number, default: {} },
  escalationReasonCounts: { type: Map, of: Number, default: {} },
  kbArticleCounts: { type: Map, of: Number, default: {} },
}, { timestamps: true });

reportDailyWorkspaceSchema.index({ workspaceId: 1, date: 1 }, { unique: true });
reportDailyWorkspaceSchema.index({ workspaceId: 1, date: -1 });

export default mongoose.model<IReportDailyWorkspace>('ReportDailyWorkspace', reportDailyWorkspaceSchema);
