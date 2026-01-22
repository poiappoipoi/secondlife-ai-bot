/**
 * System prompt route handler - updates AI persona/behavior
 */
import { Router, Request, Response } from 'express';
import type { SetSystemPromptRequest } from '../types/index';
import { ConversationService } from '../services/conversation';

/**
 * Creates Express router for system prompt endpoint
 * @param conversation - Conversation state management service
 * @returns Configured Express router
 */
export function createSystemPromptRouter(conversation: ConversationService): Router {
  const router = Router();

  router.post('/', async (req: Request<object, string, SetSystemPromptRequest>, res: Response): Promise<void> => {
    const newPrompt = req.body.prompt;

    console.log(`\n[Received command]: Change persona to -> ${newPrompt}`);

    if (!newPrompt) {
      res.status(400).send('Please provide prompt content');
      return;
    }

    await conversation.setSystemPrompt(newPrompt);
    res.send(`設定成功！我現在是：${newPrompt}`);
  });

  return router;
}
