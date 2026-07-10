// Gmail access for Leucrocotta: read unread inbound, create drafts, mark read.
// Uses the service account with DOMAIN-WIDE DELEGATION to impersonate GMAIL_USER
// (mayor@mayorclothing.com). Requires: DWD enabled for the service account in the
// Workspace admin console with scope gmail.modify (manual setup, blueprint §27).
// Guarded: no creds / no user => enabled() false, callers skip.

const { google } = require('googleapis');

const GMAIL_USER = process.env.GMAIL_USER || 'mayor@mayorclothing.com';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function enabled() {
  return !!(CREDS.client_email && CREDS.private_key);
}

function getGmail() {
  // JWT with `subject` = the delegated user is how a service account acts as a
  // Workspace mailbox. GoogleAuth's plain credentials can't impersonate Gmail.
  const auth = new google.auth.JWT({
    email: CREDS.client_email,
    key: CREDS.private_key,
    scopes: SCOPES,
    subject: GMAIL_USER,
  });
  return google.gmail({ version: 'v1', auth });
}

function header(payload, name) {
  const h = (payload.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

// Walk the MIME tree for the first text/plain (fallback text/html stripped).
function extractBody(payload) {
  if (!payload) return '';
  const decode = (data) => Buffer.from(data, 'base64').toString('utf8');
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decode(payload.body.data);
  for (const part of payload.parts || []) {
    const found = extractBody(part);
    if (found) return found;
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decode(payload.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

async function listUnreadInbound() {
  const gmail = getGmail();
  const res = await gmail.users.messages.list({ userId: GMAIL_USER, q: 'in:inbox is:unread newer_than:2d', maxResults: 25 });
  return res.data.messages || [];
}

async function getMessage(id) {
  const gmail = getGmail();
  const res = await gmail.users.messages.get({ userId: GMAIL_USER, id, format: 'full' });
  const m = res.data;
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m.payload, 'From'),
    subject: header(m.payload, 'Subject'),
    text: extractBody(m.payload) || m.snippet || '',
  };
}

// Fetch the whole thread's messages as plain text, oldest first (for context).
async function getThreadText(threadId) {
  const gmail = getGmail();
  const res = await gmail.users.threads.get({ userId: GMAIL_USER, id: threadId, format: 'full' });
  return (res.data.messages || []).map((m) => {
    const from = header(m.payload, 'From');
    const body = extractBody(m.payload) || m.snippet || '';
    return `From: ${from}\n${body}`;
  }).join('\n\n---\n\n');
}

// RFC 2822 draft in-thread. Returns the created draft id.
async function createDraft({ threadId, to, subject, body, inReplyTo }) {
  const gmail = getGmail();
  const headers = [
    `To: ${to}`,
    `From: ${GMAIL_USER}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (inReplyTo) { headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`); }
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await gmail.users.drafts.create({ userId: GMAIL_USER, requestBody: { message: { threadId, raw } } });
  return res.data.id;
}

async function markRead(id) {
  const gmail = getGmail();
  await gmail.users.messages.modify({ userId: GMAIL_USER, id, requestBody: { removeLabelIds: ['UNREAD'] } });
}

module.exports = { enabled, listUnreadInbound, getMessage, getThreadText, createDraft, markRead, GMAIL_USER };
