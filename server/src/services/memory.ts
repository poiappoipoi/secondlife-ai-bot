/**
 * Memory service - keyword-activated memory retrieval system
 * Inspired by SillyTavern's World Info/Lorebook system
 */
import type { MemoryEntry, MemoryMatchResult } from '../types/index';
import { LoggerService } from './logger';
import { estimateTokens } from '../utils/token-estimator';

/**
 * Manages keyword-activated memories that are injected into context when relevant
 */
export class MemoryService {
  private memories: Map<string, MemoryEntry> = new Map();
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Add a memory entry
   * @param entry - Memory entry without auto-generated fields
   * @returns The created memory entry with generated ID
   */
  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessCount'>): MemoryEntry {
    const newEntry: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      accessCount: 0,
      keywords: entry.keywords.map((k) => k.toLowerCase().trim()),
    };

    this.memories.set(newEntry.id, newEntry);
    this.logger.debug(`Added memory entry: ${newEntry.id}`, { keywords: newEntry.keywords });
    return newEntry;
  }

  /**
   * Find memories relevant to recent messages
   * @param recentMessages - Array of recent message contents to match against
   * @param maxTokens - Maximum tokens to allocate for memories
   * @returns Array of relevant memory entries, sorted by priority
   */
  getRelevantMemories(recentMessages: string[], maxTokens: number): MemoryEntry[] {
    const messageLower = recentMessages.join(' ').toLowerCase();
    const matches: MemoryMatchResult[] = [];

    // Find all matching memories
    for (const memory of this.memories.values()) {
      const matchedKeywords = memory.keywords.filter((keyword) => messageLower.includes(keyword));

      if (matchedKeywords.length > 0) {
        matches.push({
          entry: memory,
          matchedKeywords,
          score: this.calculateScore(memory, matchedKeywords),
        });
      }
    }

    // Sort by score (priority + keyword matches)
    matches.sort((a, b) => b.score - a.score);

    // Select entries within token budget
    const selected = this.selectByTokenBudget(
      matches.map((m) => m.entry),
      maxTokens
    );

    // Update access stats
    selected.forEach((memory) => {
      memory.lastAccessed = new Date();
      memory.accessCount++;
    });

    if (selected.length > 0) {
      this.logger.debug(
        `Retrieved ${selected.length} relevant memories from ${matches.length} matches`,
        {
          selectedIds: selected.map((m) => m.id),
          totalMatches: matches.length,
        }
      );
    }

    return selected;
  }

  /**
   * Calculate relevance score for a memory
   * @param memory - Memory entry to score
   * @param matchedKeywords - Keywords that matched
   * @returns Score value (higher = more relevant)
   */
  private calculateScore(memory: MemoryEntry, matchedKeywords: string[]): number {
    return (
      memory.priority * 10 + // Priority weight
      matchedKeywords.length * 5 + // Keyword match count
      (memory.accessCount > 0 ? 2 : 0) // Bonus for previously accessed
    );
  }

  /**
   * Select memories within token budget
   * @param memories - Array of memories to select from (already sorted by score)
   * @param maxTokens - Maximum tokens to allocate
   * @returns Array of memories that fit within budget
   */
  private selectByTokenBudget(memories: MemoryEntry[], maxTokens: number): MemoryEntry[] {
    const selected: MemoryEntry[] = [];
    let currentTokens = 0;

    for (const memory of memories) {
      const estimatedTokens = estimateTokens(memory.content);
      if (currentTokens + estimatedTokens <= maxTokens) {
        selected.push(memory);
        currentTokens += estimatedTokens;
      } else {
        break; // Budget exhausted
      }
    }

    return selected;
  }

  /**
   * Remove a memory entry
   * @param id - ID of memory to remove
   * @returns true if memory was removed, false if not found
   */
  remove(id: string): boolean {
    const result = this.memories.delete(id);
    if (result) {
      this.logger.debug(`Removed memory entry: ${id}`);
    }
    return result;
  }

  /**
   * Clear all memories
   */
  clear(): void {
    const count = this.memories.size;
    this.memories.clear();
    this.logger.info(`Cleared all memories (${count} entries removed)`);
  }

  /**
   * Get memory count
   * @returns Number of stored memories
   */
  count(): number {
    return this.memories.size;
  }

  /**
   * Get all memories (for debugging/management)
   * @returns Array of all memory entries
   */
  getAll(): MemoryEntry[] {
    return Array.from(this.memories.values());
  }

  /**
   * Get a specific memory by ID
   * @param id - Memory ID
   * @returns Memory entry or undefined if not found
   */
  get(id: string): MemoryEntry | undefined {
    return this.memories.get(id);
  }
}
