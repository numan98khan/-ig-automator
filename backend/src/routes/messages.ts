import express, { Response } from 'express';
import Message from '../models/Message';
import Conversation from '../models/Conversation';
import Workspace from '../models/Workspace';
import KnowledgeItem from '../models/KnowledgeItem';
import InstagramAccount from '../models/InstagramAccount';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendMessage as sendInstagramMessage } from '../utils/instagram-api';
import OpenAI from 'openai';

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Get all messages for a conversation
router.get('/conversation/:conversationId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, text } = req.body;

    if (!conversationId || !text) {
      return res.status(400).json({ error: 'conversationId and text are required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Create message
    const message = await Message.create({
      conversationId,
      text,
      from: 'user',
    });

    // Update conversation's lastMessageAt
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Generate AI reply
router.post('/generate-ai-reply', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check if this is an Instagram conversation
    if (conversation.platform !== 'instagram' || !conversation.participantInstagramId) {
      return res.status(400).json({ error: 'AI reply only supported for Instagram conversations' });
    }

    // Verify workspace belongs to user
    const workspace = await Workspace.findOne({
      _id: conversation.workspaceId,
      userId: req.userId,
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    // Get Instagram account
    const igAccount = await InstagramAccount.findById(conversation.instagramAccountId).select('+accessToken');
    if (!igAccount || !igAccount.accessToken) {
      return res.status(404).json({ error: 'Instagram account not found or not connected' });
    }

    // Get conversation history
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

    // Get knowledge base
    const knowledgeItems = await KnowledgeItem.find({ workspaceId: conversation.workspaceId });

    // Build knowledge base context
    const knowledgeContext = knowledgeItems.length > 0
      ? `\n\nKnowledge Base:\n${knowledgeItems.map((item: any) => `- ${item.title}: ${item.content}`).join('\n')}`
      : '';

    // Build conversation history
    const conversationHistory = messages.map((msg: any) => {
      const role = msg.from === 'customer' ? 'Customer' : msg.from === 'ai' ? 'AI' : 'You';
      return `${role}: ${msg.text}`;
    }).join('\n');

    // Create prompt
    const prompt = `You are an AI assistant for a business's Instagram inbox. Your job is to help respond to customer messages professionally and helpfully.

${knowledgeContext}

Conversation History:
${conversationHistory}

Based on the conversation history and the knowledge base, generate a helpful and professional response to the customer's last message. If the answer is in the knowledge base, use it. If not, provide a polite response that tries to be helpful or asks for clarification.

Response:`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    const aiResponse = completion.choices[0].message.content?.trim() || 'I apologize, but I am unable to generate a response at this time.';

    console.log('🤖 AI generated response:', aiResponse);

    // Send message via Instagram API first (same pattern as manual send)
    console.log('📤 Sending AI-generated message to Instagram...');
    const result = await sendInstagramMessage(
      conversation.participantInstagramId,
      aiResponse,
      igAccount.accessToken
    );

    // Verify Instagram API returned success
    if (!result || (!result.message_id && !result.recipient_id)) {
      throw new Error('Instagram API did not return a valid response. Message may not have been sent.');
    }

    console.log('✅ Instagram API confirmed AI message sent');

    // Only save to database AFTER successful send to Instagram
    let message;
    try {
      message = await Message.create({
        conversationId,
        text: aiResponse,
        from: 'ai',
        platform: 'instagram',
        instagramMessageId: result.message_id || undefined,
      });

      // Update conversation's lastMessageAt
      conversation.lastMessage = aiResponse;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      console.log('✅ AI message saved to database');
    } catch (dbError: any) {
      // Message was sent to Instagram but failed to save to DB
      console.error('⚠️ AI message sent to Instagram but failed to save to database:', dbError);
      return res.status(200).json({
        success: true,
        warning: 'Message sent successfully but database save failed',
        instagramMessageId: result.message_id,
        text: aiResponse,
        error: dbError.message,
      });
    }

    res.status(201).json(message);
  } catch (error: any) {
    console.error('Generate AI reply error:', error);

    // Check if error is from Instagram API or AI generation
    const isInstagramError = error.message?.includes('Failed to send') || error.response?.data?.error;

    res.status(500).json({
      error: isInstagramError ? 'Generated reply but failed to send to Instagram' : 'Failed to generate AI reply',
      details: error.message,
    });
  }
});

export default router;
