/**
 * Conversation and message type definitions
 */

/**
 * Role of a message in the conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Single message in conversation history
 */
export interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Complete conversation state snapshot
 */
export interface ConversationState {
  history: Message[];
  systemPrompt: string;
  lastActivityTime: number;
}
