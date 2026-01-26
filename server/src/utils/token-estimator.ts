/**
 * Token estimation utilities for context budget management
 * Uses simple character-based estimation (4 chars ≈ 1 token)
 */
import type { Message } from '../types/index';

/**
 * Characters per token - approximate ratio for most models
 * Based on empirical observation that 1 token ≈ 4 characters
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimates token count for a text string
 * @param text - Text to estimate tokens for
 * @returns Estimated number of tokens
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates total token count for an array of messages
 * @param messages - Array of messages to estimate
 * @returns Total estimated token count
 */
export function estimateMessagesTokens(messages: Message[]): number {
  if (!messages || messages.length === 0) return 0;

  let totalTokens = 0;
  for (const message of messages) {
    // Account for role formatting overhead (~5 tokens per message)
    totalTokens += estimateTokens(message.content) + 5;
  }

  return totalTokens;
}

/**
 * Calculates how many messages from the end of the array fit within the budget
 * @param messages - Array of messages (ordered oldest to newest)
 * @param budget - Token budget available
 * @returns Number of messages that fit (from the end)
 */
export function calculateMessagesFitInBudget(messages: Message[], budget: number): number {
  if (!messages || messages.length === 0 || budget <= 0) return 0;

  let tokenCount = 0;
  let messageCount = 0;

  // Process messages in reverse order (newest first)
  for (let i = messages.length - 1; i >= 0; i--) {
    const messageTokens = estimateTokens(messages[i].content) + 5; // +5 for role overhead

    if (tokenCount + messageTokens <= budget) {
      tokenCount += messageTokens;
      messageCount++;
    } else {
      // Budget exceeded, stop
      break;
    }
  }

  return messageCount;
}
