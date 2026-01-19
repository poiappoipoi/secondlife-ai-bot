# Postman 测试指南

本文档说明如何使用 Postman 测试 AI Bot 的 API 端点。

## 前置准备

1. **启动服务器**
   ```bash
   cd server
   npm run dev  # 开发模式（推荐）
   # 或
   npm start    # 生产模式
   ```

2. **确保 Ollama 运行**（如果使用 Ollama provider）
   ```bash
   ollama serve
   ```

3. **确认服务器地址**
   - 默认地址：`http://localhost:3000`
   - 如果修改了端口，请使用相应的地址

## API 端点

### 1. POST /chat - 发送聊天消息

**请求配置：**
- **Method**: `POST`
- **URL**: `http://localhost:3000/chat`
- **Headers**:
  ```
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "message": "你好，你是谁？"
  }
  ```

**示例请求：**
```json
{
  "message": "Hello, how are you?"
}
```

**响应：**
- 成功：返回 AI 的回复（纯文本）
- 错误 400：`Error: No message content received`
- 错误 429：`API request limit reached. Maximum 40 requests per hour.`
- 错误 500：`API error: [错误信息]`

**特殊命令：**
- 发送 `"reset"` 或 `"清除"` 可以清除对话历史

---

### 2. POST /SetSystemPrompt - 设置系统提示词（人设）

**请求配置：**
- **Method**: `POST`
- **URL**: `http://localhost:3000/SetSystemPrompt`
- **Headers**:
  ```
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "prompt": "你是一只可爱的猫娘女仆，名字叫 Poi。"
  }
  ```

**示例请求：**
```json
{
  "prompt": "You are a helpful AI assistant."
}
```

**响应：**
- 成功：`設定成功！我現在是：[你设置的提示词]`
- 错误 400：`Please provide prompt content`

---

## Postman 操作步骤

### 步骤 1：创建新请求

1. 打开 Postman
2. 点击 "New" → "HTTP Request"
3. 或点击 "New" → "Collection" 创建一个集合来组织所有请求

### 步骤 2：配置聊天请求

1. **设置请求方法**：选择 `POST`
2. **输入 URL**：`http://localhost:3000/chat`
3. **设置 Headers**：
   - 点击 "Headers" 标签
   - 添加：
     - Key: `Content-Type`
     - Value: `application/json`
4. **设置 Body**：
   - 点击 "Body" 标签
   - 选择 "raw"
   - 右侧下拉菜单选择 "JSON"
   - 输入 JSON 内容：
     ```json
     {
       "message": "你好"
     }
     ```
5. **发送请求**：点击 "Send" 按钮

### 步骤 3：配置系统提示词请求

1. **设置请求方法**：选择 `POST`
2. **输入 URL**：`http://localhost:3000/SetSystemPrompt`
3. **设置 Headers**：同步骤 2
4. **设置 Body**：
   ```json
   {
     "prompt": "你是一只可爱的猫娘女仆"
   }
   ```
5. **发送请求**：点击 "Send" 按钮

---

## 测试流程示例

### 完整对话测试流程

1. **设置人设**
   ```
   POST http://localhost:3000/SetSystemPrompt
   Body: { "prompt": "你是一只可爱的猫娘女仆，名字叫 Poi。" }
   ```

2. **发送第一条消息**
   ```
   POST http://localhost:3000/chat
   Body: { "message": "你好，你是谁？" }
   ```

3. **继续对话**（保持上下文）
   ```
   POST http://localhost:3000/chat
   Body: { "message": "你喜欢吃什么？" }
   ```

4. **清除记忆**
   ```
   POST http://localhost:3000/chat
   Body: { "message": "reset" }
   ```

---

## 常见问题

### 1. 连接被拒绝 (Connection refused)

**原因**：服务器未启动

**解决**：
- 检查服务器是否正在运行
- 确认端口号是否正确（默认 3000）
- 检查防火墙设置

### 2. 429 错误（请求过多）

**原因**：达到速率限制（默认每小时 40 次）

**解决**：
- 等待一段时间后重试
- 或修改 `RATE_LIMIT_MAX` 环境变量

### 3. 500 错误（API 错误）

**可能原因**：
- Ollama 未运行（如果使用 Ollama provider）
- 模型不存在（需要先运行 `ollama create cat-maid -f cat-maid.modelfile`）
- API 密钥错误（如果使用 X.AI provider）

**解决**：
- 检查 Ollama 服务状态
- 确认模型已创建
- 检查环境变量配置

### 4. 响应为空或格式错误

**检查**：
- 确认请求 Body 格式为 JSON
- 确认 Content-Type header 设置为 `application/json`
- 查看服务器控制台日志

---

## Postman Collection 导入（可选）

你可以创建一个 Postman Collection 文件来保存所有请求配置。创建 `ai-bot.postman_collection.json`：

```json
{
  "info": {
    "name": "AI Bot API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Chat",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"message\": \"你好\"\n}"
        },
        "url": {
          "raw": "http://localhost:3000/chat",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["chat"]
        }
      }
    },
    {
      "name": "Set System Prompt",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"prompt\": \"你是一只可爱的猫娘女仆\"\n}"
        },
        "url": {
          "raw": "http://localhost:3000/SetSystemPrompt",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["SetSystemPrompt"]
        }
      }
    }
  ]
}
```

然后在 Postman 中：File → Import → 选择该 JSON 文件

---

## 提示

- 服务器日志会显示所有请求和响应，方便调试
- 对话历史会保存在内存中，直到服务器重启或收到 reset 命令
- 使用 Postman 的 "Save" 功能保存常用请求
- 可以创建环境变量（Environment）来管理不同的服务器地址
