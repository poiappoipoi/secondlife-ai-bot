/**
 * Chat route handler - processes user messages and returns AI responses
 */
import { Router, Request, Response } from 'express';
import type { ChatRequest } from '../types/index';
import { ConversationService } from '../services/conversation';
import { RateLimiterService } from '../services/rate-limiter';
import { LoggerService } from '../services/logger';
import { getConfiguredProvider } from '../providers/index';

/**
 * Creates Express router for chat endpoint
 * @param conversation - Conversation state management service
 * @param rateLimiter - Rate limiting service
 * @param logger - Logger service for structured logging
 * @returns Configured Express router
 */
export function createChatRouter(
  conversation: ConversationService,
  rateLimiter: RateLimiterService,
  logger: LoggerService
): Router {
  const router = Router();

  router.post(
    '/',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (req: Request<object, string, ChatRequest>, res: Response): Promise<void> => {
      // Check rate limit
      const rateLimit = rateLimiter.check();
      if (!rateLimit.allowed) {
        logger.warn(
          `Request blocked: rate limit reached (${rateLimit.current}/${rateLimit.max})`
        );
        res
          .status(429)
          .send(
            `API request limit reached. Maximum ${rateLimit.max} requests per hour. ` +
              `Current: ${rateLimit.current}/${rateLimit.max}`
          );
        return;
      }

      const userMessage = req.body.message;

      // Validate request
      if (!userMessage) {
        logger.warn('Request received with no message content');
        res.status(400).send('Error: No message content received');
        return;
      }

      logger.info(
        `Received message (Request ${rateLimit.current}/${rateLimit.max} this hour): ${userMessage}`
      );

      // Handle reset command
      const normalizedMessage = userMessage.trim().toLowerCase();
      if (normalizedMessage === 'reset' || userMessage === '清除') {
        logger.info('Memory reset requested by user');
        await conversation.saveAndReset('Manual reset command');
        res.send('【Memory cleared】Your conversation has been saved!');
        return;
      }

      try {
        // Add user message to conversation
        conversation.addUserMessage(userMessage);

        // Get AI provider
        const provider = getConfiguredProvider(logger);
        logger.debug(`Using AI provider: ${provider.name}`);

        // Try streaming first for faster response time
        let fullContent = '';
        try {
          logger.debug('Attempting streaming response');
          const stream = provider.chatStream(conversation.getHistory());
          for await (const chunk of stream) {
            fullContent += chunk;
          }
          logger.info(`AI response received (${fullContent.length} chars): ${fullContent}`);
          conversation.addAssistantMessage(fullContent);
          res.send(fullContent);
        } catch {
          // Fallback to non-streaming if streaming fails
          logger.warn('Streaming failed, falling back to non-streaming');
          const response = await provider.chat(conversation.getHistory());
          logger.info(
            `AI response received (${response.content.length} chars): ${response.content}`
          );
          conversation.addAssistantMessage(response.content);
          res.send(response.content);
        }
      } catch (error) {
        logger.error('Error occurred during chat request', error);

        // Remove failed user message from history
        conversation.removeLastMessage();

        if (error instanceof Error) {
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
    }
  );

  return router;
}
