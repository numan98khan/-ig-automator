import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Escalation from '../models/Escalation';
import KnowledgeItem from '../models/KnowledgeItem';
import WorkspaceSettings from '../models/WorkspaceSettings';
import GlobalAssistantConfig, { IGlobalAssistantConfig } from '../models/GlobalAssistantConfig';
import GlobalUiSettings, { IGlobalUiSettings } from '../models/GlobalUiSettings';
import FlowDraft from '../models/FlowDraft';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import AutomationIntent from '../models/AutomationIntent';
import AutomationSession from '../models/AutomationSession';
import AutomationInstance from '../models/AutomationInstance';
import { ensureBillingAccountForUser, upsertActiveSubscription } from '../services/billingService';
import { getLogSettings, updateLogSettings } from '../services/adminLogSettingsService';
import { deleteAdminLogEvents, getAdminLogEvents } from '../services/adminLogEventService';
import { compileFlow } from '../services/flowCompiler';
import { listAutomationIntents } from '../services/automationIntentService';
import {
  GLOBAL_WORKSPACE_KEY,
  deleteKnowledgeEmbedding,
  reindexGlobalKnowledge,
  reindexWorkspaceKnowledge,
  upsertKnowledgeEmbedding,
} from '../services/vectorStore';
import {
  countTiers,
  createTier,
  deleteTier,
  getTierById,
  listTiers,
  listTiersByIds,
  updateTier,
} from '../repositories/core/tierRepository';
import {
  countUsers,
  getUserById,
  listUsers,
  listUsersByIds,
  updateUser,
} from '../repositories/core/userRepository';
import {
  countWorkspaces,
  getWorkspaceById,
  listWorkspaces,
  listWorkspacesByIds,
} from '../repositories/core/workspaceRepository';
import {
  countWorkspaceMembersByWorkspaceIds,
  listWorkspaceMembersByUserId,
  listWorkspaceMembersByUserIds,
  listWorkspaceMembersByWorkspaceId,
} from '../repositories/core/workspaceMemberRepository';
import { getWorkspaceOpenAiUsageSummary } from '../repositories/core/openAiUsageRepository';

const router = express.Router();

const toInt = (value: any, fallback: number) => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};
const toOptionalBoolean = (value: any) => {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};
const toRangeDays = (value: any, fallback = 30) => {
  const parsed = typeof value === 'string' ? parseInt(value.replace(/[^0-9]/g, ''), 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 365);
};
const STORAGE_MODES = ['vector', 'text'];

router.get('/tiers', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const search = (req.query.search as string)?.trim();
    const status = (req.query.status as string)?.trim();

    const [items, total] = await Promise.all([
      listTiers({
        search: search || undefined,
        status: status || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
      countTiers({ search: search || undefined, status: status || undefined }),
    ]);

    res.json({
      data: {
        tiers: items,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list tiers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tiers', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await createTier(req.body || {});
    res.status(201).json({ data: tier });
  } catch (error: any) {
    console.error('Admin create tier error:', error);
    res.status(400).json({ error: error.message || 'Failed to create tier' });
  }
});

router.get('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await getTierById(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    const userCount = await countUsers({ tierId: tier._id });
    res.json({ data: { ...tier, userCount } });
  } catch (error) {
    console.error('Admin get tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await updateTier(req.params.id, req.body || {});
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    res.json({ data: tier });
  } catch (error: any) {
    console.error('Admin update tier error:', error);
    res.status(400).json({ error: error.message || 'Failed to update tier' });
  }
});

router.delete('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await getTierById(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    const userCount = await countUsers({ tierId: tier._id });
    if (tier.isDefault || userCount > 0) {
      return res.status(400).json({ error: 'Cannot delete a default or in-use tier' });
    }
    await deleteTier(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin delete tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tiers/:id/assign/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await getTierById(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });

    const user = await getUserById(req.params.userId, { includePassword: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const billingAccount = await ensureBillingAccountForUser(user._id);
    if (!billingAccount) return res.status(400).json({ error: 'Failed to load billing account' });

    await upsertActiveSubscription(billingAccount._id, tier._id);

    await updateUser(user._id, { tierId: tier._id });

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin assign tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspaces', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const search = (req.query.search as string)?.trim();

    const [items, total] = await Promise.all([
      listWorkspaces({ search: search || undefined, limit, offset: (page - 1) * limit }),
      countWorkspaces({ search: search || undefined }),
    ]);

    const workspaceIds = items.map((w: any) => w._id);
    const [memberCounts, convoCounts] = await Promise.all([
      countWorkspaceMembersByWorkspaceIds(workspaceIds),
      Conversation.aggregate([
        { $match: { workspaceId: { $in: workspaceIds } } },
        { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
      ]),
    ]);

    const convoMap = Object.fromEntries(convoCounts.map((c: any) => [String(c._id), c.count]));

    res.json({
      data: {
        workspaces: items.map((w: any) => ({
          ...w,
          memberCount: memberCounts[String(w._id)] || 0,
          conversationCount: convoMap[String(w._id)] || 0,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list workspaces error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users', authenticate, requireAdmin, async (_req, res) => {
  try {
    const page = Math.max(1, toInt(_req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(_req.query.limit, 20)));
    const search = (_req.query.search as string)?.trim();

    const [items, total] = await Promise.all([
      listUsers({ search: search || undefined, limit, offset: (page - 1) * limit }),
      countUsers({ search: search || undefined }),
    ]);

    const tierIds = items.map((u: any) => u.tierId).filter(Boolean) as string[];
    const tiers = await listTiersByIds(tierIds);
    const tierMap = Object.fromEntries(tiers.map((t: any) => [String(t._id), t]));

    const userIds = items.map((u: any) => u._id);
    const memberships = await listWorkspaceMembersByUserIds(userIds);
    const workspaceIds = memberships.map((m: any) => m.workspaceId);
    const workspaces = await listWorkspacesByIds(workspaceIds);
    const workspaceMap = Object.fromEntries(workspaces.map((w: any) => [String(w._id), w]));

    const membershipsByUser: Record<string, any[]> = {};
    memberships.forEach((m: any) => {
      const key = String(m.userId);
      membershipsByUser[key] = membershipsByUser[key] || [];
      membershipsByUser[key].push({
        _id: m.workspaceId,
        name: workspaceMap[String(m.workspaceId)]?.name,
        role: m.role,
      });
    });

    res.json({
      data: {
        users: items.map((u: any) => ({
          ...u,
          tier: u.tierId ? tierMap[String(u.tierId)] : undefined,
          workspaceCount: (membershipsByUser[String(u._id)] || []).length,
          workspaces: membershipsByUser[String(u._id)] || [],
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/conversations', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const workspaceId = req.query.workspaceId as string | undefined;

    const filter: any = {};
    if (workspaceId) filter.workspaceId = workspaceId;

    const [items, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    const workspaceIds = items.map((c: any) => c.workspaceId);
    const workspaceMap = Object.fromEntries(
      (await listWorkspacesByIds(workspaceIds)).map((w: any) => [String(w._id), w])
    );

    res.json({
      data: {
        conversations: items.map((c: any) => ({
          ...c,
          workspaceName: workspaceMap[String(c.workspaceId)]?.name,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard/stats', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [userCount, workspaceCount, conversationCount, messageCount] = await Promise.all([
      countUsers(),
      countWorkspaces(),
      Conversation.countDocuments({}),
      Message.countDocuments({}),
    ]);

    res.json({
      data: {
        totalWorkspaces: workspaceCount,
        totalUsers: userCount,
        conversations24h: conversationCount,
        activeEscalations: await Escalation.countDocuments({ status: { $in: ['pending', 'in_progress'] } }),
        aiResponseRate: 0,
        avgResponseTime: '0s',
        messages24h: messageCount,
        successRate: 0,
        recentEscalations: [],
        topWorkspaces: [],
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/system/metrics', authenticate, requireAdmin, async (_req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    res.json({
      data: {
        uptime: `${uptime.toFixed(0)}s`,
        cpuUsage: 0,
        memoryUsage: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Admin system metrics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/analytics', authenticate, requireAdmin, async (_req, res) => {
  res.json({ data: { series: [], range: _req.query.range || '30d' } });
});

router.get('/workspaces/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const workspace = await getWorkspaceById(id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const [memberCount, convoCount] = await Promise.all([
      listWorkspaceMembersByWorkspaceId(id).then(members => members.length),
      Conversation.countDocuments({ workspaceId: id }),
    ]);

    res.json({
      data: {
        ...workspace,
        memberCount,
        conversationCount: convoCount,
        todayActivity: 0,
        responseRate: 0,
      },
    });
  } catch (error) {
    console.error('Admin workspace detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspaces/:id/usage', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rangeDays = toRangeDays(req.query.range, 30);
    const endAt = new Date();
    const startAt = new Date(endAt);
    startAt.setUTCDate(startAt.getUTCDate() - rangeDays);

    const summary = await getWorkspaceOpenAiUsageSummary(id, startAt, endAt);

    res.json({
      data: {
        rangeDays,
        startAt,
        endAt,
        ...summary,
      },
    });
  } catch (error) {
    console.error('Admin workspace usage error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspaces/:id/members', authenticate, requireAdmin, async (req, res) => {
  try {
    const memberships = await listWorkspaceMembersByWorkspaceId(req.params.id);
    const users = await listUsersByIds(memberships.map(member => member.userId));
    const userMap = Object.fromEntries(users.map(user => [user._id, user]));
    const members = memberships.map(member => ({
      ...member,
      userId: {
        _id: member.userId,
        email: userMap[member.userId]?.email,
        firstName: userMap[member.userId]?.firstName,
        lastName: userMap[member.userId]?.lastName,
      },
    }));
    res.json({ data: { members } });
  } catch (error) {
    console.error('Admin workspace members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await getUserById(req.params.id, { includePassword: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const tier = user.tierId ? await getTierById(user.tierId) : undefined;
    const memberships = await listWorkspaceMembersByUserId(req.params.id);
    const workspaces = await listWorkspacesByIds(memberships.map((m: any) => m.workspaceId));
    const workspaceMap = Object.fromEntries(workspaces.map((w: any) => [String(w._id), w]));
    res.json({
      data: {
        ...user,
        tier,
        workspaces: memberships.map((m: any) => ({
          _id: m.workspaceId,
          name: workspaceMap[String(m.workspaceId)]?.name,
          role: m.role,
        })),
      },
    });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/conversations/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const convo = await Conversation.findById(req.params.id).lean();
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });
    const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean();
    res.json({ data: { conversation: convo, messages } });
  } catch (error) {
    console.error('Admin conversation detail error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/escalations', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const filter: any = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.severity) filter.severity = req.query.severity;

    const [items, total] = await Promise.all([
      Escalation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Escalation.countDocuments(filter),
    ]);

    res.json({
      data: {
        escalations: items,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin escalations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/health', authenticate, requireAdmin, async (_req, res) => {
  res.json({
    data: {
      status: 'healthy',
      uptime: `${process.uptime().toFixed(0)}s`,
      services: {
        database: 'connected',
        instagram: 'unknown',
        openai: 'unknown',
      },
    },
  });
});

router.get('/system/database', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [workspaces, users, conversations, messages] = await Promise.all([
      countWorkspaces(),
      countUsers(),
      Conversation.countDocuments({}),
      Message.countDocuments({}),
    ]);
    res.json({
      data: {
        size: 'unknown',
        collections: { workspaces, users, conversations, messages },
      },
    });
  } catch (error) {
    console.error('Admin db stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/system/connections', authenticate, requireAdmin, async (_req, res) => {
  res.json({ data: { connections: [] } });
});

router.get('/assistant/config/:workspaceId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const settings = await WorkspaceSettings.findOne({ workspaceId }).lean();
    res.json({
      data: {
        workspaceId,
        assistantName: settings?.assistantName || 'SendFx Assistant',
        assistantDescription: settings?.assistantDescription || 'Ask about product, pricing, or guardrails',
        systemPrompt: settings?.systemPrompt || '',
      },
    });
  } catch (error) {
    console.error('Admin assistant config get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/assistant/config/:workspaceId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { assistantName, assistantDescription, systemPrompt } = req.body || {};
    const settings = await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      { $set: { assistantName, assistantDescription, systemPrompt } },
      { new: true, upsert: true },
    );
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin assistant config update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/assistant/config', authenticate, requireAdmin, async (_req, res) => {
  try {
    const config = await GlobalAssistantConfig.findOne({ key: 'global' }).lean();
    res.json({ data: config || {} });
  } catch (error) {
    console.error('Admin global assistant config error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/assistant/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const payload: Partial<IGlobalAssistantConfig> = req.body || {};
    const config = await GlobalAssistantConfig.findOneAndUpdate(
      { key: 'global' },
      { $set: payload },
      { new: true, upsert: true },
    );
    res.json({ data: config });
  } catch (error) {
    console.error('Admin global assistant config update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ui-settings', authenticate, requireAdmin, async (_req, res) => {
  try {
    const settings = await GlobalUiSettings.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { key: 'global', uiTheme: 'legacy' } },
      { new: true, upsert: true },
    ).lean();
    res.json({ data: settings || {} });
  } catch (error) {
    console.error('Admin UI settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/ui-settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const payload: Partial<IGlobalUiSettings> = req.body || {};
    const settings = await GlobalUiSettings.findOneAndUpdate(
      { key: 'global' },
      { $set: payload },
      { new: true, upsert: true },
    );
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin UI settings update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/knowledge', authenticate, requireAdmin, async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string | undefined;
    const storageMode = req.query.storageMode as string | undefined;

    const filter: any = {};
    if (workspaceId) filter.workspaceId = workspaceId;
    if (storageMode) filter.storageMode = storageMode;

    const items = await KnowledgeItem.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ data: { items } });
  } catch (error) {
    console.error('Admin list knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, content, storageMode = 'vector', workspaceId, active } = req.body;
    if (!title || !content || !STORAGE_MODES.includes(storageMode)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const item = await KnowledgeItem.create({
      title,
      content,
      storageMode,
      workspaceId: workspaceId || undefined,
      ...(typeof active === 'boolean' ? { active } : {}),
    });

    if (storageMode === 'vector' && item.active !== false) {
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId: workspaceId || GLOBAL_WORKSPACE_KEY,
        title,
        content,
      });
    }

    res.status(201).json({ data: item });
  } catch (error) {
    console.error('Admin create knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, storageMode, active } = req.body;

    if (storageMode && !STORAGE_MODES.includes(storageMode)) {
      return res.status(400).json({ error: 'Invalid storageMode' });
    }

    const item = await KnowledgeItem.findById(id);
    if (!item) return res.status(404).json({ error: 'Knowledge item not found' });

    if (title) item.title = title;
    if (content) item.content = content;
    if (storageMode) item.storageMode = storageMode;
    if (typeof active === 'boolean') item.active = active;

    await item.save();

    if (item.storageMode === 'vector' && item.active !== false) {
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId: item.workspaceId?.toString() || GLOBAL_WORKSPACE_KEY,
        title: item.title,
        content: item.content,
      });
    } else {
      await deleteKnowledgeEmbedding(item._id.toString());
    }

    res.json({ data: item });
  } catch (error) {
    console.error('Admin update knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const item = await KnowledgeItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Knowledge item not found' });

    await KnowledgeItem.deleteOne({ _id: req.params.id });
    await deleteKnowledgeEmbedding(item._id.toString());

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin delete knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/reindex-vector', authenticate, requireAdmin, async (_req, res) => {
  try {
    await reindexGlobalKnowledge();
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin reindex global knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/reindex-vector/:workspaceId', authenticate, requireAdmin, async (req, res) => {
  try {
    await reindexWorkspaceKnowledge(req.params.workspaceId);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin reindex workspace knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/log-settings', authenticate, requireAdmin, async (_req, res) => {
  try {
    const settings = await getLogSettings();
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin log settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/log-settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const settings = await updateLogSettings(req.body || {});
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin log settings update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/log-events', authenticate, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, toInt(req.query.limit, 100)));
    const category = req.query.category as string | undefined;
    const level = req.query.level as 'info' | 'warn' | 'error' | undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    const sessionId = req.query.sessionId as string | undefined;
    const before = req.query.before as string | undefined;
    const beforeDate = before ? new Date(before) : undefined;

    const events = await getAdminLogEvents({
      limit,
      category,
      level,
      workspaceId,
      sessionId,
      before: beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined,
    });

    res.json({ data: { events } });
  } catch (error) {
    console.error('Admin log events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/log-events', authenticate, requireAdmin, async (_req, res) => {
  try {
    await deleteAdminLogEvents();
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin delete log events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-drafts', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = req.query.templateId as string | undefined;
    const status = req.query.status as string | undefined;

    const filter: any = {};
    if (templateId) filter.templateId = templateId;
    if (status) filter.status = status;

    const drafts = await FlowDraft.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ data: { drafts } });
  } catch (error) {
    console.error('Admin list flow drafts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-drafts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const draft = await FlowDraft.findById(req.params.id).lean();
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json({ data: draft });
  } catch (error) {
    console.error('Admin get flow draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/flow-drafts', authenticate, requireAdmin, async (req, res) => {
  try {
    const draft = await FlowDraft.create(req.body || {});
    res.status(201).json({ data: draft });
  } catch (error) {
    console.error('Admin create flow draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/flow-drafts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const draft = await FlowDraft.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    if (draft.templateId) {
      const templateStatus = draft.status === 'published' ? 'active' : 'archived';
      await FlowTemplate.findByIdAndUpdate(draft.templateId, { status: templateStatus });
    }

    res.json({ data: draft });
  } catch (error) {
    console.error('Admin update flow draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/flow-drafts/:id/publish', authenticate, requireAdmin, async (req, res) => {
  try {
    const draft = await FlowDraft.findById(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const compiled = compileFlow(draft.dsl);
    let template = draft.templateId ? await FlowTemplate.findById(draft.templateId) : null;

    if (!template) {
      template = await FlowTemplate.create({
        name: draft.name,
        description: draft.description,
        status: 'active',
      });
      draft.templateId = template._id;
      await draft.save();
    } else {
      template.name = draft.name;
      template.description = draft.description;
      template.status = 'active';
      await template.save();
    }

    const versionCount = await FlowTemplateVersion.countDocuments({ templateId: template._id });
    const newVersion = await FlowTemplateVersion.create({
      templateId: template._id,
      version: versionCount + 1,
      status: 'published',
      compiled,
      dslSnapshot: draft.dsl,
      triggers: draft.triggers,
      exposedFields: draft.exposedFields,
      display: draft.display,
      publishedAt: new Date(),
      createdBy: draft.createdBy,
    });

    template.currentVersionId = newVersion._id;
    template.status = 'active';
    await template.save();

    draft.status = 'published';
    await draft.save();

    res.json({ data: newVersion });
  } catch (error) {
    console.error('Admin publish flow draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/flow-drafts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const draft = await FlowDraft.findByIdAndDelete(req.params.id);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.templateId) {
      const remainingDrafts = await FlowDraft.countDocuments({ templateId: draft.templateId });
      if (remainingDrafts === 0) {
        await FlowTemplate.findByIdAndUpdate(draft.templateId, { status: 'archived' });
      }
    }
    res.json({ data: draft });
  } catch (error) {
    console.error('Admin delete flow draft error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-templates', authenticate, requireAdmin, async (_req, res) => {
  try {
    const templates = await FlowTemplate.find({}).sort({ updatedAt: -1 }).lean();
    res.json({ data: { templates } });
  } catch (error) {
    console.error('Admin list flow templates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-templates/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const template = await FlowTemplate.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ error: 'Flow template not found' });
    res.json({ data: template });
  } catch (error) {
    console.error('Admin get flow template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/flow-templates/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const template = await FlowTemplate.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!template) return res.status(404).json({ error: 'Flow template not found' });
    res.json({ data: template });
  } catch (error) {
    console.error('Admin update flow template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-templates/:id/versions', authenticate, requireAdmin, async (req, res) => {
  try {
    const versions = await FlowTemplateVersion.find({ templateId: req.params.id }).sort({ version: -1 }).lean();
    res.json({ data: { versions } });
  } catch (error) {
    console.error('Admin list flow template versions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-templates/:id/versions/:versionId', authenticate, requireAdmin, async (req, res) => {
  try {
    const version = await FlowTemplateVersion.findById(req.params.versionId).lean();
    if (!version) return res.status(404).json({ error: 'Flow template version not found' });
    res.json({ data: version });
  } catch (error) {
    console.error('Admin get flow template version error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/automation-intents', authenticate, requireAdmin, async (_req, res) => {
  try {
    const intents = await listAutomationIntents();
    res.json({ data: { intents } });
  } catch (error) {
    console.error('Admin list automation intents error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/automation-intents', authenticate, requireAdmin, async (req, res) => {
  try {
    const { value, description } = req.body || {};
    if (!value) {
      return res.status(400).json({ error: 'Intent value is required' });
    }
    const intent = await AutomationIntent.create({ value, description });
    res.status(201).json({ data: intent });
  } catch (error) {
    console.error('Admin create automation intent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/automation-intents/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const intent = await AutomationIntent.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!intent) return res.status(404).json({ error: 'Intent not found' });
    res.json({ data: intent });
  } catch (error) {
    console.error('Admin update automation intent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/automation-intents/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const intent = await AutomationIntent.findById(req.params.id);
    if (!intent) return res.status(404).json({ error: 'Intent not found' });
    await AutomationIntent.deleteOne({ _id: req.params.id });
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin delete automation intent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/automation-sessions', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const workspaceId = req.query.workspaceId as string | undefined;
    const channel = req.query.channel as string | undefined;

    const filter: any = {};
    if (workspaceId) filter.workspaceId = workspaceId;
    if (channel) filter.channel = channel;

    const [items, total] = await Promise.all([
      AutomationSession.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AutomationSession.countDocuments(filter),
    ]);

    res.json({
      data: {
        sessions: items,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list automation sessions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/automation-instances', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const workspaceId = req.query.workspaceId as string | undefined;

    const filter: any = {};
    if (workspaceId) filter.workspaceId = workspaceId;

    const [items, total] = await Promise.all([
      AutomationInstance.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AutomationInstance.countDocuments(filter),
    ]);

    res.json({
      data: {
        instances: items,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error('Admin list automation instances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/automation-instances/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const instance = await AutomationInstance.findById(req.params.id).lean();
    if (!instance) return res.status(404).json({ error: 'Automation instance not found' });
    res.json({ data: instance });
  } catch (error) {
    console.error('Admin get automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-template-versions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const version = await FlowTemplateVersion.findById(req.params.id).lean();
    if (!version) return res.status(404).json({ error: 'Flow template version not found' });
    res.json({ data: version });
  } catch (error) {
    console.error('Admin get flow template version error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/automations/compile', authenticate, requireAdmin, async (req, res) => {
  try {
    const compiled = compileFlow(req.body);
    res.json({ data: compiled });
  } catch (error) {
    console.error('Admin compile flow error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to compile flow' });
  }
});

export default router;
