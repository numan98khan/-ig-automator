import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { generateToken as generateEmailToken, verifyToken } from '../services/tokenService';
import { ensureUserTier } from '../services/tierService';
import { ensureBillingAccountForUser } from '../services/billingService';
import { postgresQuery } from '../db/postgres';
import AdminLogEvent from '../models/AdminLogEvent';
import AutomationInstance from '../models/AutomationInstance';
import AutomationPreviewProfile from '../models/AutomationPreviewProfile';
import AutomationSession from '../models/AutomationSession';
import CommentDMLog from '../models/CommentDMLog';
import Contact from '../models/Contact';
import ContactNote from '../models/ContactNote';
import Conversation from '../models/Conversation';
import CrmTask from '../models/CrmTask';
import Escalation from '../models/Escalation';
import FlowDraft from '../models/FlowDraft';
import FlowTemplate from '../models/FlowTemplate';
import FlowTemplateVersion from '../models/FlowTemplateVersion';
import FollowupTask from '../models/FollowupTask';
import InstagramAccount from '../models/InstagramAccount';
import KnowledgeItem from '../models/KnowledgeItem';
import LeadCapture from '../models/LeadCapture';
import Message from '../models/Message';
import ReportDailyWorkspace from '../models/ReportDailyWorkspace';
import SupportTicket from '../models/SupportTicket';
import SupportTicketComment from '../models/SupportTicketComment';
import SupportTicketStub from '../models/SupportTicketStub';
import WorkspaceInvite from '../models/WorkspaceInvite';
import WorkspaceSettings from '../models/WorkspaceSettings';
import {
  CoreUser,
  createUser,
  getUserByEmail,
  getUserByEmailExcludingId,
  getUserById,
  updateUser,
  verifyPassword,
} from '../repositories/core/userRepository';
import {
  createWorkspaceMember,
  listWorkspaceMembersByUserId,
} from '../repositories/core/workspaceMemberRepository';
import {
  createWorkspace,
  listWorkspacesByIds,
  listWorkspacesByUserId,
} from '../repositories/core/workspaceRepository';

const router = express.Router();

const resolveWorkspaceName = (user: CoreUser) => {
  const emailPrefix = user.email?.split('@')[0]?.trim();
  if (emailPrefix) {
    return `${emailPrefix} Workspace`;
  }
  if (user.instagramUsername) {
    return `@${user.instagramUsername}`;
  }
  return 'My Workspace';
};

const ensureDefaultWorkspace = async (user: CoreUser, billingAccountId?: string | null) => {
  const memberships = await listWorkspaceMembersByUserId(user._id);
  if (memberships.length > 0) {
    if (!user.defaultWorkspaceId) {
      await updateUser(user._id, { defaultWorkspaceId: memberships[0].workspaceId });
    }
    return;
  }

  const ownedWorkspaces = await listWorkspacesByUserId(user._id);
  if (ownedWorkspaces.length > 0) {
    const workspace = ownedWorkspaces[0];
    await createWorkspaceMember({
      workspaceId: workspace._id,
      userId: user._id,
      role: 'owner',
    });
    if (!user.defaultWorkspaceId) {
      await updateUser(user._id, { defaultWorkspaceId: workspace._id });
    }
    return;
  }

  const billingAccount = billingAccountId
    ? { _id: billingAccountId }
    : await ensureBillingAccountForUser(user._id);
  const workspace = await createWorkspace({
    name: resolveWorkspaceName(user),
    userId: user._id,
    billingAccountId: billingAccount?._id ?? null,
  });
  await createWorkspaceMember({
    workspaceId: workspace._id,
    userId: user._id,
    role: 'owner',
  });
  await updateUser(user._id, { defaultWorkspaceId: workspace._id });
};

// Signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = await createUser({ email, password });
    const billingAccount = await ensureBillingAccountForUser(user._id);
    await ensureUserTier(user._id);
    await ensureDefaultWorkspace(user, billingAccount?._id ?? null);

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await getUserByEmail(email, { includePassword: true });
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    const billingAccount = await ensureBillingAccountForUser(user._id);
    await ensureUserTier(user._id);
    await ensureDefaultWorkspace(user, billingAccount?._id ?? null);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserById(req.userId, { includePassword: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { getTierForUser } = await import('../services/tierService');
    const tierSummary = await getTierForUser(user._id);

    const memberships = await listWorkspaceMembersByUserId(user._id);
    const workspaces = await listWorkspacesByIds(memberships.map(m => m.workspaceId));

    res.json({
      user: {
        id: user._id,
        email: user.email,
        instagramUserId: user.instagramUserId,
        instagramUsername: user.instagramUsername,
        isProvisional: user.isProvisional,
        emailVerified: user.emailVerified,
        defaultWorkspaceId: user.defaultWorkspaceId,
        createdAt: user.createdAt,
        role: user.role,
        tier: tierSummary.tier,
        tierLimits: tierSummary.limits,
      },
      workspaces,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Secure account - add email/password to Instagram-only user
router.post('/secure-account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existingUser = await getUserByEmailExcludingId(email, req.userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const user = await updateUser(req.userId, {
      email,
      password,
      emailVerified: false,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const verificationToken = generateEmailToken({
      userId: user._id,
      type: 'verify_email',
    });

    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailError: any) {
      console.error('Failed to send verification email:', emailError);
    }

    res.json({
      message: 'Account secured! Please check your email to verify your address.',
      user: {
        id: user._id,
        email: user.email,
        isProvisional: user.isProvisional,
        emailVerified: user.emailVerified,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Secure account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify email
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    console.log('📧 Email verification request received');

    if (!token || typeof token !== 'string') {
      console.log('❌ No token provided');
      return res.status(400).json({ error: 'Verification token is required' });
    }

    let payload;
    try {
      payload = verifyToken(token);
      console.log('✅ Token decoded:', { userId: payload.userId, type: payload.type });
    } catch (error) {
      console.log('❌ Token verification failed:', error);
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    if (payload.type !== 'verify_email') {
      console.log('❌ Invalid token type:', payload.type);
      return res.status(400).json({ error: 'Invalid token type' });
    }

    if (!payload.userId) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const user = await getUserById(payload.userId, { includePassword: true });
    if (!user) {
      console.log('❌ User not found:', payload.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('📝 User found:', {
      id: user._id,
      email: user.email,
      emailVerified: user.emailVerified,
      isProvisional: user.isProvisional,
    });

    if (user.emailVerified) {
      console.log('ℹ️ Email already verified');
      return res.status(200).json({ message: 'Email already verified' });
    }

    const updatedUser = await updateUser(user._id, {
      emailVerified: true,
      isProvisional: false,
    });

    console.log('✅ Email verified successfully:', {
      id: updatedUser?._id,
      email: updatedUser?.email,
      emailVerified: updatedUser?.emailVerified,
      isProvisional: updatedUser?.isProvisional,
    });

    res.json({
      message: 'Email verified successfully!',
      user: {
        id: updatedUser?._id,
        email: updatedUser?.email,
        emailVerified: updatedUser?.emailVerified,
        isProvisional: updatedUser?.isProvisional,
      },
    });
  } catch (error) {
    console.error('❌ Verify email error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserById(req.userId, { includePassword: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'No email address on account' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const verificationToken = generateEmailToken({
      userId: user._id,
      type: 'verify_email',
    });

    await sendVerificationEmail(user, verificationToken);

    res.json({ message: 'Verification email sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Request password reset
router.post('/reset-password-request', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await getUserByEmail(email, { includePassword: true });

    if (user) {
      const resetToken = generateEmailToken({
        userId: user._id,
        type: 'password_reset',
      });

      try {
        await sendPasswordResetEmail(user, resetToken);
      } catch (emailError: any) {
        console.error('Failed to send password reset email:', emailError);
      }
    }

    res.json({ message: 'If an account exists with that email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password with token
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (payload.type !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    if (!payload.userId) {
      return res.status(400).json({ error: 'Invalid token payload' });
    }

    const user = await getUserById(payload.userId, { includePassword: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await updateUser(user._id, { password: newPassword });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete account and all associated data
router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await getUserById(req.userId, { includePassword: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const ownedWorkspaces = await listWorkspacesByUserId(req.userId);
    const workspaceIds = ownedWorkspaces.map((workspace) => workspace._id);
    const workspaceObjectIds = workspaceIds
      .filter((workspaceId) => mongoose.isValidObjectId(workspaceId))
      .map((workspaceId) => new mongoose.Types.ObjectId(workspaceId));
    const userObjectId = mongoose.isValidObjectId(req.userId) ? new mongoose.Types.ObjectId(req.userId) : null;
    let flowTemplateIds: mongoose.Types.ObjectId[] = [];

    let ticketIds: mongoose.Types.ObjectId[] = [];
    if (workspaceObjectIds.length > 0) {
      const tickets = await SupportTicket.find({ workspaceId: { $in: workspaceObjectIds } })
        .select('_id')
        .lean();
      ticketIds = tickets.map((ticket) => ticket._id);
    }

    if (userObjectId) {
      const templates = await FlowTemplate.find({ createdBy: userObjectId }).select('_id').lean();
      flowTemplateIds = templates.map((template) => template._id);
    }

    const deleteTasks: Array<Promise<unknown>> = [];
    if (workspaceObjectIds.length > 0) {
      deleteTasks.push(
        AdminLogEvent.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        AutomationInstance.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        AutomationPreviewProfile.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        AutomationSession.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        CommentDMLog.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        Contact.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        ContactNote.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        Conversation.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        CrmTask.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        Escalation.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        FollowupTask.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        InstagramAccount.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        KnowledgeItem.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        LeadCapture.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        Message.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        ReportDailyWorkspace.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        SupportTicket.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        SupportTicketStub.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        WorkspaceInvite.deleteMany({ workspaceId: { $in: workspaceObjectIds } }),
        WorkspaceSettings.deleteMany({ workspaceId: { $in: workspaceObjectIds } })
      );
    }

    if (userObjectId) {
      deleteTasks.push(
        SupportTicketComment.deleteMany({ authorId: userObjectId }),
        FlowDraft.deleteMany({ createdBy: userObjectId }),
        FlowTemplate.deleteMany({ createdBy: userObjectId }),
        FlowTemplateVersion.deleteMany({ createdBy: userObjectId })
      );
    }

    if (flowTemplateIds.length > 0) {
      deleteTasks.push(
        FlowDraft.deleteMany({ templateId: { $in: flowTemplateIds } }),
        FlowTemplateVersion.deleteMany({ templateId: { $in: flowTemplateIds } })
      );
    }

    if (ticketIds.length > 0) {
      deleteTasks.push(SupportTicketComment.deleteMany({ ticketId: { $in: ticketIds } }));
    }

    deleteTasks.push(AutomationPreviewProfile.deleteMany({ userId: req.userId }));

    await Promise.all(deleteTasks);

    await postgresQuery(
      `UPDATE core.users
      SET default_workspace_id = NULL,
          billing_account_id = NULL,
          tier_id = NULL,
          tier_limit_overrides = NULL
      WHERE id = $1`,
      [req.userId]
    );

    if (workspaceIds.length > 0) {
      await postgresQuery('DELETE FROM core.workspace_members WHERE workspace_id = ANY($1)', [workspaceIds]);
      await postgresQuery('DELETE FROM core.openai_usage WHERE workspace_id = ANY($1)', [workspaceIds]);
      await postgresQuery('DELETE FROM core.usage_counters WHERE workspace_id = ANY($1)', [workspaceIds]);
      await postgresQuery('DELETE FROM core.workspaces WHERE id = ANY($1)', [workspaceIds]);
    }

    await postgresQuery('DELETE FROM core.workspace_members WHERE user_id = $1', [req.userId]);
    await postgresQuery('DELETE FROM core.openai_usage WHERE user_id = $1', [req.userId]);
    await postgresQuery('DELETE FROM core.usage_counters WHERE user_id = $1', [req.userId]);

    const billingAccountIds = new Set<string>();
    if (user.billingAccountId) {
      billingAccountIds.add(user.billingAccountId);
    }
    ownedWorkspaces.forEach((workspace) => {
      if (workspace.billingAccountId) {
        billingAccountIds.add(workspace.billingAccountId);
      }
    });

    if (billingAccountIds.size > 0) {
      const billingIds = Array.from(billingAccountIds);
      await postgresQuery('DELETE FROM core.subscriptions WHERE billing_account_id = ANY($1)', [billingIds]);
      await postgresQuery('DELETE FROM core.billing_accounts WHERE id = ANY($1)', [billingIds]);
    }

    await postgresQuery('DELETE FROM core.users WHERE id = $1', [req.userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
