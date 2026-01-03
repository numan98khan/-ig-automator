import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import WorkspaceSettings from '../models/WorkspaceSettings';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';

const router = express.Router();

function sanitizeSettings(settings: any) {
  if (!settings) return settings;
  const plain = settings.toObject ? settings.toObject() : { ...settings };
  if (plain.primaryGoal) {
    plain.primaryGoal = normalizeGoalValue(plain.primaryGoal);
  }
  if (plain.secondaryGoal) {
    plain.secondaryGoal = normalizeGoalValue(plain.secondaryGoal);
  }
  if (plain.googleSheets) {
    delete plain.googleSheets.serviceAccountJson;
    delete plain.googleSheets.oauthRefreshToken;
  }
  return plain;
}

function normalizeGoalValue(goal?: string | null) {
  if (!goal) return goal;
  if (goal === 'start_order') return 'order_now';
  if (goal === 'drive_to_channel') return 'none';
  return goal;
}

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== req.userId) {
      return res.status(404).json({ error: 'Workspace not found' });
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
      commentDmEnabled,
      commentDmTemplate,
      dmAutoReplyEnabled,
      followupEnabled,
      followupHoursBeforeExpiry,
      followupTemplate,
      primaryGoal,
      secondaryGoal,
      goalConfigs,
      googleSheets,
    } = req.body;

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== req.userId) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

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
    if (commentDmEnabled !== undefined) updateData.commentDmEnabled = commentDmEnabled;
    if (commentDmTemplate !== undefined) updateData.commentDmTemplate = commentDmTemplate;
    if (dmAutoReplyEnabled !== undefined) updateData.dmAutoReplyEnabled = dmAutoReplyEnabled;
    if (followupEnabled !== undefined) updateData.followupEnabled = followupEnabled;
    if (followupHoursBeforeExpiry !== undefined) updateData.followupHoursBeforeExpiry = followupHoursBeforeExpiry;
    if (followupTemplate !== undefined) updateData.followupTemplate = followupTemplate;
    if (primaryGoal !== undefined) updateData.primaryGoal = normalizeGoalValue(primaryGoal);
    if (secondaryGoal !== undefined) updateData.secondaryGoal = normalizeGoalValue(secondaryGoal);
    if (goalConfigs !== undefined) updateData.goalConfigs = goalConfigs;
    if (googleSheets !== undefined) {
      Object.entries(googleSheets as Record<string, any>).forEach(([key, value]) => {
        updateData[`googleSheets.${key}`] = value;
      });
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

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== req.userId) {
      return res.status(404).json({ error: 'Workspace not found' });
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
