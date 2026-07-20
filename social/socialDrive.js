// Drive access for the social drafting agent: lists new photos/graphics dropped
// in the "Social Inbox" folder. Dedup is a private Drive `properties` flag
// (mayor_drafted) set on each file once drafted — NOT a folder move. Files stay
// in the Inbox until Matt actually posts them and moves them to Posted himself;
// this code never touches that folder. Guarded: no creds / no inbox folder =>
// enabled() false, callers skip.
//
// Mirrors leucrocotta/driveMemory.js's own JWT setup rather than importing it —
// same duplication the codebase already accepts there (see driveMemory.js's
// ponytail note); not worth a shared client until a third caller needs one.

const { google } = require('googleapis');

const INBOX_FOLDER_ID = process.env.SOCIAL_INBOX_FOLDER_ID || '';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

function enabled() {
  return !!(CREDS.client_email && INBOX_FOLDER_ID);
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
// review email instead of inventing details. Already-drafted files (marked via
// markDrafted) are excluded so a poll never re-drafts the same photo.
async function listInboxFiles() {
  if (!enabled()) return [];
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${INBOX_FOLDER_ID}' in parents and trashed = false and not properties has { key='mayor_drafted' and value='true' }`,
    fields: 'files(id, name, description, webViewLink)',
    pageSize: 25,
  });
  return res.data.files || [];
}

async function markDrafted(fileId) {
  if (!enabled()) return false;
  const drive = getDrive();
  await drive.files.update({
    fileId,
    requestBody: { properties: { mayor_drafted: 'true' } },
    fields: 'id',
  });
  return true;
}

module.exports = { enabled, listInboxFiles, markDrafted };
