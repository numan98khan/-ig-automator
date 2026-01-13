import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

function sanitizeSettings(settings: any) {
  if (!settings) return settings;
  const plain = settings.toObject ? settings.toObject() : { ...settings };
  if (plain.googleSheets) {
    delete plain.googleSheets.serviceAccountJson;
    delete plain.googleSheets.oauthRefreshToken;
  }
  return plain;
}

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const { hasAccess, workspace } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    let settings = await WorkspaceSettings.findOne({ workspaceId });

    if (!settings) {
      settings = await WorkspaceSettings.create({ workspaceId });
    }

    res.json(sanitizeSettings(settings));
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const {
      defaultLanguage,
      defaultReplyLanguage,
      uiLanguage,
      allowHashtags,
      allowEmojis,
      maxReplySentences,
      decisionMode,
      escalationGuidelines,
      escalationExamples,
      humanEscalationBehavior,
      humanHoldMinutes,
      businessName,
      businessDescription,
      businessHours,
      businessTone,
      businessLocation,
      businessWebsite,
      businessCatalog,
      businessDocuments,
      demoModeEnabled,
      onboarding,
      googleSheets,
    } = req.body;

    const { hasAccess, workspace, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (!hasAccess || (!isOwner && role !== 'admin')) {
      return res.status(403).json({ error: 'Only workspace owners and managers can update settings' });
    }

    const existingSettings = await WorkspaceSettings.findOne({ workspaceId });
    const updateData: Record<string, any> = {};

    if (defaultLanguage !== undefined) updateData.defaultLanguage = defaultLanguage;
    if (defaultReplyLanguage !== undefined) updateData.defaultReplyLanguage = defaultReplyLanguage;
    if (uiLanguage !== undefined) updateData.uiLanguage = uiLanguage;
    if (allowHashtags !== undefined) updateData.allowHashtags = allowHashtags;
    if (allowEmojis !== undefined) updateData.allowEmojis = allowEmojis;
    if (maxReplySentences !== undefined) updateData.maxReplySentences = maxReplySentences;
    if (decisionMode !== undefined) updateData.decisionMode = decisionMode;
    if (escalationGuidelines !== undefined) updateData.escalationGuidelines = escalationGuidelines;
    if (escalationExamples !== undefined) updateData.escalationExamples = escalationExamples;
    if (humanEscalationBehavior !== undefined) updateData.humanEscalationBehavior = humanEscalationBehavior;
    if (humanHoldMinutes !== undefined) updateData.humanHoldMinutes = humanHoldMinutes;
    if (businessName !== undefined) updateData.businessName = businessName;
    if (businessDescription !== undefined) updateData.businessDescription = businessDescription;
    if (businessHours !== undefined) updateData.businessHours = businessHours;
    if (businessTone !== undefined) updateData.businessTone = businessTone;
    if (businessLocation !== undefined) updateData.businessLocation = businessLocation;
    if (businessWebsite !== undefined) updateData.businessWebsite = businessWebsite;
    if (businessCatalog !== undefined) updateData.businessCatalog = businessCatalog;
    if (businessDocuments !== undefined) updateData.businessDocuments = businessDocuments;
    if (demoModeEnabled !== undefined) updateData.demoModeEnabled = demoModeEnabled;
    if (onboarding?.connectCompletedAt) {
      updateData['onboarding.connectCompletedAt'] = new Date(onboarding.connectCompletedAt);
    }
    if (onboarding?.publishCompletedAt) {
      updateData['onboarding.publishCompletedAt'] = new Date(onboarding.publishCompletedAt);
    }
    if (googleSheets !== undefined) {
      Object.entries(googleSheets as Record<string, any>).forEach(([key, value]) => {
        updateData[`googleSheets.${key}`] = value;
      });
    }

    const nextBusinessName = businessName ?? existingSettings?.businessName;
    const nextBusinessHours = businessHours ?? existingSettings?.businessHours;
    if (nextBusinessName && nextBusinessHours && !existingSettings?.onboarding?.basicsCompletedAt) {
      updateData['onboarding.basicsCompletedAt'] = new Date();
    }

    const settings = await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json(sanitizeSettings(settings));
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspace/:workspaceId/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const { hasAccess, workspace } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const CommentDMLog = (await import('../models/CommentDMLog')).default;
    const FollowupTask = (await import('../models/FollowupTask')).default;
    const Message = (await import('../models/Message')).default;

    const [
      commentDmsSent,
      commentDmsFailed,
      autoRepliesSent,
      followupsSent,
      followupsPending,
    ] = await Promise.all([
      CommentDMLog.countDocuments({ workspaceId, status: 'sent' }),
      CommentDMLog.countDocuments({ workspaceId, status: 'failed' }),
      Message.countDocuments({
        automationSource: 'auto_reply',
      }),
      FollowupTask.countDocuments({ workspaceId, status: 'sent' }),
      FollowupTask.countDocuments({ workspaceId, status: 'scheduled' }),
    ]);

    res.json({
      commentDm: {
        sent: commentDmsSent,
        failed: commentDmsFailed,
      },
      autoReply: {
        sent: autoRepliesSent,
      },
      followup: {
        sent: followupsSent,
        pending: followupsPending,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
