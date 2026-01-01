import mongoose from 'mongoose';
import AdminLogEvent, { IAdminLogEvent } from '../models/AdminLogEvent';
import { getLogSettingsSnapshot } from './adminLogSettingsService';

export type AdminLogLevel = 'info' | 'warn' | 'error';

export type AdminLogEventPayload = {
  workspaceId?: mongoose.Types.ObjectId | string;
  category: string;
  level?: AdminLogLevel;
  message: string;
  details?: Record<string, any>;
  source?: string;
};

type LogQueryParams = {
  limit?: number;
  category?: string;
  level?: AdminLogLevel;
  workspaceId?: string;
  sessionId?: string;
  before?: Date;
};

const toOptionalObjectId = (value?: string | mongoose.Types.ObjectId) => {
  if (!value) return undefined;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return undefined;
};

export const logAdminEvent = async (payload: AdminLogEventPayload): Promise<void> => {
  try {
    const settings = getLogSettingsSnapshot();
    const category = payload.category;
    if (category === 'automation' && !settings.automationLogsEnabled) return;
    if (category === 'automation_step' && !settings.automationStepsEnabled) return;
    if (category === 'flow_node' && !settings.automationStepsEnabled) return;
    if (category === 'ai_timing' && !settings.aiTimingEnabled) return;
    if (category === 'ai' && !settings.aiLogsEnabled) return;
    if (category === 'instagram_webhook' && !settings.instagramWebhookLogsEnabled) return;
    if (category === 'ig_api' && !settings.igApiLogsEnabled) return;
    if (category === 'openai_api' && !settings.openaiApiLogsEnabled) return;
    if (category === 'console' && !settings.consoleLogsEnabled) return;

    const workspaceId = toOptionalObjectId(payload.workspaceId);
    await AdminLogEvent.create({
      workspaceId,
      category: payload.category,
      level: payload.level || 'info',
      message: payload.message,
      details: payload.details,
      source: payload.source,
    });
  } catch (error) {
    console.error('Failed to store admin log event:', error);
  }
};

export const getAdminLogEvents = async (params: LogQueryParams = {}): Promise<IAdminLogEvent[]> => {
  const query: Record<string, any> = {};
  if (params.category) query.category = params.category;
  if (params.level) query.level = params.level;
  if (params.workspaceId) {
    const workspaceObjectId = toOptionalObjectId(params.workspaceId);
    if (workspaceObjectId) query.workspaceId = workspaceObjectId;
  }
  if (params.before) query.createdAt = { $lt: params.before };
  if (params.sessionId) {
    query['details.automationSessionId'] = params.sessionId;
  }

  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 500) : 200;
  return AdminLogEvent.find(query).sort({ createdAt: -1 }).limit(limit).lean();
};

export const deleteAdminLogEvents = async (): Promise<void> => {
  await AdminLogEvent.deleteMany({});
};
