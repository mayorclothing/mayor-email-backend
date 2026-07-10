// Leucrocotta orchestration: poll the inbox, classify each unread message, and
// dispatch. Nickel "paid" -> flip MO status to Pending (deterministic). Customer
// message -> draft a reply in Mayor's voice for Matt to review, accrue memory.

const { config } = require('../config');
const { markPaid } = require('../hermesService');
const { classifyEmail } = require('./emailClassifier');
const { parseNickelPaid } = require('./nickelParser');
const gmail = require('./gmailClient');
const memory = require('./driveMemory');
const drafter = require('./voiceDrafter');

const NICKEL_SENDER = process.env.NICKEL_SENDER || '';

// "Matt Bartini <mayor@x.com>" -> "mayor@x.com"
function extractAddress(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

async function handleNickelPaid(msg) {
  const { orderNumber } = parseNickelPaid(msg);
  if (!orderNumber) return { action: 'nickel_paid', skipped: 'no order number parsed' };
  const res = await markPaid(orderNumber);
  await gmail.markRead(msg.id);
  return { action: 'nickel_paid', orderNumber, statusUpdated: res.updated };
}

async function handleCustomerMessage(msg) {
  if (!drafter.enabled()) return { action: 'customer_message', skipped: 'no ANTHROPIC_API_KEY' };

  const customerEmail = extractAddress(msg.from);
  const [threadText, voice, contactMemory] = await Promise.all([
    gmail.getThreadText(msg.threadId),
    memory.readVoice(),
    memory.readContactMemory(customerEmail),
  ]);

  const body = await drafter.draftReply({ threadText: threadText || msg.text, voice, contactMemory, customerEmail });
  if (!body) return { action: 'customer_message', skipped: 'empty draft' };

  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
  await gmail.createDraft({ threadId: msg.threadId, to: customerEmail, subject, body });
  await gmail.markRead(msg.id); // dedup: don't re-draft next poll

  // Accrue memory (append a dated line; keep it short).
  const note = `\n- ${new Date().toISOString().slice(0, 10)}: replied re "${msg.subject}"`;
  await memory.writeContactMemory(customerEmail, (contactMemory || `# ${customerEmail}\n`) + note);

  return { action: 'customer_message', customerEmail, drafted: true };
}

async function runInboxPoll() {
  if (!gmail.enabled()) return { skipped: 'gmail not configured', results: [] };

  const selfAddresses = [gmail.GMAIL_USER, config.resend.fromEmail].filter(Boolean);
  const refs = await gmail.listUnreadInbound();
  const results = [];

  for (const ref of refs) {
    try {
      const msg = await gmail.getMessage(ref.id);
      const kind = classifyEmail(msg, { nickelSender: NICKEL_SENDER, selfAddresses });
      if (kind === 'nickel_paid') results.push(await handleNickelPaid(msg));
      else if (kind === 'customer_message') results.push(await handleCustomerMessage(msg));
      // 'ignore' => leave unread, no action
    } catch (e) {
      console.error('Leucrocotta message failed:', e.message);
      results.push({ action: 'error', error: e.message });
    }
  }
  return { skipped: null, results };
}

module.exports = { runInboxPoll, handleNickelPaid, handleCustomerMessage };
