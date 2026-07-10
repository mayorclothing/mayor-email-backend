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

const NICKEL_SENDER = process.env.NICKEL_SENDER || 'support@nickel.com';

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
  const [threadText, voice, knowledge, contactMemory] = await Promise.all([
    gmail.getThreadText(msg.threadId),
    memory.readVoice(),
    memory.readKnowledge(),
    memory.readContactMemory(customerEmail),
  ]);

  const body = await drafter.draftReply({ threadText: threadText || msg.text, voice, knowledge, contactMemory, customerEmail });
  if (!body) return { action: 'customer_message', skipped: 'empty draft' };

  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
  await gmail.createDraft({ threadId: msg.threadId, to: customerEmail, subject, body });
  await gmail.markRead(msg.id); // dedup: don't re-draft next poll

  // Accrue memory (append a dated line; keep it short).
  const note = `\n- ${new Date().toISOString().slice(0, 10)}: replied re "${msg.subject}"`;
  await memory.writeContactMemory(customerEmail, (contactMemory || `# ${customerEmail}\n`) + note);

  // Record the draft so the learning loop can later compare it to what Matt sent.
  try {
    const log = await memory.readDraftLog();
    log.push({ threadId: msg.threadId, customerEmail, subject, draftBody: body, createdMs: Date.now(), reconciled: false });
    await memory.writeDraftLog(log);
  } catch (e) { console.error('draft-log write failed:', e.message); }

  return { action: 'customer_message', customerEmail, drafted: true };
}


// Learning loop: for each recorded draft, once Matt has SENT his own reply in the
// thread, compare draft vs. sent and fold the lessons into voice + contact memory.
// Fully guarded and best-effort — never throws into the poll. Drops entries once
// reconciled, and prunes anything older than 30 days.
async function reconcileDrafts() {
  if (!drafter.enabled() || !memory.enabled()) return { reconciled: 0 };
  const log = await memory.readDraftLog();
  if (!log.length) return { reconciled: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let count = 0;
  for (const rec of log) {
    if (rec.reconciled) continue;
    try {
      const sent = await gmail.getSentReplyInThread(rec.threadId, rec.createdMs);
      if (!sent || !sent.text) continue; // Matt hasn't sent his reply yet

      const threadText = await gmail.getThreadText(rec.threadId);
      const { voiceLesson, contactLesson } = await drafter.learnFromReply({
        threadText, draftBody: rec.draftBody, sentBody: sent.text,
      });

      if (voiceLesson) {
        const voice = await memory.readVoice();
        await memory.writeVoice(`${voice || "# Mayor — Matt's Email Voice"}\n- (learned ${today}): ${voiceLesson}`);
      }
      if (contactLesson) {
        const cm = await memory.readContactMemory(rec.customerEmail);
        await memory.writeContactMemory(rec.customerEmail, `${cm || `# ${rec.customerEmail}`}\n- ${today}: ${contactLesson}`);
      }
      rec.reconciled = true;
      count += 1;
    } catch (e) { console.error(`reconcile ${rec.threadId} failed:`, e.message); }
  }

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const remaining = log.filter((r) => !r.reconciled && r.createdMs > cutoff);
  if (remaining.length !== log.length) await memory.writeDraftLog(remaining);
  return { reconciled: count };
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
  let reconciled = 0;
  try { reconciled = (await reconcileDrafts()).reconciled; } catch (e) { console.error('reconcile pass failed:', e.message); }

  return { skipped: null, results, reconciled };
}

module.exports = { runInboxPoll, handleNickelPaid, handleCustomerMessage, reconcileDrafts };
