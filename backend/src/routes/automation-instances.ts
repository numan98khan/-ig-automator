import express, { Response } from 'express';
import mongoose from 'mongoose';
import AutomationInstance from '../models/AutomationInstance';
import AutomationSession from '../models/AutomationSession';
import Conversation from '../models/Conversation';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import InstagramAccount from '../models/InstagramAccount';
import Message from '../models/Message';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import { executePreviewFlowForInstance, resolveLatestTemplateVersion } from '../services/automationService';

const router = express.Router();

const TEMPLATE_PUBLIC_FIELDS = 'name description status currentVersionId createdAt updatedAt';
const VERSION_PUBLIC_FIELDS = 'templateId version versionLabel status triggers exposedFields display publishedAt createdAt updatedAt';

const resolveTemplateVersion = async (params: {
  templateId?: string;
  templateVersionId?: string;
}) => {
  const { templateId, templateVersionId } = params;
  let template = null;

  if (templateId) {
    template = await FlowTemplate.findById(templateId).lean();
  } else if (templateVersionId) {
    const version = await FlowTemplateVersion.findById(templateVersionId).lean();
    if (!version || version.status !== 'published') {
      return null;
    }
    template = await FlowTemplate.findById(version.templateId).lean();
  }

  if (!template || !template.currentVersionId) return null;

  const version = await FlowTemplateVersion.findOne({
    _id: template.currentVersionId,
    status: 'published',
  }).lean();
  if (!version) return null;

  return {
    templateId: template._id,
    templateVersionId: version._id,
  };
};

const hydrateInstances = async (instances: Array<Record<string, any>>) => {
  if (!instances.length) return instances;

  const templateIds = Array.from(new Set(instances.map((item) => item.templateId?.toString()).filter(Boolean)));
  const storedVersionIds = Array.from(
    new Set(instances.map((item) => item.templateVersionId?.toString()).filter(Boolean)),
  );

  const templates = templateIds.length
    ? await FlowTemplate.find({ _id: { $in: templateIds } }).select(TEMPLATE_PUBLIC_FIELDS).lean()
    : [];

  const currentVersionIds = templates
    .map((template: any) => template.currentVersionId?.toString())
    .filter(Boolean) as string[];

  const versionIds = Array.from(new Set([...storedVersionIds, ...currentVersionIds]));

  const versions = versionIds.length
    ? await FlowTemplateVersion.find({ _id: { $in: versionIds } })
        .select(VERSION_PUBLIC_FIELDS)
        .lean()
    : [];

  const templateMap = new Map(templates.map((template: any) => [template._id.toString(), template]));
  const versionMap = new Map(versions.map((version: any) => [version._id.toString(), version]));

  return instances.map((instance) => {
    const template = instance.templateId ? templateMap.get(instance.templateId.toString()) || null : null;
    const latestVersionId = template?.currentVersionId?.toString();
    const latestVersion = latestVersionId ? versionMap.get(latestVersionId) || null : null;
    const storedVersion = instance.templateVersionId
      ? versionMap.get(instance.templateVersionId.toString()) || null
      : null;

    return {
      ...instance,
      template,
      templateVersion: latestVersion || storedVersion,
    };
  });
};

const buildPreviewConversation = async (params: {
  instance: any;
  instagramAccountId: mongoose.Types.ObjectId;
}) => {
  const { instance, instagramAccountId } = params;
  return Conversation.create({
    participantName: 'Preview Tester',
    participantHandle: 'preview',
    workspaceId: instance.workspaceId,
    instagramAccountId,
    platform: 'mock',
    participantInstagramId: `preview-${instance._id.toString()}`,
  });
};

const formatPreviewMessages = (messages: Array<Record<string, any>>) =>
  messages.map((message) => ({
    id: message._id?.toString(),
    text: message.text,
    from: message.from,
    createdAt: message.createdAt,
  }));

const loadPreviewMessages = async (conversationId: mongoose.Types.ObjectId | string) => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();
  return formatPreviewMessages(messages);
};

const ensurePreviewSession = async (params: {
  instance: any;
  templateVersionId: mongoose.Types.ObjectId;
  instagramAccountId: mongoose.Types.ObjectId;
  reset?: boolean;
  sessionId?: string;
}) => {
  const { instance, templateVersionId, instagramAccountId, reset, sessionId } = params;
  let session = sessionId
    ? await AutomationSession.findById(sessionId)
    : await AutomationSession.findOne({
        automationInstanceId: instance._id,
        channel: 'preview',
      }).sort({ updatedAt: -1 });

  const shouldReset = reset || !session || session.status !== 'active' || session.channel !== 'preview';
  if (shouldReset) {
    const conversation = await buildPreviewConversation({ instance, instagramAccountId });
    session = await AutomationSession.create({
      workspaceId: instance.workspaceId,
      conversationId: conversation._id,
      automationInstanceId: instance._id,
      templateId: instance.templateId,
      templateVersionId,
      channel: 'preview',
      status: 'active',
      state: {},
    });
    return { session, conversation };
  }

  if (session.templateVersionId?.toString() !== templateVersionId.toString()) {
    session.templateVersionId = templateVersionId;
    await session.save();
  }

  const conversation = await Conversation.findById(session.conversationId);
  if (!conversation) {
    const newConversation = await buildPreviewConversation({ instance, instagramAccountId });
    session.conversationId = newConversation._id;
    await session.save();
    return { session, conversation: newConversation };
  }

  return { session, conversation };
};

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const instances = await AutomationInstance.find({ workspaceId })
      .sort({ createdAt: -1 })
      .lean();
    const hydrated = await hydrateInstances(instances);
    res.json(hydrated);
  } catch (error) {
    console.error('Get automation instances error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id).lean();
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [hydrated] = await hydrateInstances([instance]);
    res.json(hydrated);
  } catch (error) {
    console.error('Get automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, workspaceId, templateId, templateVersionId, userConfig, isActive } = req.body || {};

    if (!name || !workspaceId || (!templateId && !templateVersionId)) {
      return res.status(400).json({
        error: 'name, workspaceId, and templateId or templateVersionId are required',
      });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can create automations' });
    }

    const resolved = await resolveTemplateVersion({ templateId, templateVersionId });
    if (!resolved) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instance = await AutomationInstance.create({
      name,
      description,
      workspaceId: new mongoose.Types.ObjectId(workspaceId),
      templateId: resolved.templateId,
      templateVersionId: resolved.templateVersionId,
      userConfig: userConfig || {},
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.status(201).json(hydrated);
  } catch (error: any) {
    console.error('Create automation instance error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, userConfig, isActive, templateId, templateVersionId } = req.body || {};

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can update automations' });
    }

    if (templateId || templateVersionId) {
      const resolved = await resolveTemplateVersion({ templateId, templateVersionId });
      if (!resolved) {
        return res.status(400).json({ error: 'Template version not found or unpublished' });
      }
      instance.templateId = resolved.templateId;
      instance.templateVersionId = resolved.templateVersionId;
    }

    if (name !== undefined) instance.name = name;
    if (description !== undefined) instance.description = description;
    if (userConfig !== undefined) instance.userConfig = userConfig;
    if (isActive !== undefined) instance.isActive = Boolean(isActive);

    await instance.save();
    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.json(hydrated);
  } catch (error: any) {
    console.error('Update automation instance error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

router.patch('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    instance.isActive = !instance.isActive;
    await instance.save();
    const [hydrated] = await hydrateInstances([instance.toObject()]);
    res.json(hydrated);
  } catch (error) {
    console.error('Toggle automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(
      instance.workspaceId.toString(),
      req.userId!,
    );
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can delete automations' });
    }

    await AutomationInstance.findByIdAndDelete(id);
    res.json({ message: 'Automation instance deleted successfully' });
  } catch (error) {
    console.error('Delete automation instance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reset } = req.body || {};
    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await resolveLatestTemplateVersion({
      templateId: instance.templateId,
      fallbackVersionId: instance.templateVersionId,
    });
    if (!version) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instagramAccount = await InstagramAccount.findOne({ workspaceId: instance.workspaceId })
      .select('_id')
      .lean();
    if (!instagramAccount?._id) {
      return res.status(400).json({ error: 'Instagram account not connected for this workspace' });
    }

    const { session, conversation } = await ensurePreviewSession({
      instance,
      templateVersionId: version._id,
      instagramAccountId: instagramAccount._id,
      reset: Boolean(reset),
    });

    const messages = await loadPreviewMessages(conversation._id);
    return res.json({
      sessionId: session._id,
      conversationId: conversation._id,
      status: session.status,
      messages,
    });
  } catch (error) {
    console.error('Create preview session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/preview-session/message', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { text, sessionId } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const instance = await AutomationInstance.findById(id);
    if (!instance) {
      return res.status(404).json({ error: 'Automation instance not found' });
    }

    const { hasAccess } = await checkWorkspaceAccess(instance.workspaceId.toString(), req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await resolveLatestTemplateVersion({
      templateId: instance.templateId,
      fallbackVersionId: instance.templateVersionId,
    });
    if (!version) {
      return res.status(400).json({ error: 'Template version not found or unpublished' });
    }

    const instagramAccount = await InstagramAccount.findOne({ workspaceId: instance.workspaceId })
      .select('_id')
      .lean();
    if (!instagramAccount?._id) {
      return res.status(400).json({ error: 'Instagram account not connected for this workspace' });
    }

    const { session, conversation } = await ensurePreviewSession({
      instance,
      templateVersionId: version._id,
      instagramAccountId: instagramAccount._id,
      sessionId,
    });

    const trimmedText = text.trim();
    const customerMessage = await Message.create({
      conversationId: conversation._id,
      workspaceId: conversation.workspaceId,
      text: trimmedText,
      from: 'customer',
      platform: 'mock',
    });

    conversation.lastMessage = customerMessage.text;
    conversation.lastMessageAt = customerMessage.createdAt;
    conversation.lastCustomerMessageAt = customerMessage.createdAt;
    await conversation.save();

    const result = await executePreviewFlowForInstance({
      instance,
      session,
      conversation,
      messageText: trimmedText,
    });

    return res.json({
      success: result.success,
      error: result.error,
      sessionId: session._id,
      messages: result.messages,
    });
  } catch (error) {
    console.error('Send preview message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
