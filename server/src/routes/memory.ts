/**
 * Memory route handler - manages conversation memory operations
 */
import { Router, Request, Response } from 'express';
import { ConversationService } from '../services/conversation';
import { LoggerService } from '../services/logger';

/**
 * Creates Express router for memory management endpoints
 * @param conversation - Conversation state management service
 * @param logger - Logger service for structured logging
 * @returns Configured Express router
 */
export function createMemoryRouter(
  conversation: ConversationService,
  logger: LoggerService
): Router {
  const router = Router();

  router.post(
    '/reset',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    async (_req: Request, res: Response): Promise<void> => {
      logger.info('Memory reset requested');
      await conversation.saveAndReset('Manual reset command');
      res.status(204).send();
    }
  );

  return router;
}
