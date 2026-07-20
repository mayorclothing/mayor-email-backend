// Deterministic pre-filter (blueprint §8 "agentic vs code seam"). Decides which
// path an inbound email takes so Claude tokens are spent only on real customer
// language. Pure function — no I/O.
//
// Returns one of: 'nickel_paid' | 'customer_message' | 'ignore'.

const { parseNickelPaid } = require('./nickelParser');

// "Matt Bartini <mayor@x.com>" -> "mayor@x.com". Exact-address extraction so a
// display name like "support@nickel.com <evil@x.com>" can't impersonate a sender.
function extractAddress(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
}

function senderIs(from, sender) {
  if (!from || !sender) return false;
  return extractAddress(from) === String(sender).trim().toLowerCase();
}

// Gmail stamps Authentication-Results on inbound mail. For the Nickel paid path
// (it flips order status) also require DKIM pass for the sender's domain when
// the header is present; absent header (e.g. unit tests) falls back to the
// exact-address match alone.
function dkimPasses(authResults, senderDomain) {
  if (!authResults) return true;
  const a = String(authResults).toLowerCase();
  return /dkim=pass/.test(a) && a.includes(senderDomain.toLowerCase());
}

// Machine/no-reply senders we never draft a human reply to.
const AUTOMATED = [
  /no-?reply/i, /do-?not-?reply/i, /notifications?@/i, /mailer-daemon/i,
  /postmaster@/i, /@.*\.hubspot/i, /calendar-notification/i, /automated/i,
];

// { from, subject, text, authResults }, opts { nickelSender, selfAddresses: [] }
function classifyEmail({ from = '', subject = '', text = '', authResults = '' } = {}, opts = {}) {
  const { nickelSender = '', selfAddresses = [] } = opts;

  // Our own outbound / bounces — never act.
  if (selfAddresses.some((self) => senderIs(from, self))) return 'ignore';

  // Nickel payment notification -> deterministic paid path. Exact envelope
  // address + DKIM (when available) — display-name spoofing must not reach here.
  if (senderIs(from, nickelSender)) {
    const domain = String(nickelSender).split('@')[1] || '';
    if (!dkimPasses(authResults, domain)) return 'ignore';
    const { isPaid } = parseNickelPaid({ subject, text });
    return isPaid ? 'nickel_paid' : 'ignore';
  }

  // Other automated senders -> ignore (nothing to draft).
  if (AUTOMATED.some((re) => re.test(from))) return 'ignore';

  // A human wrote something -> Claude drafting path.
  if (from) return 'customer_message';
  return 'ignore';
}

module.exports = { classifyEmail, extractAddress };
