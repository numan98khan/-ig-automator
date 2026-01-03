import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';
import { getWorkspaceMember } from '../repositories/core/workspaceMemberRepository';

export const checkWorkspaceAccess = async (workspaceId: string, userId: string) => {
  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    return { hasAccess: false, workspace: null, role: null, isOwner: false };
  }

  const member = await getWorkspaceMember(workspaceId, userId);
  const role = member?.role || null;
  return { hasAccess: !!member, workspace, role, isOwner: role === 'owner' };
};

export const requireWorkspaceAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workspaceId = (req.params.workspaceId || req.body.workspaceId || req.query.workspaceId) as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { hasAccess, workspace } = await checkWorkspaceAccess(workspaceId, req.userId);
    if (!hasAccess || !workspace) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    (req as any).workspace = workspace;
    next();
  } catch (error) {
    console.error('Workspace access check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const requireWorkspaceAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workspaceId = (req.params.workspaceId || req.body.workspaceId || req.query.workspaceId) as string;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const member = await getWorkspaceMember(workspaceId, req.userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({ error: 'Admin access required for this workspace' });
    }

    (req as any).workspace = workspace;
    next();
  } catch (error) {
    console.error('Workspace admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
