// Deterministic parse of a Nickel payment notification. No Claude — a machine
// event. Returns { isPaid, orderNumber }. Sender match is the caller's job (via
// the classifier); this confirms the paid signal and extracts the order ref.
//
// Tuned against real Nickel mail (support@nickel.com, July 2026). Two facts
// drive the regexes:
//   1. Nickel sends HTML-only; gmailClient strips tags and collapses ALL
//      whitespace to single spaces, so the parser sees one long line — never
//      anchor on newlines.
//   2. The order ref appears two ways, both used here (phrase first, it's the
//      cleaner of the two):
//        - the payment phrase, in both subject and body:
//          "...Payment of $1,845.00 for Morris County Golf Club I from Craig..."
//        - a labeled field in the body: "Order Reference 8901 Payment Method ..."
//      Refs are free-text: numeric ("8901") or a club name ("Looper's I"), and
//      sometimes absent ("...for  from PIN HUNTERS...") — then orderNumber:null.

const PAID_SIGNALS = [
  /payment\s+received/i,
  /you\s+received\s+an?\s+(?:ach|card)\s+payment/i,
  /payment\s+(?:complete|successful|confirmed)/i,
  /\byou\s+got\s+paid\b/i,
];

// "Payment of $1,845.00 for <REF> from <PAYER>" — the amount anchor keeps us off
// any stray "for X from Y" prose. Non-greedy to the first " from ".
const PHRASE_REF = /payment of \$[\d,]+(?:\.\d{2})? for (.+?) from /i;

// "Order Reference <REF> <next label>". Value runs until the next known label
// (label set differs across Nickel's two templates) or end of string.
const LABEL_REF =
  /order\s+reference\s+(.+?)\s+(?:payment method|payment id|est\.?\s*payout|estimated payout|customer email|company name|view payment|amount \w+)/i;

function parseNickelPaid({ subject = '', text = '' } = {}) {
  const haystack = `${subject}\n${text}`;
  const isPaid = PAID_SIGNALS.some((re) => re.test(haystack));
  if (!isPaid) return { isPaid: false, orderNumber: null };

  for (const re of [PHRASE_REF, LABEL_REF]) {
    const m = haystack.match(re);
    if (m && m[1] && m[1].trim()) return { isPaid: true, orderNumber: m[1].trim() };
  }
  return { isPaid: true, orderNumber: null };
}

module.exports = { parseNickelPaid };
