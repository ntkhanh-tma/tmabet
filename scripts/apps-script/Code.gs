/**
 * Google Apps Script — tmabet web app
 * =====================================
 * Deploy this as a Web App (execute as: Me, access: Anyone).
 * Paste the resulting URL into src/environments/environment.prod.ts → appsScriptUrl.
 *
 * HOW TO DEPLOY
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Replace the default code with this entire file
 * 3. Click Deploy → New deployment → Type: Web app
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone
 * 4. Authorise when prompted (only needed once)
 * 5. Copy the Web App URL → paste into environment.prod.ts
 *
 * RE-DEPLOY after any code change:
 *   Deploy → Manage deployments → edit the existing deployment → new version → Deploy
 */

var SPREADSHEET_ID = '1KN7r6qdlnDKLbAitcn_KeN8ztP05KO2ZhW0nJ81WI78';
var BETS_SHEET     = 'WC2026';
var BETS_RANGE     = 'Bets';

// ---------------------------------------------------------------------------
// Entry point — handles POST from Angular
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var player    = (payload.player    || '').trim();
    var match1Bet = (payload.match1Bet || '').trim();
    var match2Bet = (payload.match2Bet || '').trim();
    var modifier  = (payload.modifier  || '').trim();

    if (!player) {
      return jsonResponse({ ok: false, message: 'Missing player name' }, 400);
    }

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(BETS_SHEET);
    if (!sheet) {
      return jsonResponse({ ok: false, message: 'Sheet "' + BETS_SHEET + '" not found' }, 500);
    }

    // Resolve the named range "Bets" to find the actual row bounds
    var betsRange = sheet.getRange(BETS_RANGE);        // named range
    var startRow  = betsRange.getRow();
    var numRows   = betsRange.getNumRows();
    var values    = betsRange.getValues();              // 2-D array

    // Find the row whose column A matches the player name (case-insensitive)
    var rowOffset = -1;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === player.toLowerCase()) {
        rowOffset = i;
        break;
      }
    }

    if (rowOffset === -1) {
      return jsonResponse({ ok: false, message: 'Player "' + player + '" not found in Bets' }, 404);
    }

    // Write only columns B, C, D (index 1-3) — leave column A (player name) untouched
    var targetRow = startRow + rowOffset;
    sheet.getRange(targetRow, 2, 1, 3).setValues([[match1Bet, match2Bet, modifier]]);
    SpreadsheetApp.flush();

    return jsonResponse({ ok: true, updatedRow: targetRow });

  } catch (err) {
    return jsonResponse({ ok: false, message: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET handler — simple health-check so you can test the URL in a browser
// ---------------------------------------------------------------------------
function doGet() {
  return jsonResponse({ ok: true, message: 'tmabet-proxy is running' });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
