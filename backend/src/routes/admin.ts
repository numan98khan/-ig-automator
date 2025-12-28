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
import FlowDraft from '../models/FlowDraft';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import Tier from '../models/Tier';
import { ensureBillingAccountForUser, upsertActiveSubscription } from '../services/billingService';
import { getLogSettings, updateLogSettings } from '../services/adminLogSettingsService';
import { compileFlow } from '../services/flowCompiler';
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
const toOptionalBoolean = (value: any) => {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};
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

// Admin log settings (console logging controls)
router.get('/log-settings', authenticate, requireAdmin, async (_req, res) => {
  try {
    const settings = await getLogSettings();
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin log settings get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/log-settings', authenticate, requireAdmin, async (req, res) => {
  try {
    const aiTimingEnabled = toOptionalBoolean(req.body?.aiTimingEnabled);
    const automationLogsEnabled = toOptionalBoolean(req.body?.automationLogsEnabled);
    const automationStepsEnabled = toOptionalBoolean(req.body?.automationStepsEnabled);
    const openaiApiLogsEnabled = toOptionalBoolean(req.body?.openaiApiLogsEnabled);

    const settings = await updateLogSettings({
      ...(aiTimingEnabled === undefined ? {} : { aiTimingEnabled }),
      ...(automationLogsEnabled === undefined ? {} : { automationLogsEnabled }),
      ...(automationStepsEnabled === undefined ? {} : { automationStepsEnabled }),
      ...(openaiApiLogsEnabled === undefined ? {} : { openaiApiLogsEnabled }),
    });
    res.json({ data: settings });
  } catch (error) {
    console.error('Admin log settings update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Flow drafts (internal builder)
router.get('/flow-drafts', authenticate, requireAdmin, async (req, res) => {
  try {
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId.trim() : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const filter: Record<string, any> = {};
    if (templateId) filter.templateId = templateId;
    if (status) filter.status = status;
    const drafts = await FlowDraft.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ data: drafts });
  } catch (error) {
    console.error('Admin flow drafts list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/flow-drafts', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, templateId, dsl, triggers, exposedFields, status, display } = req.body || {};
    if (!name || !dsl) {
      return res.status(400).json({ error: 'name and dsl are required' });
    }

    let resolvedTemplateId = templateId;
    if (resolvedTemplateId) {
      const template = await FlowTemplate.findById(resolvedTemplateId).lean();
      if (!template) {
        return res.status(400).json({ error: 'Template not found for templateId' });
      }
    }

    const draft = await FlowDraft.create({
      name: String(name).trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      status: status === 'archived' ? 'archived' : 'draft',
      templateId: resolvedTemplateId || undefined,
      dsl,
      triggers: Array.isArray(triggers) ? triggers : [],
      exposedFields: Array.isArray(exposedFields) ? exposedFields : [],
      display: display || undefined,
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    res.status(201).json({ data: draft });
  } catch (error: any) {
    console.error('Admin flow drafts create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create flow draft' });
  }
});

router.get('/flow-drafts/:draftId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { draftId } = req.params;
    const draft = await FlowDraft.findById(draftId).lean();
    if (!draft) {
      return res.status(404).json({ error: 'Flow draft not found' });
    }
    res.json({ data: draft });
  } catch (error) {
    console.error('Admin flow drafts get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/flow-drafts/:draftId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { draftId } = req.params;
    const draft = await FlowDraft.findById(draftId);
    if (!draft) {
      return res.status(404).json({ error: 'Flow draft not found' });
    }

    const { name, description, templateId, dsl, triggers, exposedFields, status, display } = req.body || {};
    if (name !== undefined) {
      const normalized = String(name).trim();
      if (!normalized) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      draft.name = normalized;
    }
    if (description !== undefined) {
      const normalized = typeof description === 'string' ? description.trim() : '';
      draft.description = normalized || undefined;
    }
    if (dsl !== undefined) draft.dsl = dsl;
    if (Array.isArray(triggers)) draft.triggers = triggers;
    if (Array.isArray(exposedFields)) draft.exposedFields = exposedFields;
    if (display !== undefined) draft.display = display;
    if (status === 'archived' || status === 'draft') draft.status = status;

    if (templateId !== undefined) {
      if (!templateId) {
        draft.templateId = undefined;
      } else {
        const template = await FlowTemplate.findById(templateId).lean();
        if (!template) {
          return res.status(400).json({ error: 'Template not found for templateId' });
        }
        draft.templateId = template._id;
      }
    }

    draft.updatedBy = req.userId;
    await draft.save();
    res.json({ data: draft });
  } catch (error: any) {
    console.error('Admin flow drafts update error:', error);
    res.status(400).json({ error: error.message || 'Failed to update flow draft' });
  }
});

router.post('/flow-drafts/:draftId/publish', authenticate, requireAdmin, async (req, res) => {
  try {
    const { draftId } = req.params;
    const draft = await FlowDraft.findById(draftId);
    if (!draft) {
      return res.status(404).json({ error: 'Flow draft not found' });
    }

    const {
      compiled,
      dslSnapshot,
      triggers,
      exposedFields,
      templateId,
      versionLabel,
      display,
    } = req.body || {};

    const snapshot = dslSnapshot || draft.dsl;
    if (!snapshot && !compiled) {
      return res.status(400).json({ error: 'dslSnapshot or compiled artifact is required to publish' });
    }

    const compiledArtifact = compiled || compileFlow(snapshot);

    let template: any = null;
    const resolvedTemplateId = templateId || draft.templateId;
    if (resolvedTemplateId) {
      template = await FlowTemplate.findById(resolvedTemplateId);
      if (!template) {
        return res.status(400).json({ error: 'Template not found for templateId' });
      }
    }

    if (!template) {
      template = await FlowTemplate.create({
        name: draft.name,
        description: draft.description,
        status: 'active',
        createdBy: req.userId,
        updatedBy: req.userId,
      });
    }

    const latestVersion = await FlowTemplateVersion.findOne({ templateId: template._id })
      .sort({ version: -1 })
      .lean();
    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

    const version = await FlowTemplateVersion.create({
      templateId: template._id,
      version: nextVersion,
      versionLabel: typeof versionLabel === 'string' ? versionLabel.trim() : undefined,
      status: 'published',
      compiled: compiledArtifact,
      dslSnapshot: snapshot,
      triggers: Array.isArray(triggers) ? triggers : (draft.triggers || []),
      exposedFields: Array.isArray(exposedFields) ? exposedFields : (draft.exposedFields || []),
      display: display || draft.display,
      publishedAt: new Date(),
      createdBy: req.userId,
    });

    template.currentVersionId = version._id;
    template.status = 'active';
    template.updatedBy = req.userId;
    await template.save();

    draft.templateId = template._id;
    draft.updatedBy = req.userId;
    await draft.save();

    res.status(201).json({ data: { template, version } });
  } catch (error: any) {
    console.error('Admin flow drafts publish error:', error);
    res.status(400).json({ error: error.message || 'Failed to publish flow draft' });
  }
});

// Flow templates (published)
router.get('/flow-templates', authenticate, requireAdmin, async (_req, res) => {
  try {
    const templates = await FlowTemplate.find({}).sort({ updatedAt: -1 }).lean();
    const versionIds = templates
      .map((template) => template.currentVersionId)
      .filter(Boolean);

    const versions = versionIds.length
      ? await FlowTemplateVersion.find({ _id: { $in: versionIds } }).lean()
      : [];
    const versionMap = new Map(versions.map((version: any) => [version._id.toString(), version]));

    const payload = templates.map((template: any) => ({
      ...template,
      currentVersion: template.currentVersionId
        ? versionMap.get(template.currentVersionId.toString()) || null
        : null,
    }));

    res.json({ data: payload });
  } catch (error) {
    console.error('Admin flow templates list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/flow-templates', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, status } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const template = await FlowTemplate.create({
      name: String(name).trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      status: status === 'archived' ? 'archived' : 'active',
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    res.status(201).json({ data: template });
  } catch (error: any) {
    console.error('Admin flow templates create error:', error);
    res.status(400).json({ error: error.message || 'Failed to create flow template' });
  }
});

router.get('/flow-templates/:templateId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await FlowTemplate.findById(templateId).lean();
    if (!template) {
      return res.status(404).json({ error: 'Flow template not found' });
    }
    let currentVersion = null;
    if (template.currentVersionId) {
      currentVersion = await FlowTemplateVersion.findById(template.currentVersionId).lean();
    }
    res.json({ data: { ...template, currentVersion } });
  } catch (error) {
    console.error('Admin flow templates get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/flow-templates/:templateId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await FlowTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Flow template not found' });
    }

    const { name, description, status, currentVersionId } = req.body || {};
    if (name !== undefined) {
      const normalized = String(name).trim();
      if (!normalized) {
        return res.status(400).json({ error: 'name cannot be empty' });
      }
      template.name = normalized;
    }
    if (description !== undefined) {
      const normalized = typeof description === 'string' ? description.trim() : '';
      template.description = normalized || undefined;
    }
    if (status === 'archived' || status === 'active') template.status = status;

    if (currentVersionId !== undefined) {
      if (!currentVersionId) {
        template.currentVersionId = undefined;
      } else {
        const version = await FlowTemplateVersion.findOne({ _id: currentVersionId, templateId }).lean();
        if (!version) {
          return res.status(400).json({ error: 'Version not found for template' });
        }
        template.currentVersionId = version._id;
      }
    }

    template.updatedBy = req.userId;
    await template.save();
    res.json({ data: template });
  } catch (error: any) {
    console.error('Admin flow templates update error:', error);
    res.status(400).json({ error: error.message || 'Failed to update flow template' });
  }
});

router.get('/flow-templates/:templateId/versions', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await FlowTemplate.findById(templateId).lean();
    if (!template) {
      return res.status(404).json({ error: 'Flow template not found' });
    }
    const versions = await FlowTemplateVersion.find({ templateId }).sort({ version: -1 }).lean();
    res.json({ data: versions });
  } catch (error) {
    console.error('Admin flow templates versions list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/flow-templates/:templateId/versions/:versionId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { templateId, versionId } = req.params;
    const version = await FlowTemplateVersion.findOne({ _id: versionId, templateId }).lean();
    if (!version) {
      return res.status(404).json({ error: 'Flow template version not found' });
    }
    res.json({ data: version });
  } catch (error) {
    console.error('Admin flow templates version get error:', error);
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
