/**
 * Express application factory - sets up middleware, routes, and services
 */
import express, { Application } from 'express';
import { createChatRouter, createSystemPromptRouter } from './routes/index';
import {
  ConversationService,
  RateLimiterService,
  LoggerService,
  PersonaService,
} from './services/index';
import { config } from './config/index';

/**
 * Container for all application services
 */
export interface AppServices {
  conversation: ConversationService;
  rateLimiter: RateLimiterService;
  logger: LoggerService;
  persona: PersonaService;
}

/**
 * Creates and configures the Express application with routes and services
 * @returns Express app instance and service instances
 */
export async function createApp(): Promise<{ app: Application; services: AppServices }> {
  const app = express();

  app.use(express.json());

  const logger = new LoggerService();
  const persona = new PersonaService(config.persona.personasDir);

  // Load persona from configured file
  await persona.loadPersona(config.persona.personaFile);

  const conversation = new ConversationService(logger, persona);
  const rateLimiter = new RateLimiterService();

  app.use('/chat', createChatRouter(conversation, rateLimiter));
  app.use('/SetSystemPrompt', createSystemPromptRouter(conversation));

  return {
    app,
    services: { conversation, rateLimiter, logger, persona },
  };
}
