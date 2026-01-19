# Second Life AI Bot / Second Life AI 机器人

An AI chatbot bot for Second Life powered by X.AI's Grok API. This project consists of a Node.js server that handles chat requests and an LSL script for Second Life.

一个基于 X.AI Grok API 的 Second Life AI 聊天机器人。本项目包含一个处理聊天请求的 Node.js 服务器和一个 Second Life 的 LSL 脚本。

## Features / 功能

- 🤖 AI-powered chat using Grok API / 使用 Grok API 的 AI 聊天
- 💬 Real-time conversation with context memory / 带上下文记忆的实时对话
- ⚙️ Customizable AI persona / 可自定义 AI 人设
- 📊 Rate limiting (40 requests per hour) / 流量限制（每小时 40 次）
- 📝 Automatic conversation logging / 自动对话日志记录
- 🎮 OOC filter support (ignores messages in `((...))`) / 支持 OOC 过滤（忽略 `((...))` 消息）
- ⏸️ Pause/resume functionality / 暂停/恢复功能

## Project Structure / 项目结构

```
secondlife-ai-bot/
├── server/              # Node.js server / Node.js 服务器
│   ├── index.js        # Main server file / 主服务器文件
│   ├── package.json    # Dependencies / 依赖项
│   ├── key.env         # API keys (not in git) / API 密钥（不在 git 中）
│   └── logs/           # Conversation logs / 对话日志
└── lsl/                # LSL scripts / LSL 脚本
    └── brain.lsl       # Main bot script / 主机器人脚本
```

## Prerequisites / 前置要求

- Node.js (v14 or higher) / Node.js（v14 或更高版本）
- npm / npm
- X.AI API key / X.AI API 密钥
- Second Life account / Second Life 账号

## Installation / 安装

### 1. Clone the repository / 克隆仓库

```bash
git clone https://github.com/poiappoipoi/secondlife-ai-bot.git
cd secondlife-ai-bot
```

### 2. Install dependencies / 安装依赖

```bash
cd server
npm install
```

### 3. Configure API keys / 配置 API 密钥

Edit `server/key.env` and add your API keys:

编辑 `server/key.env` 并添加你的 API 密钥：

```env
XAI_API_KEY=your-xai-api-key-here
OPENAI_API_KEY=your-openai-api-key-here
```

**Note:** Only `XAI_API_KEY` is required. The server uses Grok API.

**注意：** 只需要 `XAI_API_KEY`。服务器使用 Grok API。

## Usage / 使用方法

### Starting the server / 启动服务器

```bash
cd server
node index.js
```

The server will start on port 3000 by default.

服务器将在默认端口 3000 上启动。

### Exposing Your Server / 暴露服务器

To allow your Second Life LSL script to connect to the server, you need to expose it to the internet. There are several options:

为了让 Second Life LSL 脚本连接到服务器，您需要将其暴露到互联网。有几种选择：

#### Option 1: Cloudflare Tunnel (Recommended) / Cloudflare 隧道（推荐）

Cloudflare Tunnel is the easiest and most secure way to expose your server without opening firewall ports. See [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) for detailed setup instructions.

Cloudflare 隧道是最简单、最安全的方式，无需打开防火墙端口即可暴露服务器。有关详细设置说明，请参阅 [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)。

**Quick Start / 快速开始:**
```bash
# Install cloudflared / 安装 cloudflared
# Then run / 然后运行:
cloudflared tunnel --url http://localhost:3000
```

#### Option 2: Direct IP Access / 直接 IP 访问

If your server is accessible via a public IP, you can use it directly. Make sure port 3000 (or your configured PORT) is open in your firewall.

如果您的服务器可通过公共 IP 访问，可以直接使用它。确保防火墙中开放了端口 3000（或您配置的 PORT）。

### Setting up in Second Life / 在 Second Life 中设置

1. Copy the content of `lsl/brain.lsl` / 复制 `lsl/brain.lsl` 的内容
2. Create a new script in Second Life / 在 Second Life 中创建新脚本
3. Paste the script and set `url_base` to your server URL / 粘贴脚本并设置 `url_base` 为您的服务器 URL：

**If using Cloudflare Tunnel / 如果使用 Cloudflare 隧道:**
```lsl
string url_base = "https://your-domain.example.com";
// or for quick tunnel / 或快速隧道:
string url_base = "https://random-name.trycloudflare.com";
```

**If using direct IP / 如果使用直接 IP:**
```lsl
string url_base = "http://your-server-ip:3000";
```

4. Save and reset the script / 保存并重置脚本

### Controls / 控制

**Touch the object / 点击对象：**

- **设定人设 / Set System Prompt:** Configure the AI's personality / 配置 AI 的性格
- **清除记忆 / Clear Memory:** Reset conversation history / 重置对话历史
- **开启/暂停 / Pause/Resume:** Toggle listening state / 切换监听状态

## API Endpoints / API 接口

### POST `/chat`

Send a message to the AI / 向 AI 发送消息

**Request / 请求：**
```json
{
  "message": "Hello, how are you?"
}
```

**Response / 响应：**
```
AI response text
```

### POST `/SetSystemPrompt`

Set the AI's system prompt (persona) / 设置 AI 的系统提示词（人设）

**Request / 请求：**
```json
{
  "prompt": "You are a friendly assistant."
}
```

**Response / 响应：**
```
设定成功！我現在是：You are a friendly assistant.
```

### Reset conversation / 重置对话

Send `reset` or `清除` as the message to clear conversation history.

发送 `reset` 或 `清除` 作为消息以清除对话历史。

## Rate Limiting / 流量限制

The server limits requests to 40 per hour per instance. When the limit is reached, requests will return a 429 status code.

服务器限制每个实例每小时 40 次请求。达到限制时，请求将返回 429 状态码。

## Configuration / 配置

### Change server port / 更改服务器端口

Edit `server/index.js` line 196:

编辑 `server/index.js` 第 196 行：

```javascript
app.listen(3000, () => {
    // ...
});
```

### Adjust rate limit / 调整流量限制

Edit `server/index.js` line 32:

编辑 `server/index.js` 第 32 行：

```javascript
const MAX_REQUESTS_PER_HOUR = 40; // Change this value / 更改此值
```

## Logs / 日志

Conversation logs are automatically saved to `server/logs/` directory with timestamps in Taiwan time format.

对话日志会自动保存到 `server/logs/` 目录，使用台湾时间格式的时间戳。

## OOC Filter / OOC 过滤

Messages starting with `((` are automatically filtered out (Out Of Character messages).

以 `((` 开头的消息会自动被过滤（角色外消息）。

## Troubleshooting / 故障排除

### Server won't start / 服务器无法启动

- Check if port 3000 is already in use / 检查端口 3000 是否已被使用
- Verify `key.env` file exists and contains valid API keys / 验证 `key.env` 文件存在且包含有效的 API 密钥

### Bot not responding in Second Life / Second Life 中机器人无响应

- Verify `url_base` in `brain.lsl` matches your server IP and port / 验证 `brain.lsl` 中的 `url_base` 与服务器 IP 和端口匹配
- Check server logs for errors / 检查服务器日志中的错误
- Ensure the bot is in "Active" state (not paused) / 确保机器人处于"活动"状态（未暂停）

## License / 许可证

This project is open source. Feel free to modify and use as needed.

本项目是开源的。欢迎根据需要修改和使用。

## Contributing / 贡献

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请随时提交 Pull Request。
