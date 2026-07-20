// Logs every draft to the "Social Queue" Google Sheet — a history of what's
// been drafted so Matt can track status, mirroring the MO-sheet pattern
// googleStore.js already uses for orders. One flat tab, append-only (no upsert
// needed — each row is a new draft, not an evolving order).

const { google } = require('googleapis');

const SHEET_ID = process.env.SOCIAL_QUEUE_SHEET_ID || '';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
const TAB = 'Queue';

function enabled() {
  return !!(CREDS.client_email && SHEET_ID);
}

function getSheets() {
  const auth = new google.auth.JWT({
    email: CREDS.client_email,
    key: CREDS.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    subject: process.env.GMAIL_USER || 'mayor@mayorclothing.com',
  });
  return google.sheets({ version: 'v4', auth });
}

// Formula-injection guard, same as googleStore.js sanitizeCell.
function sanitizeCell(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? `'${v}` : v;
}

// Date, File, LinkedIn caption, Instagram caption, Status.
function buildQueueRow({ fileName, linkedin, instagram }) {
  return [new Date().toISOString().slice(0, 10), fileName, linkedin, instagram, 'Drafted'].map(sanitizeCell);
}

async function appendDraftRow({ fileName, linkedin, instagram }) {
  if (!enabled()) return { logged: false, skipped: 'no google credentials or SOCIAL_QUEUE_SHEET_ID' };
  try {
    const sheets = getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: { values: [buildQueueRow({ fileName, linkedin, instagram })] },
    });
    return { logged: true };
  } catch (e) {
    console.error('socialQueueSheet append failed:', e.message);
    return { logged: false, error: e.message };
  }
}

module.exports = { enabled, buildQueueRow, appendDraftRow };
