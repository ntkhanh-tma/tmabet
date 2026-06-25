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

var SPREADSHEET_ID   = '1KN7r6qdlnDKLbAitcn_KeN8ztP05KO2ZhW0nJ81WI78';
var BETS_SHEET       = 'WC2026';
var BETS_RANGE       = 'Bets';
var COMMENTS_SHEET   = 'Comments';

// ---------------------------------------------------------------------------
// Entry point — handles POST from Angular
// ---------------------------------------------------------------------------
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = (payload.action || 'bet').trim();
    var ss      = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (action === 'order') {
      return handleOrder(payload, ss);
    }

    if (action === 'addToUsed') {
      return handleAddToUsed(payload, ss);
    }

    var player    = (payload.player    || '').trim();
    var match1Bet = (payload.match1Bet || '').trim();
    var match2Bet = (payload.match2Bet || '').trim();
    var modifier1 = (payload.modifier1 || '').trim() || '1';
    var modifier2 = (payload.modifier2 || '').trim() || '1';
    var betTeam   = (payload.betTeam   || '').trim();
    var comment   = (payload.comment   || '').trim();

    if (!player) {
      return jsonResponse({ ok: false, message: 'Missing player name' }, 400);
    }

    var sheet = ss.getSheetByName(BETS_SHEET);
    if (!sheet) {
      return jsonResponse({ ok: false, message: 'Sheet "' + BETS_SHEET + '" not found' }, 500);
    }

    // Resolve the named range "Bets" to find the actual row/column bounds
    var betsRange = sheet.getRange(BETS_RANGE);        // named range
    var startRow  = betsRange.getRow();
    var startCol  = betsRange.getColumn();             // column B = 2
    var numRows   = betsRange.getNumRows();
    var values    = betsRange.getValues();              // 2-D array, index 0 = startCol

    // Find the row whose first column (player name) matches — case-insensitive
    var rowOffset = -1;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === player.toLowerCase()) {
        rowOffset = i;
        break;
      }
    }

    var targetRow;
    if (rowOffset === -1) {
      // Player not found — use the first blank row inside the named range,
      // or append one row below if all rows are occupied.
      var firstEmptyOffset = -1;
      for (var j = 0; j < values.length; j++) {
        if (!String(values[j][0]).trim()) {
          firstEmptyOffset = j;
          break;
        }
      }

      targetRow = (firstEmptyOffset !== -1)
        ? startRow + firstEmptyOffset
        : startRow + numRows;

      // Write player name + bets starting at startCol (B, C, D, E, F)
      sheet.getRange(targetRow, startCol, 1, 5).setValues([[player, match1Bet, match2Bet, modifier1, modifier2]]);
    } else {
      // Player exists — update only the bet columns (C, D, E, F); leave player name untouched
      targetRow = startRow + rowOffset;
      sheet.getRange(targetRow, startCol + 1, 1, 4).setValues([[match1Bet, match2Bet, modifier1, modifier2]]);
    }

    SpreadsheetApp.flush();

    // ── Write to Comments sheet only when the user typed a comment ───────
    if (comment) {
      var commentsSheet = ss.getSheetByName(COMMENTS_SHEET);
      if (!commentsSheet) {
        commentsSheet = ss.insertSheet(COMMENTS_SHEET);
        commentsSheet.appendRow(['Datetime', 'Player', 'Comment', 'Bet', 'Modifier']);
      }
      // Determine which modifier applies to this specific bet action
      var activeModifier = (betTeam && betTeam === match1Bet) ? modifier1 : modifier2;
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
      commentsSheet.appendRow([now, player, comment, betTeam, activeModifier]);
      SpreadsheetApp.flush();
    }

    return jsonResponse({ ok: true, updatedRow: targetRow });

  } catch (err) {
    return jsonResponse({ ok: false, message: err.message }, 500);
  }
}

// ---------------------------------------------------------------------------
// GET handler — handles bet submissions (payload param) and health-checks
// ---------------------------------------------------------------------------
function doGet(e) {
  if (e && e.parameter && e.parameter.payload) {
    try {
      return doPost({ postData: { contents: e.parameter.payload } });
    } catch (err) {
      return jsonResponse({ ok: false, message: err.message });
    }
  }
  return jsonResponse({ ok: true, message: 'tmabet-proxy is running' });
}

// ---------------------------------------------------------------------------
// Used handler — adds drink price to each player's Used value (col I)
// ---------------------------------------------------------------------------
function handleAddToUsed(payload, ss) {
  var deductions = payload.deductions || [];
  if (!deductions.length) return jsonResponse({ ok: false, message: 'No deductions provided' });

  var sheet = ss.getSheetByName(BETS_SHEET);
  if (!sheet) return jsonResponse({ ok: false, message: 'Sheet "' + BETS_SHEET + '" not found' });

  var betsRange = sheet.getRange(BETS_RANGE);
  var startRow  = betsRange.getRow();
  var startCol  = betsRange.getColumn();  // column B = 2
  var values    = betsRange.getValues();

  for (var i = 0; i < deductions.length; i++) {
    var player = String(deductions[i].player || '').trim();
    var amount = Number(deductions[i].amount) || 0;
    if (!player || amount === 0) continue;

    var rowOffset = -1;
    for (var j = 0; j < values.length; j++) {
      if (String(values[j][0]).trim().toLowerCase() === player.toLowerCase()) {
        rowOffset = j;
        break;
      }
    }
    if (rowOffset === -1) continue;

    // Column I = startCol + 7 (B=+0, C=+1, D=+2, E=+3, F=+4, G=+5, H=+6, I=+7)
    var usedCell = sheet.getRange(startRow + rowOffset, startCol + 7, 1, 1);
    var raw = String(usedCell.getValue()).replace(/[^0-9.\-]/g, '');
    var current = parseFloat(raw) || 0;
    usedCell.setValue(current + amount);
  }

  SpreadsheetApp.flush();
  return jsonResponse({ ok: true });
}

// ---------------------------------------------------------------------------
// Order handler — writes drink choice to column G (ORDER) of the player's row
// ---------------------------------------------------------------------------
function handleOrder(payload, ss) {
  var player = (payload.player || '').trim();
  var drink  = (payload.drink  || '').trim();

  if (!player) return jsonResponse({ ok: false, message: 'Missing player name' });
  if (!drink)  return jsonResponse({ ok: false, message: 'Missing drink' });

  var sheet = ss.getSheetByName(BETS_SHEET);
  if (!sheet) return jsonResponse({ ok: false, message: 'Sheet "' + BETS_SHEET + '" not found' });

  var betsRange = sheet.getRange(BETS_RANGE);
  var startRow  = betsRange.getRow();
  var startCol  = betsRange.getColumn();  // column B = 2
  var values    = betsRange.getValues();

  var rowOffset = -1;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === player.toLowerCase()) {
      rowOffset = i;
      break;
    }
  }

  if (rowOffset === -1) return jsonResponse({ ok: false, message: 'Player not found' });

  var targetRow = startRow + rowOffset;
  // B=startCol(+0), C(+1), D(+2), E(+3), F(+4), G(+5)=ORDER
  sheet.getRange(targetRow, startCol + 5, 1, 1).setValues([[drink]]);
  SpreadsheetApp.flush();

  return jsonResponse({ ok: true, updatedRow: targetRow });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
