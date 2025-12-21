import express, { Request } from 'express';
import { askAssistant } from '../services/assistantService';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

router.post('/ask', async (req: Request, res) => {
  try {
    const { question, workspaceName, locationHint } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    if (question.length > 800) {
      return res.status(400).json({ error: 'Question is too long (max 800 characters)' });
    }

    const response = await askAssistant({
      question: question.trim(),
      workspaceName,
      locationHint,
    });

    res.json(response);
  } catch (error: any) {
    const message = error?.message || 'Assistant unavailable';
    const status = message.includes('missing OpenAI API key') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

// Optional authenticated endpoint for future personalization
router.post('/ask/authed', authenticate, async (req: AuthRequest, res) => {
  try {
    const { question, workspaceName, locationHint } = req.body || {};

    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const response = await askAssistant({
      question: question.trim(),
      workspaceName,
      locationHint,
    });

    res.json(response);
  } catch (error: any) {
    const message = error?.message || 'Assistant unavailable';
    const status = message.includes('missing OpenAI API key') ? 503 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
