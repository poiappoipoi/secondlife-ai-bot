/**
 * Express application factory - sets up middleware, routes, and services
 */
import express, { Application } from 'express';
import { createChatRouter, createSystemPromptRouter, createMemoryRouter } from './routes/index';
import {
  ConversationService,
  RateLimiterService,
  LoggerService,
  PersonaService,
  MemoryService,
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
  memory: MemoryService;
}

/**
 * Creates and configures the Express application with routes and services
 * @returns Express app instance and service instances
 */
/**
 * Initialize facts from persona as high-priority memories
 * @param memory - Memory service instance
 * @param persona - Persona service instance
 */
function initializeMemories(memory: MemoryService, persona: PersonaService): void {
  const facts = persona.getFacts();

  // Inject character facts as highest-priority memories
  for (const [key, value] of Object.entries(facts.character)) {
    // Split value by commas and use as keywords along with the key
    const valueKeywords = value
      .split(/[,，]/g)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    memory.add({
      keywords: [key, ...valueKeywords],
      content: `Character: ${key} = ${value}`,
      priority: 10, // Highest priority
    });
  }

  // Inject world facts as high-priority memories
  for (const [key, value] of Object.entries(facts.world)) {
    memory.add({
      keywords: [key],
      content: `World: ${key} = ${value}`,
      priority: 8, // High priority
    });
  }

  const totalFacts = Object.keys(facts.character).length + Object.keys(facts.world).length;
  if (totalFacts > 0) {
    console.log(`[Memory] Initialized ${memory.count()} fact-based memories`);
  }
}

export async function createApp(): Promise<{ app: Application; services: AppServices }> {
  const app = express();

  app.use(express.json());

  const logger = new LoggerService();
  const persona = new PersonaService(config.persona.personasDir);
  const memory = new MemoryService(logger);

  // Load persona from configured file
  await persona.loadPersona(config.persona.personaFile);

  // Initialize facts as memories
  if (config.memory.enabled) {
    initializeMemories(memory, persona);
  }

  const conversation = new ConversationService(logger, persona, memory);
  const rateLimiter = new RateLimiterService();

  app.use('/chat', createChatRouter(conversation, rateLimiter, logger));
  app.use('/SetSystemPrompt', createSystemPromptRouter(conversation));
  app.use('/memory', createMemoryRouter(conversation, logger));

  return {
    app,
    services: { conversation, rateLimiter, logger, persona, memory },
  };
}
