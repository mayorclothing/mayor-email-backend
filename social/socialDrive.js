// Drive access for the social drafting agent: lists new photos/graphics dropped
// in the "Social Inbox" folder, and moves each to the "Posted" folder once a
// draft has gone out — that move IS the dedup mechanism (no separate tracking
// needed). Guarded: no creds / no inbox folder => enabled() false, callers skip.
//
// Mirrors leucrocotta/driveMemory.js's own JWT setup rather than importing it —
// same duplication the codebase already accepts there (see driveMemory.js's
// ponytail note); not worth a shared client until a third caller needs one.

const { google } = require('googleapis');

const INBOX_FOLDER_ID = process.env.SOCIAL_INBOX_FOLDER_ID || '';
const POSTED_FOLDER_ID = process.env.SOCIAL_POSTED_FOLDER_ID || '';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

function enabled() {
  return !!(CREDS.client_email && INBOX_FOLDER_ID && POSTED_FOLDER_ID);
}

function getDrive() {
  const auth = new google.auth.JWT({
    email: CREDS.client_email,
    key: CREDS.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: process.env.GMAIL_USER || 'mayor@mayorclothing.com',
  });
  return google.drive({ version: 'v3', auth });
}

// Team drops a photo in the inbox folder and (optionally) sets its Drive
// "description" field to a short note — club/event/print detail — which the
// drafter uses as its main source of truth. No note => drafter flags it in the
// review email instead of inventing details.
async function listInboxFiles() {
  if (!enabled()) return [];
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${INBOX_FOLDER_ID}' in parents and trashed = false`,
    fields: 'files(id, name, description, webViewLink)',
    pageSize: 25,
  });
  return res.data.files || [];
}

async function markProcessed(fileId) {
  if (!enabled()) return false;
  const drive = getDrive();
  await drive.files.update({
    fileId,
    addParents: POSTED_FOLDER_ID,
    removeParents: INBOX_FOLDER_ID,
    fields: 'id, parents',
  });
  return true;
}

module.exports = { enabled, listInboxFiles, markProcessed };
