import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ConversationService } from '../conversation';
import { LoggerService } from '../logger';
import type { Message } from '../../types';

describe('ConversationService', () => {
  let logger: LoggerService;
  let conversation: ConversationService;

  beforeEach(() => {
    logger = new LoggerService();
    conversation = new ConversationService(logger);
  });

  afterEach(() => {
    conversation.destroy();
  });

  describe('getHistory', () => {
    it('should return initial history with system prompt', () => {
      const history = conversation.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBeDefined();
    });
  });

  describe('getSystemPrompt', () => {
    it('should return current system prompt', () => {
      const prompt = conversation.getSystemPrompt();
      expect(typeof prompt).toBe('string');
    });
  });

  describe('addUserMessage', () => {
    it('should add user message to history', () => {
      conversation.addUserMessage('Hello');
      const history = conversation.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1].role).toBe('user');
      expect(history[1].content).toBe('Hello');
    });

    it('should add multiple user messages', () => {
      conversation.addUserMessage('First');
      conversation.addUserMessage('Second');
      const history = conversation.getHistory();
      expect(history).toHaveLength(3);
      expect(history[1].content).toBe('First');
      expect(history[2].content).toBe('Second');
    });
  });

  describe('addAssistantMessage', () => {
    it('should add assistant message to history', () => {
      conversation.addUserMessage('Hello');
      conversation.addAssistantMessage('Hi there!');
      const history = conversation.getHistory();
      expect(history).toHaveLength(3);
      expect(history[2].role).toBe('assistant');
      expect(history[2].content).toBe('Hi there!');
    });
  });

  describe('removeLastMessage', () => {
    it('should remove last message from history', () => {
      conversation.addUserMessage('Hello');
      conversation.addAssistantMessage('Hi');
      expect(conversation.getHistory()).toHaveLength(3);
      
      conversation.removeLastMessage();
      const history = conversation.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1].content).toBe('Hello');
    });

    it('should not remove system message', () => {
      conversation.removeLastMessage();
      const history = conversation.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
    });
  });

  describe('setSystemPrompt', () => {
    it('should update system prompt and reset history', async () => {
      conversation.addUserMessage('Hello');
      conversation.addAssistantMessage('Hi');
      expect(conversation.getHistory()).toHaveLength(3);

      const saveSpy = mock(() => Promise.resolve());
      const loggerSave = logger.saveConversation;
      logger.saveConversation = saveSpy as typeof logger.saveConversation;

      await conversation.setSystemPrompt('New persona');
      
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(conversation.getSystemPrompt()).toBe('New persona');
      const history = conversation.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBe('New persona');

      logger.saveConversation = loggerSave;
    });

    it('should preserve new system prompt after reset', async () => {
      await conversation.setSystemPrompt('Custom prompt');
      await conversation.saveAndReset('Test');
      
      expect(conversation.getSystemPrompt()).toBe('Custom prompt');
      const history = conversation.getHistory();
      expect(history[0].content).toBe('Custom prompt');
    });
  });

  describe('saveAndReset', () => {
    it('should save conversation and reset history', async () => {
      conversation.addUserMessage('Hello');
      conversation.addAssistantMessage('Hi');

      const saveSpy = mock(() => Promise.resolve());
      const loggerSave = logger.saveConversation;
      logger.saveConversation = saveSpy as typeof logger.saveConversation;

      await conversation.saveAndReset('Test reason');

      expect(saveSpy).toHaveBeenCalledTimes(1);
      const savedHistory = saveSpy.mock.calls[0][0] as Message[];
      expect(savedHistory).toHaveLength(3);
      
      const history = conversation.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');

      logger.saveConversation = loggerSave;
    });

    it('should not save if only system message exists', async () => {
      const saveSpy = mock(() => Promise.resolve());
      const loggerSave = logger.saveConversation;
      logger.saveConversation = saveSpy as typeof logger.saveConversation;

      await conversation.saveAndReset('Test');

      expect(saveSpy).not.toHaveBeenCalled();
      const history = conversation.getHistory();
      expect(history).toHaveLength(1);

      logger.saveConversation = loggerSave;
    });

    it('should preserve system prompt after reset', async () => {
      const originalPrompt = conversation.getSystemPrompt();
      await conversation.saveAndReset('Test');
      
      expect(conversation.getSystemPrompt()).toBe(originalPrompt);
      const history = conversation.getHistory();
      expect(history[0].content).toBe(originalPrompt);
    });
  });

  describe('inactivity timer', () => {
    it('should reset timer on user message', async () => {
      const originalTimeout = 100;
      const conversationWithShortTimeout = new ConversationService(logger);
      
      const saveSpy = mock(() => Promise.resolve());
      const loggerSave = logger.saveConversation;
      logger.saveConversation = saveSpy as typeof logger.saveConversation;

      conversationWithShortTimeout.addUserMessage('First');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      conversationWithShortTimeout.addUserMessage('Second');
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(saveSpy).not.toHaveBeenCalled();

      conversationWithShortTimeout.destroy();
      logger.saveConversation = loggerSave;
    });
  });

  describe('destroy', () => {
    it('should clear inactivity timer', () => {
      conversation.addUserMessage('Test');
      conversation.destroy();
      conversation.destroy();
    });
  });
});
