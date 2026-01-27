# NPC State Machine Implementation Plan

**Status**: Draft
**Date**: 2026-01-27
**Target**: Transform the AI bot from immediate-response API into a selective, human-like NPC

## Overview

The NPC State Machine transforms the bot from a chatbot (responds to everything immediately) into a character that:
- **Buffers messages** from multiple avatars and decides selectively who to respond to
- **Only calls LLM** when engaging with a conversation
- **Maintains single active conversation** thread (one avatar at a time)
- **Feels like a believable character** instead of a chatbot

**Core Architecture**: State machine cycle with long-polling
- States: `IDLE` → `LISTENING` → `THINKING` → `SPEAKING` → back to `IDLE`/`LISTENING`
- Decision cycle runs every 1 second (configurable via tick interval)
- HTTP requests wait for decision (with timeout)

---

## Key Design Decisions

### 1. Response Flow: Long-Polling

When an avatar sends a message:

```
Avatar sends message
    ↓
Server buffers message immediately → Returns 202 (or keeps connection open)
    ↓
State machine tick (every 1s):
  - Evaluates all buffered messages
  - Decides who to respond to (if anyone)
  - Transitions to THINKING state
    ↓
If avatar was chosen:
  - Waiting HTTP request receives decision
  - LLM is called with context
  - Response is sent (200 OK + text)
    ↓
If avatar was ignored:
  - Request times out → Returns 202 Accepted (no content)
  - Avatar's messages cleared from buffer
```

### 2. Conversation History: Only Engaged Avatars

**Critical**: Only avatars the NPC chooses to engage with get added to conversation history.

- **Background chatter** from ignored avatars: NOT added to history
- **Engaged avatars**: Added to history with context injection
- **Result**: LLM context stays focused on actual conversations, not noise

**Example**:
```
[Chat] Alice: "Hello Poi!"
[Chat] Bob: "Hey there"
[Chat] Alice: "How are you?"

Decision: Respond to Alice (direct mention of name)
Result:
  - Alice's messages → Added to history
  - Bob's messages → Cleared from buffer (never added to history)
  - LLM sees only: Alice's conversation
```

### 3. System Prompt: Dynamic Context Injection

Before calling LLM, inject a system message:

```typescript
const contextInjection = `You are responding to [Avatar Name]. Address them directly and acknowledge who you're speaking to.`;
```

This tells the LLM explicitly:
- Who the audience is
- Who to address in the response
- Implicitly: other avatars are being ignored

**Result**: Responses feel more personal and contextual

---

## Architecture: Three New Services

### 1. MessageBufferService (`server/src/services/message-buffer.ts`)

**Purpose**: Buffer messages per avatar, manage expiry, provide aggregated content

**Key Methods**:
```typescript
addMessage(avatarId: string, avatarName: string, content: string, isDirectMention: boolean)
  → Returns: BufferedMessage (for immediate feedback)

getAggregatedContent(avatarId: string): string
  → Merges consecutive messages from same avatar within time window
  → Example: ["Hi", "How are you?"] → "Hi How are you?"

clearBuffer(avatarId: string): void
  → Remove all messages from avatar after NPC responds

getAllBuffers(): Map<string, AvatarBuffer>
  → Get all avatar buffers for decision layer evaluation

cleanExpiredMessages(): number
  → Remove messages older than messageExpiryMs
  → Returns count of removed messages
```

**Data Structures**:
```typescript
interface BufferedMessage {
  id: string;                    // UUID for tracking
  avatarId: string;              // Unique avatar identifier
  avatarName: string;            // Display name
  content: string;               // Message text
  receivedAt: number;            // Timestamp (ms)
  isDirectMention: boolean;      // Did message contain trigger word?
}

interface AvatarBuffer {
  avatarId: string;
  avatarName: string;
  messages: BufferedMessage[];
  firstMessageAt: number;        // When buffer started
  lastMessageAt: number;         // Most recent message
  totalMessages: number;         // Count
  lastRespondedAt: number | null; // Last time NPC responded
}
```


---

### 2. DecisionLayerService (`server/src/services/decision-layer.ts`)

**Purpose**: Evaluate all buffered messages and decide who (if anyone) to respond to

**Key Methods**:
```typescript
makeDecision(
  buffers: Map<string, AvatarBuffer>,
  stateContext: StateContext
): DecisionResult

  → Returns: {
      shouldRespond: boolean,
      targetAvatarId: string | null,
      reason: string,
      priorityScore: number
    }

calculatePriority(buffer: AvatarBuffer, context: StateContext): number
  → Score calculation with multiple factors

detectMention(content: string, triggerWords: string[]): boolean
  → Check if message contains persona's name or keywords
```

**Priority Scoring Algorithm**:

Each avatar gets a score based on:

1. **Direct Mention** (+100 points)
   - Message contains trigger words (persona name, keywords)
   - e.g., "Hey Poi!", "maid help me"

2. **Recent Interaction** (+30 points)
   - Persona responded to this avatar within 1 hour
   - Encourages continuation of existing conversations

3. **Message Count** (+5 per message, max +50)
   - More messages = higher priority
   - Example: 5 messages = +25 points

4. **Consecutive Messages** (+10 per consecutive, max +30)
   - Messages from same avatar without interruption
   - Rewards focused talkers

5. **Time Decay** (-2 per minute since first message, max -20)
   - Older buffered messages lose priority
   - Prevents ancient messages from hijacking decisions

6. **Randomness** (0 to +10 points)
   - Random factor for unpredictability
   - Makes behavior feel less mechanical

7. **Cooldown Penalty** (-1, blocks response)
   - If responded to avatar within 30s: cannot respond
   - Prevents rapid-fire responses to same avatar

**Response Decision**:
```typescript
// Score must exceed threshold AND pass random chance
if (maxScore >= responseThreshold && randomChance < responseChance) {
  respond = true
} else {
  respond = false
}
```

---

### 3. NPCStateMachineService (`server/src/services/state-machine.ts`)

**Purpose**: Core state management with tick loop and long-polling

**States**:
```typescript
enum NPCState {
  IDLE = 'IDLE',           // No activity, waiting for messages
  LISTENING = 'LISTENING', // Buffering, decision cycle active
  THINKING = 'THINKING',   // LLM call in progress (state is LOCKED)
  SPEAKING = 'SPEAKING'    // Response delivered, cooldown active
}
```

**Key Methods**:
```typescript
start(): void
  → Start tick loop (runs every tickIntervalMs)
  → Emits: 'tick', 'state-transition'

onMessageReceived(avatarId: string, avatarName: string, content: string): void
  → Buffer message immediately
  → Return to LSL script: 202 or connection held open

waitForDecision(avatarId: string, timeoutMs: number): Promise<LongPollDecision>
  → BLOCKING: Wait for state machine to make decision about this avatar
  → If timeout expires: resolve with {decided: false}
  → If avatar chosen: resolve with {decided: true, decision}
  → If different avatar chosen: resolve with {decided: false}

onLLMResponseReady(response: string): void
  → Transition: THINKING → SPEAKING
  → Emit: 'response-ready'
  → Start cooldown timer

onLLMError(): void
  → Transition: THINKING → IDLE
  → Error logged and recovered

getCurrentState(): NPCState
getActiveTarget(): string | null
```

**State Tick Loop** (every 1 second):

```typescript
tick() {
  const elapsed = now() - this.stateEnteredAt;

  switch (this.state) {
    case IDLE:
      // Check if messages available
      if (messageBuffer.size > 0) {
        transitionTo(LISTENING);
      }
      break;

    case LISTENING:
      // Make decision every tick
      const decision = decisionLayer.makeDecision(buffers, context);
      if (decision.shouldRespond) {
        this.activeTarget = decision.targetAvatarId;
        transitionTo(THINKING);
        this.emit('decision-made', decision);  // Wake up waiters
        break; // Don't make another decision this tick
      }

      // Timeout: no decision made
      if (elapsed > listeningTimeoutMs) {
        transitionTo(IDLE);
        messageBuffer.clearExpired();
      }
      break;

    case THINKING:
      // Monitor LLM timeout
      if (elapsed > thinkingTimeoutMs) {
        log.warn(`LLM timeout after ${thinkingTimeoutMs}ms`);
        transitionTo(IDLE);
      }
      break;

    case SPEAKING:
      // Cooldown
      if (elapsed > speakingCooldownMs) {
        if (messageBuffer.size > 0) {
          transitionTo(LISTENING);
        } else {
          transitionTo(IDLE);
        }
      }
      break;
  }
}
```

**Long-Polling Implementation**:

```typescript
waitForDecision(avatarId: string, timeoutMs: number): Promise<LongPollDecision> {
  return new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => {
      removeListeners();
      resolve({ decided: false, reason: 'timeout' });
    }, timeoutMs);

    const onDecision = (decision: DecisionResult) => {
      if (decision.targetAvatarId === avatarId) {
        clearTimeout(timeoutHandle);
        removeListeners();
        resolve({ decided: true, decision });
      }
      // else: different target, keep waiting
    };

    const removeListeners = () => {
      this.removeListener('decision-made', onDecision);
    };

    this.once('decision-made', onDecision);
  });
}
```

---

## NPC Configuration via Environment Variables & Config

NPC settings are configured through environment variables and loaded in `server/src/config/index.ts`.

**Benefits**:
- ✅ Standard server configuration approach
- ✅ Environment-specific settings (dev, production)
- ✅ No mixing of content (persona) and behavior (NPC config)
- ✅ Easy to change behavior without modifying persona files
- ✅ Persona files stay pure (just character prompt)

**Configuration Priority**:
1. Environment variables (highest priority)
2. `.env` file
3. Hardcoded defaults (lowest priority)

**PersonaService** (simplified):

```typescript
async loadPersona(filename: string): Promise<void> {
  const filePath = path.join(this.personasDir, filename);
  this.systemPrompt = await Bun.file(filePath).text();
  this.logger.info(`Loaded persona: ${filename}`);
}

getSystemPrompt(): string {
  return this.systemPrompt;
}
```

Persona files are pure character prompts (no config frontmatter).

---

## Modified Files

### 1. `server/src/routes/chat.ts`

Integrate state machine with long-polling:

```typescript
export function createChatRouter(
  conversation: ConversationService,
  rateLimiter: RateLimiterService,
  logger: LoggerService,
  stateMachine: NPCStateMachineService,
  messageBuffer: MessageBufferService
): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    // 1. Rate limiting
    const rateLimit = rateLimiter.check();
    if (!rateLimit.allowed) {
      res.status(429).send('Rate limit exceeded');
      return;
    }

    // 2. Validate request
    const { speaker, message: userMessage, avatarId } = req.body;
    if (!speaker || !userMessage) {
      res.status(400).send('Missing required fields: speaker, message');
      return;
    }

    const resolvedAvatarId = avatarId || speaker; // Fallback for backward compat

    // 3. Handle special commands
    if (userMessage === 'reset' || userMessage === '清除') {
      await conversation.saveAndReset('User reset command');
      messageBuffer.clearAll();
      stateMachine.resetState();
      res.status(204).send('');
      return;
    }

    // === NPC STATE MACHINE FLOW ===

    // 4. Buffer message immediately
    const bufferedMsg = await messageBuffer.addMessage(
      resolvedAvatarId,
      speaker,
      userMessage,
      decisionLayer.detectMention(userMessage, config.triggerWords)
    );
    logger.debug(`Buffered message from ${speaker} (${bufferedMsg.id})`);

    // 5. Wait for state machine decision (long-polling)
    const listeningTimeoutMs = config.npc.stateMachine.timeouts.listeningMs;
    const decision = await stateMachine.waitForDecision(
      resolvedAvatarId,
      listeningTimeoutMs
    );

    // 6. Handle ignored/timeout case
    if (!decision.decided) {
      logger.debug(
        `Ignoring ${speaker}: ${decision.reason} (state: ${stateMachine.getCurrentState()})`
      );
      res.status(202).send(''); // 202 Accepted (no content)
      return;
    }

    // === NPC DECIDED TO RESPOND ===
    logger.info(`NPC responding to ${speaker} (score: ${decision.decision?.priorityScore})`);

    try {
      // 7. Get aggregated messages for this avatar
      const aggregatedContent = messageBuffer.getAggregatedContent(resolvedAvatarId);
      const messageWithSpeaker = `[${speaker}]: ${aggregatedContent}`;

      // 8. Add to conversation history
      conversation.addUserMessage(messageWithSpeaker);

      // 9. Build history with context injection
      let history = buildConversationHistory(conversation, config);

      // Inject dynamic context before LLM call
      const contextInjection: Message = {
        role: 'system',
        content: `You are responding to ${speaker}. Address them directly by name.`
      };

      // Insert after system prompt but before conversation
      history.splice(1, 0, contextInjection);

      // 10. Call LLM
      const provider = getConfiguredProvider(logger);
      let fullResponse = '';

      try {
        const response = await provider.chat(history);
        fullResponse = response.content;
      } catch (error) {
        logger.error('LLM error:', error);
        conversation.removeLastMessage();
        await stateMachine.onLLMError();
        res.status(500).send('Error generating response');
        return;
      }

      // 11. Add response to history
      conversation.addAssistantMessage(fullResponse);

      // 12. Notify state machine (THINKING → SPEAKING)
      await stateMachine.onLLMResponseReady(fullResponse);

      // 13. Clear avatar's buffer
      messageBuffer.clearBuffer(resolvedAvatarId);

      // 14. Return response
      res.status(200).send(fullResponse);

    } catch (error) {
      logger.error('Chat handler error:', error);
      conversation.removeLastMessage();
      await stateMachine.onLLMError();
      res.status(500).send('Server error');
    }
  });

  return router;
}
```

### 2. `server/src/app.ts`

Initialize new services:

```typescript
export async function createApp() {
  const logger = new LoggerService();
  const persona = new PersonaService(config.persona.personasDir);

  // Load persona (pure system prompt, no config)
  await persona.loadPersona(config.persona.personaFile);

  const memory = new MemoryService(logger);
  if (config.memory.enabled) {
    initializeMemories(memory, persona);
  }

  const conversation = new ConversationService(logger, persona, memory);
  const rateLimiter = new RateLimiterService();

  // === NEW: NPC State Machine Services ===
  // All config comes from env vars via config module
  const messageBuffer = new MessageBufferService(logger, config.npc.buffer);
  const decisionLayer = new DecisionLayerService(logger, config.npc.decision);
  const stateMachine = new NPCStateMachineService(
    messageBuffer,
    decisionLayer,
    logger,
    config.npc.stateMachine
  );

  // Start state machine if enabled
  if (config.npc.enabled) {
    stateMachine.start();
    logger.info(`NPC State Machine enabled (tick: ${config.npc.stateMachine.tickIntervalMs}ms)`);
  }

  // Routes
  app.use('/chat', createChatRouter(
    conversation,
    rateLimiter,
    logger,
    stateMachine,
    messageBuffer
  ));

  app.use('/memory', createMemoryRouter(conversation, logger));
  app.use('/health', createHealthRouter());

  return {
    app,
    services: {
      conversation,
      rateLimiter,
      logger,
      persona,
      memory,
      messageBuffer,
      decisionLayer,
      stateMachine
    }
  };
}
```

### 3. `server/src/services/persona.ts`

Simplified (no config parsing needed):

```typescript
export class PersonaService {
  private systemPrompt: string = '';

  async loadPersona(filename: string): Promise<void> {
    const filePath = path.join(this.personasDir, filename);
    this.systemPrompt = await Bun.file(filePath).text();
    this.logger.info(`Loaded persona: ${filename}`);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }
}
```

Persona files contain pure character prompts (no configuration).

### 4. `lsl/brain.lsl`

Update to send `avatarId` and handle 202 status:

```lsl
// At top of script, where url_base is defined
string url_base = "http://localhost:3000";

listen(integer channel, string name, key id, string message) {
    if (channel == 0) {
        // === OOC Filter ===
        if (llGetSubString(message, 0, 1) == "((") {
            return; // Ignore OOC messages
        }

        // === Agent Filter ===
        if (llDetectedType(0) != AGENT) {
            return; // Only respond to avatars
        }

        // === Self Filter ===
        if (id == llGetOwner()) {
            // Owner messages have priority (could add special handling)
        }

        // === Build Request ===
        string speaker = llGetDisplayName(id);
        string avatarId = (string)id;  // NEW: Capture UUID
        string escaped_msg = escape_json(message);
        string escaped_speaker = escape_json(speaker);

        // NEW: Include avatarId in JSON
        string json = "{\"speaker\":\"" + escaped_speaker +
                      "\",\"avatarId\":\"" + avatarId +
                      "\",\"message\":\"" + escaped_msg + "\"}";

        llHTTPRequest(
            url_base + "/chat",
            [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"],
            json
        );
        return;
    }
}

http_response(key request_id, integer status, list metadata, string body) {
    if (status == 200) {
        // === Response from NPC ===
        llRegionSayTo(llGetOwner(), 0, body);

    } else if (status == 202) {
        // === NEW: Message buffered, NPC ignored ===
        // Do nothing - silent rejection (natural behavior)

    } else if (status == 204) {
        // === Memory cleared ===
        llOwnerSay("System: Memory cleared");

    } else if (status == 429) {
        // === Rate limited ===
        llOwnerSay("System: Rate limit exceeded");

    } else if (status >= 400) {
        // === Error ===
        llOwnerSay("Connection error (" + (string)status + "): " + body);
    }
}

string escape_json(string s) {
    s = llReplaceSubString(s, "\\", "\\\\", 0);
    s = llReplaceSubString(s, "\"", "\\\"", 0);
    s = llReplaceSubString(s, "\n", "\\n", 0);
    return s;
}
```

---

## New Type Definitions

Create `server/src/types/npc.ts`:

```typescript
export enum NPCState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING'
}

export interface StateContext {
  currentState: NPCState;
  stateEnteredAt: number;
  activeTarget: string | null;
  lastResponseAt: number;
  transitionHistory: StateTransition[];
}

export interface StateTransition {
  from: NPCState;
  to: NPCState;
  reason: string;
  timestamp: number;
}

export interface BufferedMessage {
  id: string;
  avatarId: string;
  avatarName: string;
  content: string;
  receivedAt: number;
  isDirectMention: boolean;
}

export interface AvatarBuffer {
  avatarId: string;
  avatarName: string;
  messages: BufferedMessage[];
  firstMessageAt: number;
  lastMessageAt: number;
  totalMessages: number;
  lastRespondedAt: number | null;
}

export interface DecisionResult {
  shouldRespond: boolean;
  targetAvatarId: string | null;
  reason: string;
  priorityScore: number;
}

export interface LongPollDecision {
  decided: boolean;
  reason: string;
  decision?: DecisionResult;
}

// Config interfaces
export interface NPCConfig {
  enabled?: boolean;
  stateMachine: StateMachineConfig;
  buffer: BufferConfig;
  decision: DecisionConfig;
}

export interface StateMachineConfig {
  tickIntervalMs: number;
  timeouts: {
    listeningMs: number;
    thinkingMs: number;
    speakingCooldownMs: number;
  };
}

export interface BufferConfig {
  maxMessagesPerAvatar: number;
  maxTotalBufferSize: number;
  aggregationWindowMs: number;
  expiryMs: number;
}

export interface DecisionConfig {
  responseThreshold: number;
  responseChance: number;
  triggerWords: string[];
  scoring: {
    directMentionBonus: number;
    recentInteractionBonus: number;
    messageCountMultiplier: number;
    consecutiveBonus: number;
    maxTimeDecay: number;
    timeDecayRate: number;
    randomnessRange: number;
  };
  cooldownMs: number;
}
```

Update `server/src/types/api.ts`:

```typescript
export interface ChatRequest {
  speaker: string;
  message: string;
  avatarId?: string; // NEW: Avatar UUID from LSL
}

export interface ChatResponse {
  status: 200 | 202 | 204 | 429 | 500;
  body: string;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Types & Config)
1. Create `server/src/types/npc.ts` with all interfaces
2. Update `server/src/config/index.ts` to add NPC configuration section
3. Add NPC environment variables to `.env` and `.env.example`
4. No changes to PersonaService (stays simple)

**Verification**: Config loads correctly, all NPC settings accessible via `config.npc`

### Phase 2: Message Buffer Service
1. Implement `server/src/services/message-buffer.ts`
2. Implement: `addMessage()`, `getAggregatedContent()`, `clearBuffer()`, `cleanExpired()`
3. Unit tests for all methods
4. Test expiry and aggregation logic

**Verification**: Message buffer tests pass, buffer cleans up old messages

### Phase 3: Decision Layer Service
1. Implement `server/src/services/decision-layer.ts`
2. Implement priority scoring algorithm
3. Implement mention detection
4. Unit tests with mock buffers

**Verification**: Scoring logic works, mentions detected, avatars prioritized correctly

### Phase 4: State Machine Service
1. Implement `server/src/services/state-machine.ts`
2. Implement state transitions and tick loop
3. Implement long-polling mechanism (EventEmitter-based)
4. Unit tests for state transitions

**Verification**: State transitions work, timeout handling works, long-polling receives decisions

### Phase 5: Chat Route Integration
1. Update `server/src/routes/chat.ts` for long-polling flow
2. Update `server/src/app.ts` to initialize services
3. Add context injection before LLM call
4. Integration tests

**Verification**: End-to-end test with Postman (single and multiple avatars)

### Phase 6: LSL Integration & Testing
1. Update `lsl/brain.lsl` with `avatarId` and 202 handling
2. Test in Second Life with multiple avatars
3. Tune scoring weights and timeouts
4. Load testing

**Verification**: NPC behaves realistically in SL, responds selectively

---

## Testing Strategy

### Unit Tests

**MessageBufferService**:
- Add messages, retrieve aggregated content
- Expiry: old messages removed after timeout
- Aggregation: consecutive messages merged within time window
- Buffer limits: oldest messages dropped when full

**DecisionLayerService**:
- Scoring: each rule applies correctly
- Mentions: detected when present, missed when absent
- Threshold: decision made only when score high enough
- Randomness: response chance affects outcomes

**NPCStateMachineService**:
- State transitions: IDLE → LISTENING → THINKING → SPEAKING → IDLE
- Timeouts: each state times out correctly
- Long-polling: waiters receive decisions
- Tick loop: runs at configured interval

### Integration Tests

```typescript
// Test: Avatar sends message, NPC responds
test('NPC responds to direct mention', async () => {
  const msg = { speaker: 'Alice', message: 'Hey Poi!' };
  const response = await request(app).post('/chat').send(msg);
  expect(response.status).toBe(200);
  expect(response.text.length).toBeGreaterThan(0);
});

// Test: Multiple avatars, NPC picks highest priority
test('NPC ignores lower priority avatar', async () => {
  const alice = { speaker: 'Alice', message: 'hi' };
  const bob = { speaker: 'Bob', message: 'Hey Poi!' };

  const aliceRes = request(app).post('/chat').send(alice);
  const bobRes = request(app).post('/chat').send(bob);

  const [aliceStatus, bobStatus] = await Promise.all([aliceRes, bobRes]);
  expect(aliceStatus.status).toBe(202); // Ignored
  expect(bobStatus.status).toBe(200);   // Responded
});

// Test: Cooldown prevents repeated responses
test('NPC applies cooldown after responding', async () => {
  const msg1 = { speaker: 'Alice', message: 'Hey Poi!' };
  const msg2 = { speaker: 'Alice', message: 'Are you there?' };

  const res1 = await request(app).post('/chat').send(msg1);
  expect(res1.status).toBe(200);

  const res2 = await request(app).post('/chat').send(msg2);
  expect(res2.status).toBe(202); // Cooldown active
});
```

### Manual Testing Scenarios

1. **Single Avatar Spam**
   - Alice sends 10 rapid messages
   - Expected: NPC responds once, subsequent ignored
   - Verify: Only 1 LLM call made

2. **Multiple Avatars**
   - Alice: "hello" (low priority)
   - Bob: "Hey Poi!" (direct mention, high priority)
   - Expected: NPC responds to Bob, ignores Alice
   - Verify: Bob gets 200, Alice gets 202

3. **Cooldown Test**
   - Alice: "Hi Poi!" → Response
   - Alice: "Are you there?" (within 30s) → Ignored
   - Expected: 202 on second message
   - Verify: Cooldown enforced

4. **Timeout Test**
   - Alice: "hello" (low priority, no mention)
   - Wait 15 seconds
   - Expected: No response, timeout expires
   - Verify: Alice's request returns 202

5. **Mention Priority**
   - Alice: 5 messages with low priority
   - Bob: 1 message mentioning persona name
   - Expected: NPC chooses Bob
   - Verify: Bob's mention score > Alice's total score

---

## Expected Behavior Changes

### Before NPC State Machine
```
User message → Immediate LLM call → Response
(Every message gets a response)
```

### After NPC State Machine
```
User message → Buffer → Decision cycle → Selective response
(Only high-priority messages trigger LLM calls)
```

### Example Scenario: Three Avatars

```
[10:00:00] Alice: "Hello"
  → Buffered (IDLE → LISTENING)

[10:00:01] Bob: "Hey Poi!" (mention)
  → Buffered
  → Tick: Decision made → Bob (score 110) → LISTENING → THINKING

[10:00:01] Carol: "Anyone here?"
  → Buffered (separate request)
  → Request waits...

[10:00:02] LLM generates response: "Yes, I'm here!"
  → THINKING → SPEAKING (cooldown 5s)

[10:00:02] Bob's request: Returns 200 + "Yes, I'm here!"
[10:00:02] Alice's request: Times out → Returns 202
[10:00:02] Carol's request: Waits for next decision...

[10:00:07] Cooldown expires → SPEAKING → LISTENING (still messages buffered)

[10:00:08] Next tick: Decision for Carol vs Alice
  → Alice has older messages (time decay)
  → Carol is newer, but no mention
  → Random chance: 60% (low score)
  → Decision: Ignore both

[10:00:15] Listening timeout expires → IDLE
[10:00:15] Carol's request: Times out → Returns 202
```

### Metrics to Monitor

- **LLM Calls/Minute**: Should decrease dramatically (only selective responses)
- **Response Latency**: May increase slightly (decision cycle + buffering)
- **202 Responses**: Indicates selective behavior working
- **Buffer Size**: Should stay under limit, clean up old messages
- **State Transitions**: Should be smooth, no stuck states

---

## Configuration Setup

### `server/src/config/index.ts`

Add NPC configuration interface and environment variable parsing:

```typescript
export interface AppConfig {
  // ... existing fields ...

  npc: {
    enabled: boolean;

    stateMachine: {
      tickIntervalMs: number;
      timeouts: {
        listeningMs: number;
        thinkingMs: number;
        speakingCooldownMs: number;
      };
    };

    buffer: {
      maxMessagesPerAvatar: number;
      maxTotalBufferSize: number;
      aggregationWindowMs: number;
      expiryMs: number;
    };

    decision: {
      responseThreshold: number;
      responseChance: number;
      triggerWords: string[];
      scoring: {
        directMentionBonus: number;
        recentInteractionBonus: number;
        messageCountMultiplier: number;
        consecutiveBonus: number;
        maxTimeDecay: number;
        timeDecayRate: number;
        randomnessRange: number;
      };
      cooldownMs: number;
    };
  };
}

// In the config initialization:
const config: AppConfig = {
  // ... existing config ...

  npc: {
    enabled: env.NPC_ENABLED === 'true',

    stateMachine: {
      tickIntervalMs: parseInt(env.NPC_TICK_INTERVAL_MS || '1000', 10),
      timeouts: {
        listeningMs: parseInt(env.NPC_LISTENING_TIMEOUT_MS || '15000', 10),
        thinkingMs: parseInt(env.NPC_THINKING_TIMEOUT_MS || '30000', 10),
        speakingCooldownMs: parseInt(env.NPC_SPEAKING_COOLDOWN_MS || '5000', 10)
      }
    },

    buffer: {
      maxMessagesPerAvatar: parseInt(env.NPC_BUFFER_MAX_PER_AVATAR || '10', 10),
      maxTotalBufferSize: parseInt(env.NPC_BUFFER_MAX_TOTAL_SIZE || '50', 10),
      aggregationWindowMs: parseInt(env.NPC_BUFFER_AGGREGATION_WINDOW_MS || '5000', 10),
      expiryMs: parseInt(env.NPC_BUFFER_EXPIRY_MS || '60000', 10)
    },

    decision: {
      responseThreshold: parseInt(env.NPC_RESPONSE_THRESHOLD || '50', 10),
      responseChance: parseFloat(env.NPC_RESPONSE_CHANCE || '0.8'),
      triggerWords: (env.NPC_TRIGGER_WORDS || 'maid,cat-maid,kitty').split(','),

      scoring: {
        directMentionBonus: parseInt(env.NPC_SCORE_DIRECT_MENTION || '100', 10),
        recentInteractionBonus: parseInt(env.NPC_SCORE_RECENT_INTERACTION || '30', 10),
        messageCountMultiplier: parseInt(env.NPC_SCORE_MESSAGE_COUNT_MULT || '5', 10),
        consecutiveBonus: parseInt(env.NPC_SCORE_CONSECUTIVE_BONUS || '10', 10),
        maxTimeDecay: parseInt(env.NPC_SCORE_MAX_TIME_DECAY || '20', 10),
        timeDecayRate: parseInt(env.NPC_SCORE_TIME_DECAY_RATE || '2', 10),
        randomnessRange: parseInt(env.NPC_SCORE_RANDOMNESS_RANGE || '10', 10)
      },

      cooldownMs: parseInt(env.NPC_AVATAR_COOLDOWN_MS || '30000', 10)
    }
  }
};
```

Note: `NPC_ENABLED` defaults to `false` if not set, requiring explicit enablement in `.env`.

### `server/.env`

Add NPC environment variables:

```env
# NPC State Machine
NPC_ENABLED=true
NPC_TICK_INTERVAL_MS=1000

# State Timeouts (milliseconds)
NPC_LISTENING_TIMEOUT_MS=15000
NPC_THINKING_TIMEOUT_MS=30000
NPC_SPEAKING_COOLDOWN_MS=5000

# Message Buffer
NPC_BUFFER_MAX_PER_AVATAR=10
NPC_BUFFER_MAX_TOTAL_SIZE=50
NPC_BUFFER_AGGREGATION_WINDOW_MS=5000
NPC_BUFFER_EXPIRY_MS=60000

# Decision Layer
NPC_RESPONSE_THRESHOLD=50
NPC_RESPONSE_CHANCE=0.8
NPC_TRIGGER_WORDS=maid,cat-maid,kitty

# Priority Scoring
NPC_SCORE_DIRECT_MENTION=100
NPC_SCORE_RECENT_INTERACTION=30
NPC_SCORE_MESSAGE_COUNT_MULT=5
NPC_SCORE_CONSECUTIVE_BONUS=10
NPC_SCORE_MAX_TIME_DECAY=20
NPC_SCORE_TIME_DECAY_RATE=2
NPC_SCORE_RANDOMNESS_RANGE=10

# Per-Avatar Cooldown
NPC_AVATAR_COOLDOWN_MS=30000
```

---

## Default NPC Configuration (Fallback)

When environment variables are not set, these hardcoded defaults are used:

These values are embedded in the configuration parsing as `||` defaults:

```typescript
// Example from config/index.ts
const npcConfig = {
  enabled: env.NPC_ENABLED === 'true',  // Default: false (must be explicitly set)

  stateMachine: {
    tickIntervalMs: parseInt(env.NPC_TICK_INTERVAL_MS || '1000', 10),
    timeouts: {
      listeningMs: parseInt(env.NPC_LISTENING_TIMEOUT_MS || '15000', 10),
      thinkingMs: parseInt(env.NPC_THINKING_TIMEOUT_MS || '30000', 10),
      speakingCooldownMs: parseInt(env.NPC_SPEAKING_COOLDOWN_MS || '5000', 10)
    }
  },

  buffer: {
    maxMessagesPerAvatar: parseInt(env.NPC_BUFFER_MAX_PER_AVATAR || '10', 10),
    maxTotalBufferSize: parseInt(env.NPC_BUFFER_MAX_TOTAL_SIZE || '50', 10),
    aggregationWindowMs: parseInt(env.NPC_BUFFER_AGGREGATION_WINDOW_MS || '5000', 10),
    expiryMs: parseInt(env.NPC_BUFFER_EXPIRY_MS || '60000', 10)
  },

  decision: {
    responseThreshold: parseInt(env.NPC_RESPONSE_THRESHOLD || '50', 10),
    responseChance: parseFloat(env.NPC_RESPONSE_CHANCE || '0.8'),
    triggerWords: (env.NPC_TRIGGER_WORDS || 'maid,cat-maid,kitty').split(','),

    scoring: {
      directMentionBonus: parseInt(env.NPC_SCORE_DIRECT_MENTION || '100', 10),
      recentInteractionBonus: parseInt(env.NPC_SCORE_RECENT_INTERACTION || '30', 10),
      messageCountMultiplier: parseInt(env.NPC_SCORE_MESSAGE_COUNT_MULT || '5', 10),
      consecutiveBonus: parseInt(env.NPC_SCORE_CONSECUTIVE_BONUS || '10', 10),
      maxTimeDecay: parseInt(env.NPC_SCORE_MAX_TIME_DECAY || '20', 10),
      timeDecayRate: parseInt(env.NPC_SCORE_TIME_DECAY_RATE || '2', 10),
      randomnessRange: parseInt(env.NPC_SCORE_RANDOMNESS_RANGE || '10', 10)
    },

    cooldownMs: 30000
  }
};
```

---

## Summary

This implementation transforms the bot from a **chatbot** (responds to everything) into a **character** (responds selectively):

| Aspect | Before | After |
|--------|--------|-------|
| **Message Handling** | Immediate LLM call | Buffered + decision |
| **Conversation Target** | Any/all avatars | Single selected avatar |
| **History** | All messages | Only engaged avatars |
| **LLM Calls** | 1 per message | 1 per decision |
| **Response Behavior** | Chatbot (always responsive) | Character (selective, realistic) |
| **Cooldown** | None | 30s per avatar |
| **Config Location** | N/A | Environment variables |

The result: An NPC that feels more like a living character than a chatbot, with realistic selective engagement and conversation history that stays focused on actual interactions.
