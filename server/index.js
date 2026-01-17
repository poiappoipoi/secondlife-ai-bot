require('dotenv').config({ path: 'key.env' });
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

// --- 0. 初始化設定 ---

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
    console.log('--- 已自動建立 logs 資料夾 ---');
}

// ★ 全域變數：目前的人設 (預設值)
let currentSystemPrompt = "You are Grok, a highly intelligent, helpful AI assistant.";

// 大腦記憶區
let conversationHistory = [
    { role: "system", content: currentSystemPrompt }
];

// 定義倒數計時器
let inactivityTimer = null;

// ==========================================
// ★ 新增功能：流量限制 (Rate Limiter) 設定
// ==========================================
const MAX_REQUESTS_PER_HOUR = 40; // 每小時最多 40 次
let requestCount = 0;             // 目前已用次數
let rateLimitStartTime = Date.now(); // 開始計算的時間點

// 檢查是否超過限制的函式
function checkRateLimit() {
    const now = Date.now();
    // 如果距離上次重置已經超過 1 小時 (3600000 毫秒)
    if (now - rateLimitStartTime > 3600 * 1000) {
        requestCount = 0;           // 歸零
        rateLimitStartTime = now;   // 重設開始時間
        console.log("--- 流量計數器已重置 (新的一小時開始) ---");
    }

    // 檢查次數
    if (requestCount >= MAX_REQUESTS_PER_HOUR) {
        return false; // 超過限制，禁止通行
    }

    requestCount++; // 次數 +1
    return true;    // 通行
}
// ==========================================


// --- 工具函式：取得台灣時間檔名 ---
function getTaiwanTimeFilename() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    const parts = formatter.formatToParts(now);
    const get = (type) => parts.find(p => p.type === type).value;
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}`;
}

// --- 核心功能：存檔並重置 ---
function saveAndResetHistory(reason = "自動逾時") {
    // 1. 如果只有系統提示詞，就不存檔，直接重置計時器
    if (conversationHistory.length <= 1) {
        return;
    }

    // 2. 存檔
    const filename = `${getTaiwanTimeFilename()}.txt`;
    const filePath = path.join(logsDir, filename);
    const fileContent = JSON.stringify(conversationHistory, null, 2);

    try {
        fs.writeFileSync(filePath, fileContent, 'utf8');
        console.log(`\n【日記已儲存】: ${filename} (原因: ${reason})`);
    } catch (err) {
        console.error("存檔失敗:", err);
    }

    // 3. ★ 重置記憶 (修正：使用 currentSystemPrompt，確保人設不跑掉)
    conversationHistory = [
        { role: "system", content: currentSystemPrompt }
    ];
    console.log("--- 記憶已重置 ---");
}

// === 路由: 設定人設 ===
app.post('/SetSystemPrompt', (req, res) => {
    const newPrompt = req.body.prompt;
    console.log(`\n[收到設定指令]: 修改人設為 -> ${newPrompt}`);

    if (newPrompt) {
        // 先把舊的記憶存檔起來，以免遺失
        saveAndResetHistory("更換人設前存檔");

        // 更新全域變數
        currentSystemPrompt = newPrompt;
        
        // 重新初始化記憶 (使用新的人設)
        conversationHistory = [
            { role: "system", content: currentSystemPrompt }
        ];
        
        res.send(`設定成功！我現在是：${newPrompt}`);
    } else {
        res.status(400).send("請提供 prompt 內容");
    }
});

// === 主程式路由 ===
app.post('/chat', async (req, res) => {
    // 清除閒置計時器
    if (inactivityTimer) clearTimeout(inactivityTimer);

    // ★★★ 檢查流量限制 ★★★
    if (!checkRateLimit()) {
        console.log(`!!! 阻擋請求：已達每小時限制 (${requestCount}/${MAX_REQUESTS_PER_HOUR}) !!!`);
        return res.status(429).send(`API 請求次數過多。每小時限制 ${MAX_REQUESTS_PER_HOUR} 次，請稍後再試。目前: ${requestCount}/${MAX_REQUESTS_PER_HOUR}`);
    }

    const userMessage = req.body.message;
    
    // 如果沒有訊息內容
    if (!userMessage) return res.status(400).send("錯誤：沒收到訊息內容");

    console.log(`\n[收到 SL 訊息]: ${userMessage} (本小時第 ${requestCount} 次)`);

    // 手動重置
    if (userMessage.trim().toLowerCase() === "reset" || userMessage === "清除") {
        saveAndResetHistory("手動指令");
        return res.send("【記憶已清除】剛剛的對話已經幫你存檔囉！");
    }

    try {
        conversationHistory.push({ role: "user", content: userMessage });

        const response = await axios.post(
            'https://api.x.ai/v1/chat/completions',
            {
                messages: conversationHistory,
                model: "grok-4-1-fast-non-reasoning",
                stream: false,
                max_tokens: 300
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.XAI_API_KEY}`
                }
            }
        );

        let aiReply = "";
        if (response.data.output?.[0]?.content?.[0]?.text) {
            aiReply = response.data.output[0].content[0].text;
        } else if (response.data.choices?.[0]?.message?.content) {
            aiReply = response.data.choices[0].message.content;
        } else {
            aiReply = "錯誤：無法解析 AI 回應格式";
        }

        console.log(`[AI 回覆]: ${aiReply}`);
        conversationHistory.push({ role: "assistant", content: aiReply });
        res.send(aiReply);

        // 重設閒置計時器 (1小時後自動存檔)
        inactivityTimer = setTimeout(() => {
            saveAndResetHistory("閒置超過1小時");
        }, 3600 * 1000);


    } catch (error) {
        console.error("!!! 發生錯誤 !!!");
        conversationHistory.pop(); 

        if (error.response) {
            console.error("狀態碼:", error.response);
            res.status(500).send(`API 報錯: ${error.response.status}`);
        } else {
            console.error(error.message);
            res.status(500).send("連線錯誤");
        }
    }
});

app.listen(80, () => {
    console.log('--- Grok Server 已啟動 ---');
    console.log(`--- 流量限制: 每小時 ${MAX_REQUESTS_PER_HOUR} 次 ---`);
});