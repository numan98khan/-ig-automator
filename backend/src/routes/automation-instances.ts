import express, { Response } from 'express';
import mongoose from 'mongoose';
import AutomationInstance from '../models/AutomationInstance';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

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

export default router;
