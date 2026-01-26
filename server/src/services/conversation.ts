/**
 * Conversation service - manages chat history, system prompt, and auto-save on inactivity
 */
import type { Message } from '../types/index';
import { config } from '../config/index';
import { LoggerService } from './logger';
import { PersonaService } from './persona';

/**
 * Manages conversation state including message history and system prompt
 * Automatically saves and resets conversation after inactivity timeout
 */
export class ConversationService {
  private history: Message[];
  private systemPrompt: string;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly logger: LoggerService;
  private readonly personaService: PersonaService;
  private readonly inactivityTimeoutMs: number;
  private readonly maxHistoryMessages: number;

  constructor(logger: LoggerService, personaService: PersonaService) {
    this.logger = logger;
    this.personaService = personaService;
    this.inactivityTimeoutMs = config.conversation.inactivityTimeoutMs;
    this.maxHistoryMessages = config.conversation.maxHistoryMessages;
    this.systemPrompt = this.personaService.getSystemPrompt();
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
   * Adds assistant message to history and trims if needed
   */
  addAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content });
    this.trimHistory();
  }

  /**
   * Trims conversation history to keep only recent messages
   * Always keeps system prompt (first message) and most recent N message pairs
   */
  private trimHistory(): void {
    if (this.history.length <= this.maxHistoryMessages + 1) {
      return;
    }

    try {
      // Keep system prompt (first message) and most recent message pairs
      const systemMessage = this.history[0];
      const recentMessages = this.history.slice(-this.maxHistoryMessages);
      this.history = [systemMessage, ...recentMessages];
    } catch (error) {
      // Log but continue - trimming is non-critical
      console.error('Error trimming history:', error);
    }
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
   * Logging is fire-and-forget to avoid blocking
   */
  async saveAndReset(reason: string): Promise<void> {
    // Fire-and-forget logging - don't block on file I/O
    if (this.history.length > 1) {
      void this.logger.saveConversation(this.history, reason).catch((error) => {
        console.error('Failed to save conversation log:', error);
      });
    }

    // Reset immediately without waiting for logging
    this.history = [{ role: 'system', content: this.systemPrompt }];
    this.clearInactivityTimer();
    console.log('--- Memory reset ---');
    await Promise.resolve(); // Satisfy async requirement
  }

  /**
   * Resets inactivity timer - called on each user message
   */
  private resetInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      void this.saveAndReset('Inactivity timeout (1 hour)');
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
