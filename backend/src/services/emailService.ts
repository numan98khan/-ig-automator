import { Resend } from 'resend';
import { IUser } from '../models/User';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@yourdomain.com';
// Remove trailing slash to prevent double slashes in URLs
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

if (!RESEND_API_KEY) {
  console.warn('⚠️ RESEND_API_KEY not set. Email sending will fail.');
}

const resend = new Resend(RESEND_API_KEY);

/**
 * Send email verification link
 */
export async function sendVerificationEmail(user: IUser, token: string): Promise<void> {
  if (!user.email) {
    throw new Error('User email is required for verification');
  }

  const verificationUrl = `${APP_BASE_URL}/verify-email?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Verify Your Email</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi there,</p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Thank you for securing your Instagram AI Inbox account! Please verify your email address by clicking the button below:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
            Verify Email Address
          </a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Or copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          This link will expire in 24 hours.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          If you didn't request this verification, you can safely ignore this email.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>Instagram AI Inbox - Powered by AI</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Verify Your Email

Hi there,

Thank you for securing your Instagram AI Inbox account! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours.

If you didn't request this verification, you can safely ignore this email.

---
Instagram AI Inbox - Powered by AI
  `.trim();

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Verify your email - Instagram AI Inbox',
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Verification email sent to ${user.email}`);
  } catch (error: any) {
    console.error('❌ Failed to send verification email:', error);
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

/**
 * Send password reset link
 */
export async function sendPasswordResetEmail(user: IUser, token: string): Promise<void> {
  if (!user.email) {
    throw new Error('User email is required for password reset');
  }

  const resetUrl = `${APP_BASE_URL}/reset-password?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Reset Your Password</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi there,</p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          We received a request to reset your password. Click the button below to create a new password:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Or copy and paste this link into your browser:<br>
          <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          This link will expire in 24 hours.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>Instagram AI Inbox - Powered by AI</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Reset Your Password

Hi there,

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 24 hours.

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

---
Instagram AI Inbox - Powered by AI
  `.trim();

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Reset your password - Instagram AI Inbox',
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Password reset email sent to ${user.email}`);
  } catch (error: any) {
    console.error('❌ Failed to send password reset email:', error);
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

/**
 * Send workspace invite email
 */
export async function sendWorkspaceInviteEmail(
  invitedEmail: string,
  workspaceName: string,
  inviterName: string,
  token: string
): Promise<void> {
  const inviteUrl = `${APP_BASE_URL}/accept-invite?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">You're Invited!</h1>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hi there,</p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${inviterName}</strong> has invited you to join the workspace <strong>${workspaceName}</strong> on Instagram AI Inbox!
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Click the button below to accept the invitation and join the team:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 16px;">
            Accept Invitation
          </a>
        </div>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          Or copy and paste this link into your browser:<br>
          <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          This invitation will expire in 24 hours.
        </p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
        <p>Instagram AI Inbox - Powered by AI</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
You're Invited!

Hi there,

${inviterName} has invited you to join the workspace ${workspaceName} on Instagram AI Inbox!

Click the link below to accept the invitation and join the team:

${inviteUrl}

This invitation will expire in 24 hours.

---
Instagram AI Inbox - Powered by AI
  `.trim();

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: invitedEmail,
      subject: `You've been invited to ${workspaceName} - Instagram AI Inbox`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Workspace invite email sent to ${invitedEmail}`);
  } catch (error: any) {
    console.error('❌ Failed to send workspace invite email:', error);
    throw new Error(`Failed to send workspace invite email: ${error.message}`);
  }
}
