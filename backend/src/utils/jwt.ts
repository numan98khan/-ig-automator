import jwt from 'jsonwebtoken';
import { requireEnv } from './requireEnv';

const JWT_SECRET = requireEnv('JWT_SECRET');

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
};
