/**
 * Chat route handler - processes user messages and returns AI responses
 * Integrates NPC State Machine for selective, human-like response behavior
 */
import { Router, Request, Response } from 'express';
import type { ChatRequest } from '../types/index';
import { ConversationService } from '../services/conversation';
import { RateLimiterService } from '../services/rate-limiter';
import { LoggerService } from '../services/logger';
import { MessageBufferService } from '../services/message-buffer';
import { NPCStateMachineService } from '../services/state-machine';
import { getConfiguredProvider } from '../providers/index';
import { config } from '../config/index';

/**
 * Creates Express router for chat endpoint with optional NPC state machine
 * @param conversation - Conversation state management service
 * @param rateLimiter - Rate limiting service
 * @param logger - Logger service for structured logging
 * @param stateMachine - Optional NPC state machine for selective responses
 * @param messageBuffer - Optional message buffer service for NPC
 * @returns Configured Express router
 */
export function createChatRouter(
  conversation: ConversationService,
  rateLimiter: RateLimiterService,
  logger: LoggerService,
  stateMachine?: NPCStateMachineService,
  messageBuffer?: MessageBufferService
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

      const { speaker, message: userMessage, avatarId } = req.body;

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

      // Resolve avatar ID (fallback to speaker for backward compatibility)
      const resolvedAvatarId = avatarId || speaker;

      try {
        // Special commands (reset memory)
        if (userMessage === 'reset' || userMessage === '清除') {
          await conversation.saveAndReset('User reset command');
          if (stateMachine && messageBuffer) {
            messageBuffer.clearAll();
            stateMachine.resetState();
          }
          res.status(204).send('');
          logger.info('Memory cleared by user');
          return;
        }

        // === NPC STATE MACHINE FLOW (if enabled) ===
        if (config.npc.enabled && stateMachine && messageBuffer) {
          // 1. Buffer message immediately
          await stateMachine.onMessageReceived(resolvedAvatarId, speaker, userMessage);

          // 2. Wait for decision (long-polling with timeout)
          const decision = await stateMachine.waitForDecision(
            resolvedAvatarId,
            config.npc.stateMachine.timeouts.listeningMs
          );

          // 3. Check decision
          if (!decision.decided) {
            // NPC ignoring this avatar (timeout or low priority)
            logger.debug(`NPC ignored ${speaker}: ${decision.reason}`);
            res.status(202).send(''); // 202 Accepted (no content)
            return;
          }

          // === NPC RESPONDING ===

          // 4. Get aggregated messages for this avatar
          const aggregatedContent = messageBuffer.getAggregatedContent(resolvedAvatarId);
          const messageWithSpeaker = `[${speaker}]: ${aggregatedContent}`;

          // 5. Add to conversation (only engaged avatars)
          conversation.addUserMessage(messageWithSpeaker);

          // 6. Build history and inject context
          let history;
          if (config.memory.enabled) {
            history = conversation.getHistoryWithMemories(config.memory.tokenBudget);
          } else if (config.conversation.contextBudget.enabled) {
            history = conversation.getHistoryWithBudget();
          } else {
            history = conversation.getHistory();
          }

          // Inject dynamic context (tell LLM who to address)
          const contextMessage = {
            role: 'system' as const,
            content: `You are responding to ${speaker}. Address them directly by name.`,
          };

          // Insert context after system prompt but before conversation
          history.splice(1, 0, contextMessage);

          // 7. Get AI provider
          const provider = getConfiguredProvider(logger);
          logger.debug(`Using AI provider: ${provider.name}`);

          // 8. Get response
          let fullContent = '';
          try {
            logger.debug('Attempting streaming response');
            const stream = provider.chatStream(history);
            for await (const chunk of stream) {
              fullContent += chunk;
            }
          } catch {
            // Fallback to non-streaming
            logger.warn('Streaming failed, falling back to non-streaming');
            const response = await provider.chat(history);
            fullContent = response.content;
          }

          // 9. Add to history and notify state machine
          conversation.addAssistantMessage(fullContent);
          await stateMachine.onLLMResponseReady(fullContent);

          // 10. Clear avatar's buffer
          messageBuffer.clearBuffer(resolvedAvatarId);

          logger.info(`AI response to ${speaker} (${fullContent.length} chars): ${fullContent}`);
          res.send(fullContent);

          return;
        }

        // === LEGACY FLOW (NPC disabled) ===

        // Add user message to conversation with speaker context
        const messageWithSpeaker = `[${speaker}] ${userMessage}`;
        conversation.addUserMessage(messageWithSpeaker);

        // Get AI provider
        const provider = getConfiguredProvider(logger);
        logger.debug(`Using AI provider: ${provider.name}`);

        // Get history based on enabled features
        let history;
        if (config.memory.enabled) {
          history = conversation.getHistoryWithMemories(config.memory.tokenBudget);
        } else if (config.conversation.contextBudget.enabled) {
          history = conversation.getHistoryWithBudget();
        } else {
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

        // Handle NPC error
        if (config.npc.enabled && stateMachine) {
          await stateMachine.onLLMError();
        }

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
