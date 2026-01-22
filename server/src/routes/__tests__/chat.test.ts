import { describe, it, expect, beforeEach, mock, spyOn, afterEach } from 'bun:test';
import { Request, Response } from 'express';
import { createChatRouter } from '../chat';
import { ConversationService } from '../../services/conversation';
import { RateLimiterService } from '../../services/rate-limiter';
import { LoggerService } from '../../services/logger';
import type { AIProvider, AIProviderResponse } from '../../types';
import * as providers from '../../providers';

describe('Chat Router', () => {
  let conversation: ConversationService;
  let rateLimiter: RateLimiterService;
  let router: ReturnType<typeof createChatRouter>;
  let mockProvider: AIProvider;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let getProviderSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    const logger = new LoggerService();
    conversation = new ConversationService(logger);
    rateLimiter = new RateLimiterService();
    router = createChatRouter(conversation, rateLimiter);

    mockProvider = {
      name: 'Test Provider',
      isConfigured: true,
      chat: mock(() => Promise.resolve({ content: 'Test response' } as AIProviderResponse)),
    };

    getProviderSpy = spyOn(providers, 'getConfiguredProvider').mockReturnValue(mockProvider);

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: mock((_code: number) => mockResponse as Response),
      send: mock((_body: string) => mockResponse as Response),
    };
  });

  afterEach(() => {
    getProviderSpy.mockRestore();
  });

  const getHandler = (routerInstance: ReturnType<typeof createChatRouter>) => {
    const stack = (routerInstance as any).stack || [];
    const route = stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route?.methods?.post
    );
    return route?.route?.stack?.[0]?.handle;
  };

  it('should return 400 if message is missing', async () => {
    mockRequest.body = {};

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith('Error: No message content received');
  });

  it('should return 400 if message is empty string', async () => {
    mockRequest.body = { message: '' };

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith('Error: No message content received');
  });

  it('should handle reset command', async () => {
    conversation.addUserMessage('Previous message');
    mockRequest.body = { message: 'reset' };

    const saveSpy = mock(() => Promise.resolve());
    const loggerSave = (conversation as any).logger.saveConversation;
    (conversation as any).logger.saveConversation = saveSpy;

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(saveSpy).toHaveBeenCalled();
    expect(mockResponse.send).toHaveBeenCalledWith(
      '【Memory cleared】Your conversation has been saved!'
    );
    expect(conversation.getHistory()).toHaveLength(1);

    (conversation as any).logger.saveConversation = loggerSave;
  });

  it('should handle Chinese reset command', async () => {
    conversation.addUserMessage('Previous message');
    mockRequest.body = { message: '清除' };

    const saveSpy = mock(() => Promise.resolve());
    const loggerSave = (conversation as any).logger.saveConversation;
    (conversation as any).logger.saveConversation = saveSpy;

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(saveSpy).toHaveBeenCalled();
    expect(mockResponse.send).toHaveBeenCalledWith(
      '【Memory cleared】Your conversation has been saved!'
    );

    (conversation as any).logger.saveConversation = loggerSave;
  });

  it('should process valid message and return AI response', async () => {
    mockRequest.body = { message: 'Hello' };

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockProvider.chat).toHaveBeenCalled();
    expect(mockResponse.send).toHaveBeenCalledWith('Test response');
    expect(conversation.getHistory().length).toBeGreaterThan(1);
  });

  it('should add user and assistant messages to conversation', async () => {
    mockRequest.body = { message: 'Test message' };

    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    const history = conversation.getHistory();
    expect(history[history.length - 2].role).toBe('user');
    expect(history[history.length - 2].content).toBe('Test message');
    expect(history[history.length - 1].role).toBe('assistant');
    expect(history[history.length - 1].content).toBe('Test response');
  });

  it('should handle rate limiting', async () => {
    const maxRequests = 40;
    const customRateLimiter = new RateLimiterService();
    const customRouter = createChatRouter(conversation, customRateLimiter);

    for (let i = 0; i < maxRequests; i++) {
      customRateLimiter.check();
    }

    mockRequest.body = { message: 'Should be blocked' };
    const handler = getHandler(customRouter);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(429);
    expect(mockResponse.send).toHaveBeenCalledWith(
      expect.stringContaining('API request limit reached')
    );
  });

  it('should handle provider errors', async () => {
    const errorProvider = {
      name: 'Error Provider',
      isConfigured: true,
      chat: mock(() => Promise.reject(new Error('API error'))),
    };

    getProviderSpy.mockReturnValue(errorProvider);

    mockRequest.body = { message: 'Test' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith(expect.stringContaining('API error'));
  });

  it('should handle HTTP error responses', async () => {
    const httpErrorProvider = {
      name: 'HTTP Error Provider',
      isConfigured: true,
      chat: mock(() => Promise.reject(new Error('HTTP 401 Unauthorized: Invalid API key'))),
    };

    getProviderSpy.mockReturnValue(httpErrorProvider);

    mockRequest.body = { message: 'Test' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.send).toHaveBeenCalledWith(
      expect.stringContaining('API error (401 Unauthorized)')
    );
  });

  it('should remove last message on error', async () => {
    conversation.addUserMessage('Previous');
    const errorProvider = {
      name: 'Error Provider',
      isConfigured: true,
      chat: mock(() => Promise.reject(new Error('Test error'))),
    };

    getProviderSpy.mockReturnValue(errorProvider);

    mockRequest.body = { message: 'Failing message' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    const history = conversation.getHistory();
    expect(history[history.length - 1].content).toBe('Previous');
  });

  it('should handle non-Error exceptions', async () => {
    const throwProvider = {
      name: 'Throw Provider',
      isConfigured: true,
      chat: mock(() => Promise.reject('String error')),
    };

    getProviderSpy.mockReturnValue(throwProvider);

    mockRequest.body = { message: 'Test' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();

    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith('Connection error');
  });
});
