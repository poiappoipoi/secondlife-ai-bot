# Memory System Improvement Suggestions

**Date**: 2026-01-26
**Based on**: SillyTavern architecture analysis

## Executive Summary

This document proposes enhancements to the AI bot's memory system, inspired by SillyTavern's sophisticated multi-layered approach to context management. The goal is to move from simple linear history to intelligent, retrieval-based memory that maintains character consistency across long conversations.

---

## Current System Analysis

### Strengths ✅
- Simple, working conversation history management
- Automatic history trimming (keeps last N messages)
- Inactivity timeout with auto-save
- Persona system (loads character from .md files)
- System prompt persists across memory resets
- Multi-speaker support

### Weaknesses ❌
- **Linear memory only** - oldest messages are simply deleted
- **No memory retrieval** - past conversations are saved but never referenced
- **No context prioritization** - all messages treated equally
- **No semantic memory** - can't recall relevant past events
- **No structured knowledge** - no way to inject character lore/facts
- **Token budget is fixed** - no dynamic context management

### Current Flow
```
[System Prompt] + [Last 50 messages] → LLM
```

---

## How SillyTavern Handles Memory

SillyTavern uses a sophisticated multi-layered approach:

### 1. World Info/Lorebooks (Core System)
- **Keyword-activated memory**: Information injected only when relevant keywords appear
- **Token budgeting**: Allocate % of context to background info vs. chat history
- **Priority system**: Control which memories are most important
- **Insertion positions**: Control where in the prompt memories appear

### 2. MemoryBooks Extension (Automated Memory)
- **Auto-summarization**: Every N messages, AI creates JSON summaries of scenes
- **Structured storage**: Summaries include title, content, keywords
- **Retrieval by relevance**: Old memories reactivate when keywords match
- **Arc summaries**: Condense multiple old memories into single entries

### 3. Context Management Features
- **Recursive linking**: Memories can trigger other memories
- **Timed effects**: Sticky (persist N msgs), cooldown (wait N msgs), delay
- **Vector search**: Semantic similarity matching (optional)

---

## Proposed Improvements

### Priority 1: Keyword-Based Memory Injection
**Complexity**: Medium
**Impact**: High
**Implementation Time**: 2-4 hours

Create a simple lorebook system that injects relevant memories based on keyword matching.

#### Type Definitions
```typescript
// src/types/memory.ts

export interface MemoryEntry {
  id: string;
  keywords: string[];      // Trigger words (lowercase)
  content: string;         // What to inject into context
  priority: number;        // Higher = more important (1-10)
  createdAt: Date;
  lastAccessed?: Date;
  accessCount: number;
}

export interface MemoryMatchResult {
  entry: MemoryEntry;
  matchedKeywords: string[];
  score: number;           // For ranking
}
```

#### Service Implementation
```typescript
// src/services/memory.ts

import type { MemoryEntry, MemoryMatchResult } from '../types/memory';
import { LoggerService } from './logger';

export class MemoryService {
  private memories: Map<string, MemoryEntry> = new Map();
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Add a memory entry
   */
  add(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'accessCount'>): MemoryEntry {
    const newEntry: MemoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      accessCount: 0,
      keywords: entry.keywords.map(k => k.toLowerCase())
    };

    this.memories.set(newEntry.id, newEntry);
    this.logger.debug(`Added memory entry: ${newEntry.id}`, { keywords: newEntry.keywords });
    return newEntry;
  }

  /**
   * Find memories relevant to recent messages
   */
  getRelevantMemories(
    recentMessages: string[],
    maxTokens: number
  ): MemoryEntry[] {
    const messageLower = recentMessages.join(' ').toLowerCase();
    const matches: MemoryMatchResult[] = [];

    // Find all matching memories
    for (const memory of this.memories.values()) {
      const matchedKeywords = memory.keywords.filter(keyword =>
        messageLower.includes(keyword)
      );

      if (matchedKeywords.length > 0) {
        matches.push({
          entry: memory,
          matchedKeywords,
          score: this.calculateScore(memory, matchedKeywords)
        });
      }
    }

    // Sort by score (priority + keyword matches)
    matches.sort((a, b) => b.score - a.score);

    // Select entries within token budget
    const selected = this.selectByTokenBudget(
      matches.map(m => m.entry),
      maxTokens
    );

    // Update access stats
    selected.forEach(memory => {
      memory.lastAccessed = new Date();
      memory.accessCount++;
    });

    this.logger.debug(`Retrieved ${selected.length} relevant memories from ${matches.length} matches`);
    return selected;
  }

  /**
   * Calculate relevance score for a memory
   */
  private calculateScore(memory: MemoryEntry, matchedKeywords: string[]): number {
    return (
      memory.priority * 10 +                    // Priority weight
      matchedKeywords.length * 5 +              // Keyword match count
      (memory.accessCount > 0 ? 2 : 0)          // Bonus for previously accessed
    );
  }

  /**
   * Select memories within token budget (rough estimation)
   */
  private selectByTokenBudget(memories: MemoryEntry[], maxTokens: number): MemoryEntry[] {
    const CHARS_PER_TOKEN = 4; // Rough estimate
    const selected: MemoryEntry[] = [];
    let currentTokens = 0;

    for (const memory of memories) {
      const estimatedTokens = Math.ceil(memory.content.length / CHARS_PER_TOKEN);
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
   */
  remove(id: string): boolean {
    return this.memories.delete(id);
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.memories.clear();
    this.logger.info('All memories cleared');
  }

  /**
   * Get memory count
   */
  count(): number {
    return this.memories.size;
  }
}
```

#### Integration with ConversationService
```typescript
// src/services/conversation.ts (modifications)

import { MemoryService } from './memory';

export class ConversationService {
  private memoryService: MemoryService;

  constructor(
    logger: LoggerService,
    personaService: PersonaService,
    memoryService: MemoryService
  ) {
    // ... existing code
    this.memoryService = memoryService;
  }

  /**
   * Build context with memories injected
   */
  getHistoryWithMemories(memoryTokenBudget: number = 500): Message[] {
    // Get recent messages for keyword matching
    const recentMessages = this.history
      .slice(-5)
      .map(m => m.content);

    // Retrieve relevant memories
    const memories = this.memoryService.getRelevantMemories(
      recentMessages,
      memoryTokenBudget
    );

    // Build final context
    return [
      this.history[0], // System prompt
      ...memories.map(m => ({
        role: 'system' as const,
        content: `[Memory] ${m.content}`
      })),
      ...this.history.slice(1) // Chat history (excluding system prompt)
    ];
  }
}
```

---

### Priority 2: Auto-Summarization of Old Conversations
**Complexity**: High
**Impact**: Very High
**Implementation Time**: 4-6 hours

Instead of deleting old messages, summarize them and store as retrievable memories.

#### Implementation
```typescript
// src/services/conversation.ts

async summarizeAndArchive(): Promise<void> {
  if (this.history.length <= 20) {
    return; // Not enough history to summarize
  }

  const systemMsg = this.history[0];
  const recentMsgs = this.history.slice(-10); // Keep recent 10
  const oldMsgs = this.history.slice(1, -10); // Summarize middle section

  this.logger.info(`Summarizing ${oldMsgs.length} old messages`);

  try {
    // Ask AI to create summary
    const provider = getConfiguredProvider(this.logger);
    const summaryPrompt: Message[] = [
      {
        role: 'system',
        content: 'You are a memory archival system. Summarize the following conversation in 2-4 sentences. ' +
                 'Include: key facts mentioned, emotional moments, important decisions, and character development. ' +
                 'Format: One paragraph, factual and concise.'
      },
      ...oldMsgs
    ];

    const response = await provider.chat(summaryPrompt);
    const summary = response.content;

    // Extract keywords from old messages
    const keywords = this.extractKeywords(oldMsgs);

    // Store as memory
    this.memoryService.add({
      keywords,
      content: summary,
      priority: 5 // Medium priority
    });

    // Trim history to recent messages only
    this.history = [systemMsg, ...recentMsgs];

    this.logger.info(`Archived ${oldMsgs.length} messages as memory. History reduced to ${this.history.length} messages`);
  } catch (error) {
    this.logger.error('Failed to summarize old messages', error);
    // Don't throw - just continue with existing history
  }
}

/**
 * Extract keywords from messages (simple implementation)
 */
private extractKeywords(messages: Message[]): string[] {
  const text = messages
    .map(m => m.content)
    .join(' ')
    .toLowerCase();

  // Simple keyword extraction: common nouns, names, and unique words
  const words = text.split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

  const keywords = words
    .filter(w => w.length > 3 && !stopWords.has(w))
    .filter(w => /^[a-z]+$/.test(w)); // Only alphabetic

  // Return unique keywords
  return [...new Set(keywords)].slice(0, 10); // Max 10 keywords
}
```

#### Trigger Summarization
```typescript
// src/services/conversation.ts

addAssistantMessage(content: string): void {
  this.history.push({ role: 'assistant', content });
  this.logger.debug(`Added assistant message to history (total: ${this.history.length} messages)`);

  // Check if we need to summarize
  if (this.history.length > 30) {
    void this.summarizeAndArchive();
  } else {
    this.trimHistory();
  }
}
```

---

### Priority 3: Context Budget Management
**Complexity**: Low
**Impact**: Medium
**Implementation Time**: 1-2 hours

Dynamic allocation of tokens between system prompt, memories, and chat history.

#### Configuration
```typescript
// src/config/index.ts

export const config = {
  // ... existing config
  conversation: {
    maxTokens: 4000,              // Total context window
    systemPromptTokens: 800,      // Fixed for persona
    memoryTokensBudget: 500,      // 12.5% for memories
    chatHistoryTokens: 2700,      // 67.5% for recent chat
  }
};
```

#### Token Estimation
```typescript
// src/utils/tokens.ts

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trim messages to fit within token budget
 */
export function trimToTokenBudget(messages: Message[], maxTokens: number): Message[] {
  const result: Message[] = [];
  let currentTokens = 0;

  // Work backwards (keep most recent)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (currentTokens + msgTokens <= maxTokens) {
      result.unshift(messages[i]);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }

  return result;
}
```

#### Usage
```typescript
// src/services/conversation.ts

import { config } from '../config/index';
import { trimToTokenBudget } from '../utils/tokens';

getHistoryWithBudget(): Message[] {
  const systemMsg = this.history[0];
  const chatMsgs = this.history.slice(1);

  // Get relevant memories
  const memories = this.memoryService.getRelevantMemories(
    chatMsgs.slice(-5).map(m => m.content),
    config.conversation.memoryTokensBudget
  );

  // Trim chat history to budget
  const trimmedChat = trimToTokenBudget(
    chatMsgs,
    config.conversation.chatHistoryTokens
  );

  return [
    systemMsg,
    ...memories.map(m => ({ role: 'system' as const, content: `[Memory] ${m.content}` })),
    ...trimmedChat
  ];
}
```

---

### Priority 4: Structured Character Facts
**Complexity**: Low
**Impact**: Medium
**Implementation Time**: 2-3 hours

Extend persona system to parse structured facts separately and inject as high-priority memories.

#### Persona File Format
```markdown
<!-- personas/cat-maid.md -->
你现在是一只可爱的猫娘女仆，名字叫"Poi"...

[Rest of persona description...]

---FACTS---
name: Poi
species: catgirl
age: 20
gender: female
likes: 小鱼干, head pats, serving master, warm places
dislikes: water, loud noises, being alone
skills: cooking, cleaning, being cute, massage
relationships: deeply loves and serves her master
personality_traits: energetic, obedient, affectionate, playful

---WORLD---
location: Master's manor
time_period: modern
setting: domestic slice of life
atmosphere: warm, cozy, safe
```

#### Parser Implementation
```typescript
// src/services/persona.ts

export interface PersonaFacts {
  character: Record<string, string>;
  world: Record<string, string>;
}

export class PersonaService {
  private currentFacts: PersonaFacts | null = null;

  async loadPersona(filename: string): Promise<string> {
    // ... existing code to load file

    const content = await file.text();

    // Parse sections
    const { description, facts } = this.parsePersona(content);

    this.currentSystemPrompt = description.trim();
    this.currentFacts = facts;

    console.log(`[Persona] Loaded: ${this.currentPersonaName}`);
    console.log(`[Persona] Facts: ${Object.keys(facts.character).length} character, ${Object.keys(facts.world).length} world`);

    return this.currentSystemPrompt;
  }

  private parsePersona(content: string): { description: string; facts: PersonaFacts } {
    const factsSectionMatch = content.match(/---FACTS---\n([\s\S]*?)(?=---WORLD---|$)/);
    const worldSectionMatch = content.match(/---WORLD---\n([\s\S]*?)$/);

    const description = content.split('---FACTS---')[0].trim();

    const characterFacts = factsSectionMatch
      ? this.parseKeyValueSection(factsSectionMatch[1])
      : {};

    const worldFacts = worldSectionMatch
      ? this.parseKeyValueSection(worldSectionMatch[1])
      : {};

    return {
      description,
      facts: {
        character: characterFacts,
        world: worldFacts
      }
    };
  }

  private parseKeyValueSection(section: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = section.trim().split('\n');

    for (const line of lines) {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        result[match[1].trim()] = match[2].trim();
      }
    }

    return result;
  }

  getFacts(): PersonaFacts | null {
    return this.currentFacts;
  }
}
```

#### Auto-Inject Facts as High-Priority Memories
```typescript
// src/index.ts or src/app.ts

async function initializeMemories(
  memoryService: MemoryService,
  personaService: PersonaService
) {
  const facts = personaService.getFacts();
  if (!facts) return;

  // Inject character facts
  for (const [key, value] of Object.entries(facts.character)) {
    memoryService.add({
      keywords: [key, ...value.split(/[,，]/g).map(v => v.trim())],
      content: `Character fact: ${key} = ${value}`,
      priority: 10 // Highest priority
    });
  }

  // Inject world facts
  for (const [key, value] of Object.entries(facts.world)) {
    memoryService.add({
      keywords: [key],
      content: `World info: ${key} = ${value}`,
      priority: 8 // High priority
    });
  }

  console.log(`[Memory] Initialized ${memoryService.count()} fact-based memories`);
}
```

---

### Priority 5: Multi-Session Memory Persistence
**Complexity**: Medium
**Impact**: High
**Implementation Time**: 3-4 hours

Save and load memories across server restarts.

#### File Storage
```typescript
// src/services/memory.ts

export class MemoryService {
  private readonly storageFile: string;

  constructor(logger: LoggerService, storageDir?: string) {
    this.logger = logger;
    this.storageFile = path.join(
      storageDir ?? path.join(process.cwd(), 'data'),
      'memories.json'
    );
  }

  /**
   * Load memories from disk
   */
  async loadFromDisk(): Promise<number> {
    try {
      if (!existsSync(this.storageFile)) {
        this.logger.info('No existing memories file found');
        return 0;
      }

      const file = Bun.file(this.storageFile);
      const json = await file.json();
      const entries: MemoryEntry[] = json.memories || [];

      for (const entry of entries) {
        this.memories.set(entry.id, {
          ...entry,
          createdAt: new Date(entry.createdAt),
          lastAccessed: entry.lastAccessed ? new Date(entry.lastAccessed) : undefined
        });
      }

      this.logger.info(`Loaded ${entries.length} memories from disk`);
      return entries.length;
    } catch (error) {
      this.logger.error('Failed to load memories from disk', error);
      return 0;
    }
  }

  /**
   * Save memories to disk
   */
  async saveToDisk(): Promise<void> {
    try {
      const entries = Array.from(this.memories.values());
      const json = JSON.stringify({ memories: entries }, null, 2);

      // Ensure directory exists
      const dir = path.dirname(this.storageFile);
      if (!existsSync(dir)) {
        await Bun.write(dir, ''); // Creates directory
      }

      await Bun.write(this.storageFile, json);
      this.logger.debug(`Saved ${entries.length} memories to disk`);
    } catch (error) {
      this.logger.error('Failed to save memories to disk', error);
    }
  }

  /**
   * Auto-save memories periodically
   */
  startAutoSave(intervalMs: number = 300000): NodeJS.Timeout {
    return setInterval(() => {
      void this.saveToDisk();
    }, intervalMs);
  }
}
```

#### Server Initialization
```typescript
// src/index.ts

async function startServer() {
  // ... existing initialization

  // Load memories from disk
  await memoryService.loadFromDisk();

  // Initialize fact-based memories
  await initializeMemories(memoryService, personaService);

  // Start auto-save (every 5 minutes)
  memoryService.startAutoSave(300000);

  // ... rest of server setup
}
```

#### Detect and Save Significant Moments
```typescript
// src/services/conversation.ts

async addUserMessage(content: string): Promise<void> {
  this.history.push({ role: 'user', content });
  this.logger.debug(`Added user message to history (total: ${this.history.length} messages)`);
  this.resetInactivityTimer();
}

async addAssistantMessage(content: string): Promise<void> {
  const userMsg = this.history[this.history.length - 1];

  this.history.push({ role: 'assistant', content });
  this.logger.debug(`Added assistant message to history (total: ${this.history.length} messages)`);

  // Check if this exchange is significant
  if (this.isSignificant(userMsg.content, content)) {
    await this.saveSignificantMoment(userMsg.content, content);
  }

  // Continue with existing logic
  if (this.history.length > 30) {
    await this.summarizeAndArchive();
  } else {
    this.trimHistory();
  }
}

private isSignificant(userMsg: string, assistantMsg: string): boolean {
  // Simple heuristics for significance
  const combinedLength = userMsg.length + assistantMsg.length;

  // Long exchanges are usually important
  if (combinedLength > 500) return true;

  // Emotional keywords
  const emotionalWords = ['love', 'hate', 'happy', 'sad', 'angry', 'afraid', '喜欢', '爱', '讨厌', '开心', '伤心'];
  const combined = (userMsg + ' ' + assistantMsg).toLowerCase();
  if (emotionalWords.some(word => combined.includes(word))) return true;

  // Questions about character
  if (userMsg.includes('?') || userMsg.includes('？')) return true;

  return false;
}

private async saveSignificantMoment(userMsg: string, assistantMsg: string): Promise<void> {
  const keywords = this.extractKeywords([
    { role: 'user', content: userMsg },
    { role: 'assistant', content: assistantMsg }
  ]);

  this.memoryService.add({
    keywords,
    content: `${userMsg} → ${assistantMsg}`,
    priority: 6 // Above average priority
  });

  this.logger.debug('Saved significant moment as memory');
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Implement Priority 3 (Context Budget) - Easy win, immediate benefits
- [ ] Implement Priority 4 (Structured Facts) - Extends existing system
- [ ] Test with existing personas

### Phase 2: Core Memory (Week 2)
- [ ] Implement Priority 1 (Keyword Memories) - Core retrieval feature
- [ ] Implement Priority 5 (Persistence) - Save/load memories
- [ ] Add memory management endpoints (list, clear, remove)

### Phase 3: Advanced Features (Week 3)
- [ ] Implement Priority 2 (Auto-Summarization) - Most complex
- [ ] Add significant moment detection
- [ ] Fine-tune keyword extraction

### Phase 4: Polish (Week 4)
- [ ] Add memory viewer UI (optional web interface)
- [ ] Performance optimization
- [ ] Documentation and examples

---

## Enhanced Context Flow

**Before:**
```
[System Prompt] + [Last 50 messages] → LLM
```

**After:**
```
[System Prompt (persona description)]
+ [Character Facts (priority 10)]
+ [World Info (priority 8)]
+ [Relevant Memories (priority 5-7, keyword-matched)]
+ [Recent Summary (if long chat)]
+ [Last 20 messages (trimmed to token budget)]
→ LLM
```

---

## Testing Strategy

### Unit Tests
- Memory keyword matching
- Token budget calculation
- Keyword extraction
- Memory scoring algorithm

### Integration Tests
- Memory injection in conversation flow
- Auto-summarization trigger
- Persistence (save/load)
- Fact parsing from persona files

### Manual Testing
- Long conversation (100+ messages)
- Keyword retrieval accuracy
- Memory persistence across restarts
- Token budget limits

---

## Configuration Options

Add to `.env`:
```env
# Memory System
MEMORY_MAX_ENTRIES=1000
MEMORY_TOKEN_BUDGET=500
MEMORY_AUTO_SUMMARIZE_THRESHOLD=30
MEMORY_PERSISTENCE_ENABLED=true
MEMORY_AUTO_SAVE_INTERVAL_MS=300000
MEMORY_SIGNIFICANT_MOMENT_DETECTION=true

# Context Management
CONTEXT_MAX_TOKENS=4000
CONTEXT_SYSTEM_PROMPT_TOKENS=800
CONTEXT_MEMORY_TOKENS=500
CONTEXT_CHAT_HISTORY_TOKENS=2700
```

---

## API Extensions

### New Endpoints

#### GET `/memories`
List all stored memories.

**Response:**
```json
{
  "count": 42,
  "memories": [
    {
      "id": "uuid-here",
      "keywords": ["master", "headpat", "happy"],
      "content": "Master gave Poi headpats and Poi was very happy",
      "priority": 6,
      "accessCount": 5,
      "createdAt": "2026-01-26T10:30:00Z",
      "lastAccessed": "2026-01-26T15:45:00Z"
    }
  ]
}
```

#### DELETE `/memories/:id`
Remove a specific memory.

#### POST `/memories/clear`
Clear all memories (keeps character facts).

#### GET `/memories/stats`
Memory system statistics.

**Response:**
```json
{
  "totalMemories": 42,
  "characterFacts": 10,
  "worldFacts": 5,
  "conversationMemories": 27,
  "totalAccessCount": 156,
  "averagePriority": 6.2,
  "storageSize": "15.2 KB"
}
```

---

## Performance Considerations

### Memory Usage
- Store memories in-memory (Map) for fast lookup
- Periodically save to disk (JSON file)
- Limit total memories (configurable, default 1000)

### Token Efficiency
- Rough estimation: 1 token ≈ 4 characters
- For accuracy, use tiktoken library (optional)
- Budget allocation ensures context never exceeds model limits

### Keyword Matching
- O(n) scan through all memories
- Optimize with inverted index if >1000 memories
- Cache recent matches for repeated queries

---

## Future Enhancements

### Vector-Based Semantic Search
Replace keyword matching with embeddings:
- Use OpenAI embeddings API or local model
- Store vector representations of memories
- Retrieve by cosine similarity

### Memory Categories
Organize memories by type:
- `character_fact` - Immutable character traits
- `world_info` - Setting and environment
- `conversation` - Past dialogue summaries
- `event` - Significant moments
- `relationship` - User interactions

### Memory Importance Decay
Reduce priority of old, rarely accessed memories:
```typescript
priority = basePriority * Math.exp(-daysSinceAccess / decayRate)
```

### Manual Memory Management
Allow users to:
- Pin important memories (never decay)
- Edit memory content and keywords
- Create custom memory categories

---

## References

- [SillyTavern World Info Documentation](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)
- [SillyTavern MemoryBooks Extension](https://github.com/aikohanasaki/SillyTavern-MemoryBooks)
- [Managing Long Chats on SillyTavern](https://rpwithai.com/how-to-manage-long-chats-on-sillytavern/)
- [Timeline Memory System](https://github.com/unkarelian/timeline-memory)
- [SillyTavern Lorebook Ordering](https://github.com/aikohanasaki/SillyTavern-LorebookOrdering)

---

## Conclusion

By implementing these improvements, the bot will gain:
1. **Long-term memory** - Recall past conversations and facts
2. **Context efficiency** - Fit more relevant information in token budget
3. **Character consistency** - Structured facts ensure persona adherence
4. **Scalability** - Handle conversations of any length
5. **Intelligence** - Surface relevant memories at the right time

The proposed system balances complexity with practicality, starting with simple keyword matching and progressing to advanced summarization. Each phase builds on the previous, allowing incremental development and testing.
