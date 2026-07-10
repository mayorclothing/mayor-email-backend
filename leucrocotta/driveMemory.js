// Leucrocotta's shared brain on Drive: Mayor's voice + per-contact memory.
// Reuses the same service account as the MO sheet (share the brain folder with
// it). Guarded: no creds / no folder => reads return '' and writes no-op.
//
// ponytail: contact memory is stored as flat files `contact-<email>.md` in the
// brain folder, not the nested /Memory/contacts tree (§7). Same effect, no
// folder-path resolution. Flatten stays until someone needs the tree in Drive UI.

const { google } = require('googleapis');
const { Readable } = require('stream');

const FOLDER_ID = process.env.DRIVE_BRAIN_FOLDER_ID || '';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');

function enabled() {
  return !!(CREDS.client_email && FOLDER_ID);
}

function getDrive() {
  // Impersonate the Workspace user (domain-wide delegation) — service accounts
  // have no Drive storage quota and can't own files on their own.
  const auth = new google.auth.JWT({
    email: CREDS.client_email,
    key: CREDS.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
    subject: process.env.GMAIL_USER || 'mayor@mayorclothing.com',
  });
  return google.drive({ version: 'v3', auth });
}

function contactFileName(email) {
  return `contact-${String(email).toLowerCase().replace(/[^a-z0-9@._-]/g, '_')}.md`;
}

async function findFileId(drive, name) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${FOLDER_ID}' in parents and trashed = false`;
  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  return res.data.files?.[0]?.id || null;
}

async function readTextFile(name) {
  if (!enabled()) return '';
  try {
    const drive = getDrive();
    const id = await findFileId(drive, name);
    if (!id) return '';
    const res = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'text' });
    return typeof res.data === 'string' ? res.data : String(res.data || '');
  } catch (e) {
    console.error(`driveMemory read ${name} failed:`, e.message);
    return '';
  }
}

async function writeTextFile(name, content) {
  if (!enabled()) return false;
  try {
    const drive = getDrive();
    const id = await findFileId(drive, name);
    const media = { mimeType: 'text/markdown', body: Readable.from(content) };
    if (id) await drive.files.update({ fileId: id, media });
    else await drive.files.create({ requestBody: { name, parents: [FOLDER_ID], mimeType: 'text/markdown' }, media, fields: 'id' });
    return true;
  } catch (e) {
    console.error(`driveMemory write ${name} failed:`, e.message);
    return false;
  }
}

const readVoice = () => readTextFile('voice.md');
const readKnowledge = () => readTextFile('knowledge.md');
const readContactMemory = (email) => readTextFile(contactFileName(email));
const writeContactMemory = (email, content) => writeTextFile(contactFileName(email), content);

module.exports = { enabled, readVoice, readKnowledge, readContactMemory, writeContactMemory };
