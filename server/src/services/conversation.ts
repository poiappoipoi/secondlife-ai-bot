/**
 * Conversation service - manages chat history, system prompt, and auto-save on inactivity
 */
import type { Message } from '../types/index';
import { config } from '../config/index';
import { LoggerService } from './logger';
import { PersonaService } from './persona';
import { MemoryService } from './memory';
import { estimateTokens, calculateMessagesFitInBudget } from '../utils/token-estimator';

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
  private readonly memoryService: MemoryService;
  private readonly inactivityTimeoutMs: number;
  private readonly maxHistoryMessages: number;
  private readonly budgetEnabled: boolean;
  private readonly maxContextTokens: number;
  private readonly systemPromptMaxPercent: number;

  constructor(logger: LoggerService, personaService: PersonaService, memoryService: MemoryService) {
    this.logger = logger;
    this.personaService = personaService;
    this.memoryService = memoryService;
    this.inactivityTimeoutMs = config.conversation.inactivityTimeoutMs;
    this.maxHistoryMessages = config.conversation.maxHistoryMessages;
    this.budgetEnabled = config.conversation.contextBudget.enabled;
    this.maxContextTokens = config.conversation.contextBudget.maxContextTokens;
    this.systemPromptMaxPercent = config.conversation.contextBudget.systemPromptMaxPercent;
    this.systemPrompt = this.personaService.getSystemPrompt();
    this.history = [{ role: 'system', content: this.systemPrompt }];
  }

  /**
   * Returns current conversation history
   */
  getHistory(): Message[] {
    this.logger.debug('Building prompt for LLM', {
      messageCount: this.history.length,
      messages: this.history.map((m) => ({
        role: m.role,
        contentPreview: m.content.substring(0, 100) + (m.content.length > 100 ? '...' : ''),
      })),
    });
    return this.history;
  }

  /**
   * Returns conversation history with token budget management
   * If budget is disabled, returns full history
   * If enabled, trims messages to fit within context window
   */
  getHistoryWithBudget(): Message[] {
    // If budget disabled, return full history
    if (!this.budgetEnabled) {
      return this.getHistory();
    }

    // Calculate budgets
    const systemMsg = this.history[0];
    const systemTokens = estimateTokens(systemMsg.content);
    const systemBudget = Math.floor((this.maxContextTokens * this.systemPromptMaxPercent) / 100);
    const historyBudget = this.maxContextTokens - Math.min(systemTokens, systemBudget);

    // Log warning if system prompt exceeds budget
    if (systemTokens > systemBudget) {
      this.logger.warn(
        `System prompt (${systemTokens} tokens) exceeds budget (${systemBudget} tokens)`
      );
    }

    // Calculate how many messages fit in history budget
    const conversationMsgs = this.history.slice(1);
    const messagesToInclude = calculateMessagesFitInBudget(conversationMsgs, historyBudget);

    // Log trimming if it occurs
    if (messagesToInclude < conversationMsgs.length) {
      this.logger.debug(
        `Context budget: Trimmed ${conversationMsgs.length - messagesToInclude} messages ` +
          `(keeping ${messagesToInclude}/${conversationMsgs.length} conversation messages)`
      );
    }

    // Return system + recent messages that fit
    const result = [systemMsg, ...conversationMsgs.slice(-messagesToInclude)];

    this.logger.debug('Building prompt for LLM with budget', {
      budgetEnabled: true,
      maxContextTokens: this.maxContextTokens,
      systemTokens,
      systemBudget,
      historyBudget,
      totalMessages: this.history.length,
      includedMessages: result.length,
      trimmedMessages: this.history.length - result.length,
    });

    return result;
  }

  /**
   * Returns conversation history with relevant memories injected
   * Memories are keyword-matched based on recent messages and injected after system prompt
   * @param memoryTokenBudget - Maximum tokens to allocate for memories (default: 500)
   * @returns Message array with system prompt, memories, and chat history
   */
  getHistoryWithMemories(memoryTokenBudget: number = 500): Message[] {
    // Get recent messages for keyword matching (last 5 messages)
    const conversationMsgs = this.history.slice(1);
    const recentMessages = conversationMsgs.slice(-5).map((m) => m.content);

    // Retrieve relevant memories based on keywords
    const memories = this.memoryService.getRelevantMemories(recentMessages, memoryTokenBudget);

    // Build final context: [system] + [memories] + [chat history]
    const systemMsg = this.history[0];
    const memoryMessages: Message[] = memories.map((m) => ({
      role: 'system' as const,
      content: `[Memory] ${m.content}`,
    }));

    // Apply budget trimming to chat history if enabled
    let chatHistory = conversationMsgs;
    if (this.budgetEnabled) {
      // Calculate remaining budget after system + memories
      const systemTokens = estimateTokens(systemMsg.content);
      const memoryTokens = memories.reduce((sum, m) => sum + estimateTokens(m.content), 0);
      const usedTokens = systemTokens + memoryTokens;
      const historyBudget = Math.max(0, this.maxContextTokens - usedTokens);

      const messagesToInclude = calculateMessagesFitInBudget(conversationMsgs, historyBudget);
      chatHistory = conversationMsgs.slice(-messagesToInclude);

      this.logger.debug('Building prompt with memories and budget', {
        systemTokens,
        memoryTokens,
        memoryCount: memories.length,
        historyBudget,
        chatMessagesIncluded: chatHistory.length,
        chatMessagesTrimmed: conversationMsgs.length - chatHistory.length,
      });
    } else if (memories.length > 0) {
      this.logger.debug('Building prompt with memories', {
        memoryCount: memories.length,
        chatMessages: chatHistory.length,
      });
    }

    return [systemMsg, ...memoryMessages, ...chatHistory];
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
    this.logger.debug(`Added user message to history (total: ${this.history.length} messages)`);
    this.resetInactivityTimer();
  }

  /**
   * Adds assistant message to history and trims if needed
   */
  addAssistantMessage(content: string): void {
    this.history.push({ role: 'assistant', content });
    this.logger.debug(
      `Added assistant message to history (total: ${this.history.length} messages)`
    );
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
      const originalLength = this.history.length;
      // Keep system prompt (first message) and most recent message pairs
      const systemMessage = this.history[0];
      const recentMessages = this.history.slice(-this.maxHistoryMessages);
      this.history = [systemMessage, ...recentMessages];
      this.logger.debug(
        `History trimmed: ${originalLength} → ${this.history.length} messages (kept system + last ${this.maxHistoryMessages})`
      );
    } catch (error) {
      // Log but continue - trimming is non-critical
      this.logger.error('Error trimming history', error);
    }
  }

  /**
   * Removes last message from history (used for error recovery)
   */
  removeLastMessage(): void {
    if (this.history.length > 1) {
      this.history.pop();
      this.logger.debug(`Removed last message from history (remaining: ${this.history.length})`);
    }
  }


  /**
   * Saves conversation to log file and resets history
   * Preserves system prompt across resets
   * Logging is fire-and-forget to avoid blocking
   */
  async saveAndReset(reason: string): Promise<void> {
    // Fire-and-forget logging - don't block on file I/O
    if (this.history.length > 1) {
      this.logger.info(
        `Saving conversation history before reset (${this.history.length} messages)`
      );
      void this.logger.saveConversation(this.history, reason).catch((error) => {
        this.logger.error('Failed to save conversation log', error);
      });
    }

    // Reset immediately without waiting for logging
    this.history = [{ role: 'system', content: this.systemPrompt }];
    this.clearInactivityTimer();
    this.logger.info('Memory reset - conversation cleared');
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
