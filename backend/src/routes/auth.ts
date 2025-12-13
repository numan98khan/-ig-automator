import express, { Request, Response } from 'express';
import User from '../models/User';
import Workspace from '../models/Workspace';
import WorkspaceMember from '../models/WorkspaceMember';
import { generateToken } from '../utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { generateToken as generateEmailToken, verifyToken } from '../services/tokenService';

const router = express.Router();

// Signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user
    const user = await User.create({ email, password });

    // Generate token
    const token = generateToken(user._id.toString());

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
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

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user._id.toString());

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
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
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's workspaces via WorkspaceMember
    const memberships = await WorkspaceMember.find({ userId: user._id })
      .populate('workspaceId')
      .sort({ createdAt: -1 });

    const workspaces = memberships.map((m: any) => m.workspaceId).filter(Boolean);

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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email is already taken
    const existingUser = await User.findOne({ email, _id: { $ne: req.userId } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Update user with email and password
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.email = email;
    user.password = password; // Will be hashed by pre-save hook
    // Keep isProvisional = true until email is verified
    user.emailVerified = false;
    await user.save();

    // Generate verification token
    const verificationToken = generateEmailToken({
      userId: user._id.toString(),
      type: 'verify_email',
    });

    // Send verification email
    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailError: any) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail the request if email fails - user can request resend
    }

    res.json({
      message: 'Account secured! Please check your email to verify your address.',
      user: {
        id: user._id,
        email: user.email,
        isProvisional: user.isProvisional,
        emailVerified: user.emailVerified,
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

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Verify and decode token
    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    if (payload.type !== 'verify_email') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Find user and verify
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: 'Email already verified' });
    }

    // Mark email as verified and user as non-provisional
    user.emailVerified = true;
    user.isProvisional = false;
    await user.save();

    res.json({
      message: 'Email verified successfully!',
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        isProvisional: user.isProvisional,
      },
    });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend verification email
router.post('/resend-verification', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.email) {
      return res.status(400).json({ error: 'No email address on account' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    // Generate new verification token
    const verificationToken = generateEmailToken({
      userId: user._id.toString(),
      type: 'verify_email',
    });

    // Send verification email
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

    // Find user by email
    const user = await User.findOne({ email });

    // Always return success (don't leak if email exists)
    // But only send email if user exists
    if (user) {
      // Generate reset token
      const resetToken = generateEmailToken({
        userId: user._id.toString(),
        type: 'password_reset',
      });

      // Send password reset email
      try {
        await sendPasswordResetEmail(user, resetToken);
      } catch (emailError: any) {
        console.error('Failed to send password reset email:', emailError);
        // Still return success to user for security
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

    // Password strength validation
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Verify token
    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (payload.type !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Find user and update password
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
