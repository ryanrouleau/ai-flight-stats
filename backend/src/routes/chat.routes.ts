import { Router, Request, Response } from 'express';
import { chat, type ChatRequest } from '../services/chat.service';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /chat
 * Send a message and get a response from the AI assistant
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body as ChatRequest;

    // Validate request
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required and must be a non-empty string',
      });
    }

    if (history && !Array.isArray(history)) {
      return res.status(400).json({
        error: 'History must be an array of messages',
      });
    }

    // Get user email from request (attached by requireAuth middleware)
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(401).json({
        error: 'User not authenticated',
      });
    }

    // Process chat request
    const response = await chat({ message, history }, userEmail);

    return res.json(response);
  } catch (error: any) {
    console.error('❌ Chat error:', error);
    return res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message,
    });
  }
});

export default router;
