/**
 * scripts/fetch-sheet-data.mjs
 *
 * Fetches data from three Google Sheets tabs and writes them as JSON files
 * into public/data/. Designed to run inside GitHub Actions.
 *
 * Required environment variables:
 *   GOOGLE_SHEETS_API_KEY  – Google Sheets API key (no OAuth needed for public sheets)
 *   SPREADSHEET_ID         – The spreadsheet ID from the sheet URL
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

if (!API_KEY || !SPREADSHEET_ID) {
  console.error('❌  Missing GOOGLE_SHEETS_API_KEY or SPREADSHEET_ID environment variables.');
  process.exit(1);
}

const BASE_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values`;

/** Sheets to fetch as object arrays: [tabName, outputFileName] */
const SHEETS = [
  ['WC2026', 'wc2026.json'],
  ['WC2026-Result', 'wc2026-result.json'],
  ['Matches', 'matches.json'],
];

/**
 * WC2026 named ranges to collect into wc2026-data.json.
 * Each entry: [range, key in output object]
 */
const WC2026_RANGES = [
  ['WC2026!Players', 'players'],
  ['WC2026!Bets', 'bets'],
  ['WC2026!Points', 'points'],
  ['WC2026!I2:I5', 'currentMatch'],
];

const OUT_DIR = join(__dirname, '..', 'public', 'data');
mkdirSync(OUT_DIR, { recursive: true });

async function fetchRange(range) {
  const url = `${BASE_URL}/${encodeURIComponent(range)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching range "${range}": ${await res.text()}`);
  }
  const json = await res.json();
  return json.values ?? [];
}

/**
 * Converts a rows array (header row + data rows) into an array of objects.
 * Empty cells become empty strings.
 */
function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? '';
    });
    return obj;
  });
}

let hasError = false;

// Fetch full tabs as object arrays (Matches, WC2026 full, WC2026-Result)
for (const [sheetName, fileName] of SHEETS) {
  try {
    console.log(`⏳  Fetching sheet: ${sheetName}`);
    const rows = await fetchRange(sheetName);
    const data = rowsToObjects(rows);
    const outPath = join(OUT_DIR, fileName);
    writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅  Wrote ${data.length} rows → ${outPath}`);
  } catch (err) {
    console.error(`❌  Failed to fetch "${sheetName}": ${err.message}`);
    hasError = true;
  }
}

// Fetch WC2026 named ranges into a single wc2026-data.json
try {
  console.log('⏳  Fetching WC2026 named ranges…');
  const wc2026Data = {};
  for (const [range, key] of WC2026_RANGES) {
    wc2026Data[key] = await fetchRange(range);
    console.log(`   • ${range} → ${wc2026Data[key].length} rows`);
  }
  const outPath = join(OUT_DIR, 'wc2026-data.json');
  writeFileSync(outPath, JSON.stringify(wc2026Data, null, 2), 'utf8');
  console.log(`✅  Wrote wc2026-data.json`);
} catch (err) {
  console.error(`❌  Failed to fetch WC2026 named ranges: ${err.message}`);
  hasError = true;
}

if (hasError) {
  process.exit(1);
}
