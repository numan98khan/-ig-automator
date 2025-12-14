import express, { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { WorkspaceInvite } from '../models/WorkspaceInvite';
import User from '../models/User';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';
import { hasPermission, addMember, getWorkspaceMembers } from '../services/workspaceService';
import { sendWorkspaceInviteEmail } from '../services/emailService';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Send workspace invite
router.post('/send', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, email, role } = req.body;

    if (!workspaceId || !email || !role) {
      return res.status(400).json({ error: 'Workspace ID, email, and role are required' });
    }

    // Validate role
    const validRoles = ['admin', 'agent', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, agent, or viewer' });
    }

    // Check if user has permission to invite (must be owner or admin)
    const canInvite = await hasPermission(req.userId!, workspaceId, 'admin');
    if (!canInvite) {
      return res.status(403).json({ error: 'You do not have permission to invite members to this workspace' });
    }

    // Get workspace details
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user is already a member
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      const members = await getWorkspaceMembers(workspaceId);
      const isMember = members.some((m: any) => m.user._id.toString() === existingUser._id.toString());
      if (isMember) {
        return res.status(400).json({ error: 'User is already a member of this workspace' });
      }
    }

    // Check if there's already a pending invite
    const existingInvite = await WorkspaceInvite.findOne({
      workspaceId,
      email: email.toLowerCase(),
      accepted: false,
      expiresAt: { $gt: new Date() },
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'An invite has already been sent to this email' });
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invite
    const invite = await WorkspaceInvite.create({
      workspaceId,
      email: email.toLowerCase(),
      role,
      invitedBy: req.userId,
      token: inviteToken,
      expiresAt,
    });

    // Get inviter details
    const inviter = await User.findById(req.userId);

    // Send invite email
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

// List invites for a workspace
router.get('/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has permission to view invites (must be at least an agent)
    const canView = await hasPermission(req.userId!, workspaceId, 'agent');
    if (!canView) {
      return res.status(403).json({ error: 'You do not have permission to view invites for this workspace' });
    }

    // Get all pending invites
    const invites = await WorkspaceInvite.find({
      workspaceId,
      accepted: false,
      expiresAt: { $gt: new Date() },
    })
      .populate('invitedBy', 'email')
      .sort({ createdAt: -1 });

    res.json(invites);
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel invite
router.delete('/:inviteId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { inviteId } = req.params;

    const invite = await WorkspaceInvite.findById(inviteId);
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Check if user has permission to cancel invites (must be owner or admin)
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

// Get invite details by token
router.get('/details/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const invite = await WorkspaceInvite.findOne({
      token,
      accepted: false,
      expiresAt: { $gt: new Date() },
    }).populate('workspaceId', 'name');

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    res.json({
      email: invite.email,
      workspaceName: (invite.workspaceId as any).name,
      role: invite.role,
    });
  } catch (error) {
    console.error('Get invite details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept invite and set password
router.post('/accept', async (req, res) => {
  try {
    const { token, password, firstName, lastName } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find invite
    const invite = await WorkspaceInvite.findOne({
      token,
      accepted: false,
      expiresAt: { $gt: new Date() },
    });

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    // Get workspace details
    const workspace = await Workspace.findById(invite.workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if user already exists
    let user = await User.findOne({ email: invite.email });

    if (user) {
      // User exists - just add them to the workspace
      if (user.isProvisional) {
        // Upgrade provisional account to full account
        user.password = password;
        user.emailVerified = true;
        user.isProvisional = false;
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        await user.save();
      }
    } else {
      // Create new user
      user = await User.create({
        email: invite.email,
        password,
        firstName,
        lastName,
        emailVerified: true, // Email verified via invite
        isProvisional: false,
      });
    }

    // Add user to workspace
    await addMember(invite.workspaceId, user._id, invite.role);

    // Mark invite as accepted
    invite.accepted = true;
    invite.acceptedAt = new Date();
    await invite.save();

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    console.log('✅ Invite accepted:', {
      email: user.email,
      workspace: workspace.name,
      role: invite.role,
    });

    res.json({
      message: 'Invite accepted successfully',
      token: jwtToken,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
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
