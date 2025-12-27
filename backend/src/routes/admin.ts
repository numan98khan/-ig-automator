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
import AutomationTemplate from '../models/AutomationTemplate';
import Tier from '../models/Tier';
import { ensureBillingAccountForUser, upsertActiveSubscription } from '../services/billingService';
import {
  getAutomationTemplateConfig,
  isAutomationTemplateId,
  listAutomationTemplateConfigs,
} from '../services/automationTemplateService';
import {
  GLOBAL_WORKSPACE_KEY,
  deleteKnowledgeEmbedding,
  reindexGlobalKnowledge,
  reindexWorkspaceKnowledge,
  upsertKnowledgeEmbedding,
} from '../services/vectorStore';

const router = express.Router();

const toInt = (value: any, fallback: number) => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};
const toOptionalNumber = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
};
const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const normalizeModel = (value: any) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const STORAGE_MODES = ['vector', 'text'];

// Tiers CRUD
router.get('/tiers', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 20)));
    const search = (req.query.search as string)?.trim();
    const status = (req.query.status as string)?.trim();

    const filter: any = {};
    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }
    if (status) {
      filter.status = status;
    }

    const [items, total] = await Promise.all([
      Tier.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tier.countDocuments(filter),
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
    const tier = await Tier.create(req.body || {});
    res.status(201).json({ data: tier });
  } catch (error: any) {
    console.error('Admin create tier error:', error);
    res.status(400).json({ error: error.message || 'Failed to create tier' });
  }
});

router.get('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await Tier.findById(req.params.id).lean();
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    const userCount = await User.countDocuments({ tierId: tier._id });
    res.json({ data: { ...tier, userCount } });
  } catch (error) {
    console.error('Admin get tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await Tier.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    res.json({ data: tier });
  } catch (error: any) {
    console.error('Admin update tier error:', error);
    res.status(400).json({ error: error.message || 'Failed to update tier' });
  }
});

router.delete('/tiers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await Tier.findById(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });
    const userCount = await User.countDocuments({ tierId: tier._id });
    if (tier.isDefault || userCount > 0) {
      return res.status(400).json({ error: 'Cannot delete a default or in-use tier' });
    }
    await Tier.deleteOne({ _id: req.params.id });
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin delete tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/tiers/:id/assign/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const tier = await Tier.findById(req.params.id);
    if (!tier) return res.status(404).json({ error: 'Tier not found' });

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const billingAccount = await ensureBillingAccountForUser(user._id);
    if (!billingAccount) return res.status(400).json({ error: 'Failed to load billing account' });

    await upsertActiveSubscription(billingAccount._id, tier._id);

    user.tierId = tier._id;
    await user.save();

    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin assign tier error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

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

    const tierIds = items.map((u: any) => u.tierId).filter(Boolean);
    const tiers = await Tier.find({ _id: { $in: tierIds } }).lean();
    const tierMap = Object.fromEntries(tiers.map((t: any) => [String(t._id), t]));

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
    const tier = user.tierId ? await Tier.findById(user.tierId).lean() : undefined;
    const memberships = await WorkspaceMember.find({ userId: req.params.id }).lean();
    const workspaces = await Workspace.find({ _id: { $in: memberships.map((m: any) => m.workspaceId) } }).lean();
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

// Automation template configs (global)
router.get('/automation-templates', authenticate, requireAdmin, async (_req, res) => {
  try {
    const templates = await listAutomationTemplateConfigs();
    res.json({ data: templates });
  } catch (error) {
    console.error('Admin automation templates list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/automation-templates/:templateId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!isAutomationTemplateId(templateId)) {
      return res.status(404).json({ error: 'Unknown automation template' });
    }
    const template = await getAutomationTemplateConfig(templateId);
    res.json({ data: template });
  } catch (error) {
    console.error('Admin automation template get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/automation-templates/:templateId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!isAutomationTemplateId(templateId)) {
      return res.status(404).json({ error: 'Unknown automation template' });
    }

    const aiReply = req.body?.aiReply || {};
    const categorization = req.body?.categorization || {};
    const update: Record<string, any> = {};

    const replyModel = normalizeModel(aiReply.model);
    if (replyModel) update['aiReply.model'] = replyModel;

    const replyTemperature = toOptionalNumber(aiReply.temperature);
    if (replyTemperature !== undefined) {
      update['aiReply.temperature'] = clampNumber(replyTemperature, 0, 2);
    }

    const replyMaxTokens = toOptionalNumber(aiReply.maxOutputTokens);
    if (replyMaxTokens !== undefined) {
      update['aiReply.maxOutputTokens'] = Math.max(1, Math.round(replyMaxTokens));
    }

    const categorizationModel = normalizeModel(categorization.model);
    if (categorizationModel) update['categorization.model'] = categorizationModel;

    const categorizationTemperature = toOptionalNumber(categorization.temperature);
    if (categorizationTemperature !== undefined) {
      update['categorization.temperature'] = clampNumber(categorizationTemperature, 0, 2);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await AutomationTemplate.findOneAndUpdate(
      { templateId },
      { $set: update },
      { new: true, upsert: true },
    );

    const template = await getAutomationTemplateConfig(templateId);
    res.json({ data: template });
  } catch (error) {
    console.error('Admin automation template update error:', error);
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
    const normalizedStorageMode = STORAGE_MODES.includes(storageMode) ? storageMode : 'vector';
    const item = await KnowledgeItem.create({
      title,
      content,
      workspaceId: normalizedWorkspaceId,
      storageMode: normalizedStorageMode,
    });

    if (normalizedStorageMode === 'vector') {
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId: normalizedWorkspaceId || GLOBAL_WORKSPACE_KEY,
        title,
        content,
      });
    }
    res.status(201).json({ data: item });
  } catch (error) {
    console.error('Admin knowledge create error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { title, content, storageMode } = req.body || {};
    const item = await KnowledgeItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Knowledge item not found' });

    const nextStorageMode = storageMode && STORAGE_MODES.includes(storageMode)
      ? storageMode
      : (item.storageMode || 'vector');

    item.title = title || item.title;
    item.content = content || item.content;
    item.storageMode = nextStorageMode;
    await item.save();

    const workspaceKey = item.workspaceId ? item.workspaceId.toString() : GLOBAL_WORKSPACE_KEY;
    if (nextStorageMode === 'vector') {
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId: workspaceKey,
        title: item.title,
        content: item.content,
      });
    } else {
      await deleteKnowledgeEmbedding(item._id.toString());
    }
    res.json({ data: item });
  } catch (error) {
    console.error('Admin knowledge update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/knowledge/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await KnowledgeItem.findByIdAndDelete(req.params.id);
    await deleteKnowledgeEmbedding(req.params.id);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin knowledge delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/workspace/:workspaceId/reindex-vector', authenticate, requireAdmin, async (req, res) => {
  try {
    await reindexWorkspaceKnowledge(req.params.workspaceId);
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Admin knowledge reindex error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/knowledge/reindex-vector', authenticate, requireAdmin, async (_req, res) => {
  try {
    await reindexGlobalKnowledge();
    res.json({ data: { success: true, message: 'Global knowledge reindexed' } });
  } catch (error) {
    console.error('Admin knowledge global reindex error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
