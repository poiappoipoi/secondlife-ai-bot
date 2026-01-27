/**
 * Memory system type definitions
 */

/**
 * Single memory entry stored in the memory system
 */
export interface MemoryEntry {
  id: string;
  keywords: string[]; // Trigger words (lowercase)
  content: string; // What to inject into context
  priority: number; // Higher = more important (1-10)
  createdAt: Date;
  lastAccessed?: Date;
  accessCount: number;
}

/**
 * Memory match result with scoring information
 */
export interface MemoryMatchResult {
  entry: MemoryEntry;
  matchedKeywords: string[];
  score: number; // For ranking
}
