import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getWorkspaceMembers, updateMemberRole, removeMember, hasPermission } from '../services/workspaceService';
import { ensureUserTier } from '../services/tierService';
import { ensureBillingAccountForUser } from '../services/billingService';
import {
  createWorkspace,
  getWorkspaceById,
  getWorkspaceByUserId,
  listWorkspacesByUserId,
} from '../repositories/core/workspaceRepository';
import { createWorkspaceMember, getWorkspaceMember } from '../repositories/core/workspaceMemberRepository';

const router = express.Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    const existing = await getWorkspaceByUserId(req.userId!);
    if (existing) {
      return res.status(200).json(existing);
    }

    const billingAccount = await ensureBillingAccountForUser(req.userId!);
    const workspace = await createWorkspace({
      name,
      userId: req.userId!,
      billingAccountId: billingAccount?._id ?? null,
    });
    await ensureUserTier(req.userId!);

    await createWorkspaceMember({
      workspaceId: workspace._id,
      userId: req.userId!,
      role: 'owner',
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspaces = await listWorkspacesByUserId(req.userId!);
    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workspace = await getWorkspaceById(req.params.id);

    if (!workspace || workspace.userId !== req.userId) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const canView = await hasPermission(req.userId!, id, 'viewer');
    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view members of this workspace' });
    }

    const members = await getWorkspaceMembers(id);
    res.json(members);
  } catch (error) {
    console.error('Get workspace members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/members/:userId/role', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const canManage = await hasPermission(req.userId!, id, 'admin');
    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to change member roles' });
    }

    await updateMemberRole(id, userId, role);
    res.json({ message: 'Member role updated successfully' });
  } catch (error: any) {
    console.error('Update member role error:', error);
    res.status(400).json({ error: error.message || 'Failed to update member role' });
  }
});

router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id, userId } = req.params;

    const canManage = await hasPermission(req.userId!, id, 'admin');
    if (!canManage) {
      return res.status(403).json({ error: 'You do not have permission to remove members' });
    }

    await removeMember(id, userId);
    res.json({ message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('Remove member error:', error);
    res.status(400).json({ error: error.message || 'Failed to remove member' });
  }
});

router.post('/migrate-members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    console.log('🔄 Starting workspace member migration...');

    const workspaces = await listWorkspacesByUserId(req.userId!);

    let created = 0;
    let skipped = 0;

    for (const workspace of workspaces) {
      const existing = await getWorkspaceMember(workspace._id, workspace.userId);

      if (!existing) {
        await createWorkspaceMember({
          workspaceId: workspace._id,
          userId: workspace.userId,
          role: 'owner',
        });
        console.log(`✅ Created member entry for workspace ${workspace._id}`);
        created++;
      } else {
        console.log(`⏭️  Skipped workspace ${workspace._id} (already has member entry)`);
        skipped++;
      }
    }

    console.log(`✅ Migration complete: ${created} created, ${skipped} skipped`);
    res.json({
      message: 'Migration completed successfully',
      created,
      skipped,
      total: workspaces.length,
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

export default router;
