/**
 * Message Buffer Service
 * Buffers messages from multiple avatars and manages aggregation/expiry
 */

import { randomUUID } from 'crypto';
import type {
  BufferedMessage,
  AvatarBuffer,
  BufferConfig,
} from '../types/npc';
import { LoggerService } from './logger';

export class MessageBufferService {
  private buffers: Map<string, AvatarBuffer> = new Map();
  private config: BufferConfig;

  constructor(
    private logger: LoggerService,
    config: BufferConfig
  ) {
    this.config = config;
  }

  /**
   * Add a message to buffer for an avatar
   */
  addMessage(
    avatarId: string,
    avatarName: string,
    content: string,
    isDirectMention: boolean
  ): BufferedMessage {
    const message: BufferedMessage = {
      id: randomUUID(),
      avatarId,
      avatarName,
      content,
      receivedAt: Date.now(),
      isDirectMention,
    };

    // Get or create buffer for this avatar
    if (!this.buffers.has(avatarId)) {
      this.buffers.set(avatarId, {
        avatarId,
        avatarName,
        messages: [],
        firstMessageAt: Date.now(),
        lastMessageAt: Date.now(),
        totalMessages: 0,
        lastRespondedAt: null,
      });
    }

    const buffer = this.buffers.get(avatarId)!;

    // Add message
    buffer.messages.push(message);
    buffer.lastMessageAt = Date.now();
    buffer.totalMessages++;

    // Enforce max messages per avatar
    if (buffer.messages.length > this.config.maxMessagesPerAvatar) {
      const removed = buffer.messages.shift();
      this.logger.debug(
        `Buffer overflow for ${avatarName}: removed message ${removed?.id}`
      );
    }

    // Check total buffer size
    this.cleanExpiredMessages();
    if (this.getTotalBufferSize() > this.config.maxTotalBufferSize) {
      this.evictOldestMessage();
    }

    return message;
  }

  /**
   * Get aggregated content for an avatar (merge recent messages)
   */
  getAggregatedContent(avatarId: string): string {
    const buffer = this.buffers.get(avatarId);
    if (!buffer || buffer.messages.length === 0) {
      return '';
    }

    const now = Date.now();
    const windowMs = this.config.aggregationWindowMs;

    // Include all messages within the aggregation window
    const aggregated = buffer.messages
      .filter((msg) => now - msg.receivedAt <= windowMs || buffer.messages.length === 1)
      .map((msg) => msg.content)
      .join(' ');

    return aggregated;
  }

  /**
   * Get all avatar buffers for decision layer
   */
  getAllBuffers(): Map<string, AvatarBuffer> {
    return new Map(this.buffers);
  }

  /**
   * Get specific avatar buffer
   */
  getBuffer(avatarId: string): AvatarBuffer | undefined {
    return this.buffers.get(avatarId);
  }

  /**
   * Clear messages for an avatar but preserve buffer metadata
   * This keeps lastRespondedAt so recent interaction bonus applies to next message
   */
  clearBuffer(avatarId: string): void {
    const buffer = this.buffers.get(avatarId);
    if (buffer) {
      this.logger.debug(`Cleared ${buffer.messages.length} messages for ${buffer.avatarName}`);
      // Clear only messages, keep buffer entry to preserve lastRespondedAt
      buffer.messages = [];
      buffer.totalMessages = 0;
    }
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    this.buffers.clear();
  }

  /**
   * Update last responded time for avatar
   */
  updateLastResponded(avatarId: string): void {
    const buffer = this.buffers.get(avatarId);
    if (buffer) {
      buffer.lastRespondedAt = Date.now();
    }
  }

  /**
   * Remove expired messages from all buffers
   */
  cleanExpiredMessages(): void {
    const now = Date.now();
    const expiryMs = this.config.expiryMs;

    for (const [avatarId, buffer] of this.buffers.entries()) {
      const initialCount = buffer.messages.length;

      // Keep only non-expired messages
      buffer.messages = buffer.messages.filter((msg) => now - msg.receivedAt <= expiryMs);
      buffer.totalMessages = buffer.messages.length;

      // Remove empty buffers
      if (buffer.messages.length === 0) {
        this.buffers.delete(avatarId);
        if (initialCount > 0) {
          this.logger.debug(`Expired all messages for ${buffer.avatarName}`);
        }
      }
    }
  }

  /**
   * Get total number of buffered messages across all avatars
   */
  getTotalBufferSize(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      total += buffer.messages.length;
    }
    return total;
  }

  /**
   * Remove oldest message from any buffer (for overflow)
   */
  private evictOldestMessage(): void {
    let oldestMessage: BufferedMessage | null = null;
    let oldestBufferId: string | null = null;

    // Find the oldest message across all buffers
    for (const [avatarId, buffer] of this.buffers.entries()) {
      if (buffer.messages.length === 0) continue;

      const first = buffer.messages[0];
      if (!oldestMessage || first.receivedAt < oldestMessage.receivedAt) {
        oldestMessage = first;
        oldestBufferId = avatarId;
      }
    }

    if (oldestBufferId && oldestMessage) {
      const buffer = this.buffers.get(oldestBufferId)!;
      buffer.messages.shift();
      buffer.totalMessages--;

      this.logger.debug(
        `Evicted oldest message for ${buffer.avatarName} (total buffer at ${this.getTotalBufferSize()}/${this.config.maxTotalBufferSize})`
      );

      // Remove empty buffers
      if (buffer.messages.length === 0) {
        this.buffers.delete(oldestBufferId);
      }
    }
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    totalAvatars: number;
    totalMessages: number;
    buffers: Array<{
      avatarName: string;
      messageCount: number;
      ageMs: number;
    }>;
  } {
    const stats = {
      totalAvatars: this.buffers.size,
      totalMessages: this.getTotalBufferSize(),
      buffers: Array.from(this.buffers.values()).map((b) => ({
        avatarName: b.avatarName,
        messageCount: b.messages.length,
        ageMs: Date.now() - b.firstMessageAt,
      })),
    };
    return stats;
  }
}
