import express, { Response } from 'express';
import SupportTicket from '../models/SupportTicket';
import SupportTicketComment from '../models/SupportTicketComment';
import User from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import { checkWorkspaceAccess } from '../middleware/workspaceAccess';

const router = express.Router();

// Create a support ticket
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      workspaceId,
      instagramAccountId,
      type,
      severity,
      message,
      subject,
      attachments,
      tags,
      context,
    } = req.body;

    if (!workspaceId || !type || !message) {
      return res.status(400).json({ error: 'workspaceId, type, and message are required' });
    }

    const { hasAccess } = await checkWorkspaceAccess(workspaceId, req.userId!);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this workspace' });
    }

    const ticket = await SupportTicket.create({
      workspaceId,
      instagramAccountId,
      userId: req.userId,
      type,
      severity,
      description: message,
      subject,
      attachments,
      tags: tags || [],
      context: {
        ...context,
        requestId: req.requestId,
      },
      requestIds: context?.requestIds || (req.requestId ? [req.requestId] : []),
      breadcrumbs: context?.breadcrumbs || [],
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Create support ticket error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// List tickets for workspace or all (admin)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, status, type, severity, tag } = req.query;
    const filter: any = {};

    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';

    if (workspaceId) {
      const { hasAccess } = await checkWorkspaceAccess(workspaceId as string, req.userId!);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this workspace' });
      }
      filter.workspaceId = workspaceId;
    } else if (!isAdmin) {
      return res.status(400).json({ error: 'Workspace ID required for non-admin users' });
    }

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (tag) filter.tags = tag;

    const tickets = await SupportTicket.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ tickets });
  } catch (error) {
    console.error('List support tickets error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get ticket details
router.get('/:ticketId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';

    if (!isAdmin) {
      const { hasAccess } = await checkWorkspaceAccess(ticket.workspaceId.toString(), req.userId!);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this workspace' });
      }
    }

    const comments = await SupportTicketComment.find({ ticketId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ ticket, comments });
  } catch (error) {
    console.error('Get support ticket error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update ticket status or metadata (admin only)
router.patch('/:ticketId', authenticate, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { status, assigneeUserId, tags, severity } = req.body;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (status) {
      ticket.status = status;
      if (status === 'resolved') {
        ticket.resolvedAt = new Date();
      }
    }
    if (assigneeUserId) {
      ticket.assigneeUserId = assigneeUserId;
    }
    if (Array.isArray(tags)) {
      ticket.tags = tags;
    }
    if (severity) {
      ticket.severity = severity;
    }

    await ticket.save();

    res.json(ticket);
  } catch (error) {
    console.error('Update support ticket error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add comment to ticket
router.post('/:ticketId/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const { message, attachments } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';

    if (!isAdmin) {
      const { hasAccess } = await checkWorkspaceAccess(ticket.workspaceId.toString(), req.userId!);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied to this workspace' });
      }
    }

    const comment = await SupportTicketComment.create({
      ticketId,
      authorType: isAdmin ? 'admin' : 'user',
      authorId: req.userId,
      message,
      attachments,
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Create support ticket comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
