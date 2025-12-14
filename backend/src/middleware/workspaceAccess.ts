import { Response, NextFunction } from 'express';
import Workspace from '../models/Workspace';
import WorkspaceMember from '../models/WorkspaceMember';
import { AuthRequest } from './auth';

/**
 * Check if user has access to a workspace (either as owner or member)
 * @param workspaceId - Workspace ID to check
 * @param userId - User ID to check
 * @returns Object with workspace and access info
 */
export async function checkWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<{
  hasAccess: boolean;
  workspace: any | null;
  isOwner: boolean;
  role?: string;
}> {
  const workspace = await Workspace.findById(workspaceId);

  if (!workspace) {
    return { hasAccess: false, workspace: null, isOwner: false };
  }

  const isOwner = workspace.userId.toString() === userId;

  if (isOwner) {
    return { hasAccess: true, workspace, isOwner: true, role: 'owner' };
  }

  const member = await WorkspaceMember.findOne({
    workspaceId,
    userId,
  });

  if (member) {
    return {
      hasAccess: true,
      workspace,
      isOwner: false,
      role: member.role,
    };
  }

  return { hasAccess: false, workspace, isOwner: false };
}

/**
 * Middleware to verify user has access to workspace from route params
 * Usage: router.get('/workspace/:workspaceId', authenticate, requireWorkspaceAccess, ...)
 */
export async function requireWorkspaceAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { hasAccess, workspace, isOwner, role } = await checkWorkspaceAccess(
      workspaceId,
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Attach workspace info to request for use in route handlers
    req.workspace = workspace;
    req.isWorkspaceOwner = isOwner;
    req.workspaceRole = role;

    next();
  } catch (error) {
    console.error('Workspace access check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Middleware to require workspace owner or admin role
 * Usage: router.put('/workspace/:workspaceId/settings', authenticate, requireWorkspaceAdmin, ...)
 */
export async function requireWorkspaceAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { hasAccess, workspace, isOwner, role } = await checkWorkspaceAccess(
      workspaceId,
      req.userId!
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    // Only owners and admins can perform admin actions
    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.workspace = workspace;
    req.isWorkspaceOwner = isOwner;
    req.workspaceRole = role;

    next();
  } catch (error) {
    console.error('Workspace admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Extend AuthRequest interface to include workspace info
declare module './auth' {
  interface AuthRequest {
    workspace?: any;
    isWorkspaceOwner?: boolean;
    workspaceRole?: string;
  }
}
