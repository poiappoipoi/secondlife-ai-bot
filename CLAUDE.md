# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Second Life AI Bot - A chatbot integration for Second Life using X.AI's Grok API. The system consists of two components:
- **Node.js Express server** (`server/index.js`): Handles API requests and manages conversation state
- **LSL script** (`lsl/brain.lsl`): Second Life object script that captures chat and communicates with the server

## Common Development Commands

### Server

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Start the server (default port 3000)
npm start
# or
node index.js
```

### Configuration

Environment variables are stored in `server/key.env`:
```env
XAI_API_KEY=your-xai-api-key-here
OPENAI_API_KEY=your-openai-api-key-here  # Optional, not used
```

**Note**: Only `XAI_API_KEY` is required. The server uses Grok API exclusively.

## Architecture

### Server Architecture (`server/index.js`)

**Core Components**:
- **Express server**: REST API with two endpoints (`/chat`, `/SetSystemPrompt`)
- **Conversation memory**: In-memory array storing chat history with roles (system/user/assistant)
- **Rate limiting**: 40 requests per hour, automatically resets every hour
- **Auto-save system**: Saves conversation to timestamped log files after inactivity (1 hour) or manual reset
- **System prompt management**: Global `currentSystemPrompt` variable that persists across memory resets

**Key Global State**:
```javascript
currentSystemPrompt          // AI persona, survives memory resets
conversationHistory          // Array of {role, content} objects
requestCount                 // Rate limiter counter
rateLimitStartTime          // Rate limiter window start time
inactivityTimer             // Timeout handle for auto-save
```

**API Endpoints**:
- `POST /chat`: Send message to AI, returns AI response as plain text
  - Auto-resets conversation after 1 hour of inactivity
  - Special command: Send "reset" or "清除" to manually clear memory
  - Returns 429 status when rate limit exceeded
- `POST /SetSystemPrompt`: Update AI persona (saves old conversation first)

**Logging System**:
- Saves conversation history to `server/logs/` directory
- Filename format: `YYYYMMDDHHmm.txt` (Taiwan timezone)
- Contains full JSON of conversation history
- Triggered by: manual reset, system prompt change, 1-hour inactivity, or "reset" command

**X.AI API Integration**:
- Endpoint: `https://api.x.ai/v1/chat/completions`
- Model: `grok-4-1-fast-non-reasoning`
- Max tokens: 300
- Sends entire conversation history for context

### LSL Script Architecture (`lsl/brain.lsl`)

**State Management**:
- `gIsActive`: Controls whether bot listens to chat (pause/resume functionality)
- `gWaitingForPrompt`: Flag for expecting system prompt input from text box
- Status displayed as hover text with color coding (purple=active, red=paused)

**Key Features**:
- **OOC Filter**: Automatically ignores messages starting with `((` (Out Of Character)
- **Agent-only listening**: Filters out messages from non-avatar sources using `llGetAgentSize()`
- **Self-filtering**: Ignores messages from the bot itself
- **Owner-only controls**: Touch menu restricted to object owner

**Communication Flow**:
1. LSL script listens on public chat (channel 0)
2. Filters applied: not from self → is avatar → not OOC → bot is active
3. HTTP POST to server `/chat` endpoint with JSON payload
4. Server responds with AI reply as plain text
5. LSL speaks response using `llSay(0, body)`

**Touch Menu Options** (owner only):
- **設定人設 / Set System Prompt**: Opens text box to change AI persona
- **清除記憶 / Clear Memory**: Sends "reset" message to clear conversation history
- **開啟/暫停 / Pause/Resume**: Toggles `gIsActive` state
- **取消 / Cancel**: Closes menu

**Configuration Required**:
- Set `url_base` in line 1 to your server address (e.g., `"http://your-ip:3000"`)

## Important Implementation Details

### Rate Limiting Logic
The rate limiter uses a sliding window approach:
- Tracks `requestCount` and `rateLimitStartTime`
- Resets counter when 1 hour (3600000ms) has elapsed
- Increments count on each `/chat` request
- Returns 429 error when limit reached

### Memory Reset Behavior
When conversation history is reset:
1. **Old conversation is saved** to logs (unless history is empty)
2. **System prompt is preserved** using `currentSystemPrompt` variable
3. **New conversation history** initialized with current system prompt
4. **Inactivity timer** is cleared and restarted after next message

This ensures the AI persona persists across memory resets, preventing the need to reconfigure after every reset.

### Taiwan Timezone Logging
Log filenames use `Asia/Taipei` timezone via `Intl.DateTimeFormat` with parts parsing to construct `YYYYMMDDHHmm.txt` format.

### Error Handling
- **Server errors**: Returns 500 status with error message
- **LSL HTTP errors**: Displays error status code to owner via `llOwnerSay()`
- **Rate limit**: Returns 429 with descriptive message showing current count
- **Missing message**: Returns 400 status
- **API failures**: Removes failed user message from conversation history (pops last entry)

## Server Port Configuration

Default port is 3000. To change:
- Edit line 196 in `server/index.js`: `app.listen(3000, ...)`

## Rate Limit Adjustment

To modify hourly request limit:
- Edit line 32 in `server/index.js`: `const MAX_REQUESTS_PER_HOUR = 40;`
