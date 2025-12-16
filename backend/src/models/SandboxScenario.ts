import mongoose, { Document, Schema } from 'mongoose';

export interface SandboxMessageStep {
  role: 'customer';
  text: string;
}

export interface ISandboxScenario extends Document {
  workspaceId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  messages: SandboxMessageStep[];
  createdAt: Date;
  updatedAt: Date;
}

const sandboxMessageSchema = new Schema<SandboxMessageStep>({
  role: {
    type: String,
    enum: ['customer'],
    default: 'customer',
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
});

const sandboxScenarioSchema = new Schema<ISandboxScenario>(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    messages: {
      type: [sandboxMessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISandboxScenario>('SandboxScenario', sandboxScenarioSchema);
