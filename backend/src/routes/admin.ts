import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import Workspace from '../models/Workspace';
import User from '../models/User';
import Conversation from '../models/Conversation';
import Message from '../models/Message';

const router = express.Router();

// Admin god-eye: list all workspaces
router.get('/workspaces', authenticate, requireAdmin, async (_req, res) => {
  try {
    const workspaces = await Workspace.find({}).lean();
    res.json(workspaces);
  } catch (error) {
    console.error('Admin list workspaces error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin god-eye: list all users
router.get('/users', authenticate, requireAdmin, async (_req, res) => {
  try {
    const users = await User.find({}).lean();
    res.json(users);
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin god-eye: list all conversations
router.get('/conversations', authenticate, requireAdmin, async (_req, res) => {
  try {
    const conversations = await Conversation.find({}).lean();
    res.json(conversations);
  } catch (error) {
    console.error('Admin list conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin god-eye: platform stats
router.get('/dashboard/stats', authenticate, requireAdmin, async (_req, res) => {
  try {
    const [userCount, workspaceCount, conversationCount, messageCount] = await Promise.all([
      User.countDocuments({}),
      Workspace.countDocuments({}),
      Conversation.countDocuments({}),
      Message.countDocuments({}),
    ]);

    res.json({
      users: userCount,
      workspaces: workspaceCount,
      conversations: conversationCount,
      messages: messageCount,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
