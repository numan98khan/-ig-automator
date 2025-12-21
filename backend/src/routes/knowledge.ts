import express, { Response } from 'express';
import KnowledgeItem from '../models/KnowledgeItem';
import Workspace from '../models/Workspace';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';
import {
  deleteKnowledgeEmbedding,
  reindexWorkspaceKnowledge,
  upsertKnowledgeEmbedding,
} from '../services/vectorStore';

const router = express.Router();
const STORAGE_MODES = ['vector', 'text'];

// Get all knowledge items for a workspace (all members can view)
router.get('/workspace/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    // Check if user has access to this workspace
    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const items = await KnowledgeItem.find({ workspaceId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error('Get knowledge items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create knowledge item (owner and admin only)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, workspaceId, storageMode = 'vector' } = req.body;

    if (!title || !content || !workspaceId || !STORAGE_MODES.includes(storageMode)) {
      return res.status(400).json({ error: 'title, content, workspaceId, and valid storageMode are required' });
    }

    // Check if user is owner or admin
    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    if (!isOwner && role !== 'admin') {
      return res.status(403).json({ error: 'Only workspace owners and admins can create knowledge items' });
    }

    const item = await KnowledgeItem.create({
      title,
      content,
      workspaceId,
      storageMode,
    });

    if (storageMode === 'vector') {
      // Best-effort vector upsert
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId,
        title,
        content,
      });
    }

    res.status(201).json(item);
  } catch (error) {
    console.error('Create knowledge item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update knowledge item
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, storageMode } = req.body;
    const { id } = req.params;

    if (storageMode && !STORAGE_MODES.includes(storageMode)) {
      return res.status(400).json({ error: 'storageMode must be either vector or text' });
    }

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

    const nextStorageMode = storageMode || item.storageMode || 'vector';

    item.title = title || item.title;
    item.content = content || item.content;
    item.storageMode = nextStorageMode;
    await item.save();

    if (nextStorageMode === 'vector') {
      await upsertKnowledgeEmbedding({
        id: item._id.toString(),
        workspaceId: item.workspaceId.toString(),
        title: item.title,
        content: item.content,
      });
    } else {
      await deleteKnowledgeEmbedding(item._id.toString());
    }

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
    await deleteKnowledgeEmbedding(id);
    res.json({ message: 'Knowledge item deleted' });
  } catch (error) {
    console.error('Delete knowledge item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reindex all knowledge items into pgvector for a workspace (owner/admin)
router.post('/workspace/:workspaceId/reindex-vector', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { hasAccess, isOwner, role } = await checkWorkspaceAccess(workspaceId, req.userId!);

    if (!hasAccess || (!isOwner && role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    await reindexWorkspaceKnowledge(workspaceId);
    res.json({ success: true });
  } catch (error) {
    console.error('Reindex vector knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
