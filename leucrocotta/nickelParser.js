// Deterministic parse of a Nickel "paid" notification. No Claude — a machine
// event. Returns { isPaid, orderNumber }. Sender match is caller's job (via the
// classifier); this confirms the paid signal and extracts the order reference.
//
// ponytail: patterns are best-effort until a real Nickel email is in hand
// (blueprint §12 #2). Keep the labeled-reference extraction — that's where a
// real sample will tune the regexes. Order numbers are free-text (e.g.
// "Oklahoma City Golf & Country Club I"), so we lean on explicit labels.

const PAID_SIGNALS = [
  /\bpaid\b/i,
  /payment\s+(received|complete|successful|confirmed)/i,
  /\bhas\s+paid\b/i,
];

// Labels Nickel/most invoicing tools put before the reference.
const REF_LABELS = [
  /(?:order|invoice|memo|reference|ref)\b\s*(?:number|no\.?)?\s*[#:]*\s*([^\n<]{2,80}?)\s*(?:\n|$|<)/i,
  /(?:for|regarding)\s+["“]([^"”\n]{2,80})["”]/i,
];

function parseNickelPaid({ subject = '', text = '' } = {}) {
  const haystack = `${subject}\n${text}`;
  const isPaid = PAID_SIGNALS.some((re) => re.test(haystack));
  if (!isPaid) return { isPaid: false, orderNumber: null };

  for (const re of REF_LABELS) {
    const m = haystack.match(re);
    if (m && m[1]) return { isPaid: true, orderNumber: m[1].trim() };
  }
  return { isPaid: true, orderNumber: null };
}

module.exports = { parseNickelPaid };
