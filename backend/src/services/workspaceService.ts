import { WorkspaceMemberRole } from '../types/core';
import { assignTierFromOwner, assertWorkspaceLimit } from './tierService';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';
import {
  countWorkspaceMembers,
  createWorkspaceMember,
  deleteWorkspaceMember,
  getWorkspaceMember,
  listWorkspaceMembersByUserId,
  listWorkspaceMembersByWorkspaceId,
  updateWorkspaceMemberRole,
} from '../repositories/core/workspaceMemberRepository';
import { getUserById } from '../repositories/core/userRepository';
import { listWorkspacesByIds } from '../repositories/core/workspaceRepository';

export async function isMemberOf(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await getWorkspaceMember(workspaceId, userId);
  return !!membership;
}

export async function getUserRole(
  userId: string,
  workspaceId: string
): Promise<WorkspaceMemberRole | null> {
  const membership = await getWorkspaceMember(workspaceId, userId);
  return membership?.role || null;
}

export async function getUserWorkspaces(userId: string): Promise<any[]> {
  const memberships = await listWorkspaceMembersByUserId(userId);
  const workspaces = await listWorkspacesByIds(memberships.map(m => m.workspaceId));
  const workspaceMap = Object.fromEntries(workspaces.map(workspace => [workspace._id, workspace]));

  return memberships.map(member => ({
    workspace: workspaceMap[member.workspaceId],
    role: member.role,
    joinedAt: member.createdAt,
  }));
}

export async function getWorkspaceMembers(workspaceId: string): Promise<any[]> {
  const memberships = await listWorkspaceMembersByWorkspaceId(workspaceId);
  const users = await Promise.all(memberships.map(member => getUserById(member.userId, { includePassword: true })));
  const userMap = Object.fromEntries(users.filter(Boolean).map(user => [user!._id, user]));

  return memberships.map(member => ({
    user: userMap[member.userId],
    role: member.role,
    joinedAt: member.createdAt,
  }));
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceMemberRole = 'agent'
): Promise<any> {
  const existing = await getWorkspaceMember(workspaceId, userId);
  if (existing) {
    throw new Error('User is already a member of this workspace');
  }

  const currentCount = await countWorkspaceMembers(workspaceId);
  const limitCheck = await assertWorkspaceLimit(workspaceId, 'teamMembers', currentCount + 1);
  if (!limitCheck.allowed) {
    throw new Error(`Team member limit reached for this workspace (limit: ${limitCheck.limit})`);
  }

  const membership = await createWorkspaceMember({
    workspaceId,
    userId,
    role,
  });

  await assignTierFromOwner(workspaceId, userId);

  return membership;
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const membership = await getWorkspaceMember(workspaceId, userId);
  if (membership?.role === 'owner') {
    throw new Error('Cannot remove workspace owner');
  }

  await deleteWorkspaceMember(workspaceId, userId);
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: WorkspaceMemberRole
): Promise<void> {
  const membership = await getWorkspaceMember(workspaceId, userId);
  if (!membership) {
    throw new Error('Membership not found');
  }

  if (membership.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot change owner role. Transfer ownership first.');
  }

  await updateWorkspaceMemberRole(workspaceId, userId, newRole);
}

export async function hasPermission(
  userId: string,
  workspaceId: string,
  requiredRole: WorkspaceMemberRole
): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId);
  if (!role) return false;

  const hierarchy: Record<WorkspaceMemberRole, number> = {
    owner: 4,
    admin: 3,
    agent: 2,
    viewer: 1,
  };

  return hierarchy[role] >= hierarchy[requiredRole];
}

export const checkWorkspaceAccess = async (workspaceId: string, userId: string) => {
  const membership = await getWorkspaceMember(workspaceId, userId);
  return { hasAccess: !!membership, role: membership?.role };
};

export const checkWorkspaceAdminAccess = async (workspaceId: string, userId: string) => {
  const membership = await getWorkspaceMember(workspaceId, userId);
  return { hasAccess: membership?.role === 'owner' || membership?.role === 'admin' };
};

export const resolveWorkspaceName = async (workspaceId?: string) => {
  if (!workspaceId) return undefined;
  const workspace = await getWorkspaceById(workspaceId);
  return workspace?.name;
};
