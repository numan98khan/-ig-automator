import mongoose from 'mongoose';
import Escalation, { IEscalation, EscalationStatus } from '../models/Escalation';
import Conversation from '../models/Conversation';
import { addCountIncrement, trackDailyMetric } from './reportingService';

export async function getActiveTicket(conversationId: mongoose.Types.ObjectId | string): Promise<IEscalation | null> {
  return Escalation.findOne({
    conversationId,
    status: { $in: ['pending', 'in_progress'] },
  }).sort({ createdAt: -1 });
}

export async function createTicket(params: {
  conversationId: mongoose.Types.ObjectId | string;
  categoryId?: mongoose.Types.ObjectId | string;
  topicSummary: string;
  reason?: string;
  createdBy?: 'ai' | 'human' | 'system';
  customerMessage?: string;
  workspaceId?: mongoose.Types.ObjectId | string;
  severity?: 'normal' | 'high' | 'critical';
}): Promise<IEscalation> {
  let workspaceId = params.workspaceId;
  if (!workspaceId) {
    const convo = await Conversation.findById(params.conversationId).select('workspaceId');
    workspaceId = convo?.workspaceId;
  }

  const ticket = await Escalation.create({
    conversationId: params.conversationId,
    workspaceId,
    categoryId: params.categoryId,
    topicSummary: params.topicSummary,
    reason: params.reason,
    createdBy: params.createdBy || 'ai',
    severity: params.severity,
    followUpCount: 0,
    updates: params.customerMessage
      ? [
          {
            from: 'customer',
            text: params.customerMessage,
            at: new Date(),
          },
        ]
      : [],
    lastCustomerMessage: params.customerMessage,
    lastCustomerAt: params.customerMessage ? new Date() : undefined,
  });

  if (workspaceId) {
    const increments: Record<string, number> = { escalationsOpened: 1 };
    if (params.reason) {
      addCountIncrement(increments, 'escalationReasonCounts', params.reason);
    }
    await trackDailyMetric(workspaceId, new Date(), increments);
  }
  return ticket;
}

export async function addTicketUpdate(ticketId: mongoose.Types.ObjectId | string, update: {
  from: 'customer' | 'ai' | 'human' | 'system';
  text?: string;
  messageId?: mongoose.Types.ObjectId | string;
}): Promise<void> {
  const inc: Record<string, number> = {};
  const set: Record<string, any> = {};

  if (update.from === 'customer' && update.text) {
    set.lastCustomerMessage = update.text;
    set.lastCustomerAt = new Date();
    inc.followUpCount = 1;
  }
  if (update.from === 'ai' && update.text) {
    set.lastAiMessage = update.text;
    set.lastAiAt = new Date();
  }

  const updateBody: any = {
    $push: {
      updates: {
        from: update.from,
        text: update.text,
        messageId: update.messageId,
        at: new Date(),
      },
    },
  };

  if (Object.keys(inc).length > 0) {
    updateBody.$inc = inc;
  }
  if (Object.keys(set).length > 0) {
    updateBody.$set = set;
  }

  await Escalation.findByIdAndUpdate(ticketId, updateBody);
}

export async function resolveTicket(escalationId: mongoose.Types.ObjectId | string, status: EscalationStatus = 'resolved') {
  const updated = await Escalation.findByIdAndUpdate(escalationId, { status }, { new: true });
  if (updated?.workspaceId) {
    await trackDailyMetric(updated.workspaceId, new Date(), { escalationsClosed: 1 });
  }
  return updated;
}

export async function listWorkspaceTickets(workspaceId: mongoose.Types.ObjectId | string) {
  // Join via conversations
  return Escalation.aggregate([
    {
      $lookup: {
        from: 'conversations',
        localField: 'conversationId',
        foreignField: '_id',
        as: 'conversation',
      },
    },
    { $unwind: '$conversation' },
    { $match: { 'conversation.workspaceId': new mongoose.Types.ObjectId(workspaceId as any) } },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: 50,
    },
  ]);
}
