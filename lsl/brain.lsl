string url_base = ""; // ★ 請確認 IP 是否正確

integer gDialogChannel;
integer gListenHandle_Chat;
integer gListenHandle_Dialog;
key gOwner;

integer gWaitingForPrompt = FALSE; 
integer gIsActive = TRUE; 

// 更新狀態顯示的函式
update_status() {
    if (gIsActive) {
        // 開啟狀態：粉紫色文字 (Talk To AI Brain)
        llSetText(" \n \n \nTalk To AI Brain", <1.0, 0.0, 1.0>, 1.0);
    } else {
        // 暫停狀態：紅色文字
        llSetText(" \n \n \nZzz... (PAUSED)", <1.0, 0.0, 0.0>, 1.0);
    }
}

init() {
    gOwner = llGetOwner();
    gDialogChannel = (integer)llFrand(100000.0) + 1000;
    
    // 初始化文字
    update_status();
    
    llListenRemove(gListenHandle_Chat);
    llListenRemove(gListenHandle_Dialog);
    
    // 監聽所有人
    gListenHandle_Chat = llListen(0, "", NULL_KEY, "");
    // 監聽選單
    gListenHandle_Dialog = llListen(gDialogChannel, "", gOwner, "");
    
    llOwnerSay("系統已就緒。已開啟 OOC 過濾功能 ((...))。");
}

default
{
    state_entry() {
        init();
    }

    on_rez(integer start_param) {
        init();
    }

    touch_start(integer total_number) {
        if (llDetectedKey(0) != gOwner) {
            llWhisper(0, "我是 AI 機器人，直接跟我說話就可以了。");
            return; 
        }
        
        gWaitingForPrompt = FALSE;
        
        // 判斷目前狀態，顯示在選單標題上
        string status_msg = "【目前狀態: 運作中】";
        if (!gIsActive) status_msg = "【目前狀態: 已暫停】";

        // 跳出選單
        llDialog(gOwner, "\n" + status_msg + "\n請選擇操作：", 
            ["設定人設", "清除記憶", "開啟/暫停", "取消"], gDialogChannel);
    }

    listen(integer channel, string name, key id, string message) {
        
        // === 情況 A: 收到聊天訊息 ===
        if (channel == 0) {
            // 1. 不聽自己的話
            if (id == llGetKey()) return; 

            // 2. 過濾器：只聽真人的話
            // llGetAgentSize 如果回傳 ZERO_VECTOR，代表是物件
            if (llGetAgentSize(id) == ZERO_VECTOR) return;

            // ★★★ 新增過濾器：忽略 (( ... )) 的 OOC 發言 ★★★
            // 先把訊息前後的空白去掉
            string cleanMsg = llStringTrim(message, STRING_TRIM);
            // 檢查前兩個字是不是 "(("
            if (llGetSubString(cleanMsg, 0, 1) == "((") return;

            // 3. 如果處於暫停狀態，不傳送資料
            if (gIsActive == FALSE) return;

            string json = "{\"message\":\"" + message + "\"}";
            llHTTPRequest(url_base + "/chat", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], json);
            return;
        }

        // === 情況 B: 選單控制 ===
        if (channel == gDialogChannel) {
            if (message == "取消") return;

            if (message == "開啟/暫停") {
                if (gIsActive) {
                    gIsActive = FALSE;
                    llOwnerSay("系統: 已暫停監聽。");
                } else {
                    gIsActive = TRUE;
                    llOwnerSay("系統: 已恢復監聽。");
                }
                update_status(); // 更新頭頂文字顏色
                return;
            }

            else if (message == "設定人設") {
                gWaitingForPrompt = TRUE;
                llTextBox(id, "\n請輸入新的 AI 人設：", gDialogChannel);
                return;
            }
            else if (message == "清除記憶") {
                 llHTTPRequest(url_base + "/chat", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], "{\"message\":\"reset\"}");
                 return;
            }
            else if (gWaitingForPrompt == TRUE) {
                llOwnerSay("正在修改人設為: " + message);
                string json = "{\"prompt\":\"" + message + "\"}";
                llHTTPRequest(url_base + "/SetSystemPrompt", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], json);
                gWaitingForPrompt = FALSE;
            }
        }
    }

    http_response(key request_id, integer status, list metadata, string body) {
        if (status == 200) {
            if (llSubStringIndex(body, "設定成功") != -1 || llSubStringIndex(body, "記憶已清除") != -1) {
                llOwnerSay("系統: " + body);
            } 
            else {
                llSay(0, body);
            }
        } else {
            llOwnerSay("連線錯誤 (" + (string)status + "): " + body);
        }
    }
}