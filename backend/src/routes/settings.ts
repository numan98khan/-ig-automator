import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import WorkspaceSettings from '../models/WorkspaceSettings';
import Workspace from '../models/Workspace';
import { initializeDefaultCategories } from '../services/aiCategorization';

const router = express.Router();

/**
 * Get workspace settings
 * GET /api/settings/workspace/:workspaceId
 */
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Get or create settings
    let settings = await WorkspaceSettings.findOne({ workspaceId });

    if (!settings) {
      // Create default settings
      settings = await WorkspaceSettings.create({ workspaceId });

      // Initialize default categories for the workspace
      await initializeDefaultCategories(workspaceId);
    }

    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update workspace settings
 * PUT /api/settings/workspace/:workspaceId
 */
router.put('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const {
      defaultLanguage,
      uiLanguage,
      commentDmEnabled,
      commentDmTemplate,
      dmAutoReplyEnabled,
      followupEnabled,
      followupHoursBeforeExpiry,
      followupTemplate,
    } = req.body;

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Update settings
    const updateData: Record<string, any> = {};

    if (defaultLanguage !== undefined) updateData.defaultLanguage = defaultLanguage;
    if (uiLanguage !== undefined) updateData.uiLanguage = uiLanguage;
    if (commentDmEnabled !== undefined) updateData.commentDmEnabled = commentDmEnabled;
    if (commentDmTemplate !== undefined) updateData.commentDmTemplate = commentDmTemplate;
    if (dmAutoReplyEnabled !== undefined) updateData.dmAutoReplyEnabled = dmAutoReplyEnabled;
    if (followupEnabled !== undefined) updateData.followupEnabled = followupEnabled;
    if (followupHoursBeforeExpiry !== undefined) updateData.followupHoursBeforeExpiry = followupHoursBeforeExpiry;
    if (followupTemplate !== undefined) updateData.followupTemplate = followupTemplate;

    const settings = await WorkspaceSettings.findOneAndUpdate(
      { workspaceId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get automation statistics
 * GET /api/settings/workspace/:workspaceId/stats
 */
router.get('/workspace/:workspaceId/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Import models for stats
    const CommentDMLog = (await import('../models/CommentDMLog')).default;
    const FollowupTask = (await import('../models/FollowupTask')).default;
    const Message = (await import('../models/Message')).default;

    // Get statistics
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
        // Note: We'd need to join with conversation to filter by workspace
        // For now, this gives an approximation
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
