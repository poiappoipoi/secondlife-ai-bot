import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { Request, Response } from 'express';
import { createSystemPromptRouter } from '../system-prompt';
import { ConversationService } from '../../services/conversation';
import { LoggerService } from '../../services/logger';

describe('System Prompt Router', () => {
  let conversation: ConversationService;
  let router: ReturnType<typeof createSystemPromptRouter>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    const logger = new LoggerService();
    conversation = new ConversationService(logger);
    router = createSystemPromptRouter(conversation);

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: mock((code: number) => mockResponse as Response),
      send: mock((body: string) => mockResponse as Response),
    };
  });

  const getHandler = (routerInstance: ReturnType<typeof createSystemPromptRouter>) => {
    const stack = (routerInstance as any).stack || [];
    const route = stack.find((layer: any) => 
      layer.route?.path === '/' && layer.route?.methods?.post
    );
    return route?.route?.stack?.[0]?.handle;
  };

  it('should return 400 if prompt is missing', async () => {
    mockRequest.body = {};
    
    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith('Please provide prompt content');
  });

  it('should return 400 if prompt is empty string', async () => {
    mockRequest.body = { prompt: '' };
    
    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.send).toHaveBeenCalledWith('Please provide prompt content');
  });

  it('should update system prompt', async () => {
    conversation.addUserMessage('Previous message');
    mockRequest.body = { prompt: 'New persona' };

    const saveSpy = mock(() => Promise.resolve());
    const loggerSave = (conversation as any).logger.saveConversation;
    (conversation as any).logger.saveConversation = saveSpy;

    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    expect(saveSpy).toHaveBeenCalled();
    expect(conversation.getSystemPrompt()).toBe('New persona');
    expect(mockResponse.send).toHaveBeenCalledWith('設定成功！我現在是：New persona');
    
    const history = conversation.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('New persona');

    (conversation as any).logger.saveConversation = loggerSave;
  });

  it('should save existing conversation before updating prompt', async () => {
    conversation.addUserMessage('Message 1');
    conversation.addAssistantMessage('Response 1');
    conversation.addUserMessage('Message 2');

    const saveSpy = mock(() => Promise.resolve());
    const loggerSave = (conversation as any).logger.saveConversation;
    (conversation as any).logger.saveConversation = saveSpy;

    mockRequest.body = { prompt: 'Updated persona' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const savedHistory = saveSpy.mock.calls[0][0];
    expect(savedHistory.length).toBe(4);

    (conversation as any).logger.saveConversation = loggerSave;
  });

  it('should handle prompt with special characters', async () => {
    mockRequest.body = { prompt: 'Persona with "quotes" and \'apostrophes\'' };

    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    expect(conversation.getSystemPrompt()).toBe('Persona with "quotes" and \'apostrophes\'');
    expect(mockResponse.send).toHaveBeenCalledWith(
      '設定成功！我現在是：Persona with "quotes" and \'apostrophes\''
    );
  });

  it('should reset conversation history when updating prompt', async () => {
    conversation.addUserMessage('Old message 1');
    conversation.addAssistantMessage('Old response 1');
    conversation.addUserMessage('Old message 2');

    mockRequest.body = { prompt: 'Fresh start' };
    const handler = getHandler(router);
    expect(handler).toBeDefined();
    
    await handler(mockRequest as Request, mockResponse as Response);
    const history = conversation.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('system');
    expect(history[0].content).toBe('Fresh start');
  });
});
