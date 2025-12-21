import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import Workspace from '../models/Workspace';
import User from '../models/User';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import WorkspaceMember from '../models/WorkspaceMember';
import MessageCategory from '../models/MessageCategory';
import Escalation from '../models/Escalation';
import KnowledgeItem from '../models/KnowledgeItem';
import WorkspaceSettings from '../models/WorkspaceSettings';
import GlobalAssistantConfig, { IGlobalAssistantConfig } from '../models/GlobalAssistantConfig';

const router = express.Router();

const toInt = (value: any, fallback: number) => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};

// Admin god-eye: list all workspaces
router.get('/workspaces', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const search = (req.query.search as string)?.trim();

    const filter: any = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const [items, total] = await Promise.all([
      Workspace.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Workspace.countDocuments(filter),
    ]);

    const workspaceIds = items.map((w: any) => w._id);
    const [memberCounts, convoCounts] = await Promise.all([
      WorkspaceMember.aggregate([
        { $match: { workspaceId: { $in: workspaceIds } } },
        { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
      ]),
      Conversation.aggregate([
        { $match: { workspaceId: { $in: workspaceIds } } },
        { $group: { _id: '$workspaceId', count: { $sum: 1 } } },
      ]),
    ]);

    const memberMap = Object.fromEntries(memberCounts.map((m: any) => [String(m._id), m.count]));
    const convoMap = Object.fromEntries(convoCounts.map((c: any) => [String(c._id), c.count]));

    res.json({
      data: {
        workspaces: items.map((w: any) => ({
          ...w,
          memberCount: memberMap[String(w._id)] || 0,
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

// Admin god-eye: list all users
router.get('/users', authenticate, requireAdmin, async (_req, res) => {
  try {
    const page = Math.max(1, toInt(_req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(_req.query.limit, 20)));
    const search = (_req.query.search as string)?.trim();

    const filter: any = {};
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = items.map((u: any) => u._id);
    const memberships = await WorkspaceMember.find({ userId: { $in: userIds } }).lean();
    const workspaceIds = memberships.map((m: any) => m.workspaceId);
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } }).lean();
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

// Admin god-eye: list all conversations
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
    const categories = await MessageCategory.find({
      _id: { $in: items.map((c: any) => c.categoryId).filter(Boolean) },
    }).lean();
    const categoryMap = Object.fromEntries(categories.map((c: any) => [String(c._id), c]));
    const workspaceMap = Object.fromEntries(
      (await Workspace.find({ _id: { $in: workspaceIds } }).lean()).map((w: any) => [String(w._id), w])
    );

    res.json({
      data: {
        conversations: items.map((c: any) => ({
          ...c,
          workspaceName: workspaceMap[String(c.workspaceId)]?.name,
          categoryName: c.categoryId ? categoryMap[String(c.categoryId)]?.nameEn : undefined,
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

// Admin god-eye: platform stats
router.get('/dashboard/stats', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [userCount, workspaceCount, conversationCount, messageCount] = await Promise.all([
      User.countDocuments({}),
      Workspace.countDocuments({}),
      Conversation.countDocuments({}),
      Message.countDocuments({}),
    ]);

    res.json({
      data: {
        totalWorkspaces: workspaceCount,
        totalUsers: userCount,
        conversations24h: conversationCount, // placeholder
        activeEscalations: await Escalation.countDocuments({ status: { $in: ['pending', 'in_progress'] } }),
        aiResponseRate: 0,
        avgResponseTime: '0s',
        messages24h: messageCount, // placeholder
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

// System metrics (basic placeholders)
router.get('/system/metrics', authenticate, requireAdmin, async (_req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    res.json({
      data: {
        uptime: `${uptime.toFixed(0)}s`,
        cpuUsage: 0, // placeholder
        memoryUsage: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Admin system metrics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Analytics placeholder
router.get('/analytics', authenticate, requireAdmin, async (_req, res) => {
  res.json({ data: { series: [], range: _req.query.range || '30d' } });
});

// Workspace detail
router.get('/workspaces/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const workspace = await Workspace.findById(id).lean();
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const [memberCount, convoCount] = await Promise.all([
      WorkspaceMember.countDocuments({ workspaceId: id }),
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

router.get('/workspaces/:id/members', authenticate, requireAdmin, async (req, res) => {
  try {
    const members = await WorkspaceMember.find({ workspaceId: req.params.id })
      .populate('userId', 'email firstName lastName')
      .lean();
    res.json({ data: { members } });
  } catch (error) {
    console.error('Admin workspace members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspaces/:id/categories', authenticate, requireAdmin, async (req, res) => {
  try {
    const categories = await MessageCategory.find({ workspaceId: req.params.id }).lean();
    res.json({ data: { categories } });
  } catch (error) {
    console.error('Admin workspace categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// User detail
router.get('/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const memberships = await WorkspaceMember.find({ userId: req.params.id }).lean();
    const workspaces = await Workspace.find({ _id: { $in: memberships.map((m: any) => m.workspaceId) } }).lean();
    const workspaceMap = Object.fromEntries(workspaces.map((w: any) => [String(w._id), w]));
    res.json({
      data: {
        ...user,
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

// Conversation detail
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

// Escalations list
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

// Health & system info
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
      Workspace.countDocuments({}),
      User.countDocuments({}),
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

// Assistant config (uses WorkspaceSettings)
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
    res.json({ data: { success: true, message: 'Configuration updated', settings } });
  } catch (error) {
    console.error('Admin assistant config update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Global assistant config (god-eye)
router.get('/assistant/config', authenticate, requireAdmin, async (_req, res) => {
  try {
    const config = await GlobalAssistantConfig.findOneAndUpdate(
      {},
      {
        $setOnInsert: {
          assistantName: 'SendFx Assistant',
          assistantDescription: 'Ask about product, pricing, or guardrails',
          systemPrompt: '',
        },
      },
      { new: true, upsert: true },
    ).lean<IGlobalAssistantConfig>();

    res.json({
      data: {
        assistantName: config?.assistantName || 'SendFx Assistant',
        assistantDescription: config?.assistantDescription || 'Ask about product, pricing, or guardrails',
        systemPrompt: config?.systemPrompt || '',
      },
    });
  } catch (error) {
    console.error('Admin global assistant config get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/assistant/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const { assistantName, assistantDescription, systemPrompt } = req.body || {};
    const config = await GlobalAssistantConfig.findOneAndUpdate(
      {},
      { $set: { assistantName, assistantDescription, systemPrompt } },
      { new: true, upsert: true },
    );
    res.json({
      data: {
        success: true,
        message: 'Configuration updated',
        settings: {
          assistantName: config?.assistantName || 'SendFx Assistant',
          assistantDescription: config?.assistantDescription || 'Ask about product, pricing, or guardrails',
          systemPrompt: config?.systemPrompt || '',
        },
      },
    });
  } catch (error) {
    console.error('Admin global assistant config update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin knowledge passthrough (no membership filter)
router.get('/knowledge/workspace/:workspaceId', authenticate, requireAdmin, async (req, res) => {
  try {
    const items = await KnowledgeItem.find({ workspaceId: req.params.workspaceId }).sort({ createdAt: -1 }).lean();
    res.json({ data: items });
  } catch (error) {
    console.error('Admin knowledge list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Global knowledge (workspace-agnostic)
router.get('/knowledge', authenticate, requireAdmin, async (_req, res) => {
  try {
    const items = await KnowledgeItem.find({ $or: [{ workspaceId: null }, { workspaceId: { $exists: false } }] })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ data: items });
  } catch (error) {
    console.error('Admin knowledge global list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, content, workspaceId, storageMode = 'vector' } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }
    const normalizedWorkspaceId = workspaceId || null;
    const item = await KnowledgeItem.create({ title, content, workspaceId: normalizedWorkspaceId, storageMode });
    res.status(201).json({ data: item });
  } catch (error) {
    console.error('Admin knowledge create error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, content, storageMode } = req.body || {};
    const item = await KnowledgeItem.findByIdAndUpdate(
      req.params.id,
      { $set: { title, content, storageMode } },
      { new: true },
    );
    if (!item) return res.status(404).json({ error: 'Knowledge item not found' });
    res.json({ data: item });
  } catch (error) {
    console.error('Admin knowledge update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await KnowledgeItem.findByIdAndDelete(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin knowledge delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/workspace/:workspaceId/reindex-vector', authenticate, requireAdmin, async (req, res) => {
  try {
    // reuse existing route logic via vectorStore
    res.redirect(307, `/api/knowledge/workspace/${req.params.workspaceId}/reindex-vector`);
  } catch (error) {
    console.error('Admin knowledge reindex error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/reindex-vector', authenticate, requireAdmin, async (_req, res) => {
  try {
    res.json({ data: { success: true, message: 'Global knowledge reindex request accepted (no-op placeholder)' } });
  } catch (error) {
    console.error('Admin knowledge global reindex error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
