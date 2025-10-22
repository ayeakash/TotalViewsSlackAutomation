// --- 1. CONFIGURATION: PASTE YOUR WEBHOOK ---

// Note: YOUTUBE_DATA_API_KEY is NO LONGER NEEDED.
var SLACK_WEBHOOK_URL = "ADD_SLACK_WebHook_URL";

// --- 2. SPREADSHEET SETUP ---
var CHANNELS_SHEET_NAME = "Channels";
var HISTORY_SHEET_NAME = "History";

/**
 * ---------------------------------------------------------------------------------
 * MAIN FUNCTION: This is what the trigger will run every hour.
 * ---------------------------------------------------------------------------------
 */
/**
 * ---------------------------------------------------------------------------------
 * MAIN FUNCTION: This is what the trigger will run every hour.
 * (Formatting confirmed to place each channel on a new line)
 * ---------------------------------------------------------------------------------
 */
/**
 * ---------------------------------------------------------------------------------
 * MAIN FUNCTION: This is what the trigger will run every hour.
 * (UPDATED with simple formatting)
 * ---------------------------------------------------------------------------------
 */
function trackViews() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var channelsSheet = ss.getSheetByName(CHANNELS_SHEET_NAME);
    var historySheet = ss.getSheetByName(HISTORY_SHEET_NAME);

    // --- Error Checking for Sheets (Unchanged) ---
    if (!channelsSheet) {
      var errorMsg = "SCRIPT ERROR: Cannot find the sheet named '" + CHANNELS_SHEET_NAME + "'. Please check your tab names.";
      Logger.log(errorMsg);
      sendSlackMessage("🚨 " + errorMsg);
      return; 
    }
    if (!historySheet) {
      var errorMsg = "SCRIPT ERROR: Cannot find the sheet named '" + HISTORY_SHEET_NAME + "'. Please check your tab names.";
      Logger.log(errorMsg);
      sendSlackMessage("🚨 " + errorMsg);
      return; 
    }
    // --- End Error Checking ---

    var numChannelRows = Math.max(0, channelsSheet.getLastRow() - 1);
    if (numChannelRows === 0) {
      Logger.log("No channels found in the 'Channels' sheet. Stopping run.");
      return; 
    }
    var channelDataRange = channelsSheet.getRange(2, 1, numChannelRows, 3);
    var channels = channelDataRange.getValues();
    
    var numHistoryRows = Math.max(0, historySheet.getLastRow() - 1);
    var historyData = [];
    if (numHistoryRows > 0) {
       historyData = historySheet.getRange(2, 1, numHistoryRows, 3).getValues();
    }

    var now = new Date();
    var hasData = false;
    
    // --- NEW: Initialize message sections with simple headers ---
    var hourlySection = "*Last 60 minutes views*\n";
    var fortyEightHourSection = "*Last 48 Hours Views*\n";

    for (var i = 0; i < channels.length; i++) {
      var channelId = channels[i][0];
      var channelName = channels[i][1];
      var previousTotalViews = channels[i][2]; 
      
      if (!channelId) continue; 

      var currentTotalViews = getTotalViews(channelId);
      if (currentTotalViews === null) {
        hourlySection += `● ${channelName}: _(API Error)_\n`;
        fortyEightHourSection += `● ${channelName}: _(API Error)_\n`;
        continue;
      }

      // --- Calculations ---
      var hourlyChange = 0;
      if (typeof previousTotalViews === 'number' && previousTotalViews > 0) {
        hourlyChange = currentTotalViews - previousTotalViews;
      }
      var views48HourChange = get48HourChange(channelName, currentTotalViews, historyData);
      
      // --- Log and Update (Unchanged) ---
      historySheet.appendRow([
        now, channelName, currentTotalViews, hourlyChange, views48HourChange
      ]);
      channelsSheet.getRange(i + 2, 3).setValue(currentTotalViews);
      
      // --- NEW: Build message sections in the new format ---
      var hourlyChangeStr = hourlyChange.toLocaleString(); 
      var views48HourStr = (typeof views48HourChange === 'number') 
                           ? views48HourChange.toLocaleString() 
                           : views48HourChange; // e.g., "N/A"
      
      hourlySection += `● ${channelName}: ${hourlyChangeStr}\n`;
      fortyEightHourSection += `● ${channelName}: ${views48HourStr}\n`;
      
      hasData = true;
    }
    
    // --- NEW: Assemble and Send Final Message ---
    if (hasData) {
      var slackMessage = hourlySection;
      slackMessage += "\n---------------\n\n"; // Separator line
      slackMessage += fortyEightHourSection;

      sendSlackMessage(slackMessage);
    }
    
    // --- Clean up history (Unchanged) ---
    trimHistoryLog();
    
  } catch (e) {
    Logger.log("Error in trackViews: " + e);
    sendSlackMessage("🚨 SCRIPT ERROR: `trackViews` function failed unexpectedly.\n`" + e.message + "`");
  }
}

/**
 * ---------------------------------------------------------------------------------
 * API & CALCULATION FUNCTIONS
 * ---------------------------------------------------------------------------------
 */

/**
 * *** UPDATED FUNCTION ***
 * Fetches the channel's LIFETIME view count.
 * Uses the YouTube Advanced Service (no API key).
 */
function getTotalViews(channelId) {
  try {
    // The 'YouTube' object is now available because we added the Advanced Service
    var response = YouTube.Channels.list('statistics', {
      'id': channelId
    });
    
    if (response.items && response.items.length > 0) {
      return parseInt(response.items[0].statistics.viewCount, 10);
    } else {
      Logger.log("No items returned for " + channelId + ". Response: " + JSON.stringify(response));
      return null;
    }
  } catch (e) {
    // This will catch errors if the API is not enabled in the Cloud Project
    Logger.log("Error in getTotalViews (Advanced Service) for " + channelId + ": " + e);
    
    // Send a specific error to Slack if the API is disabled
    if (e.message.includes("API has not been used") || e.message.includes("is not enabled")) {
      sendSlackMessage("🚨 SCRIPT ERROR: The YouTube Data API v3 is not enabled in your Google Cloud Project. Please follow Step 3 of the instructions to enable it.");
    }
    return null;
  }
}

/**
 * Calculates the view change over the last 48 hours by checking the History log.
 * (This function is unchanged)
 */
function get48HourChange(channelName, currentTotalViews, historyData) {
  var targetTime = new Date().getTime() - (48 * 60 * 60 * 1000); // 48 hours ago
  var closestEntry = null;

  for (var i = historyData.length - 1; i >= 0; i--) {
    var rowChannelName = historyData[i][1];
    if (rowChannelName === channelName) {
      var rowTimestamp = new Date(historyData[i][0]).getTime();
      if (rowTimestamp <= targetTime) {
        closestEntry = historyData[i];
        break; 
      }
    }
  }

  if (closestEntry) {
    var views48hAgo = closestEntry[2]; // Column C is Current Total Views
    return currentTotalViews - views48hAgo;
  } else {
    return "N/A"; // Not enough data yet
  }
}

/**
 * ---------------------------------------------------------------------------------
 * HELPER FUNCTIONS (SLACK & LOGGING)
 * ---------------------------------------------------------------------------------
 */

/**
 * Sends a message to Slack using the Webhook URL.
 * (This function is unchanged)
 */
function sendSlackMessage(message) {
  try {
    var payload = { "text": message };
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload)
    };
    UrlFetchApp.fetch(SLACK_WEBHOOK_URL, options);
  } catch (e) {
    Logger.log("Error in sendSlackMessage: " + e);
  }
}

/**
 * Optional: Cleans the History sheet to prevent it from getting too large.
 * (This function is unchanged)
 */
function trimHistoryLog() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    
    if (data.length < 100) return; 
    
    var sevenDaysAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
    var rowsToDelete = 0;

    for (var i = 1; i < data.length; i++) {
      var timestamp = new Date(data[i][0]).getTime();
      if (timestamp < sevenDaysAgo) {
        rowsToDelete++;
      } else {
        break; 
      }
    }
    
    if (rowsToDelete > 0) {
      sheet.deleteRows(2, rowsToDelete);
      Logger.log("Trimmed " + rowsToDelete + " old rows from History.");
    }
  } catch (e) {
    Logger.log("Error in trimHistoryLog: " + e);
  }
}
