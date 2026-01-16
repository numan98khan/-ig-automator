import express, { Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import ReportDailyWorkspace from '../models/ReportDailyWorkspace';
import Escalation from '../models/Escalation';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import { DashboardRange, formatDateKey, getDateBounds } from '../services/reportingService';

const router = express.Router();

type AttentionFilter = 'escalations' | 'unreplied' | 'followups';

router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, range = '7d' } = req.query as { workspaceId?: string; range?: DashboardRange };

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const bounds = getDateBounds(range);
    const docs = await ReportDailyWorkspace.find({
      workspaceId,
      date: { $gte: formatDateKey(bounds.start), $lt: formatDateKey(bounds.end) },
    })
      .sort({ date: 1 })
      .lean();

    const totals = docs.reduce((acc, doc) => {
      acc.newConversations += doc.newConversations || 0;
      acc.inboundMessages += doc.inboundMessages || 0;
      acc.aiReplies += doc.aiReplies || 0;
      acc.escalationsOpened += doc.escalationsOpened || 0;
      acc.kbBackedReplies += doc.kbBackedReplies || 0;
      acc.firstResponseTimeSumMs += doc.firstResponseTimeSumMs || 0;
      acc.firstResponseTimeCount += doc.firstResponseTimeCount || 0;
      return acc;
    }, {
      newConversations: 0,
      inboundMessages: 0,
      aiReplies: 0,
      escalationsOpened: 0,
      kbBackedReplies: 0,
      firstResponseTimeSumMs: 0,
      firstResponseTimeCount: 0,
    });

    const humanAlerts = await Escalation.aggregate([
      { $match: { workspaceId: new mongoose.Types.ObjectId(workspaceId), status: { $in: ['pending', 'in_progress'] } } },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 },
        },
      },
    ]);

    const alertCounts = humanAlerts.reduce(
      (acc, row) => {
        acc.open += row.count || 0;
        if (row._id === 'critical') {
          acc.critical += row.count || 0;
        }
        return acc;
      },
      { open: 0, critical: 0 }
    );

    const trend = docs.map(doc => ({
      date: doc.date,
      inboundMessages: doc.inboundMessages,
      aiReplies: doc.aiReplies,
      escalationsOpened: doc.escalationsOpened,
      kbBackedReplies: doc.kbBackedReplies,
    }));

    const kpis = {
      newConversations: totals.newConversations,
      inboundMessages: totals.inboundMessages,
      aiHandledRate: totals.inboundMessages > 0 ? totals.aiReplies / totals.inboundMessages : 0,
      humanAlerts: alertCounts,
      medianFirstResponseMs: totals.firstResponseTimeCount > 0
        ? totals.firstResponseTimeSumMs / totals.firstResponseTimeCount
        : 0,
    };

    res.json({ range, kpis, trend });
  } catch (error) {
    console.error('Error building dashboard summary', error);
    res.status(500).json({ error: 'Failed to load dashboard summary' });
  }
});

router.get('/attention', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, filter = 'escalations' } = req.query as { workspaceId?: string; filter?: AttentionFilter };

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const items = await buildAttentionItems(workspaceId, filter as AttentionFilter);
    res.json({ filter, items });
  } catch (error) {
    console.error('Error fetching attention queue', error);
    res.status(500).json({ error: 'Failed to load attention queue' });
  }
});

router.get('/insights', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, range = '7d' } = req.query as { workspaceId?: string; range?: DashboardRange };

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const bounds = getDateBounds(range);
    const docs = await ReportDailyWorkspace.find({
      workspaceId,
      date: { $gte: formatDateKey(bounds.start), $lt: formatDateKey(bounds.end) },
    }).lean();

    const totals = docs.reduce((acc, doc) => {
      const escalationReasons = mapToRecord(doc.escalationReasonCounts);
      const kbArticles = mapToRecord(doc.kbArticleCounts);

      acc.aiReplies += doc.aiReplies || 0;
      acc.escalations += doc.escalationsOpened || 0;
      acc.kbBacked += doc.kbBackedReplies || 0;
      acc.escalationReasons = combineMap(acc.escalationReasons, escalationReasons);
      acc.kbArticles = combineMap(acc.kbArticles, kbArticles);
      return acc;
    }, {
      aiReplies: 0,
      escalations: 0,
      kbBacked: 0,
      escalationReasons: {} as Record<string, number>,
      kbArticles: {} as Record<string, number>,
    });

    const insights = {
      aiPerformance: {
        escalationRate: totals.aiReplies > 0 ? totals.escalations / totals.aiReplies : 0,
        topReasons: topEntries(totals.escalationReasons, 3),
      },
      knowledge: {
        kbBackedRate: totals.aiReplies > 0 ? totals.kbBacked / totals.aiReplies : 0,
        topArticles: topEntries(totals.kbArticles, 5),
        missingTopics: [],
      },
    };

    res.json({ range, ...insights });
  } catch (error) {
    console.error('Error fetching insights', error);
    res.status(500).json({ error: 'Failed to load insights' });
  }
});

export default router;

async function buildAttentionItems(workspaceId: string, filter: AttentionFilter) {
  if (filter === 'escalations') {
    const escalations = await Escalation.find({
      workspaceId,
      status: { $in: ['pending', 'in_progress'] },
    }).sort({ severity: -1, createdAt: -1 }).limit(25);

    const items = await Promise.all(escalations.map(async esc => {
      const conversation = await Conversation.findById(esc.conversationId);
      const lastMessage = await Message.findOne({ workspaceId, conversationId: esc.conversationId })
        .sort({ createdAt: -1 });

      return {
        id: esc._id.toString(),
        conversationId: esc.conversationId?.toString?.() || '',
        participantName: conversation?.participantName,
        handle: conversation?.participantHandle,
        lastMessagePreview: lastMessage?.text,
        lastMessageAt: lastMessage?.createdAt,
        badges: ['escalated'],
        actions: { canResolve: true },
      };
    }));

    return items;
  }

  if (filter === 'unreplied') {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const conversations = await Conversation.find({
      workspaceId,
      lastCustomerMessageAt: { $exists: true, $lte: cutoff },
      $expr: { $or: [ { $lt: ['$lastBusinessMessageAt', '$lastCustomerMessageAt'] }, { $eq: ['$lastBusinessMessageAt', null] } ] },
    }).sort({ lastCustomerMessageAt: -1 }).limit(25);

    return Promise.all(conversations.map(async conv => {
      const lastMessage = await Message.findOne({ workspaceId, conversationId: conv._id })
        .sort({ createdAt: -1 });
      return {
        id: conv._id.toString(),
        conversationId: conv._id.toString(),
        participantName: conv.participantName,
        handle: conv.participantHandle,
        lastMessagePreview: lastMessage?.text,
        lastMessageAt: lastMessage?.createdAt,
        badges: ['sla'],
        actions: { canAssign: true, canSnooze: true },
      };
    }));
  }

  if (filter === 'followups') {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const conversations = await Conversation.find({
      workspaceId,
      lastCustomerMessageAt: { $exists: true, $lte: cutoff },
      lastBusinessMessageAt: { $lte: cutoff },
    }).sort({ lastCustomerMessageAt: -1 }).limit(25);

    return Promise.all(conversations.map(async conv => {
      const lastMessage = await Message.findOne({ workspaceId, conversationId: conv._id })
        .sort({ createdAt: -1 });
      return {
        id: conv._id,
        conversationId: conv._id,
        participantName: conv.participantName,
        handle: conv.participantHandle,
        lastMessagePreview: lastMessage?.text,
        lastMessageAt: lastMessage?.createdAt,
        badges: ['followup'],
        actions: { canAssign: true, canSnooze: true },
      };
    }));
  }
  return [];
}

function combineMap(base: Record<string, number>, incoming: Record<string, number>): Record<string, number> {
  const merged = { ...base };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    merged[key] = (merged[key] || 0) + (value || 0);
  });
  return merged;
}

function mapToRecord(value: Record<string, number> | Map<string, number> | undefined): Record<string, number> {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  return value;
}

function topEntries(map: Record<string, number>, limit: number) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ name: key, count }));
}
