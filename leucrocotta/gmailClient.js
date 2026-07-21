// Gmail access for Leucrocotta: read unread inbound, create drafts, mark read.
// Uses the service account with DOMAIN-WIDE DELEGATION to impersonate GMAIL_USER
// (mayor@mayorclothing.com). Requires: DWD enabled for the service account in the
// Workspace admin console with scope gmail.modify (manual setup, blueprint §27).
// Guarded: no creds / no user => enabled() false, callers skip.

const { google } = require('googleapis');

const GMAIL_USER = process.env.GMAIL_USER || 'mayor@mayorclothing.com';
const CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
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
    authResults: header(m.payload, 'Authentication-Results'),
  };
}

// Fetch recent thread messages as plain text, oldest first (for context).
// Capped to the last MAX_MESSAGES and MAX_BODY_CHARS per message — Gmail
// bodies quote the whole prior thread inline, so a long chain blows past
// Claude's context window otherwise (hit 238k tokens on a 30-message thread).
const MAX_MESSAGES = 12;
const MAX_BODY_CHARS = 4000;

async function getThreadText(threadId) {
  const gmail = getGmail();
  const res = await gmail.users.threads.get({ userId: GMAIL_USER, id: threadId, format: 'full' });
  const messages = res.data.messages || [];
  const recent = messages.slice(-MAX_MESSAGES);
  const text = recent.map((m) => {
    const from = header(m.payload, 'From');
    const body = (extractBody(m.payload) || m.snippet || '').slice(0, MAX_BODY_CHARS);
    return `From: ${from}\n${body}`;
  }).join('\n\n---\n\n');
  return messages.length > recent.length
    ? `[...${messages.length - recent.length} earlier messages omitted...]\n\n${text}`
    : text;
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

// Register (or renew) push notifications: Google posts to GMAIL_PUBSUB_TOPIC
// whenever INBOX changes. Expires after 7 days max — call this again before
// then (see /leucrocotta/watch-renew cron, every 6 days).
async function watch() {
  const gmail = getGmail();
  const topicName = process.env.GMAIL_PUBSUB_TOPIC;
  const res = await gmail.users.watch({
    userId: GMAIL_USER,
    requestBody: { topicName, labelIds: ['INBOX'] },
  });
  return res.data; // { historyId, expiration (epoch ms string) }
}

async function markRead(id) {
  const gmail = getGmail();
  await gmail.users.messages.modify({ userId: GMAIL_USER, id, requestBody: { removeLabelIds: ['UNREAD'] } });
}


// Latest message SENT by the mailbox owner (Matt) in this thread after `afterMs`
// (epoch ms). Used to reconcile a Leucrocotta draft against what Matt actually
// sent. Returns { id, ts, text } or null.
async function getSentReplyInThread(threadId, afterMs = 0) {
  const gmail = getGmail();
  const res = await gmail.users.threads.get({ userId: GMAIL_USER, id: threadId, format: 'full' });
  let best = null;
  for (const m of res.data.messages || []) {
    const from = header(m.payload, 'From').toLowerCase();
    const ts = Number(m.internalDate || 0);
    const isSent = (m.labelIds || []).includes('SENT') || from.includes(GMAIL_USER.toLowerCase());
    if (isSent && ts > afterMs && (!best || ts > best.ts)) {
      best = { id: m.id, ts, text: extractBody(m.payload) || m.snippet || '' };
    }
  }
  return best;
}

module.exports = { enabled, listUnreadInbound, getMessage, getThreadText, createDraft, markRead, getSentReplyInThread, watch, GMAIL_USER };
