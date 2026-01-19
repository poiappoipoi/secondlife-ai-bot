# AI Bot Context Documentation

## Project Overview

This is a Second Life AI chatbot system that supports multiple AI providers (X.AI Grok, Ollama) to provide intelligent conversational capabilities within the Second Life virtual world. The system consists of two main components:

1. **LSL Script** (`lsl/brain.lsl`) - Runs inside Second Life, handles user interactions
2. **TypeScript Server** (`server/src/`) - Middleware server that processes requests and communicates with AI providers

## System Architecture

### Component Flow

```
Second Life User → LSL Script → TypeScript Server → AI Provider → TypeScript Server → LSL Script → Second Life User
```

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
├── dist/                     # Compiled JavaScript
├── index.js                  # Legacy server (kept for fallback)
├── tsconfig.json
└── package.json
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
- **Rate Limiting**: Configurable requests per hour limit (default: 40)
- **Conversation Management**: Maintains conversation history with context
- **Multi-Provider Support**: Switchable AI backends (X.AI, Ollama)
- **Auto-archiving**: Automatically saves conversations to log files
- **Memory Management**: Handles conversation resets and persona changes

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
**Model:** `deepseek-r1:7b` (configurable)

**Configuration:**
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=deepseek-r1:7b
```

**Setup:**
```bash
ollama pull deepseek-r1:7b
ollama serve
```

### Provider Interface

All providers implement the `AIProvider` interface:

```typescript
interface AIProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  chat(messages: Message[]): Promise<AIProviderResponse>;
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

- **Storage**: Maintains full conversation history in memory
- **Format**: Array of message objects with `role` and `content`
- **Roles**: `system`, `user`, `assistant`
- **Persistence**: Automatically saved to log files before reset
- **Reset Triggers**:
  - Manual reset (user sends "reset" or "清除")
  - Persona change (before applying new system prompt)
  - Inactivity timeout (configurable, default 1 hour)

### 4. Auto-archiving System

- **Location**: `server/logs/` directory
- **Filename Format**: `YYYYMMDDHHmm.txt` (configurable timezone)
- **Content**: Full conversation history as JSON
- **Trigger Conditions**:
  - Manual reset command
  - Persona change
  - Inactivity timeout
- **Skip Condition**: If conversation only contains system prompt

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
- Rate limit exceeded: HTTP 429 with error message
- API error: HTTP 500 with error details

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

All settings are configurable via environment variables:

```env
# Server
PORT=3000

# AI Provider (xai | ollama)
AI_PROVIDER=xai
AI_MAX_TOKENS=300
AI_TIMEOUT_MS=30000

# X.AI (Grok)
XAI_API_KEY=your-api-key
XAI_MODEL=grok-4-1-fast-non-reasoning

# Ollama (local LLM)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=deepseek-r1:7b

# Rate Limiting
RATE_LIMIT_MAX=40
RATE_LIMIT_WINDOW_MS=3600000

# Conversation
INACTIVITY_TIMEOUT_MS=3600000
DEFAULT_SYSTEM_PROMPT=You are a helpful AI assistant.

# Logging
LOG_TIMEZONE=Asia/Taipei
```

### LSL Script Configuration

**Required:**
```lsl
string url_base = "http://your-server-ip:3000";
```

## Development Commands

```bash
cd server

# Install dependencies
npm install

# Development server (hot reload)
npm run dev

# Build TypeScript
npm run build

# Production server
npm start

# Type checking
npm run typecheck

# Legacy server (original JS)
npm run start:legacy
```

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
2. Extend `BaseAIProvider` and implement `chat()` and `parseResponse()`
3. Add provider type to `ProviderType` in `src/types/providers.ts`
4. Register in provider factory `src/providers/index.ts`
5. Add configuration in `src/config/index.ts`

## Dependencies

### Server Dependencies

**Production:**
- `express`: Web framework
- `axios`: HTTP client for AI APIs
- `dotenv`: Environment variable management

**Development:**
- `typescript`: TypeScript compiler
- `tsx`: TypeScript execution with hot reload
- `@types/express`: Express type definitions
- `@types/node`: Node.js type definitions

### LSL Requirements

- Second Life viewer with LSL scripting support
- HTTP request capability
- Dialog and text box support
- Owner permissions for controls
