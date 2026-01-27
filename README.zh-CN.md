# Second Life AI 机器人

**[简体中文](#简体中文) | [English](README.md#english)**

---

## 简体中文

一个由 X.AI 的 Grok API 或本地 LLM 驱动的 Second Life 智能聊天机器人。该机器人采用 NPC 状态机，使其有选择性地响应，创造更像真实角色的交互体验。

### 功能

- 🤖 **多个 AI 提供商** - 支持 X.AI Grok 和本地 Ollama
- 🧠 **NPC 状态机** - 有选择性的响应行为，不是简单的聊天机器人
- 💭 **对话记忆** - 具有可配置历史的上下文感知响应
- 📚 **人物设定系统** - 从 markdown 文件加载角色定义
- 🎯 **记忆关键词** - 关键字激活的记忆注入（灵感来自 SillyTavern 的 Lorebook）
- 📊 **流量限制** - 可配置的请求限制（默认：40/小时）
- 📝 **日志记录** - 自动对话日志记录，支持时区
- 🎮 **LSL 集成** - 带有触摸菜单控制的 Second Life 物体脚本
- 🔍 **OOC 过滤** - 自动忽略角色外消息 `((...))`
- ⏸️ **暂停/恢复** - 控制机器人监听状态

### 快速开始

#### 前置要求

- [Bun.js](https://bun.sh)（v1.0.0 或更高版本）
- 来自 [x.ai](https://x.ai) 的 X.AI API 密钥
- Second Life 账户

#### 安装

1. **克隆仓库**

```bash
git clone https://github.com/poiappoipoi/secondlife-ai-bot.git
cd secondlife-ai-bot/server
```

2. **安装依赖**

```bash
bun install
```

3. **配置环境**

将 `.env.example` 复制到 `.env` 并添加 API 密钥：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 服务器
PORT=3000

# AI 提供商 (xai | ollama)
AI_PROVIDER=xai
XAI_API_KEY=你的-xai-api-密钥

# 可选：Ollama（本地 LLM）
# OLLAMA_BASE_URL=http://localhost:11434/v1
# OLLAMA_MODEL=cat-maid
```

4. **启动服务器**

```bash
bun run dev          # 开发模式（热重新加载）
bun run start        # 生产模式
```

服务器默认在端口 3000 启动。

### 在 Second Life 中设置

1. 复制 `lsl/brain.lsl` 的内容
2. 在 Second Life 物体中创建新脚本
3. 粘贴并修改配置：

```lsl
string url_base = "你的服务器地址";
```

**如果使用 Cloudflare 隧道（推荐）：**
```lsl
string url_base = "https://random-name.trycloudflare.com";
```

**如果使用直接 IP：**
```lsl
string url_base = "http://你的服务器IP:3000";
```

4. 保存并重置脚本
5. 触摸物体查看菜单

### 菜单控制

- **設定人設** - 更改 AI 的人物设定
- **清除記憶** - 重置对话历史
- **開啟/暫停** - 切换监听状态

### 项目结构

```
server/
├── src/
│   ├── index.ts              # 入口点
│   ├── app.ts                # Express 应用设置
│   ├── config/               # 类型安全的配置
│   ├── types/                # TypeScript 定义
│   ├── providers/            # AI 提供商实现
│   │   ├── base.ts           # 基础提供商类
│   │   ├── xai.ts            # X.AI Grok 提供商
│   │   └── ollama.ts         # Ollama 提供商
│   ├── services/             # 业务逻辑
│   │   ├── conversation.ts   # 消息历史
│   │   ├── decision-layer.ts # NPC 决策制定
│   │   ├── state-machine.ts  # NPC 状态管理
│   │   ├── message-buffer.ts # 每个头像的缓冲
│   │   ├── memory.ts         # 关键字记忆系统
│   │   ├── rate-limiter.ts   # 请求限制
│   │   ├── logger.ts         # 文件日志
│   │   └── persona.ts        # 人物设定加载
│   ├── routes/               # API 端点
│   │   ├── chat.ts           # POST /chat
│   │   └── memory.ts         # POST /memory/reset
│   ├── utils/                # 工具函数
│   └── __tests__/            # 单元测试
├── personas/                 # 人物设定 markdown 文件
│   └── cat-maid.md           # 示例人物设定
└── logs/                     # 对话日志（自动创建）
```

### API 端点

#### POST `/chat`

向 AI 机器人发送消息。

**请求：**
```json
{
  "speaker": "John Doe",
  "message": "你好，你好吗？",
  "avatarId": "uuid-可选"
}
```

**响应：**
- `200 OK` - AI 的纯文本响应
- `202 Accepted` - NPC 收到消息但选择不响应
- `429 Too Many Requests` - 超过速率限制

#### POST `/memory/reset`

清除对话历史并保存到日志。

**响应：**
- `204 No Content` - 成功

### 配置

环境变量（查看 `.env.example` 获取所有选项）：

```env
# 服务器
PORT=3000
NODE_ENV=development

# AI 提供商
AI_PROVIDER=xai                    # xai 或 ollama
AI_MAX_TOKENS=300
AI_TIMEOUT_MS=30000

# X.AI Grok
XAI_API_KEY=sk-...
XAI_MODEL=grok-4-1-fast-non-reasoning

# Ollama（本地 LLM）
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=cat-maid

# 流量限制
RATE_LIMIT_MAX=40
RATE_LIMIT_WINDOW_MS=3600000      # 1 小时

# 对话
CONVERSATION_MAX_HISTORY_MESSAGES=50
INACTIVITY_TIMEOUT_MS=3600000

# 人物设定
PERSONA_FILE=cat-maid.md
PERSONAS_DIR=./personas

# NPC 状态机（可选）
NPC_ENABLED=true
NPC_TICK_INTERVAL_MS=1000
NPC_LISTENING_TIMEOUT_MS=15000
NPC_RESPONSE_THRESHOLD=50
NPC_RESPONSE_CHANCE=0.8
NPC_TRIGGER_WORDS=maid,cat-maid

# 日志
LOG_LEVEL=info
LOG_TIMEZONE=UTC
```

### 创建自定义人物设定

人物设定文件是 `personas/` 目录中的 markdown 文件。示例结构：

```markdown
# 系统提示

你是一个有帮助且友好的 AI 助手。
你喜欢帮助人们，总是礼貌地回应。

### 性格特征

- 友好且平易近人
- 对 Second Life 有了解
- 耐心解答问题

### 世界背景

这次对话发生在 Second Life，一个虚拟现实平台。
```

系统提示（第一个 `###` 之前）被用作 AI 的指令。以 `###` 开头的部分被解析为人物设定事实。

### 开发命令

```bash
# 开发服务器（热重新加载）
bun run dev

# 生产服务器
bun run start

# 类型检查
bun run typecheck
bun run typecheck:watch

# 代码检查
bun run lint
bun run lint:fix

# 代码格式化
bun run format
bun run format:check

# 测试
bun test
bun test:watch

# 质量检查（所有检查一次）
npm run check
```

### NPC 状态机

机器人使用可选的状态机使其更像 NPC：

1. **IDLE** - 等待消息
2. **LISTENING** - 从头像收集消息
3. **THINKING** - 处理并决定是否响应
4. **SPEAKING** - 生成 AI 响应

**决策因素：**
- 直接提及（由关键词触发）
- 最近交互历史
- 消息频率
- 随机因素（不可预测性）
- 头像冷却时间（防止垃圾邮件）

### 故障排除

**服务器无法启动**
- 检查端口 3000 是否已被使用：`lsof -i :3000`
- 验证 `.env` 文件存在且具有有效的 API 密钥
- 检查 Bun 安装：`bun --version`

**机器人在 Second Life 中无响应**
- 验证 `brain.lsl` 中的 `url_base` 与你的服务器 URL 匹配
- 检查服务器日志：`cat logs/chat_*.log`
- 确保机器人未暂停（检查物体上方的浮动文本）
- 验证是否超过了速率限制
- 检查到服务器的网络连接

**高延迟或超时**
- 增加 `.env` 中的 `AI_TIMEOUT_MS`
- 检查 LLM 提供商是否响应缓慢
- 减少 `AI_MAX_TOKENS` 以加快响应

### 服务器隧道

要将本地服务器暴露到 Second Life，请使用 Cloudflare 隧道：

```bash
# 安装 cloudflared
# macOS: brew install cloudflare-cli
# Windows: choco install cloudflare-warp
# Linux: wget https://github.com/cloudflare/warp-cli/releases/download/v1.0.0/warp-cli-linux-x86_64.zip

cloudflared tunnel --url http://localhost:3000
```

详见 [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)。

### 日志

对话日志自动保存到 `logs/` 目录，文件名如：
```
chat_2025-01-27_14-30-45.log
```

日志包含时区信息（通过 `LOG_TIMEZONE` 配置）。

### 许可证

此项目为开源项目。欢迎根据需要修改和使用。

### 贡献

欢迎贡献！请随时提交 Pull Request。
