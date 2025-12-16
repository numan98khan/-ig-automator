import mongoose, { Document, Schema } from 'mongoose';
import { GoalType } from '../types/automationGoals';

export interface SandboxKnowledgeItemRef {
  id: string;
  title: string;
}

export interface SandboxRunStepMeta {
  detectedLanguage?: string;
  categoryName?: string;
  goalMatched?: GoalType | 'none';
  shouldEscalate?: boolean;
  escalationReason?: string;
  tags?: string[];
  knowledgeItemsUsed?: SandboxKnowledgeItemRef[];
}

export interface SandboxRunStep {
  customerText: string;
  aiReplyText: string;
  meta?: SandboxRunStepMeta;
}

export interface ISandboxRun extends Document {
  workspaceId: mongoose.Types.ObjectId;
  scenarioId: mongoose.Types.ObjectId;
  settingsSnapshot?: Record<string, any>;
  steps: SandboxRunStep[];
  createdAt: Date;
}

const sandboxRunSchema = new Schema<ISandboxRun>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    scenarioId: {
      type: Schema.Types.ObjectId,
      ref: 'SandboxScenario',
      required: true,
      index: true,
    },
    settingsSnapshot: {
      type: Schema.Types.Mixed,
    },
    steps: [
      {
        customerText: { type: String, required: true },
        aiReplyText: { type: String, required: true },
        meta: {
          detectedLanguage: String,
          categoryName: String,
          goalMatched: String,
          shouldEscalate: Boolean,
          escalationReason: String,
          tags: [String],
          knowledgeItemsUsed: [
            {
              id: String,
              title: String,
            },
          ],
        },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<ISandboxRun>('SandboxRun', sandboxRunSchema);
