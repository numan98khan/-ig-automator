import mongoose from 'mongoose';
import Escalation, { IEscalation, EscalationStatus } from '../models/Escalation';

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
}): Promise<IEscalation> {
  const ticket = await Escalation.create({
    conversationId: params.conversationId,
    categoryId: params.categoryId,
    topicSummary: params.topicSummary,
    reason: params.reason,
    createdBy: params.createdBy || 'ai',
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
  return Escalation.findByIdAndUpdate(escalationId, { status }, { new: true });
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
