/**
 * Chat route handler - processes user messages and returns AI responses
 */
import { Router, Request, Response } from 'express';
import type { ChatRequest } from '../types/index.js';
import { ConversationService } from '../services/conversation.js';
import { RateLimiterService } from '../services/rate-limiter.js';
import { getConfiguredProvider } from '../providers/index.js';

/**
 * Creates Express router for chat endpoint
 * @param conversation - Conversation state management service
 * @param rateLimiter - Rate limiting service
 * @returns Configured Express router
 */
export function createChatRouter(
  conversation: ConversationService,
  rateLimiter: RateLimiterService
): Router {
  const router = Router();

  router.post('/', async (req: Request<object, string, ChatRequest>, res: Response): Promise<void> => {
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

    if (!userMessage) {
      res.status(400).send('Error: No message content received');
      return;
    }

    console.log(`\n[Received message]: ${userMessage} (Request ${rateLimit.current} this hour)`);

    const normalizedMessage = userMessage.trim().toLowerCase();
    if (normalizedMessage === 'reset' || userMessage === '清除') {
      await conversation.saveAndReset('Manual reset command');
      res.send('【Memory cleared】Your conversation has been saved!');
      return;
    }

    try {
      conversation.addUserMessage(userMessage);

      const provider = getConfiguredProvider();
      const response = await provider.chat(conversation.getHistory());

      console.log(`[AI response]: ${response.content}`);

      conversation.addAssistantMessage(response.content);

      res.send(response.content);

    } catch (error) {
      console.error('!!! Error occurred !!!');

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
