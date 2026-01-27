/**
 * Chat route handler - processes user messages and returns AI responses
 */
import { Router, Request, Response } from 'express';
import type { ChatRequest } from '../types/index';
import { ConversationService } from '../services/conversation';
import { RateLimiterService } from '../services/rate-limiter';
import { LoggerService } from '../services/logger';
import { getConfiguredProvider } from '../providers/index';
import { config } from '../config/index';

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
        logger.warn(`Request blocked: rate limit reached (${rateLimit.current}/${rateLimit.max})`);
        res
          .status(429)
          .send(
            `API request limit reached. Maximum ${rateLimit.max} requests per hour. ` +
              `Current: ${rateLimit.current}/${rateLimit.max}`
          );
        return;
      }

      const { speaker, message: userMessage } = req.body;

      // Validate request
      if (!speaker) {
        logger.warn('Request received with no speaker field');
        res.status(400).send('Error: No speaker field received');
        return;
      }

      if (!userMessage) {
        logger.warn('Request received with no message content');
        res.status(400).send('Error: No message content received');
        return;
      }

      logger.info(
        `Received message from ${speaker} (Request ${rateLimit.current}/${rateLimit.max} this hour): ${userMessage}`
      );

      try {
        // Add user message to conversation with speaker context
        const messageWithSpeaker = `[${speaker}] ${userMessage}`;
        conversation.addUserMessage(messageWithSpeaker);

        // Get AI provider
        const provider = getConfiguredProvider(logger);
        logger.debug(`Using AI provider: ${provider.name}`);

        // Get history based on enabled features
        // Priority: Memory > Budget > Simple
        let history;
        if (config.memory.enabled) {
          // Memory system with keyword-activated injection (respects budget internally)
          history = conversation.getHistoryWithMemories(config.memory.tokenBudget);
        } else if (config.conversation.contextBudget.enabled) {
          // Token budget management without memories
          history = conversation.getHistoryWithBudget();
        } else {
          // Simple history (no budget, no memories)
          history = conversation.getHistory();
        }

        // Try streaming first for faster response time
        let fullContent = '';
        try {
          logger.debug('Attempting streaming response');
          const stream = provider.chatStream(history);
          for await (const chunk of stream) {
            fullContent += chunk;
          }
          logger.info(`AI response received (${fullContent.length} chars): ${fullContent}`);
          conversation.addAssistantMessage(fullContent);
          res.send(fullContent);
        } catch {
          // Fallback to non-streaming if streaming fails
          logger.warn('Streaming failed, falling back to non-streaming');
          const response = await provider.chat(history);
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
