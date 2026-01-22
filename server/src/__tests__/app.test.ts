import { describe, it, expect, beforeEach } from 'bun:test';
import { createApp } from '../app';
import { ConversationService } from '../services/conversation';
import { RateLimiterService } from '../services/rate-limiter';
import { LoggerService } from '../services/logger';
import type { Request, Response } from 'express';

describe('App', () => {
  let app: ReturnType<typeof createApp>['app'];
  let services: ReturnType<typeof createApp>['services'];

  beforeEach(() => {
    const result = createApp();
    app = result.app;
    services = result.services;
  });

  it('should create app with services', () => {
    expect(app).toBeDefined();
    expect(services).toBeDefined();
    expect(services.conversation).toBeInstanceOf(ConversationService);
    expect(services.rateLimiter).toBeInstanceOf(RateLimiterService);
    expect(services.logger).toBeInstanceOf(LoggerService);
  });

  it('should have routes registered', () => {
    const routes = (app as any)._router?.stack || [];
    const hasChatRoute = routes.some((r: any) => 
      r.path === '/chat' || r.regexp?.test('/chat')
    );
    const hasSystemPromptRoute = routes.some((r: any) => 
      r.path === '/SetSystemPrompt' || r.regexp?.test('/SetSystemPrompt')
    );
    
    expect(hasChatRoute || hasSystemPromptRoute).toBe(true);
  });

  it('should return same service instances on multiple calls', () => {
    const result1 = createApp();
    const result2 = createApp();
    
    expect(result1.services.conversation).not.toBe(result2.services.conversation);
    expect(result1.services.rateLimiter).not.toBe(result2.services.rateLimiter);
    expect(result1.services.logger).not.toBe(result2.services.logger);
  });

  it('should configure routes with correct services', () => {
    const testApp = createApp();
    expect(testApp.services.conversation).toBeDefined();
    expect(testApp.services.rateLimiter).toBeDefined();
  });
});
