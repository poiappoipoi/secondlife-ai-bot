string url_base = ""; // ★ Please confirm the IP is correct

integer gDialogChannel;
integer gListenHandle_Chat;
integer gListenHandle_Dialog;
key gOwner;

integer gWaitingForPrompt = FALSE; 
integer gIsActive = TRUE; 

// JSON string escape function (handles quotes, backslashes, and other special characters)
string escape_json(string input) {
    string result = "";
    integer len = llStringLength(input);
    integer i;
    for (i = 0; i < len; i++) {
        string char = llGetSubString(input, i, i);
        if (char == "\\") {
            result += "\\\\";
        } else if (char == "\"") {
            result += "\\\"";
        } else if (char == "\n") {
            result += "\\n";
        } else if (char == "\r") {
            result += "\\r";
        } else if (char == "\t") {
            result += "\\t";
        } else {
            result += char;
        }
    }
    return result;
}

// Function to update status display
update_status() {
    if (gIsActive) {
        // Active state: magenta text (Talk To AI Brain)
        llSetText(" \n \n \nTalk To AI Brain", <1.0, 0.0, 1.0>, 1.0);
    } else {
        // Paused state: red text
        llSetText(" \n \n \nZzz... (PAUSED)", <1.0, 0.0, 0.0>, 1.0);
    }
}

init() {
    gOwner = llGetOwner();
    gDialogChannel = (integer)llFrand(100000.0) + 1000;
    
    // Initialize text
    update_status();
    
    llListenRemove(gListenHandle_Chat);
    llListenRemove(gListenHandle_Dialog);
    
    // Listen to everyone
    gListenHandle_Chat = llListen(0, "", NULL_KEY, "");
    // Listen to menu
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
        
        // Determine current status, display in menu title
        string status_msg = "【目前狀態: 運作中】";
        if (!gIsActive) status_msg = "【目前狀態: 已暫停】";

        // Show menu
        llDialog(gOwner, "\n" + status_msg + "\n請選擇操作：", 
            ["設定人設", "清除記憶", "開啟/暫停", "取消"], gDialogChannel);
    }

    listen(integer channel, string name, key id, string message) {
        
        // === Case A: Received chat message ===
        if (channel == 0) {
            // 1. Don't listen to own messages
            if (id == llGetKey()) return; 

            // 2. Filter: only listen to real avatars
            // llGetAgentSize returns ZERO_VECTOR if it's an object
            if (llGetAgentSize(id) == ZERO_VECTOR) return;

            // ★★★ New filter: ignore OOC messages starting with (( ... )) ★★★
            // First trim whitespace from message
            string cleanMsg = llStringTrim(message, STRING_TRIM);
            // Check if first two characters are "(("
            if (llGetSubString(cleanMsg, 0, 1) == "((") return;

            // 3. If paused, don't send data
            if (gIsActive == FALSE) return;

            string escaped_msg = escape_json(message);
            string json = "{\"message\":\"" + escaped_msg + "\"}";
            llHTTPRequest(url_base + "/chat", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], json);
            return;
        }

        // === Case B: Menu control ===
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
                update_status(); // Update floating text color
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
                string escaped_prompt = escape_json(message);
                string json = "{\"prompt\":\"" + escaped_prompt + "\"}";
                llHTTPRequest(url_base + "/SetSystemPrompt", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], json);
                gWaitingForPrompt = FALSE;
            }
        }
    }

    http_response(key request_id, integer status, list metadata, string body) {
        if (status == 200) {
            // Check if it's a system message (prompt set successfully or memory cleared)
            if (llSubStringIndex(body, "設定成功") != -1 || llSubStringIndex(body, "Memory cleared") != -1 || llSubStringIndex(body, "【Memory cleared】") != -1) {
                llOwnerSay("系統: " + body);
            } 
            else {
                // Regular chat response, say publicly
                llSay(0, body);
            }
        } else if (status == 429) {
            // Rate limit error
            llOwnerSay("系統: " + body);
        } else if (status == 400) {
            // Bad request error
            llOwnerSay("系統錯誤: " + body);
        } else {
            // Other errors (500, etc.)
            llOwnerSay("連線錯誤 (" + (string)status + "): " + body);
        }
    }
}