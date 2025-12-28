import express, { Response } from 'express';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

const TEMPLATE_PUBLIC_FIELDS = 'name description status currentVersionId createdAt updatedAt';
const VERSION_PUBLIC_FIELDS = 'templateId version versionLabel status triggers exposedFields display publishedAt createdAt updatedAt';

router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const templates = await FlowTemplate.find({ status: 'active' })
      .select(TEMPLATE_PUBLIC_FIELDS)
      .sort({ updatedAt: -1 })
      .lean();
    const versionIds = templates
      .map((template) => template.currentVersionId)
      .filter(Boolean);

    const versions = versionIds.length
      ? await FlowTemplateVersion.find({
          _id: { $in: versionIds },
          status: 'published',
        }).select(VERSION_PUBLIC_FIELDS).lean()
      : [];

    const versionMap = new Map(versions.map((version: any) => [version._id.toString(), version]));

    const payload = templates.map((template: any) => ({
      ...template,
      currentVersion: template.currentVersionId
        ? versionMap.get(template.currentVersionId.toString()) || null
        : null,
    }));

    res.json(payload);
  } catch (error) {
    console.error('List flow templates error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:templateId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const template = await FlowTemplate.findById(templateId).select(TEMPLATE_PUBLIC_FIELDS).lean();
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    let currentVersion = null;
    if (template.currentVersionId) {
      currentVersion = await FlowTemplateVersion.findOne({
        _id: template.currentVersionId,
        status: 'published',
      }).select(VERSION_PUBLIC_FIELDS).lean();
    }

    res.json({ ...template, currentVersion });
  } catch (error) {
    console.error('Get flow template error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:templateId/versions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { templateId } = req.params;
    const template = await FlowTemplate.findById(templateId).select(TEMPLATE_PUBLIC_FIELDS).lean();
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const versions = await FlowTemplateVersion.find({ templateId })
      .select(VERSION_PUBLIC_FIELDS)
      .sort({ version: -1 })
      .lean();
    res.json(versions);
  } catch (error) {
    console.error('List flow template versions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:templateId/versions/:versionId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { templateId, versionId } = req.params;
    const version = await FlowTemplateVersion.findOne({ _id: versionId, templateId })
      .select(VERSION_PUBLIC_FIELDS)
      .lean();
    if (!version) {
      return res.status(404).json({ error: 'Template version not found' });
    }
    res.json(version);
  } catch (error) {
    console.error('Get flow template version error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
