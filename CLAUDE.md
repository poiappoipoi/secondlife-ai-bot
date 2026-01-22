# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Second Life AI Bot - A chatbot integration for Second Life using X.AI's Grok API. The system consists of two components:
- **TypeScript Bun server** (`server/src/`): Handles API requests and manages conversation state (runs on Bun.js runtime)
- **LSL script** (`lsl/brain.lsl`): Second Life object script that captures chat and communicates with the server

## Common Development Commands

### Server

```bash
# Navigate to server directory
cd server

# Install dependencies
bun install

# Development server (with hot reload)
bun run dev

# Build (type check and verify server starts)
bun run build

# Production server (runs TypeScript directly)
bun run start

# Type checking only
bun run typecheck
```

### Configuration

Environment variables can be set in `server/.env` or `server/key.env`:

```env
# Server
PORT=3000

# AI Provider (xai | ollama)
AI_PROVIDER=xai
AI_MAX_TOKENS=300
AI_TIMEOUT_MS=30000

# X.AI (Grok)
XAI_API_KEY=your-xai-api-key-here
XAI_MODEL=grok-4-1-fast-non-reasoning

# Ollama (local LLM)
# Make sure Ollama is running: ollama serve
# Create the model: ollama create cat-maid -f cat-maid.modelfile
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=cat-maid

# Rate Limiting
RATE_LIMIT_MAX=40
RATE_LIMIT_WINDOW_MS=3600000

# Conversation
INACTIVITY_TIMEOUT_MS=3600000
DEFAULT_SYSTEM_PROMPT=You are Grok, a helpful AI assistant.

# Logging
LOG_TIMEZONE=Asia/Taipei
```

See `server/.env.example` for full configuration options.

## Architecture

### TypeScript Server Structure

```
server/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Express app setup
│   ├── config/
│   │   └── index.ts          # Type-safe configuration
│   ├── types/
│   │   ├── conversation.ts   # Message, ConversationState
│   │   ├── api.ts            # Request/Response types
│   │   └── providers.ts      # AIProvider interface
│   ├── providers/
│   │   ├── base.ts           # Abstract BaseAIProvider
│   │   ├── xai.ts            # X.AI Grok implementation
│   │   ├── ollama.ts         # Ollama (local LLM) implementation
│   │   └── index.ts          # Provider factory
│   ├── services/
│   │   ├── conversation.ts   # Conversation state management
│   │   ├── rate-limiter.ts   # Rate limiting logic
│   │   └── logger.ts         # Log file persistence
│   └── routes/
│       ├── chat.ts           # POST /chat endpoint
│       └── system-prompt.ts  # POST /SetSystemPrompt endpoint
├── tsconfig.json
└── package.json
```

### Key Components

**Configuration (`src/config/index.ts`)**:
- Type-safe environment variable loading
- Bun automatically loads `.env` files from project root
- Supports `key.env` file for override values (key.env overrides .env)
- All settings configurable via environment variables

**Provider Abstraction (`src/providers/`)**:
- `AIProvider` interface for swappable AI backends
- Implements X.AI Grok and Ollama (local LLM)
- Extensible for future providers (OpenAI, Anthropic, etc.)

**Services (`src/services/`)**:
- `ConversationService`: Manages chat history and system prompt
- `RateLimiterService`: Sliding window rate limiting
- `LoggerService`: Taiwan timezone log file persistence

**Routes (`src/routes/`)**:
- `POST /chat`: Main chat endpoint (plain text response)
- `POST /SetSystemPrompt`: Update AI persona

### API Endpoints

**POST /chat**
- Request: `{ "message": "user text" }`
- Response: Plain text AI reply
- Special commands: `"reset"` or `"清除"` to clear memory
- Returns 429 when rate limited

**POST /SetSystemPrompt**
- Request: `{ "prompt": "new persona" }`
- Response: Success message
- Saves current conversation before changing

### LSL Script (`lsl/brain.lsl`)

**Features**:
- OOC filter (ignores messages starting with `((`)
- Agent-only listening (filters non-avatars)
- Self-filtering (ignores bot's own messages)
- Owner-only touch menu

**Touch Menu Options**:
- 設定人設 / Set System Prompt
- 清除記憶 / Clear Memory
- 開啟/暫停 / Pause/Resume
- 取消 / Cancel

**Configuration**:
- Set `url_base` in line 1 to your server address

## Type Definitions

### Message
```typescript
type MessageRole = 'system' | 'user' | 'assistant';
interface Message {
  role: MessageRole;
  content: string;
}
```

### AIProvider
```typescript
interface AIProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  chat(messages: Message[]): Promise<AIProviderResponse>;
}
```

## Adding New AI Providers

1. Create new provider class in `src/providers/`
2. Extend `BaseAIProvider` and implement `chat()` and `parseResponse()`
3. Add provider type to `ProviderType` in `src/types/providers.ts`
4. Register in provider factory `src/providers/index.ts`
5. Add configuration in `src/config/index.ts`

Example:
```typescript
// src/providers/openai.ts
export class OpenAIProvider extends BaseAIProvider {
  readonly name = 'OpenAI';

  async chat(messages: Message[]): Promise<AIProviderResponse> {
    // Implementation
  }

  protected parseResponse(data: unknown): AIProviderResponse {
    // Parse OpenAI response format
  }
}
```

## Important Notes

- **Bun.js Runtime**: Server runs on Bun.js - TypeScript is executed directly without compilation
- **Native APIs**: Uses Bun's native `fetch` API and `Bun.file()` for file operations
- **Plain Text Responses**: API returns plain text (not JSON) for LSL script compatibility
- **Taiwan Timezone**: Log files use Asia/Taipei timezone
- **System Prompt Persistence**: Persona survives memory resets
- **Rate Limiting**: Configurable via environment variables
