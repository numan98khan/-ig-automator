import mongoose from 'mongoose';
import WorkspaceMember, { WorkspaceMemberRole } from '../models/WorkspaceMember';
import Workspace from '../models/Workspace';
import User from '../models/User';

/**
 * Check if a user is a member of a workspace
 */
export async function isMemberOf(
  userId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<boolean> {
  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
  });
  return !!membership;
}

/**
 * Get user's role in a workspace
 */
export async function getUserRole(
  userId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string
): Promise<WorkspaceMemberRole | null> {
  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId,
  });
  return membership?.role || null;
}

/**
 * Get all workspaces a user belongs to
 */
export async function getUserWorkspaces(
  userId: mongoose.Types.ObjectId | string
): Promise<any[]> {
  const memberships = await WorkspaceMember.find({ userId })
    .populate('workspaceId')
    .sort({ createdAt: -1 });

  return memberships.map((m: any) => ({
    workspace: m.workspaceId,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

/**
 * Get all members of a workspace
 */
export async function getWorkspaceMembers(
  workspaceId: mongoose.Types.ObjectId | string
): Promise<any[]> {
  const memberships = await WorkspaceMember.find({ workspaceId })
    .populate('userId')
    .sort({ createdAt: 1 });

  return memberships.map((m: any) => ({
    user: m.userId,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

/**
 * Add a member to a workspace
 */
export async function addMember(
  workspaceId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
  role: WorkspaceMemberRole = 'agent'
): Promise<any> {
  // Check if already a member
  const existing = await WorkspaceMember.findOne({ workspaceId, userId });
  if (existing) {
    throw new Error('User is already a member of this workspace');
  }

  const membership = await WorkspaceMember.create({
    workspaceId,
    userId,
    role,
  });

  return membership;
}

/**
 * Remove a member from a workspace
 */
export async function removeMember(
  workspaceId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string
): Promise<void> {
  // Don't allow removing the owner
  const membership = await WorkspaceMember.findOne({ workspaceId, userId });
  if (membership?.role === 'owner') {
    throw new Error('Cannot remove workspace owner');
  }

  await WorkspaceMember.deleteOne({ workspaceId, userId });
}

/**
 * Update member role
 */
export async function updateMemberRole(
  workspaceId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
  newRole: WorkspaceMemberRole
): Promise<void> {
  const membership = await WorkspaceMember.findOne({ workspaceId, userId });
  if (!membership) {
    throw new Error('Membership not found');
  }

  // Don't allow changing owner role
  if (membership.role === 'owner' && newRole !== 'owner') {
    throw new Error('Cannot change owner role. Transfer ownership first.');
  }

  membership.role = newRole;
  await membership.save();
}

/**
 * Check if user has permission for an action in a workspace
 */
export async function hasPermission(
  userId: mongoose.Types.ObjectId | string,
  workspaceId: mongoose.Types.ObjectId | string,
  requiredRole: WorkspaceMemberRole
): Promise<boolean> {
  const role = await getUserRole(userId, workspaceId);
  if (!role) return false;

  // Define role hierarchy: owner > admin > agent > viewer
  const hierarchy: Record<WorkspaceMemberRole, number> = {
    owner: 4,
    admin: 3,
    agent: 2,
    viewer: 1,
  };

  return hierarchy[role] >= hierarchy[requiredRole];
}
