import express, { Application } from 'express';
import { createChatRouter, createSystemPromptRouter } from './routes/index.js';
import { ConversationService, RateLimiterService, LoggerService } from './services/index.js';

export interface AppServices {
  conversation: ConversationService;
  rateLimiter: RateLimiterService;
  logger: LoggerService;
}

export function createApp(): { app: Application; services: AppServices } {
  const app = express();

  // Middleware
  app.use(express.json());

  // Initialize services
  const logger = new LoggerService();
  const conversation = new ConversationService(logger);
  const rateLimiter = new RateLimiterService();

  // Routes
  app.use('/chat', createChatRouter(conversation, rateLimiter));
  app.use('/SetSystemPrompt', createSystemPromptRouter(conversation));

  return {
    app,
    services: { conversation, rateLimiter, logger },
  };
}
