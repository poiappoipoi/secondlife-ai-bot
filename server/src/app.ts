/**
 * Express application factory - sets up middleware, routes, and services
 */
import express, { Application } from 'express';
import { createChatRouter, createSystemPromptRouter } from './routes/index';
import { ConversationService, RateLimiterService, LoggerService } from './services/index';

/**
 * Container for all application services
 */
export interface AppServices {
  conversation: ConversationService;
  rateLimiter: RateLimiterService;
  logger: LoggerService;
}

/**
 * Creates and configures the Express application with routes and services
 * @returns Express app instance and service instances
 */
export function createApp(): { app: Application; services: AppServices } {
  const app = express();

  app.use(express.json());

  const logger = new LoggerService();
  const conversation = new ConversationService(logger);
  const rateLimiter = new RateLimiterService();

  app.use('/chat', createChatRouter(conversation, rateLimiter));
  app.use('/SetSystemPrompt', createSystemPromptRouter(conversation));

  return {
    app,
    services: { conversation, rateLimiter, logger },
  };
}
