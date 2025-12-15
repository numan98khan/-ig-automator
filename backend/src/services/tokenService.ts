import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const EMAIL_TOKEN_SECRET = process.env.EMAIL_TOKEN_SECRET || 'your-email-token-secret';
const TOKEN_EXPIRY = '24h'; // 24 hours for verification tokens

export type TokenType = 'verify_email' | 'password_reset' | 'workspace_invite';

interface TokenPayload {
  userId?: string;
  email?: string;
  workspaceId?: string;
  type: TokenType;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for email verification, password reset, or workspace invite
 */
export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, EMAIL_TOKEN_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify and decode a token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, EMAIL_TOKEN_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Generate a random verification code (6 digits)
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash a verification code for storage
 */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}
