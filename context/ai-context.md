# AI Bot Context Documentation

## Project Overview

This is a Second Life AI chatbot system that integrates X.AI's Grok API to provide intelligent conversational capabilities within the Second Life virtual world. The system consists of two main components:

1. **LSL Script** (`lsl/brain.lsl`) - Runs inside Second Life, handles user interactions
2. **Node.js Server** (`server/index.js`) - Middleware server that processes requests and communicates with Grok API

## System Architecture

### Component Flow

```
Second Life User → LSL Script → Node.js Server → Grok API → Node.js Server → LSL Script → Second Life User
```

### LSL Script Responsibilities

- **Message Listening**: Monitors public chat channel (channel 0) for user messages
- **Message Filtering**: 
  - Ignores messages from the bot itself
  - Filters out non-human agents (objects)
  - Filters OOC (Out Of Character) messages starting with `((`
  - Respects pause/resume state
- **HTTP Communication**: Sends filtered messages to Node.js server via HTTP POST
- **Response Delivery**: Receives AI responses and speaks them in chat
- **Owner Controls**: Provides menu system for owner to:
  - Set system prompt (AI persona)
  - Clear conversation memory
  - Pause/resume listening
- **Visual Status**: Displays current state on object ("Talk To AI Brain" or "Zzz... (PAUSED)")

### Node.js Server Responsibilities

- **Request Processing**: Handles incoming chat requests from LSL script
- **Rate Limiting**: Enforces 40 requests per hour limit
- **Conversation Management**: Maintains conversation history with context
- **API Integration**: Communicates with X.AI Grok API
- **Auto-archiving**: Automatically saves conversations to log files
- **Memory Management**: Handles conversation resets and persona changes

## Key Features

### 1. Message Filtering System

The LSL script implements multiple filters:
- **Self-filter**: Ignores messages from the bot itself
- **Agent filter**: Only processes messages from human avatars (not objects)
- **OOC filter**: Automatically ignores messages starting with `((` (Out Of Character notation)
- **State filter**: Respects pause/resume functionality

### 2. Rate Limiting

- **Limit**: 40 requests per hour per server instance
- **Reset**: Automatically resets every hour
- **Response**: Returns HTTP 429 when limit exceeded
- **Purpose**: Prevents API overuse and manages costs

### 3. Conversation Memory

- **Storage**: Maintains full conversation history in memory
- **Format**: Array of message objects with `role` and `content`
- **Roles**: `system`, `user`, `assistant`
- **Persistence**: Automatically saved to log files before reset
- **Reset Triggers**:
  - Manual reset (user sends "reset" or "清除")
  - Persona change (before applying new system prompt)
  - Inactivity timeout (1 hour of no activity)

### 4. Auto-archiving System

- **Location**: `server/logs/` directory
- **Filename Format**: `YYYYMMDDHHmm.txt` (Taiwan time)
- **Content**: Full conversation history as JSON
- **Trigger Conditions**:
  - Manual reset command
  - Persona change
  - 1 hour of inactivity
- **Skip Condition**: If conversation only contains system prompt (no actual conversation)

### 5. Persona Customization

- **Default**: "You are Grok, a highly intelligent, helpful AI assistant."
- **Modification**: Via owner menu → "設定人設" (Set System Prompt)
- **Persistence**: New persona persists across conversation resets
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

**Process Flow:**
1. Clear inactivity timer
2. Check rate limit
3. Validate message content
4. Handle special commands (reset)
5. Add user message to conversation history
6. Call Grok API with full conversation history
7. Parse AI response
8. Add AI response to conversation history
9. Return AI response
10. Reset inactivity timer (1 hour)

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

**Process Flow:**
1. Archive current conversation (if exists)
2. Update `currentSystemPrompt` global variable
3. Reset conversation history with new system prompt
4. Return success message

## Configuration

### LSL Script Configuration

**Required:**
```lsl
string url_base = "http://your-server-ip:3000";
```

**Key Variables:**
- `gIsActive`: Controls pause/resume state (TRUE/FALSE)
- `gWaitingForPrompt`: Tracks if waiting for persona input
- `gDialogChannel`: Random channel for owner menu (1000-101000)

### Server Configuration

**Environment Variables** (`server/key.env`):
```
XAI_API_KEY=your-api-key-here
```

**Server Settings:**
- Default port: 3000
- Rate limit: 40 requests/hour (configurable in code)
- Inactivity timeout: 3600 seconds (1 hour)
- Max tokens: 300 per response
- Model: `grok-4-1-fast-non-reasoning`

**Adjustable Constants:**
- `MAX_REQUESTS_PER_HOUR`: Line 32 in `index.js`
- Server port: Line 196 in `index.js`
- Inactivity timeout: Line 177 in `index.js` (3600 * 1000)
- Max tokens: Line 153 in `index.js`

## Grok API Integration

**Endpoint:** `https://api.x.ai/v1/chat/completions`

**Request Format:**
```json
{
  "messages": [
    { "role": "system", "content": "System prompt" },
    { "role": "user", "content": "User message 1" },
    { "role": "assistant", "content": "AI response 1" },
    { "role": "user", "content": "User message 2" }
  ],
  "model": "grok-4-1-fast-non-reasoning",
  "stream": false,
  "max_tokens": 300
}
```

**Response Parsing:**
The server handles two possible response formats:
1. `response.data.output[0].content[0].text` (primary)
2. `response.data.choices[0].message.content` (fallback)

## Error Handling

### LSL Script Errors

- **HTTP Errors**: Displayed to owner via `llOwnerSay()`
- **Connection Errors**: Shown with status code and body
- **Success Messages**: System messages (persona changes, memory clears) sent to owner
- **Chat Responses**: Normal AI responses spoken in public chat

### Server Errors

- **API Errors**: Logged to console, error message sent to LSL
- **Rate Limit**: HTTP 429 with informative message
- **Validation Errors**: HTTP 400 for missing/invalid data
- **Network Errors**: HTTP 500 with error details
- **Conversation Rollback**: User message removed from history on API failure

## State Management

### LSL Script States

- **Active**: `gIsActive = TRUE` - Listening and processing messages
- **Paused**: `gIsActive = FALSE` - Ignoring all chat messages
- **Waiting for Prompt**: `gWaitingForPrompt = TRUE` - Expecting persona input

### Server States

- **Conversation History**: Array maintained in memory
- **Current System Prompt**: Global variable for persona
- **Rate Limit Counter**: Tracks requests in current hour
- **Inactivity Timer**: Node.js timeout for auto-archive

## Logging and Debugging

### Server Logs

Console output includes:
- Server startup messages
- Rate limit status
- Incoming messages with request count
- AI responses
- Archive operations with filenames
- Error messages with details

### Conversation Logs

- **Location**: `server/logs/`
- **Format**: JSON files with full conversation history
- **Naming**: Taiwan time format `YYYYMMDDHHmm.txt`
- **Content**: Complete message array including system, user, and assistant messages

## Security Considerations

- **API Key**: Stored in `key.env` (not in git)
- **Rate Limiting**: Prevents abuse and cost overruns
- **Input Validation**: Server validates message content
- **Error Messages**: Don't expose sensitive information
- **Owner-Only Controls**: Menu system restricted to object owner

## Performance Characteristics

- **Response Time**: Depends on Grok API latency (typically 1-3 seconds)
- **Memory Usage**: Grows with conversation length (reset every hour or on demand)
- **Rate Limit**: 40 requests/hour = ~0.67 requests/minute
- **Concurrent Requests**: Single-threaded Node.js, processes sequentially

## Extension Points

Potential enhancements:
- Multiple conversation contexts (per-user memory)
- Database storage instead of file-based logs
- WebSocket for real-time updates
- Admin dashboard for monitoring
- Multiple AI model support
- Conversation search and retrieval
- Custom rate limits per user
- Scheduled conversation resets

## Dependencies

### Server Dependencies
- `express`: Web framework
- `axios`: HTTP client for Grok API
- `dotenv`: Environment variable management
- `fs`: File system operations (built-in)
- `path`: Path utilities (built-in)

### LSL Requirements
- Second Life viewer with LSL scripting support
- HTTP request capability
- Dialog and text box support
- Owner permissions for controls
