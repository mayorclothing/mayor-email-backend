// Runnable checks for Leucrocotta's deterministic seam. `node leucrocotta/leucrocotta.test.js`.
const assert = require('assert');
const { parseNickelPaid } = require('./nickelParser');
const { classifyEmail } = require('./emailClassifier');

// --- nickelParser ---
let r = parseNickelPaid({ subject: 'Payment received', text: 'Invoice #: Test Club I\nThanks' });
assert.strictEqual(r.isPaid, true);
assert.strictEqual(r.orderNumber, 'Test Club I');

r = parseNickelPaid({ subject: 'You have been paid', text: 'Order Number: OKC G&CC II' });
assert.strictEqual(r.isPaid, true);
assert.strictEqual(r.orderNumber, 'OKC G&CC II');

r = parseNickelPaid({ subject: 'Newsletter', text: 'Check out our new styles' });
assert.strictEqual(r.isPaid, false);
assert.strictEqual(r.orderNumber, null);

// paid but no parseable ref
r = parseNickelPaid({ subject: 'Payment successful', text: 'A customer paid you.' });
assert.strictEqual(r.isPaid, true);
assert.strictEqual(r.orderNumber, null);

// --- classifyEmail ---
const opts = { nickelSender: 'notify@nickel.com', selfAddresses: ['mayor@mayorclothing.com'] };

assert.strictEqual(
  classifyEmail({ from: 'Nickel <notify@nickel.com>', subject: 'Paid', text: 'Invoice #: X paid' }, opts),
  'nickel_paid');

// nickel sender but not a paid email => ignore
assert.strictEqual(
  classifyEmail({ from: 'notify@nickel.com', subject: 'Your account', text: 'settings changed' }, opts),
  'ignore');

// real customer
assert.strictEqual(
  classifyEmail({ from: 'Coach Dave <dave@club.com>', subject: 'Reorder?', text: 'Can we do 24 more polos?' }, opts),
  'customer_message');

// our own outbound
assert.strictEqual(
  classifyEmail({ from: 'mayor@mayorclothing.com', subject: 'x', text: 'y' }, opts),
  'ignore');

// automated no-reply
assert.strictEqual(
  classifyEmail({ from: 'no-reply@shipping.com', subject: 'Shipped', text: 'tracking' }, opts),
  'ignore');

console.log('leucrocotta.test.js: all assertions passed');
