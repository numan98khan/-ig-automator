import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getTierForUser, getWorkspaceOwnerTier, getUsageWindow } from '../services/tierService';
import UsageCounter from '../models/UsageCounter';
import InstagramAccount from '../models/InstagramAccount';
import WorkspaceMember from '../models/WorkspaceMember';
import KnowledgeItem from '../models/KnowledgeItem';
import Workspace from '../models/Workspace';
import { WorkspaceInvite } from '../models/WorkspaceInvite';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

const buildWorkspaceUsage = async (workspaceId: string) => {
  const [accounts, members, knowledge, pendingInvites] = await Promise.all([
    InstagramAccount.countDocuments({ workspaceId }),
    WorkspaceMember.countDocuments({ workspaceId }),
    KnowledgeItem.countDocuments({ workspaceId }),
    WorkspaceInvite.countDocuments({
      workspaceId,
      accepted: false,
      expiresAt: { $gt: new Date() },
    }),
  ]);

  return {
    instagramAccounts: accounts,
    teamMembers: members + pendingInvites,
    knowledgeItems: knowledge,
  };
};

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const tierSummary = await getTierForUser(req.userId!);
    const { periodStart, periodEnd } = getUsageWindow();

    const aiUsage = await UsageCounter.findOne({
      userId: req.userId,
      resource: 'aiMessages',
      periodStart,
    });

    let workspaceSummary: any = undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    if (workspaceId) {
      const workspace = await Workspace.findById(workspaceId);
      if (workspace) {
        const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied to workspace' });
        }
        const ownerTier = await getWorkspaceOwnerTier(workspaceId);
        const usage = await buildWorkspaceUsage(workspaceId);
        workspaceSummary = {
          workspaceId,
          ownerId: workspace.userId,
          tier: ownerTier.tier,
          limits: ownerTier.limits,
          usage,
        };
      }
    }

    res.json({
      tier: tierSummary.tier,
      limits: tierSummary.limits,
      usage: {
        aiMessages: {
          used: aiUsage?.count || 0,
          limit: tierSummary.limits.aiMessages,
          periodStart,
          periodEnd,
        },
      },
      workspace: workspaceSummary,
    });
  } catch (error) {
    console.error('Tier me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { workspaceId } = req.params;
    const { tier, limits, ownerId } = await getWorkspaceOwnerTier(workspaceId);
    const usage = await buildWorkspaceUsage(workspaceId);

    res.json({
      tier,
      limits,
      ownerId,
      usage,
    });
  } catch (error) {
    console.error('Tier workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
