string url_base = ""; // Set server address here

integer gDialogChannel;
integer gListenHandle_Chat;
integer gListenHandle_Dialog;
key gOwner;

integer gIsActive = TRUE; 

// Escape special characters for JSON strings
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

// Update floating text status
update_status() {
    if (gIsActive) {
        // Show active status in magenta
        llSetText(" \n \n \nTalk To AI Brain", <1.0, 0.0, 1.0>, 1.0);
    } else {
        // Show paused status in red
        llSetText(" \n \n \nZzz... (PAUSED)", <1.0, 0.0, 0.0>, 1.0);
    }
}

init() {
    gOwner = llGetOwner();
    gDialogChannel = (integer)llFrand(100000.0) + 1000;

    // Update floating text
    update_status();

    // Remove old listeners
    llListenRemove(gListenHandle_Chat);
    llListenRemove(gListenHandle_Dialog);

    // Listen to all public chat
    gListenHandle_Chat = llListen(0, "", NULL_KEY, "");
    // Listen to menu responses
    gListenHandle_Dialog = llListen(gDialogChannel, "", gOwner, "");
    
    llOwnerSay("System ready. OOC filter enabled ((...)).");
}

handle_response(string response) {
    llSay(0, response);
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
        // Determine current status, display in menu title
        string status_msg = "【Status: Running】";
        if (!gIsActive) status_msg = "【Status: Paused】";

        // Show menu
        llDialog(gOwner, "\n" + status_msg + "\nSelect an action:",
            ["Clear Memory", "Pause/Resume", "Cancel"], gDialogChannel);
    }

    listen(integer channel, string name, key id, string message) {
        // Handle chat messages
        if (channel == 0) {
            // Ignore own messages
            if (id == llGetKey()) return; 

            // Ignore non-avatar objects
            if (llGetAgentSize(id) == ZERO_VECTOR) return;

            // Ignore out-of-character (OOC) messages: ((text))
            string cleanMsg = llStringTrim(message, STRING_TRIM);
            if (llGetSubString(cleanMsg, 0, 1) == "((") return;

            // Don't process if paused
            if (gIsActive == FALSE) return;

            string speaker = llGetDisplayName(id);
            string avatarId = (string)id;
            string escaped_msg = escape_json(message);
            string escaped_speaker = escape_json(speaker);
            string json = "{\"speaker\":\"" + escaped_speaker + "\",\"avatarId\":\"" + avatarId + "\",\"message\":\"" + escaped_msg + "\"}";
            llHTTPRequest(url_base + "/chat", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], json);
            return;
        }

        // Handle menu selections
        if (channel == gDialogChannel) {
            if (message == "Cancel") return;

            if (message == "Pause/Resume") {
                if (gIsActive) {
                    gIsActive = FALSE;
                    llOwnerSay("System: Paused");
                } else {
                    gIsActive = TRUE;
                    llOwnerSay("System: Resumed");
                }
                update_status(); // Update status display
                return;
            }

            else if (message == "Clear Memory") {
                llHTTPRequest(url_base + "/memory/reset", [HTTP_METHOD, "POST", HTTP_MIMETYPE, "application/json"], "{}");
                return;
            }
        }
    }

    http_response(key request_id, integer status, list metadata, string body) {
        if (status == 200) {
            handle_response(body);
        } else if (status == 202) {
            // NPC ignored this message (buffered but not responding)
            // Silent - this is normal behavior
        } else if (status == 204) {
            // Memory cleared (no content)
            llOwnerSay("System: Memory cleared");
        } else if (status == 429) {
            // Rate limited
            llOwnerSay("Connection error: Rate limit exceeded");
        } else {
            // Handle other error codes
            llOwnerSay("Connection error (" + (string)status + "): " + body);
        }
    }
}