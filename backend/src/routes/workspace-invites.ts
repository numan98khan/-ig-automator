import express, { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { WorkspaceInvite } from '../models/WorkspaceInvite';
import { authenticate, AuthRequest } from '../middleware/auth';
import { hasPermission, addMember, getWorkspaceMembers } from '../services/workspaceService';
import { sendWorkspaceInviteEmail } from '../services/emailService';
import { assertWorkspaceLimit } from '../services/tierService';
import { countWorkspaceMembers } from '../repositories/core/workspaceMemberRepository';
import { getWorkspaceById } from '../repositories/core/workspaceRepository';
import {
  createUser,
  getUserByEmail,
  getUserById,
  updateUser,
} from '../repositories/core/userRepository';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

router.post('/send', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, email, role } = req.body;

    if (!workspaceId || !email || !role) {
      return res.status(400).json({ error: 'Workspace ID, email, and role are required' });
    }

    const validRoles = ['admin', 'agent', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, agent, or viewer' });
    }

    const canInvite = await hasPermission(req.userId!, workspaceId, 'admin');
    if (!canInvite) {
      return res.status(403).json({ error: 'You do not have permission to invite members to this workspace' });
    }

    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const existingMembersCount = await countWorkspaceMembers(workspaceId);
    const pendingInvitesCount = await WorkspaceInvite.countDocuments({
      workspaceId,
      accepted: false,
      expiresAt: { $gt: new Date() },
    });
    const limitCheck = await assertWorkspaceLimit(workspaceId, 'teamMembers', existingMembersCount + pendingInvitesCount + 1);
    if (!limitCheck.allowed) {
      return res.status(403).json({ error: `Team member limit reached (limit: ${limitCheck.limit})` });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      const members = await getWorkspaceMembers(workspaceId);
      const isMember = members.some((m: any) => m.user?._id === existingUser._id);
      if (isMember) {
        return res.status(400).json({ error: 'User is already a member of this workspace' });
      }
    }

    const existingInvite = await WorkspaceInvite.findOne({
      workspaceId,
      email: email.toLowerCase(),
      accepted: false,
      expiresAt: { $gt: new Date() },
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'An invite has already been sent to this email' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await WorkspaceInvite.create({
      workspaceId,
      email: email.toLowerCase(),
      role,
      invitedBy: req.userId,
      token: inviteToken,
      expiresAt,
    });

    const inviter = await getUserById(req.userId!, { includePassword: true });

    await sendWorkspaceInviteEmail(
      email,
      workspace.name,
      inviter?.email || 'Team member',
      inviteToken,
      role
    );

    console.log('✅ Workspace invite sent:', {
      email,
      workspace: workspace.name,
      role,
    });

    res.status(201).json({
      message: 'Invite sent successfully',
      invite: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('Send invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const canView = await hasPermission(req.userId!, workspaceId, 'agent');
    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view invites for this workspace' });
    }

    const invites = await WorkspaceInvite.find({
      workspaceId,
      accepted: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    const inviterIds = invites
      .map(invite => invite.invitedBy?.toString())
      .filter(Boolean) as string[];
    const inviters = await Promise.all(inviterIds.map(id => getUserById(String(id), { includePassword: true })));
    const inviterMap = Object.fromEntries(inviters.filter(Boolean).map(user => [user!._id, user]));

    res.json(invites.map(invite => ({
      ...invite.toObject(),
      invitedBy: inviterMap[String(invite.invitedBy)]
        ? { email: inviterMap[String(invite.invitedBy)]?.email }
        : undefined,
    })));
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:inviteId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteId } = req.params;

    const invite = await WorkspaceInvite.findById(inviteId);
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    const canCancel = await hasPermission(req.userId!, invite.workspaceId.toString(), 'admin');
    if (!canCancel) {
      return res.status(403).json({ error: 'You do not have permission to cancel invites for this workspace' });
    }

    await WorkspaceInvite.deleteOne({ _id: inviteId });

    console.log('✅ Invite cancelled:', {
      inviteId,
      email: invite.email,
    });

    res.json({ message: 'Invite cancelled successfully' });
  } catch (error) {
    console.error('Cancel invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/details/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invite = await WorkspaceInvite.findOne({
      token,
      accepted: false,
      expiresAt: { $gt: new Date() },
    });

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    const workspace = await getWorkspaceById(invite.workspaceId.toString());

    res.json({
      email: invite.email,
      workspaceName: workspace?.name,
      role: invite.role,
    });
  } catch (error) {
    console.error('Get invite details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/accept', async (req, res) => {
  try {
    const { token, password, firstName, lastName } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const invite = await WorkspaceInvite.findOne({
      token,
      accepted: false,
      expiresAt: { $gt: new Date() },
    });

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    const workspace = await getWorkspaceById(invite.workspaceId.toString());
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    let user = await getUserByEmail(invite.email, { includePassword: true });

    if (user) {
      if (user.isProvisional) {
        user = await updateUser(user._id, {
          password,
          emailVerified: true,
          isProvisional: false,
          firstName: firstName ?? user.firstName ?? null,
          lastName: lastName ?? user.lastName ?? null,
        });
      }
    } else {
      user = await createUser({
        email: invite.email,
        password,
        firstName,
        lastName,
        emailVerified: true,
        isProvisional: false,
      });
    }

    const { assignTierFromOwner } = await import('../services/tierService');

    await addMember(invite.workspaceId.toString(), user!._id, invite.role);
    await assignTierFromOwner(invite.workspaceId.toString(), user!._id);

    invite.accepted = true;
    invite.acceptedAt = new Date();
    await invite.save();

    const jwtToken = jwt.sign(
      { userId: user!._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Invite accepted:', {
      email: user!.email,
      workspace: workspace.name,
      role: invite.role,
    });

    res.json({
      message: 'Invite accepted successfully',
      token: jwtToken,
      user: {
        _id: user!._id,
        email: user!.email,
        firstName: user!.firstName,
        lastName: user!.lastName,
        emailVerified: user!.emailVerified,
      },
    });
  } catch (error: any) {
    console.error('Accept invite error:', error);
    if (error.message === 'User is already a member of this workspace') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
