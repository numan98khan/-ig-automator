import mongoose, { Document, Schema } from 'mongoose';
import { SandboxMessageStep } from './SandboxScenario';
import { SandboxRunStepMeta } from './SandboxRun';

interface LiveChatMessage {
  from: 'customer' | 'ai';
  text: string;
  meta?: SandboxRunStepMeta;
  typing?: boolean;
}

interface LiveChatState {
  messages: LiveChatMessage[];
  input?: string;
  selectedTurnIndex?: number | null;
}

interface ScenarioDraftState {
  name?: string;
  description?: string;
  messages?: SandboxMessageStep[];
  selectedScenarioId?: mongoose.Types.ObjectId | null;
}

export interface ISandboxWorkspaceState extends Document {
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  runConfig?: Record<string, any>;
  liveChat?: LiveChatState;
  scenarioDraft?: ScenarioDraftState;
  createdAt: Date;
  updatedAt: Date;
}

const liveChatMessageSchema = new Schema<LiveChatMessage>({
  from: { type: String, enum: ['customer', 'ai'], required: true },
  text: { type: String, required: true },
  meta: { type: Schema.Types.Mixed },
  typing: { type: Boolean },
}, { _id: false });

const liveChatStateSchema = new Schema<LiveChatState>({
  messages: { type: [liveChatMessageSchema], default: [] },
  input: { type: String },
  selectedTurnIndex: { type: Number },
}, { _id: false });

const scenarioDraftSchema = new Schema<ScenarioDraftState>({
  name: { type: String, trim: true },
  description: { type: String, trim: true },
  messages: { type: [new Schema<SandboxMessageStep>({
    role: { type: String, enum: ['customer'], required: true },
    text: { type: String, required: true },
  }, { _id: false })], default: [] },
  selectedScenarioId: { type: Schema.Types.ObjectId, ref: 'SandboxScenario', default: null },
}, { _id: false });

const sandboxWorkspaceStateSchema = new Schema<ISandboxWorkspaceState>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  runConfig: {
    type: Schema.Types.Mixed,
    default: {},
  },
  liveChat: {
    type: liveChatStateSchema,
    default: () => ({}),
  },
  scenarioDraft: {
    type: scenarioDraftSchema,
    default: () => ({}),
  },
}, { timestamps: true });

sandboxWorkspaceStateSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export default mongoose.model<ISandboxWorkspaceState>('SandboxWorkspaceState', sandboxWorkspaceStateSchema);
