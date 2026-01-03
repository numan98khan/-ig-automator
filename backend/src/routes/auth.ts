import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { generateToken as generateEmailToken, verifyToken } from '../services/tokenService';
import { ensureUserTier } from '../services/tierService';
import { ensureBillingAccountForUser } from '../services/billingService';
import { TierLimits } from '../types/core';
import {
  createUser,
  getUserByEmail,
  getUserByEmailExcludingId,
  getUserById,
  upsertUserFromLegacy,
  updateUser,
  verifyPassword,
} from '../repositories/core/userRepository';
import { upsertWorkspaceFromLegacy } from '../repositories/core/workspaceRepository';
import { upsertWorkspaceMemberFromLegacy } from '../repositories/core/workspaceMemberRepository';
import { listWorkspaceMembersByUserId } from '../repositories/core/workspaceMemberRepository';
import { listWorkspacesByIds } from '../repositories/core/workspaceRepository';

const router = express.Router();

type LegacyUserDoc = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'user' | 'admin';
  instagramUserId?: string;
  instagramUsername?: string;
  isProvisional?: boolean;
  emailVerified?: boolean;
  defaultWorkspaceId?: mongoose.Types.ObjectId;
  billingAccountId?: mongoose.Types.ObjectId;
  tierId?: mongoose.Types.ObjectId;
  tierLimitOverrides?: TierLimits;
  createdAt?: Date;
  updatedAt?: Date;
};

type LegacyWorkspaceDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
  userId?: mongoose.Types.ObjectId;
  billingAccountId?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

type LegacyWorkspaceMemberDoc = {
  _id: mongoose.Types.ObjectId;
  workspaceId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const getLegacyCollections = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB not connected');
  }

  return {
    users: db.collection<LegacyUserDoc>('users'),
    workspaces: db.collection<LegacyWorkspaceDoc>('workspaces'),
    workspaceMembers: db.collection<LegacyWorkspaceMemberDoc>('workspacemembers'),
  };
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
    await ensureBillingAccountForUser(user._id);
    await ensureUserTier(user._id);

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

    let user = await getUserByEmail(email, { includePassword: true });
    if (!user) {
      const { users, workspaces, workspaceMembers } = getLegacyCollections();
      const legacyUser = await users.findOne({ email: email.toLowerCase() });
      if (legacyUser) {
        user = await upsertUserFromLegacy({
          _id: legacyUser._id.toString(),
          email: legacyUser.email ?? undefined,
          password: legacyUser.password ?? undefined,
          firstName: legacyUser.firstName ?? undefined,
          lastName: legacyUser.lastName ?? undefined,
          role: legacyUser.role ?? 'user',
          instagramUserId: legacyUser.instagramUserId ?? undefined,
          instagramUsername: legacyUser.instagramUsername ?? undefined,
          isProvisional: legacyUser.isProvisional ?? true,
          emailVerified: legacyUser.emailVerified ?? false,
          defaultWorkspaceId: legacyUser.defaultWorkspaceId?.toString() ?? undefined,
          billingAccountId: legacyUser.billingAccountId?.toString() ?? undefined,
          tierId: legacyUser.tierId?.toString() ?? undefined,
          tierLimitOverrides: legacyUser.tierLimitOverrides ?? undefined,
          createdAt: legacyUser.createdAt ?? undefined,
          updatedAt: legacyUser.updatedAt ?? undefined,
        });

        const legacyWorkspaces = await workspaces.find({ userId: legacyUser._id }).toArray();
        const legacyMemberships = await workspaceMembers.find({ userId: legacyUser._id }).toArray();
        const workspaceMap = new Map(
          legacyWorkspaces.map((workspace) => [workspace._id.toString(), workspace])
        );
        for (const membership of legacyMemberships) {
          const workspaceId = membership.workspaceId?.toString();
          if (workspaceId && !workspaceMap.has(workspaceId)) {
            const workspace = await workspaces.findOne({ _id: new mongoose.Types.ObjectId(workspaceId) });
            if (workspace) {
              workspaceMap.set(workspace._id.toString(), workspace);
            }
          }
        }

        for (const workspace of workspaceMap.values()) {
          await upsertWorkspaceFromLegacy({
            _id: workspace._id.toString(),
            name: workspace.name,
            userId: workspace.userId?.toString(),
            billingAccountId: workspace.billingAccountId?.toString(),
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
          });
        }

        for (const membership of legacyMemberships) {
          await upsertWorkspaceMemberFromLegacy({
            workspaceId: membership.workspaceId.toString(),
            userId: membership.userId.toString(),
            role: membership.role,
            createdAt: membership.createdAt,
            updatedAt: membership.updatedAt,
          });
        }
      }
    }
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);
    await ensureBillingAccountForUser(user._id);
    await ensureUserTier(user._id);

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

export default router;
