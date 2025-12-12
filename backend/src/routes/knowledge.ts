import express, { Response } from 'express';
import KnowledgeItem from '../models/KnowledgeItem';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all knowledge items for a workspace
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const items = await KnowledgeItem.find({ workspaceId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error('Get knowledge items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create knowledge item
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, workspaceId } = req.body;

    if (!title || !content || !workspaceId) {
      return res.status(400).json({ error: 'title, content, and workspaceId are required' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const item = await KnowledgeItem.create({
      title,
      content,
      workspaceId,
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Create knowledge item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update knowledge item
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content } = req.body;
    const { id } = req.params;

    const item = await KnowledgeItem.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Knowledge item not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: item.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    item.title = title || item.title;
    item.content = content || item.content;
    await item.save();

    res.json(item);
  } catch (error) {
    console.error('Update knowledge item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete knowledge item
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const item = await KnowledgeItem.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Knowledge item not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: item.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    await KnowledgeItem.findByIdAndDelete(id);
    res.json({ message: 'Knowledge item deleted' });
  } catch (error) {
    console.error('Delete knowledge item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
