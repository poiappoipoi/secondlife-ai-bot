# AI Bot Context Documentation

## Project Overview

This is a Second Life AI chatbot system that supports multiple AI providers (X.AI Grok, Ollama) to provide intelligent conversational capabilities within the Second Life virtual world. The system consists of two main components:

1. **LSL Script** (`lsl/brain.lsl`) - Runs inside Second Life, handles user interactions
2. **TypeScript Server** (`server/src/`) - Bun.js server that processes requests and communicates with AI providers

## System Architecture

### Component Flow

```
Second Life User → LSL Script → TypeScript Server → AI Provider → TypeScript Server → LSL Script → Second Life User
```

### TypeScript Server Structure

```
server/
├── src/
│   ├── index.ts              # Entry point with startup banner
│   ├── app.ts                # Express app factory
│   ├── config/
│   │   └── index.ts          # Type-safe configuration (supports .env and key.env)
│   ├── types/
│   │   ├── conversation.ts   # Message type definitions
│   │   ├── api.ts            # Request/Response types
│   │   ├── providers.ts      # AIProvider interface
│   │   └── index.ts          # Type exports
│   ├── providers/
│   │   ├── base.ts           # Abstract BaseAIProvider (streaming support)
│   │   ├── xai.ts            # X.AI Grok implementation
│   │   ├── ollama.ts         # Ollama (local LLM) implementation
│   │   └── index.ts          # Provider factory
│   ├── services/
│   │   ├── conversation.ts   # Conversation state management with history trimming
│   │   ├── rate-limiter.ts   # Sliding window rate limiting
│   │   ├── logger.ts         # Log file persistence (Bun native)
│   │   └── index.ts          # Service exports
│   └── routes/
│       ├── chat.ts           # POST /chat endpoint (streaming with fallback)
│       ├── system-prompt.ts  # POST /SetSystemPrompt endpoint
│       └── index.ts          # Route factory functions
├── tsconfig.json             # TypeScript configuration
├── tsconfig.test.json        # Test TypeScript configuration
├── package.json              # Bun.js dependencies
└── .env.example              # Environment variable template
```

### LSL Script Responsibilities

- **Message Listening**: Monitors public chat channel (channel 0) for user messages
- **Message Filtering**:
  - Ignores messages from the bot itself
  - Filters out non-human agents (objects)
  - Filters OOC (Out Of Character) messages starting with `((`
  - Respects pause/resume state
- **HTTP Communication**: Sends filtered messages to server via HTTP POST
- **Response Delivery**: Receives AI responses and speaks them in chat
- **Owner Controls**: Provides menu system for owner to:
  - Set system prompt (AI persona)
  - Clear conversation memory
  - Pause/resume listening
- **Visual Status**: Displays current state on object ("Talk To AI Brain" or "Zzz... (PAUSED)")

### TypeScript Server Responsibilities

- **Request Processing**: Handles incoming chat requests from LSL script
- **Rate Limiting**: Sliding window rate limiting (configurable, default: 40 requests/hour)
- **Conversation Management**: Maintains conversation history with automatic trimming
- **Streaming Support**: Real-time response streaming with fallback to non-streaming
- **Multi-Provider Support**: Switchable AI backends (X.AI, Ollama)
- **Auto-archiving**: Automatically saves conversations to log files before resets
- **Memory Management**: Handles conversation resets, persona changes, and inactivity timeouts
- **Configuration**: Supports `.env` and `key.env` files (key.env overrides .env)

## AI Providers

### X.AI Grok Provider

**Endpoint:** `https://api.x.ai/v1/chat/completions`
**Model:** `grok-4-1-fast-non-reasoning` (configurable)

**Configuration:**
```env
AI_PROVIDER=xai
XAI_API_KEY=your-api-key
XAI_MODEL=grok-4-1-fast-non-reasoning
```

### Ollama Provider (Local LLM)

**Endpoint:** `http://localhost:11434/v1/chat/completions`
**Model:** `cat-maid` (configurable, default)

**Configuration:**
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=cat-maid
```

**Setup:**
```bash
# Create model from modelfile (see ollama/cat-maid.modelfile)
ollama create cat-maid -f ollama/cat-maid.modelfile

# Start Ollama server
ollama serve
```

**Notes:**
- Ollama doesn't require API key authentication
- Empty system messages are filtered to allow modelfile's SYSTEM directive to work
- Supports both streaming and non-streaming responses

### Provider Interface

All providers implement the `AIProvider` interface:

```typescript
interface AIProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  chat(messages: Message[]): Promise<AIProviderResponse>;
  chatStream(messages: Message[]): AsyncIterable<string>;
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIProviderResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

**Streaming:**
- All providers support streaming via `chatStream()` method
- Returns `AsyncIterable<string>` that yields content chunks
- Chat route attempts streaming first, falls back to non-streaming on error
- Uses Server-Sent Events (SSE) format for X.AI, JSON streaming for Ollama

## Key Features

### 1. Message Filtering System

The LSL script implements multiple filters:
- **Self-filter**: Ignores messages from the bot itself
- **Agent filter**: Only processes messages from human avatars (not objects)
- **OOC filter**: Automatically ignores messages starting with `((` (Out Of Character notation)
- **State filter**: Respects pause/resume functionality

### 2. Rate Limiting

- **Limit**: Configurable (default 40 requests per hour)
- **Reset**: Automatically resets every hour
- **Response**: Returns HTTP 429 when limit exceeded
- **Configuration**: `RATE_LIMIT_MAX` environment variable

### 3. Conversation Memory

- **Storage**: Maintains conversation history in memory with automatic trimming
- **Format**: Array of message objects with `role` and `content`
- **Roles**: `system`, `user`, `assistant`
- **History Trimming**: Automatically trims to keep most recent N messages (default: 50)
  - Always preserves system prompt (first message)
  - Keeps most recent message pairs to maintain context
- **Persistence**: Automatically saved to log files before reset
- **Reset Triggers**:
  - Manual reset (user sends "reset" or "清除")
  - Persona change (before applying new system prompt)
  - Inactivity timeout (configurable, default 1 hour)

### 4. Auto-archiving System

- **Location**: `server/logs/` directory (auto-created)
- **Filename Format**: `YYYYMMDDHHmm.txt` (timezone-aware, default: Asia/Taipei)
- **Content**: Full conversation history as formatted JSON
- **Trigger Conditions**:
  - Manual reset command
  - Persona change
  - Inactivity timeout
- **Skip Condition**: If conversation only contains system prompt
- **Implementation**: Uses Bun's native file I/O (`Bun.write()`)
- **Fire-and-forget**: Logging doesn't block request processing

### 5. Persona Customization

- **Default**: Configurable via `DEFAULT_SYSTEM_PROMPT`
- **Modification**: Via owner menu → "設定人設" (Set System Prompt)
- **Persistence**: Persona persists across conversation resets
- **Archive**: Old conversation is saved before applying new persona

## API Endpoints

### POST `/chat`

Main endpoint for processing chat messages.

**Request Body:**
```json
{
  "message": "User's message text"
}
```

**Special Commands:**
- `"reset"` or `"清除"` - Triggers conversation archive and reset

**Response:**
- Success: AI response text (plain string)
  - Attempts streaming first for faster response time
  - Falls back to non-streaming if streaming fails
- Rate limit exceeded: HTTP 429 with error message
- API error: HTTP 500 with error details
- On error: User message is removed from history (rollback)

### POST `/SetSystemPrompt`

Endpoint for changing AI persona.

**Request Body:**
```json
{
  "prompt": "New system prompt text"
}
```

**Response:**
- Success: "設定成功！我現在是：{prompt}"
- Error: HTTP 400 if prompt is missing

## Configuration

### Environment Variables

All settings are configurable via environment variables. The system supports two configuration files:

1. **`.env`** - Main configuration file (automatically loaded by Bun)
2. **`key.env`** - Override file (takes precedence over `.env`)

This allows keeping sensitive keys in `key.env` (which can be gitignored) while maintaining defaults in `.env`.

```env
# Server
PORT=3000
NODE_ENV=development

# AI Provider (xai | ollama)
AI_PROVIDER=xai
AI_MAX_TOKENS=300
AI_TIMEOUT_MS=30000

# X.AI (Grok)
XAI_API_KEY=your-xai-api-key-here
XAI_MODEL=grok-4-1-fast-non-reasoning

# Ollama (local LLM)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=cat-maid

# Rate Limiting
RATE_LIMIT_MAX=40
RATE_LIMIT_WINDOW_MS=3600000

# Conversation
INACTIVITY_TIMEOUT_MS=3600000
DEFAULT_SYSTEM_PROMPT=You are Grok, a highly intelligent, helpful AI assistant.
CONVERSATION_MAX_HISTORY_MESSAGES=50

# Logging
LOG_TIMEZONE=Asia/Taipei
```

### LSL Script Configuration

**Required:**
```lsl
string url_base = "http://your-server-ip:3000";
```

## Development Commands

The server runs on **Bun.js** runtime, which executes TypeScript directly without compilation.

```bash
cd server

# Install dependencies
bun install

# Development server (hot reload with --watch)
bun run dev

# Build (type check and verify server starts)
bun run build

# Production server (runs TypeScript directly)
bun run start

# Type checking only
bun run typecheck

# Linting and formatting
bun run lint
bun run lint:fix
bun run format
bun run format:check

# Run tests
bun test
bun test --watch

# Full check (typecheck + lint + format)
bun run check
```

**Note**: Bun executes TypeScript natively, so there's no separate compilation step. The `build` script just verifies the code compiles and starts correctly.

## Error Handling

### LSL Script Errors

- **HTTP Errors**: Displayed to owner via `llOwnerSay()`
- **Success Messages**: System messages sent to owner
- **Chat Responses**: Normal AI responses spoken in public chat

### Server Errors

- **API Errors**: Logged to console, error message sent to LSL
- **Rate Limit**: HTTP 429 with informative message
- **Validation Errors**: HTTP 400 for missing/invalid data
- **Network Errors**: HTTP 500 with error details
- **Conversation Rollback**: User message removed from history on API failure

## Type Definitions

### Core Types

```typescript
type MessageRole = 'system' | 'user' | 'assistant';

interface Message {
  role: MessageRole;
  content: string;
}

interface ChatRequest {
  message: string;
}

interface SetSystemPromptRequest {
  prompt: string;
}

type ProviderType = 'xai' | 'ollama';
```

## Adding New Providers

1. Create new provider class in `src/providers/`
2. Extend `BaseAIProvider` and implement:
   - `chat()` - Non-streaming chat method
   - `chatStream()` - Streaming chat method (returns `AsyncIterable<string>`)
   - `parseResponse()` - Parse provider-specific response format
   - Optionally override `extractContentFromSSE()` for custom SSE parsing
3. Add provider type to `ProviderType` in `src/types/providers.ts`
4. Register in provider factory `src/providers/index.ts` (switch case)
5. Add configuration in `src/config/index.ts` (config structure)

**Example Structure:**
```typescript
export class NewProvider extends BaseAIProvider {
  readonly name = 'New Provider';
  
  async chat(messages: Message[]): Promise<AIProviderResponse> {
    // Implementation
  }
  
  async *chatStream(messages: Message[]): AsyncIterable<string> {
    // Streaming implementation
  }
  
  protected parseResponse(data: unknown): AIProviderResponse {
    // Parse provider response
  }
}
```

## Dependencies

### Server Dependencies

**Production:**
- `express`: Web framework
- **Bun.js runtime**: Provides native TypeScript execution, fetch API, and file I/O

**Development:**
- `typescript`: TypeScript compiler (for type checking)
- `@types/express`: Express type definitions
- `@typescript-eslint/eslint-plugin`: ESLint TypeScript plugin
- `@typescript-eslint/parser`: ESLint TypeScript parser
- `eslint`: Code linting
- `prettier`: Code formatting

**Key Features:**
- Uses Bun's native `fetch` API (no axios needed)
- Uses Bun's native file operations (`Bun.write()`, `Bun.file()`)
- Environment variables loaded automatically by Bun
- No build step required - TypeScript runs directly

### LSL Requirements

- Second Life viewer with LSL scripting support
- HTTP request capability
- Dialog and text box support
- Owner permissions for controls

## Startup Banner

When the server starts, it displays a formatted banner showing:
- Server status (✓ Running)
- Port number
- AI Provider name
- Model name
- Rate limit configuration
- Environment configuration source

The banner uses ANSI color codes for better visibility in terminal.

## Important Notes

- **Bun.js Runtime**: Server runs on Bun.js - TypeScript is executed directly without compilation
- **Native APIs**: Uses Bun's native `fetch` API and `Bun.write()` for file operations
- **Plain Text Responses**: API returns plain text (not JSON) for LSL script compatibility
- **Streaming Support**: All providers support streaming with automatic fallback
- **History Trimming**: Conversation history is automatically trimmed to prevent memory issues
- **Timezone Support**: Log files use configurable timezone (default: Asia/Taipei)
- **System Prompt Persistence**: Persona survives memory resets
- **Rate Limiting**: Sliding window algorithm with configurable limits
- **Configuration Override**: `key.env` file overrides `.env` values for sensitive keys
