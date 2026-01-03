import express, { Response } from 'express';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation';
import ContactNote from '../models/ContactNote';
import CrmTask from '../models/CrmTask';
import AutomationSession from '../models/AutomationSession';
import AutomationInstance from '../models/AutomationInstance';
import FlowTemplate from '../models/FlowTemplate';
import Message from '../models/Message';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { existsWorkspaceMember } from '../repositories/core/workspaceMemberRepository';
import { getUserById, listUsersByIds } from '../repositories/core/userRepository';

const router = express.Router();

const STAGES = ['new', 'engaged', 'qualified', 'won', 'lost'] as const;
type CrmStage = typeof STAGES[number];

const toInt = (value: any, fallback: number) => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeTags = (value: unknown): string[] => {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const cleaned = raw
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];
  cleaned.forEach((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });
  return result;
};

const parseDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
};

const normalizeStage = (value: unknown): CrmStage | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  return STAGES.includes(trimmed as CrmStage) ? (trimmed as CrmStage) : undefined;
};

const formatContactTags = (tags: any): string[] => {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
};

const formatContact = (contact: any) => ({
  ...contact,
  ownerId: contact.ownerId?.toString ? contact.ownerId.toString() : contact.ownerId,
  stage: contact.stage || 'new',
  tags: formatContactTags(contact.tags),
});

const loadConversationForUser = async (conversationId: string, userId: string) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    return { error: 'invalid' as const };
  }
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { error: 'not_found' as const };
  const { hasAccess } = await checkWorkspaceAccess(conversation.workspaceId.toString(), userId);
  if (!hasAccess) return { error: 'forbidden' as const };
  return { conversation };
};

const formatUser = (user: any) => {
  if (!user) return undefined;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const id = user._id && typeof user._id.toString === 'function' ? user._id.toString() : user._id;
  return {
    _id: id,
    email: user.email,
    instagramUsername: user.instagramUsername,
    name: name || user.email || user.instagramUsername,
  };
};

const mapUserIdsToMap = async (ids: Array<string | undefined>) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))) as string[];
  const users = await listUsersByIds(uniqueIds);
  return Object.fromEntries(users.map(user => [user._id, user]));
};

router.get('/contacts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId.trim() : '';
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    if (!mongoose.isValidObjectId(workspaceId)) {
      return res.status(400).json({ error: 'workspaceId must be a valid id' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 25)));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const stage = normalizeStage(req.query.stage);
    const tagFilter = normalizeTags(req.query.tags ?? req.query.tag);
    const inactiveDays = toInt(req.query.inactiveDays, 0);

    const workspaceObjectId = new mongoose.Types.ObjectId(workspaceId);
    const baseFilter: Record<string, any> = {
      workspaceId: workspaceObjectId,
      platform: { $ne: 'mock' },
    };
    const baseAndFilters: Record<string, any>[] = [];
    const tagFilters: Record<string, any>[] = [];
    const stageFilters: Record<string, any>[] = [];

    if (search) {
      const escaped = escapeRegExp(search);
      const regex = new RegExp(escaped, 'i');
      baseAndFilters.push({
        $or: [
          { participantName: regex },
          { participantHandle: regex },
          { contactEmail: regex },
          { contactPhone: regex },
        ],
      });
    }

    if (stage) {
      if (stage === 'new') {
        stageFilters.push({
          $or: [
            { stage: 'new' },
            { stage: { $exists: false } },
            { stage: null },
          ],
        });
      } else {
        stageFilters.push({ stage });
      }
    }

    if (tagFilter.length > 0) {
      const tagMatchers = tagFilter.map((tag) => new RegExp(`^${escapeRegExp(tag)}$`, 'i'));
      tagFilters.push({ tags: { $in: tagMatchers } });
    }

    const inactivityCutoff = inactiveDays > 0
      ? new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000)
      : undefined;

    const andFilters = [...baseAndFilters, ...tagFilters, ...stageFilters];
    if (inactivityCutoff) {
      andFilters.push({ lastMessageAt: { $lte: inactivityCutoff } });
    }
    if (andFilters.length > 0) {
      baseFilter.$and = andFilters;
    }

    const [contacts, total, stageCounts, tagCounts, newTodayCount, overdueCount, waitingCount, qualifiedCount] = await Promise.all([
      Conversation.find(baseFilter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(baseFilter),
      Conversation.aggregate([
        { $match: { workspaceId: workspaceObjectId } },
        { $group: { _id: '$stage', count: { $sum: 1 } } },
      ]),
      Conversation.aggregate([
        { $match: { workspaceId: workspaceObjectId } },
        { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),
      Conversation.countDocuments({
        workspaceId: workspaceObjectId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      Conversation.countDocuments({
        workspaceId: workspaceObjectId,
        stage: { $in: ['won', 'lost'] },
        updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      Conversation.countDocuments({
        workspaceId: workspaceObjectId,
        stage: 'engaged',
      }),
      Conversation.countDocuments({
        workspaceId: workspaceObjectId,
        stage: 'qualified',
      }),
    ]);

    const stageCountsMap = stageCounts.reduce((acc: Record<string, number>, entry: any) => {
      const key = entry._id || 'new';
      acc[key] = entry.count;
      return acc;
    }, {});

    const stageCountsPayload = STAGES.map((stageName) => ({
      stage: stageName,
      count: stageCountsMap[stageName] || 0,
    }));

    const tagCountsPayload = tagCounts.map((entry: any) => ({
      tag: entry._id,
      count: entry.count,
    }));

    const contactsPayload = contacts.map((contact) => formatContact(contact));

    res.json({
      data: {
        contacts: contactsPayload,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
          totalItems: total,
        },
        stageCounts: stageCountsPayload,
        tagCounts: tagCountsPayload,
        summary: {
          newToday: newTodayCount || 0,
          overdue: overdueCount,
          waiting: waitingCount || 0,
          qualified: qualifiedCount || 0,
        },
      },
    });
  } catch (error) {
    console.error('CRM list contacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/contacts/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    res.json({ data: { contact: formatContact(conversation.toObject()) } });
  } catch (error) {
    console.error('CRM get contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/contacts/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const updates: Record<string, any> = {};
    if (typeof req.body?.participantName === 'string') {
      const name = req.body.participantName.trim();
      if (name) updates.participantName = name;
    }
    if (typeof req.body?.participantHandle === 'string') {
      const handle = req.body.participantHandle.trim();
      if (handle) updates.participantHandle = handle;
    }
    if (typeof req.body?.contactEmail === 'string') {
      const email = req.body.contactEmail.trim().toLowerCase();
      updates.contactEmail = email || undefined;
    }
    if (typeof req.body?.contactPhone === 'string') {
      const phone = req.body.contactPhone.trim();
      updates.contactPhone = phone || undefined;
    }
    if ('tags' in (req.body || {})) {
      updates.tags = normalizeTags(req.body.tags);
    }
    if ('stage' in (req.body || {})) {
      const stage = normalizeStage(req.body.stage);
      if (!stage) {
        return res.status(400).json({ error: 'Invalid stage value' });
      }
      updates.stage = stage;
    }
    if ('ownerId' in (req.body || {})) {
      if (!req.body.ownerId) {
        updates.ownerId = undefined;
      } else if (mongoose.isValidObjectId(req.body.ownerId)) {
        const isMember = await existsWorkspaceMember(conversation.workspaceId.toString(), req.body.ownerId);
        if (!isMember) {
          return res.status(400).json({ error: 'Owner must belong to the workspace' });
        }
        updates.ownerId = new mongoose.Types.ObjectId(req.body.ownerId);
      } else {
        return res.status(400).json({ error: 'Owner id must be valid' });
      }
    }

    Object.assign(conversation, updates);
    await conversation.save();

    res.json({ data: { contact: formatContact(conversation.toObject()) } });
  } catch (error) {
    console.error('CRM update contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/contacts/:id/notes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const notes = await ContactNote.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .lean();

    const userMap = await mapUserIdsToMap(notes.map(note => note.authorId?.toString()));

    const payload = notes.map((note: any) => ({
      ...note,
      author: formatUser(userMap[note.authorId?.toString()] ?? null),
      authorId: note.authorId?.toString() || note.authorId,
    }));

    res.json({ data: { notes: payload } });
  } catch (error) {
    console.error('CRM list notes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/contacts/:id/notes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const body = typeof req.body?.body === 'string'
      ? req.body.body.trim()
      : typeof req.body?.content === 'string'
        ? req.body.content.trim()
        : '';

    if (!body) {
      return res.status(400).json({ error: 'Note body is required' });
    }

    const note = await ContactNote.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      authorId: req.userId,
      body,
    });

    const author = await getUserById(req.userId, { includePassword: true });

    res.status(201).json({
      data: {
        note: {
          ...note.toObject(),
          author: formatUser(author),
        },
      },
    });
  } catch (error) {
    console.error('CRM create note error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/contacts/:id/automation-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const sessions = await AutomationSession.find({ conversationId: conversation._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const instanceIds = Array.from(new Set(
      sessions
        .map((session: any) => session.automationInstanceId?.toString())
        .filter(Boolean)
    ));
    const instances = instanceIds.length
      ? await AutomationInstance.find({ _id: { $in: instanceIds } }).select('name templateId').lean()
      : [];
    const instanceMap = new Map(instances.map((instance: any) => [instance._id.toString(), instance]));

    const templateIds = Array.from(new Set(
      instances
        .map((instance: any) => instance.templateId?.toString())
        .filter(Boolean)
    ));
    const templates = templateIds.length
      ? await FlowTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
      : [];
    const templateMap = new Map(templates.map((template: any) => [template._id.toString(), template]));

    const payload = sessions.map((session: any) => {
      const instance = session.automationInstanceId
        ? instanceMap.get(session.automationInstanceId.toString())
        : null;
      const templateId = instance?.templateId || session.templateId;
      const template = templateId ? templateMap.get(templateId.toString()) : null;
      return {
        ...session,
        automationName: instance?.name,
        templateName: template?.name,
      };
    });

    res.json({ data: { sessions: payload } });
  } catch (error) {
    console.error('CRM automation events error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/contacts/:id/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const tasks = await CrmTask.find({ conversationId: conversation._id })
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .lean();

    const userMap = await mapUserIdsToMap([
      ...tasks.map(task => task.assignedTo?.toString()),
      ...tasks.map(task => task.createdBy?.toString()),
    ]);

    const payload = tasks.map((task: any) => {
      const assignedId = task.assignedTo?.toString();
      const createdId = task.createdBy?.toString();
      return {
        ...task,
        assignedTo: formatUser(assignedId ? userMap[assignedId] : null),
        createdBy: formatUser(createdId ? userMap[createdId] : null),
      };
    });

    res.json({ data: { tasks: payload } });
  } catch (error) {
    console.error('CRM list tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/contacts/:id/tasks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const taskType = typeof req.body?.taskType === 'string' && ['follow_up', 'general'].includes(req.body.taskType)
      ? req.body.taskType
      : 'follow_up';
    const status = typeof req.body?.status === 'string' && ['open', 'completed', 'cancelled'].includes(req.body.status)
      ? req.body.status
      : 'open';
    const dueAt = parseDate(req.body?.dueAt);
    const reminderAt = parseDate(req.body?.reminderAt);
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;

    let assignedTo: mongoose.Types.ObjectId | undefined;
    if (req.body?.assignedTo) {
      if (!mongoose.isValidObjectId(req.body.assignedTo)) {
        return res.status(400).json({ error: 'Assigned user must be valid' });
      }
      const isMember = await existsWorkspaceMember(conversation.workspaceId.toString(), req.body.assignedTo);
      if (!isMember) {
        return res.status(400).json({ error: 'Assignee must belong to the workspace' });
      }
      assignedTo = new mongoose.Types.ObjectId(req.body.assignedTo);
    }

    const task = await CrmTask.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation._id,
      title,
      description,
      taskType,
      status,
      dueAt,
      reminderAt,
      assignedTo,
      createdBy: req.userId,
      completedAt: status === 'completed' ? new Date() : undefined,
    });

    const userMap = await mapUserIdsToMap([
      task.assignedTo?.toString(),
      task.createdBy?.toString(),
    ]);

    const assignedId = task.assignedTo?.toString();
    const createdId = task.createdBy?.toString();
    const taskPayload = {
      ...task.toObject(),
      assignedTo: formatUser(assignedId ? userMap[assignedId] : null),
      createdBy: formatUser(createdId ? userMap[createdId] : null),
    };

    res.status(201).json({
      data: {
        task: taskPayload,
      },
    });
  } catch (error) {
    console.error('CRM create task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/contacts/:id/tasks/:taskId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversation, error } = await loadConversationForUser(req.params.id, req.userId!);
    if (error === 'invalid') return res.status(400).json({ error: 'Contact id must be valid' });
    if (error === 'not_found') return res.status(404).json({ error: 'Contact not found' });
    if (error === 'forbidden') return res.status(403).json({ error: 'Access denied to this workspace' });

    if (!mongoose.isValidObjectId(req.params.taskId)) {
      return res.status(400).json({ error: 'Task id must be valid' });
    }

    const task = await CrmTask.findOne({
      _id: req.params.taskId,
      conversationId: conversation._id,
    });
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (typeof req.body?.title === 'string') {
      task.title = req.body.title.trim();
    }
    if (typeof req.body?.description === 'string') {
      task.description = req.body.description.trim();
    }
    if (typeof req.body?.taskType === 'string' && ['follow_up', 'general'].includes(req.body.taskType)) {
      task.taskType = req.body.taskType;
    }
    if (typeof req.body?.status === 'string' && ['open', 'completed', 'cancelled'].includes(req.body.status)) {
      task.status = req.body.status;
      task.completedAt = req.body.status === 'completed' ? new Date() : undefined;
    }
    if ('dueAt' in (req.body || {})) {
      task.dueAt = parseDate(req.body.dueAt);
    }
    if ('reminderAt' in (req.body || {})) {
      task.reminderAt = parseDate(req.body.reminderAt);
    }
    if ('assignedTo' in (req.body || {})) {
      if (!req.body.assignedTo) {
        task.assignedTo = undefined;
      } else if (mongoose.isValidObjectId(req.body.assignedTo)) {
        const isMember = await existsWorkspaceMember(conversation.workspaceId.toString(), req.body.assignedTo);
        if (!isMember) {
          return res.status(400).json({ error: 'Assignee must belong to the workspace' });
        }
        task.assignedTo = new mongoose.Types.ObjectId(req.body.assignedTo);
      } else {
        return res.status(400).json({ error: 'Assigned user must be valid' });
      }
    }

    await task.save();

    const userMap = await mapUserIdsToMap([
      task.assignedTo?.toString(),
      task.createdBy?.toString(),
    ]);

    const updatedAssignedId = task.assignedTo?.toString();
    const updatedCreatedId = task.createdBy?.toString();
    const taskPayload = {
      ...task.toObject(),
      assignedTo: formatUser(updatedAssignedId ? userMap[updatedAssignedId] : null),
      createdBy: formatUser(updatedCreatedId ? userMap[updatedCreatedId] : null),
    };

    res.json({
      data: {
        task: taskPayload,
      },
    });
  } catch (error) {
    console.error('CRM update task error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
