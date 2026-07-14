// Deterministic pre-filter (blueprint §8 "agentic vs code seam"). Decides which
// path an inbound email takes so Claude tokens are spent only on real customer
// language. Pure function — no I/O.
//
// Returns one of: 'nickel_paid' | 'customer_message' | 'ignore'.

const { parseNickelPaid } = require('./nickelParser');

// Compare the actual envelope address, not the raw header — so a spoofed display
// name like `"support@nickel.com" <attacker@evil.com>` does NOT match.
function extractAddr(from) {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
}
function senderMatches(from, sender) {
  if (!from || !sender) return false;
  return extractAddr(from) === String(sender).trim().toLowerCase();
}

// Machine/no-reply senders we never draft a human reply to.
const AUTOMATED = [
  /no-?reply/i, /do-?not-?reply/i, /notifications?@/i, /mailer-daemon/i,
  /postmaster@/i, /@.*\.hubspot/i, /calendar-notification/i, /automated/i,
];

// { from, subject, text }, opts { nickelSender, selfAddresses: [] }
function classifyEmail({ from = '', subject = '', text = '' } = {}, opts = {}) {
  const { nickelSender = '', selfAddresses = [] } = opts;

  // Our own outbound / bounces — never act.
  if (selfAddresses.some((self) => senderMatches(from, self))) return 'ignore';

  // Nickel payment notification -> deterministic paid path.
  if (senderMatches(from, nickelSender)) {
    const { isPaid } = parseNickelPaid({ subject, text });
    return isPaid ? 'nickel_paid' : 'ignore';
  }

  // Other automated senders -> ignore (nothing to draft).
  if (AUTOMATED.some((re) => re.test(from))) return 'ignore';

  // A human wrote something -> Claude drafting path.
  if (from) return 'customer_message';
  return 'ignore';
}

module.exports = { classifyEmail };
