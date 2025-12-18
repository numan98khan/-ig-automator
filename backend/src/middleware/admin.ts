import { NextFunction, Response } from 'express';
import User from '../models/User';
import { AuthRequest } from './auth';

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.userRole = user.role;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

declare module './auth' {
  interface AuthRequest {
    userRole?: 'user' | 'admin';
  }
}
