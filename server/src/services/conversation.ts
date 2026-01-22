/**
 * Conversation service - manages chat history, system prompt, and auto-save on inactivity
 */
import type { Message } from '../types/index';
import { config } from '../config/index';
import { LoggerService } from './logger';

/**
 * Manages conversation state including message history and system prompt
 * Automatically saves and resets conversation after inactivity timeout
 */
export class ConversationService {
  private history: Message[];
  private systemPrompt: string;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly logger: LoggerService;
  private readonly inactivityTimeoutMs: number;

  constructor(logger: LoggerService) {
    this.logger = logger;
    this.inactivityTimeoutMs = config.conversation.inactivityTimeoutMs;
    this.systemPrompt = config.conversation.defaultSystemPrompt;
    this.history = [{ role: 'system', content: this.systemPrompt }];
  }

  /**
   * Returns current conversation history
   */
  getHistory(): Message[] {
    return this.history;
  }

  /**
   * Returns current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Adds user message to history and resets inactivity timer
   */
  addUserMessage(content: string): void {
    this.history.push({ role: 'user', content });
    this.resetInactivityTimer();
  }

  /**
   * Adds assistant message to history
   */
  addAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content });
  }

  /**
   * Removes last message from history (used for error recovery)
   */
  removeLastMessage(): void {
    if (this.history.length > 1) {
      this.history.pop();
    }
  }

  /**
   * Updates system prompt and resets conversation
   * Saves existing conversation before resetting
   */
  async setSystemPrompt(newPrompt: string): Promise<void> {
    await this.saveAndReset('System prompt changed');

    this.systemPrompt = newPrompt;
    this.history = [{ role: 'system', content: newPrompt }];
  }

  /**
   * Saves conversation to log file and resets history
   * Preserves system prompt across resets
   */
  async saveAndReset(reason: string): Promise<void> {
    if (this.history.length > 1) {
      await this.logger.saveConversation(this.history, reason);
    }

    this.history = [{ role: 'system', content: this.systemPrompt }];
    this.clearInactivityTimer();
    console.log('--- Memory reset ---');
  }

  /**
   * Resets inactivity timer - called on each user message
   */
  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(async () => {
      await this.saveAndReset('Inactivity timeout (1 hour)');
    }, this.inactivityTimeoutMs);
  }

  /**
   * Clears inactivity timer
   */
  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  /**
   * Cleanup method - clears timers
   */
  destroy(): void {
    this.clearInactivityTimer();
  }
}
