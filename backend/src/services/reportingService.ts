import mongoose from 'mongoose';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Escalation from '../models/Escalation';
import LeadCapture from '../models/LeadCapture';
import SupportTicketStub from '../models/SupportTicketStub';
import ReportDailyWorkspace from '../models/ReportDailyWorkspace';
import { GoalType } from '../types/automationGoals';
import { listAllWorkspaceIds } from '../repositories/core/workspaceRepository';

export type DashboardRange = 'today' | '7d' | '30d';

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDateBounds(range: DashboardRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(end);

  if (range === 'today') {
    start.setUTCDate(end.getUTCDate() - 1);
  } else if (range === '7d') {
    start.setUTCDate(end.getUTCDate() - 7);
  } else {
    start.setUTCDate(end.getUTCDate() - 30);
  }

  return { start, end };
}

export async function trackDailyMetric(
  workspaceId: mongoose.Types.ObjectId | string,
  date: Date,
  increments: Record<string, number>,
  sets?: Record<string, any>
) {
  const dateKey = formatDateKey(date);

  await ReportDailyWorkspace.findOneAndUpdate(
    { workspaceId, date: dateKey },
    {
      $inc: increments,
      ...(sets ? { $set: sets } : {}),
      $setOnInsert: { workspaceId, date: dateKey },
    },
    { upsert: true, new: true }
  );
}

export function addCountIncrement(
  increments: Record<string, number>,
  path: string,
  key: string,
  amount = 1
) {
  if (!key) return;
  increments[`${path}.${key}`] = (increments[`${path}.${key}`] || 0) + amount;
}

export async function rebuildWorkspaceReportForDate(workspaceId: string, date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const match = { workspaceId: new mongoose.Types.ObjectId(workspaceId), createdAt: { $gte: start, $lt: end } };

  const [
    newConversations,
    inboundMessages,
    outboundMessages,
    aiReplies,
    humanReplies,
    escalationsOpened,
    escalationsClosed,
    followupsSent,
    kbBackedReplies,
    goalCompletionCounts,
    goalAttemptCounts,
    escalationReasons,
    tagCounts,
    kbArticleCounts,
    responseAggregation,
  ] = await Promise.all([
    Conversation.countDocuments({ workspaceId, createdAt: { $gte: start, $lt: end } }),
    Message.countDocuments({ ...match, from: 'customer' }),
    Message.countDocuments({ ...match, from: { $in: ['ai', 'user'] } }),
    Message.countDocuments({ ...match, from: 'ai' }),
    Message.countDocuments({ ...match, from: 'user' }),
    Escalation.countDocuments({ workspaceId, createdAt: { $gte: start, $lt: end } }),
    Escalation.countDocuments({ workspaceId, updatedAt: { $gte: start, $lt: end }, status: 'resolved' }),
    Message.countDocuments({ ...match, automationSource: 'followup', from: 'ai' }),
    Message.countDocuments({ ...match, kbItemIdsUsed: { $exists: true, $not: { $size: 0 } } }),
    Promise.all([
      LeadCapture.countDocuments({ workspaceId, createdAt: { $gte: start, $lt: end } }),
      SupportTicketStub.countDocuments({ workspaceId, createdAt: { $gte: start, $lt: end } }),
    ]).then(([leads, supports]) => ({
      capture_lead: leads,
      handle_support: supports,
    })),
    Promise.resolve({}),
    Message.aggregate([
      { $match: { ...match, aiEscalationReason: { $exists: true, $ne: null } } },
      { $group: { _id: '$aiEscalationReason', count: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { ...match, aiTags: { $exists: true, $ne: [] } } },
      { $unwind: '$aiTags' },
      { $group: { _id: '$aiTags', count: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { ...match, kbItemIdsUsed: { $exists: true, $ne: [] } } },
      { $unwind: '$kbItemIdsUsed' },
      { $group: { _id: '$kbItemIdsUsed', count: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { ...match, from: { $in: ['ai', 'user'] } } },
      { $sort: { conversationId: 1, createdAt: 1 } },
      { $group: { _id: '$conversationId', firstResponse: { $first: '$$ROOT' } } },
      {
        $lookup: {
          from: 'messages',
          let: { convId: '$_id', sentAt: '$firstResponse.createdAt' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$conversationId', '$$convId'] }, { $eq: ['$from', 'customer'] }, { $lte: ['$createdAt', '$$sentAt'] } ] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'previousCustomer',
        },
      },
      { $unwind: '$previousCustomer' },
      { $project: { diffMs: { $subtract: ['$firstResponse.createdAt', '$previousCustomer.createdAt'] } } },
      { $group: { _id: null, sum: { $sum: '$diffMs' }, count: { $sum: 1 } } },
    ]),
  ]);

  const goalAttemptsCombined: Record<string, number> = { ...goalAttemptCounts };
  const goalCompletionsCombined: Record<string, number> = { ...goalCompletionCounts };

  const responseSum = responseAggregation[0]?.sum || 0;
  const responseCount = responseAggregation[0]?.count || 0;

  const tagCountMap: Record<string, number> = {};
  for (const row of tagCounts) {
    tagCountMap[row._id || 'unknown'] = row.count;
  }

  const escalationReasonMap: Record<string, number> = {};
  for (const row of escalationReasons) {
    escalationReasonMap[row._id || 'other'] = row.count;
  }

  const kbArticleCountMap: Record<string, number> = {};
  for (const row of kbArticleCounts) {
    kbArticleCountMap[row._id || 'unknown'] = row.count;
  }

  await ReportDailyWorkspace.findOneAndUpdate(
    { workspaceId, date: formatDateKey(start) },
    {
      $set: {
        workspaceId,
        date: formatDateKey(start),
        newConversations,
        inboundMessages,
        outboundMessages,
        aiReplies,
        humanReplies,
        escalationsOpened,
        escalationsClosed,
        followupsSent,
        kbBackedReplies,
        goalAttempts: goalAttemptsCombined,
        goalCompletions: goalCompletionsCombined,
        firstResponseTimeSumMs: responseSum,
        firstResponseTimeCount: responseCount,
        tagCounts: tagCountMap,
        escalationReasonCounts: escalationReasonMap,
        kbArticleCounts: kbArticleCountMap,
      },
    },
    { upsert: true, new: true }
  );
}

export async function rebuildYesterdayReports() {
  const workspaceIds = await listAllWorkspaceIds();
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  await Promise.all(
    workspaceIds.map(async (workspaceId) => {
      try {
        await rebuildWorkspaceReportForDate(workspaceId, yesterday);
      } catch (error) {
        console.error('Failed to rebuild report for workspace', workspaceId, error);
      }
    })
  );
}

export function mapGoalKey(goal: GoalType | string): string {
  switch (goal) {
    case 'capture_lead':
      return 'capture_lead';
    case 'book_appointment':
      return 'book_appointment';
    case 'order_now':
      return 'order_now';
    case 'product_inquiry':
      return 'product_inquiry';
    case 'delivery':
      return 'delivery';
    case 'order_status':
      return 'order_status';
    case 'refund_exchange':
      return 'refund_exchange';
    case 'human':
      return 'human';
    case 'handle_support':
      return 'handle_support';
    case 'start_order':
      return 'order_now';
    case 'drive_to_channel':
      return 'other';
    default:
      return goal || 'other';
  }
}
