/**
 * Decision Layer Service
 * Evaluates buffered messages and decides who (if anyone) to respond to
 */

import type {
  AvatarBuffer,
  DecisionConfig,
  DecisionResult,
} from '../types/npc';
import { LoggerService } from './logger';

export class DecisionLayerService {
  private lastResponseTime: Map<string, number> = new Map();
  private lastDecision: Map<string, DecisionResult> = new Map(); // Track previous decisions for logging
  private config: DecisionConfig;

  constructor(
    private logger: LoggerService,
    config: DecisionConfig
  ) {
    this.config = config;
  }

  /**
   * Make decision about who (if anyone) to respond to
   */
  makeDecision(
    buffers: Map<string, AvatarBuffer>
  ): DecisionResult {
    // No buffers = no decision
    if (buffers.size === 0) {
      return {
        shouldRespond: false,
        targetAvatarId: null,
        reason: 'no messages buffered',
        priorityScore: 0,
      };
    }

    let bestAvatarId: string | null = null;
    let bestScore = -Infinity;
    const scoreDetails = new Map<string, string>();

    // Evaluate each avatar
    for (const [avatarId, buffer] of buffers.entries()) {
      const score = this.calculatePriority(buffer);
      scoreDetails.set(avatarId, this.formatScoreDetails(buffer, score));

      if (score > bestScore) {
        bestScore = score;
        bestAvatarId = avatarId;
      }
    }

    // Check if best score meets threshold
    const meetsThreshold = bestScore >= this.config.responseThreshold;
    const passesChance = Math.random() < this.config.responseChance;
    const shouldRespond = meetsThreshold && passesChance;

    // Check cooldown on chosen avatar (but allow if engaged in active conversation)
    if (shouldRespond && bestAvatarId) {
      const lastResponse = this.lastResponseTime.get(bestAvatarId) ?? 0;
      const timeSinceLastResponse = Date.now() - lastResponse;
      const buffer = buffers.get(bestAvatarId);

      // Allow rapid responses if there are multiple messages (engaged conversation)
      // Otherwise enforce cooldown to prevent spam from single avatar
      const isActiveConversation = buffer && buffer.totalMessages > 1;

      if (timeSinceLastResponse < this.config.cooldownMs && !isActiveConversation) {
        // Cooldown prevents response (only for single-message cases)
        this.logger.debug(
          `Cooldown active for ${bestAvatarId} (${Math.round(
            this.config.cooldownMs - timeSinceLastResponse
          )}ms remaining)`
        );

        return {
          shouldRespond: false,
          targetAvatarId: null,
          reason: `cooldown active (${Math.round(timeSinceLastResponse)}ms)`,
          priorityScore: bestScore,
        };
      }
    }

    // Log decision details ONLY if decision changed (reduce log spam)
    if (bestAvatarId) {
      const previousDecision = this.lastDecision.get(bestAvatarId);
      const decisionChanged =
        !previousDecision ||
        previousDecision.shouldRespond !== shouldRespond ||
        previousDecision.reason !== this.getCurrentReasonCode(shouldRespond);

      if (decisionChanged) {
        this.logger.debug(
          `Decision: ${shouldRespond ? 'RESPOND' : 'IGNORE'} to ${buffers.get(bestAvatarId)?.avatarName} ` +
            `(score: ${bestScore.toFixed(0)}, threshold: ${this.config.responseThreshold}, ` +
            `chance: ${(this.config.responseChance * 100).toFixed(0)}%)`
        );

        // Log all scores for analysis (only on change)
        for (const [id, detail] of scoreDetails.entries()) {
          const buffer = buffers.get(id);
          if (buffer) {
            this.logger.debug(`  ${buffer.avatarName}: ${detail}`);
          }
        }
      }
    }

    if (!shouldRespond) {
      const result: DecisionResult = {
        shouldRespond: false,
        targetAvatarId: null,
        reason:
          bestScore < this.config.responseThreshold
            ? 'score below threshold'
            : 'random chance rejected',
        priorityScore: bestScore,
      };
      // Store decision for change detection
      if (bestAvatarId) {
        this.lastDecision.set(bestAvatarId, result);
      }
      return result;
    }

    // Record response time
    if (bestAvatarId) {
      this.lastResponseTime.set(bestAvatarId, Date.now());
    }

    const result: DecisionResult = {
      shouldRespond: true,
      targetAvatarId: bestAvatarId,
      reason: 'selected for response',
      priorityScore: bestScore,
    };
    // Store decision for change detection
    if (bestAvatarId) {
      this.lastDecision.set(bestAvatarId, result);
    }
    return result;
  }

  /**
   * Get comparable reason code (for detecting decision changes)
   */
  private getCurrentReasonCode(shouldRespond: boolean): string {
    return shouldRespond ? 'respond' : 'ignore';
  }

  /**
   * Calculate priority score for an avatar's buffer
   */
  private calculatePriority(buffer: AvatarBuffer): number {
    let score = 0;
    const now = Date.now();

    // 1. Direct mention bonus
    const hasMention = buffer.messages.some((msg) => msg.isDirectMention);
    if (hasMention) {
      score += this.config.scoring.directMentionBonus;
    }

    // 2. Recent interaction bonus (tiered by freshness)
    if (buffer.lastRespondedAt) {
      const timeSinceResponse = now - buffer.lastRespondedAt;
      const thirtySecondsMs = 30000;
      const oneHourMs = 3600000;

      if (timeSinceResponse <= thirtySecondsMs) {
        // Active conversation - very likely to respond to maintain flow
        score += 60; // High bonus for natural conversation continuation
      } else if (timeSinceResponse <= oneHourMs) {
        // Recent interaction - remember past conversations
        score += this.config.scoring.recentInteractionBonus; // +30
      }
    }

    // 3. Message count
    const messageBonus = Math.min(
      buffer.messages.length * this.config.scoring.messageCountMultiplier,
      buffer.messages.length * this.config.scoring.messageCountMultiplier
    );
    score += messageBonus;

    // 4. Consecutive messages
    const consecutiveCount = this.countConsecutiveMessages(buffer);
    const consecutiveBonus = Math.min(
      consecutiveCount * this.config.scoring.consecutiveBonus,
      3 * this.config.scoring.consecutiveBonus
    );
    score += consecutiveBonus;

    // 5. Time decay (older messages lose priority)
    const ageMinutes = (now - buffer.firstMessageAt) / 60000;
    const timeDecay = Math.min(ageMinutes * this.config.scoring.timeDecayRate, this.config.scoring.maxTimeDecay);
    score -= timeDecay;

    // 6. Randomness (human unpredictability)
    const randomBonus = Math.random() * this.config.scoring.randomnessRange;
    score += randomBonus;

    return Math.max(0, score);
  }

  /**
   * Count consecutive messages from same avatar (without interruption)
   */
  private countConsecutiveMessages(buffer: AvatarBuffer): number {
    if (buffer.messages.length === 0) return 0;

    let count = 1;
    const maxCheck = 5; // Only check last 5 messages

    for (let i = 1; i < buffer.messages.length && i < maxCheck; i++) {
      count++;
    }

    return count;
  }

  /**
   * Check if message contains trigger words (direct mention)
   */
  detectMention(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return this.config.triggerWords.some((word) => lowerContent.includes(word.toLowerCase()));
  }

  /**
   * Format score details for logging
   */
  private formatScoreDetails(buffer: AvatarBuffer, score: number): string {
    const parts: string[] = [];

    if (buffer.messages.some((msg) => msg.isDirectMention)) {
      parts.push(`mention(+${this.config.scoring.directMentionBonus})`);
    }

    // Show recent interaction bonus with tier info
    if (buffer.lastRespondedAt) {
      const now = Date.now();
      const timeSinceResponse = now - buffer.lastRespondedAt;
      const thirtySecondsMs = 30000;
      const oneHourMs = 3600000;

      if (timeSinceResponse <= thirtySecondsMs) {
        parts.push(`active(+60)`); // Active conversation bonus
      } else if (timeSinceResponse <= oneHourMs) {
        parts.push(`recent(+${this.config.scoring.recentInteractionBonus})`); // Recent bonus
      }
    }

    const msgBonus = buffer.messages.length * this.config.scoring.messageCountMultiplier;
    if (msgBonus > 0) {
      parts.push(`msgs(+${msgBonus})`);
    }

    const now = Date.now();
    const ageMinutes = (now - buffer.firstMessageAt) / 60000;
    if (ageMinutes > 0) {
      const timeDecay = Math.min(ageMinutes * this.config.scoring.timeDecayRate, this.config.scoring.maxTimeDecay);
      parts.push(`age(-${timeDecay.toFixed(0)})`);
    }

    return `[${score.toFixed(0)}] ${parts.join(', ')}`;
  }

  /**
   * Clear response history (useful for testing/reset)
   */
  clearHistory(): void {
    this.lastResponseTime.clear();
    this.lastDecision.clear();
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    lastResponses: Array<{ avatarId: string; timeAgo: number }>;
  } {
    const now = Date.now();
    const lastResponses = Array.from(this.lastResponseTime.entries())
      .map(([avatarId, time]) => ({
        avatarId,
        timeAgo: now - time,
      }))
      .sort((a, b) => a.timeAgo - b.timeAgo);

    return { lastResponses };
  }
}
