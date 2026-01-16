import { Resend } from 'resend';
import GlobalUiSettings, { UiTheme } from '../models/GlobalUiSettings';
import { CoreUser } from '../repositories/core/userRepository';
import { requireEnv, requireOneOf } from '../utils/requireEnv';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = requireEnv('EMAIL_FROM');
const APP_BASE_URL = requireOneOf(['APP_BASE_URL', 'FRONTEND_URL']).replace(/\/$/, '');

if (!RESEND_API_KEY) {
  console.warn('⚠️ RESEND_API_KEY not set. Email sending will fail.');
}

const resend = new Resend(RESEND_API_KEY);

type EmailUser = Pick<CoreUser, '_id' | 'email' | 'firstName' | 'lastName'>;

type VerificationThemeTokens = {
  label: string;
  brand: string;
  fontFamily: string;
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  cardRadius: string;
  shadow: string;
  headerBg: string;
  headerText: string;
  bodyText: string;
  mutedText: string;
  kickerBg: string;
  kickerText: string;
  buttonBg: string;
  buttonText: string;
  buttonBorder: string;
  buttonShadow: string;
  linkColor: string;
  noteBg: string;
  noteText: string;
};

const DEFAULT_UI_THEME: UiTheme = 'legacy';

const VERIFICATION_THEME_TOKENS: Record<UiTheme, VerificationThemeTokens> = {
  legacy: {
    label: 'Legacy',
    brand: 'SendFx AI Inbox',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    pageBg: '#f5f4ff',
    cardBg: '#ffffff',
    cardBorder: '1px solid #e5e7eb',
    cardRadius: '12px',
    shadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
    headerBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    headerText: '#ffffff',
    bodyText: '#1f2937',
    mutedText: '#6b7280',
    kickerBg: '#ede9fe',
    kickerText: '#4c1d95',
    buttonBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    buttonText: '#ffffff',
    buttonBorder: 'none',
    buttonShadow: '0 12px 24px rgba(102, 126, 234, 0.35)',
    linkColor: '#667eea',
    noteBg: '#f3f4f6',
    noteText: '#6b7280',
  },
  studio: {
    label: 'Studio',
    brand: 'SendFx AI Inbox',
    fontFamily: "'Space Grotesk', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    pageBg: '#f6f2ed',
    cardBg: '#ffffff',
    cardBorder: '1px solid #e7e5e4',
    cardRadius: '16px',
    shadow: '0 30px 70px rgba(17, 24, 39, 0.25)',
    headerBg: '#111827',
    headerText: '#ffffff',
    bodyText: '#1f2937',
    mutedText: '#6b7280',
    kickerBg: '#fff7ed',
    kickerText: '#c2410c',
    buttonBg: '#111827',
    buttonText: '#ffffff',
    buttonBorder: '1px solid #111827',
    buttonShadow: '0 12px 22px rgba(17, 24, 39, 0.25)',
    linkColor: '#f97316',
    noteBg: '#fff7ed',
    noteText: '#9a3412',
  },
  comic: {
    label: 'Comic Pop Art',
    brand: 'SendFx AI Inbox',
    fontFamily: "'Trebuchet MS', 'Comic Sans MS', 'Segoe UI', sans-serif",
    pageBg: '#fff1fa',
    cardBg: '#ffffff',
    cardBorder: '3px solid #111827',
    cardRadius: '18px',
    shadow: '6px 6px 0 #111827',
    headerBg: '#ff3fd0',
    headerText: '#111827',
    bodyText: '#111827',
    mutedText: '#374151',
    kickerBg: '#00d4ff',
    kickerText: '#111827',
    buttonBg: '#ffe24a',
    buttonText: '#111827',
    buttonBorder: '3px solid #111827',
    buttonShadow: '4px 4px 0 #111827',
    linkColor: '#111827',
    noteBg: '#fff7cc',
    noteText: '#1f2937',
  },
};

const getGlobalUiTheme = async (): Promise<UiTheme> => {
  try {
    const settings = await GlobalUiSettings.findOne({ key: 'global' }).lean();
    if (settings?.uiTheme === 'legacy' || settings?.uiTheme === 'comic' || settings?.uiTheme === 'studio') {
      return settings.uiTheme;
    }
  } catch (error) {
    console.warn('⚠️ Failed to load UI theme for email. Falling back to legacy.', error);
  }
  return DEFAULT_UI_THEME;
};

const buildVerificationEmail = ({
  verificationUrl,
  uiTheme,
}: {
  verificationUrl: string;
  uiTheme: UiTheme;
}) => {
  const theme = VERIFICATION_THEME_TOKENS[uiTheme] ?? VERIFICATION_THEME_TOKENS.legacy;
  const subject = `Verify your email - ${theme.brand}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background: ${theme.pageBg}; font-family: ${theme.fontFamily}; color: ${theme.bodyText};">
      <div style="padding: 24px;">
        <div style="max-width: 640px; margin: 0 auto; background: ${theme.cardBg}; border: ${theme.cardBorder}; border-radius: ${theme.cardRadius}; overflow: hidden; box-shadow: ${theme.shadow};">
          <div style="background: ${theme.headerBg}; padding: 28px 32px; text-align: left;">
            <img
              src="${APP_BASE_URL}/sendfx-studio.png"
              alt="SendFx"
              style="height: 28px; width: auto; display: block;"
            />
            <h1 style="margin: 16px 0 6px; font-size: 28px; color: ${theme.headerText};">
              Verify your email
            </h1>
            <p style="margin: 0; font-size: 14px; color: ${theme.headerText}; opacity: 0.85;">
              ${theme.brand}
            </p>
          </div>
          <div style="padding: 32px;">
            <p style="font-size: 16px; margin: 0 0 16px;">
              Hi there,
            </p>
            <p style="font-size: 16px; margin: 0 0 24px;">
              Thanks for securing your SendFx account. Verify your email to activate your workspace and keep your inbox protected.
            </p>
            <div style="text-align: center; margin: 28px 0 32px;">
              <a href="${verificationUrl}" style="background: ${theme.buttonBg}; color: ${theme.buttonText}; padding: 14px 32px; text-decoration: none; border-radius: 999px; font-weight: 700; display: inline-block; font-size: 15px; border: ${theme.buttonBorder}; box-shadow: ${theme.buttonShadow};">
                Verify my email
              </a>
            </div>
            <p style="font-size: 13px; color: ${theme.mutedText}; margin: 0 0 10px;">
              Or paste this link into your browser:
            </p>
            <p style="font-size: 13px; margin: 0 0 22px;">
              <a href="${verificationUrl}" style="color: ${theme.linkColor}; word-break: break-all;">${verificationUrl}</a>
            </p>
            <div style="background: ${theme.noteBg}; color: ${theme.noteText}; padding: 12px 16px; border-radius: 10px; font-size: 13px;">
              This link expires in 24 hours. If you did not request this, you can safely ignore this email.
            </div>
          </div>
        </div>
        <p style="text-align: center; margin: 18px 0 0; font-size: 12px; color: ${theme.mutedText};">
          Powered by Insight Interface
        </p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Verify your email

Hi there,

Thanks for securing your SendFx account. Verify your email to activate your workspace and keep your inbox protected.

${verificationUrl}

This link expires in 24 hours. If you did not request this, you can safely ignore this email.

---
Powered by Insight Interface
  `.trim();

  return { htmlContent, textContent, subject };
};

export async function sendVerificationEmail(user: EmailUser, token: string): Promise<void> {
  if (!user.email) {
    throw new Error('User email is required for verification');
  }

  const verificationUrl = `${APP_BASE_URL}/verify-email?token=${token}`;
  const uiTheme = await getGlobalUiTheme();
  const { htmlContent, textContent, subject } = buildVerificationEmail({ verificationUrl, uiTheme });

  try {
    console.log(`📧 Sending verification email...`);
    console.log(`   From: ${EMAIL_FROM}`);
    console.log(`   To: ${user.email}`);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Verification email sent to ${user.email}`);
    console.log(`📬 Resend response:`, JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to send verification email:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}

export async function sendPasswordResetEmail(user: EmailUser, token: string): Promise<void> {
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
    console.log(`📧 Sending password reset email...`);
    console.log(`   From: ${EMAIL_FROM}`);
    console.log(`   To: ${user.email}`);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: user.email,
      subject: 'Reset your password - Instagram AI Inbox',
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Password reset email sent to ${user.email}`);
    console.log(`📬 Resend response:`, JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to send password reset email:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}

export async function sendWorkspaceInviteEmail(
  invitedEmail: string,
  workspaceName: string,
  inviterName: string,
  token: string,
  role: string
): Promise<void> {
  const inviteUrl = `${APP_BASE_URL}/accept-invite?token=${token}`;

  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);

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
          <strong>${inviterName}</strong> has invited you to join the workspace <strong>${workspaceName}</strong> on Instagram AI Inbox as a <strong>${roleDisplay}</strong>!
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Click the button below to accept the invitation and set up your account:
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
          This invitation will expire in 7 days.
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

${inviterName} has invited you to join the workspace ${workspaceName} on Instagram AI Inbox as a ${roleDisplay}!

Click the link below to accept the invitation and set up your account:

${inviteUrl}

This invitation will expire in 7 days.

---
Instagram AI Inbox - Powered by AI
  `.trim();

  try {
    console.log(`📧 Sending workspace invite email...`);
    console.log(`   From: ${EMAIL_FROM}`);
    console.log(`   To: ${invitedEmail}`);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: invitedEmail,
      subject: `You're invited to join ${workspaceName} on Instagram AI Inbox`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Workspace invite email sent to ${invitedEmail}`);
    console.log(`📬 Resend response:`, JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to send workspace invite email:', error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Failed to send workspace invite email: ${error.message}`);
  }
}
