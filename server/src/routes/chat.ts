import { Router, Request, Response } from 'express';
import type { ChatRequest } from '../types/index.js';
import { ConversationService } from '../services/conversation.js';
import { RateLimiterService } from '../services/rate-limiter.js';
import { getConfiguredProvider } from '../providers/index.js';

export function createChatRouter(
  conversation: ConversationService,
  rateLimiter: RateLimiterService
): Router {
  const router = Router();

  router.post('/', async (req: Request<object, string, ChatRequest>, res: Response): Promise<void> => {
    // Rate limit check
    const rateLimit = rateLimiter.check();
    if (!rateLimit.allowed) {
      console.log(`!!! Request blocked: rate limit reached (${rateLimit.current}/${rateLimit.max}) !!!`);
      res.status(429).send(
        `API request limit reached. Maximum ${rateLimit.max} requests per hour. ` +
        `Current: ${rateLimit.current}/${rateLimit.max}`
      );
      return;
    }

    const userMessage = req.body.message;

    // Validate message
    if (!userMessage) {
      res.status(400).send('Error: No message content received');
      return;
    }

    console.log(`\n[Received message]: ${userMessage} (Request ${rateLimit.current} this hour)`);

    // Handle reset command
    const normalizedMessage = userMessage.trim().toLowerCase();
    if (normalizedMessage === 'reset' || userMessage === '清除') {
      await conversation.saveAndReset('Manual reset command');
      res.send('【Memory cleared】Your conversation has been saved!');
      return;
    }

    try {
      // Add user message to history
      conversation.addUserMessage(userMessage);

      // Get AI response
      const provider = getConfiguredProvider();
      const response = await provider.chat(conversation.getHistory());

      console.log(`[AI response]: ${response.content}`);

      // Add assistant response to history
      conversation.addAssistantMessage(response.content);

      // Send plain text response (compatible with LSL script)
      res.send(response.content);

    } catch (error) {
      console.error('!!! Error occurred !!!');

      // Remove failed user message from history
      conversation.removeLastMessage();

      if (error instanceof Error) {
        console.error(error.message);
        
        // Check if error message contains HTTP status code
        const httpErrorMatch = error.message.match(/HTTP (\d+) (.+?):/);
        if (httpErrorMatch) {
          const statusCode = parseInt(httpErrorMatch[1], 10);
          const statusText = httpErrorMatch[2];
          const errorMsg = error.message.replace(/^HTTP \d+ .+?: /, '');
          res.status(statusCode).send(`API error (${statusCode} ${statusText}): ${errorMsg}`);
        } else {
          res.status(500).send(`API error: ${error.message}`);
        }
      } else {
        res.status(500).send('Connection error');
      }
    }
  });

  return router;
}
