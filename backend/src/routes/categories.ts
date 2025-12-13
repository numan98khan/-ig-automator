import express, { Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import MessageCategory from '../models/MessageCategory';
import CategoryKnowledge from '../models/CategoryKnowledge';
import Workspace from '../models/Workspace';
import Message from '../models/Message';
import { initializeDefaultCategories } from '../services/aiCategorization';

const router = express.Router();

/**
 * Get all categories for a workspace
 * GET /api/categories/workspace/:workspaceId
 */
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

    // Get categories
    let categories = await MessageCategory.find({ workspaceId }).sort({ isSystem: -1, nameEn: 1 });

    // Initialize default categories if none exist
    if (categories.length === 0) {
      await initializeDefaultCategories(workspaceId);
      categories = await MessageCategory.find({ workspaceId }).sort({ isSystem: -1, nameEn: 1 });
    }

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get a single category
 * GET /api/categories/:id
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    res.json(category);
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Create a new category
 * POST /api/categories
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, nameEn, description, autoReplyEnabled } = req.body;

    if (!workspaceId || !nameEn) {
      return res.status(400).json({ error: 'workspaceId and nameEn are required' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if category already exists
    const existing = await MessageCategory.findOne({ workspaceId, nameEn });
    if (existing) {
      return res.status(400).json({ error: 'Category with this name already exists' });
    }

    const category = await MessageCategory.create({
      workspaceId,
      nameEn,
      description,
      autoReplyEnabled: autoReplyEnabled !== false,
      isSystem: false,
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update a category
 * PUT /api/categories/:id
 */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nameEn, description, autoReplyEnabled } = req.body;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Update fields
    if (nameEn !== undefined && !category.isSystem) {
      // Check if new name already exists
      const existing = await MessageCategory.findOne({
        workspaceId: category.workspaceId,
        nameEn,
        _id: { $ne: id },
      });
      if (existing) {
        return res.status(400).json({ error: 'Category with this name already exists' });
      }
      category.nameEn = nameEn;
    }

    if (description !== undefined) {
      category.description = description;
    }

    if (autoReplyEnabled !== undefined) {
      category.autoReplyEnabled = autoReplyEnabled;
    }

    await category.save();
    res.json(category);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Delete a category (only non-system categories)
 * DELETE /api/categories/:id
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Cannot delete system categories
    if (category.isSystem) {
      return res.status(400).json({ error: 'Cannot delete system categories' });
    }

    // Move messages to "General" category
    const generalCategory = await MessageCategory.findOne({
      workspaceId: category.workspaceId,
      nameEn: 'General',
    });

    if (generalCategory) {
      await Message.updateMany(
        { categoryId: id },
        { categoryId: generalCategory._id }
      );
    }

    // Delete category knowledge
    await CategoryKnowledge.deleteOne({
      workspaceId: category.workspaceId,
      categoryId: id,
    });

    // Delete category
    await MessageCategory.findByIdAndDelete(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get category knowledge
 * GET /api/categories/:id/knowledge
 */
router.get('/:id/knowledge', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Get or create knowledge entry
    let knowledge = await CategoryKnowledge.findOne({
      workspaceId: category.workspaceId,
      categoryId: id,
    });

    if (!knowledge) {
      knowledge = await CategoryKnowledge.create({
        workspaceId: category.workspaceId,
        categoryId: id,
        content: '',
      });
    }

    res.json(knowledge);
  } catch (error) {
    console.error('Get category knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update category knowledge
 * PUT /api/categories/:id/knowledge
 */
router.put('/:id/knowledge', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content, language } = req.body;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Update or create knowledge entry
    const knowledge = await CategoryKnowledge.findOneAndUpdate(
      {
        workspaceId: category.workspaceId,
        categoryId: id,
      },
      {
        $set: {
          content: content || '',
          language: language || 'en',
        },
      },
      { new: true, upsert: true }
    );

    res.json(knowledge);
  } catch (error) {
    console.error('Update category knowledge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Get messages for a category
 * GET /api/categories/:id/messages
 */
router.get('/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const category = await MessageCategory.findById(id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: category.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Get messages for this category
    const messages = await Message.find({ categoryId: id })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .populate('conversationId', 'participantName participantHandle');

    const total = await Message.countDocuments({ categoryId: id });

    res.json({
      messages,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Get category messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
