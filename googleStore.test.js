// Runnable check for the MO-sheet row layout + no-creds guard.
// `node googleStore.test.js`. No network: persistOrder must no-op without creds.
const assert = require('assert');
const { buildDetailRow, persistOrder, credsPresent } = require('./googleStore');

// Row must place fields at the exact indices portal.js parseSheetRow reads.
const payload = {
  order_number: 'Test Club I', customer_email: 'a@club.com', club: 'Test GCC',
  address: '123 Main St', ship_date: '2026-07-20', payment_link: 'https://nickel.com/a',
  line_items: [
    { url: 'https://img/p.png', description: 'Navy', quantity: 48, price: 42, orig_price: null },
    { url: '', description: 'White', quantity: 12, price: 0, orig_price: null },
  ],
  shipping: 25, subtotal: 2016, embroidery: 150, art_setup: -40, total: 2276,
  product_page: 'https://x', shipping_address: '', date_label: 'Ship Date',
  payment_link_2: 'https://nickel.com/b', payment_terms: 'Net 30',
  strike_embroidery: true, strike_art: false, strike_shipping: true,
  custom_label: null, sample_reimbursement: '(40.00)',
};

const row = buildDetailRow(payload, 'https://drive.google.com/file/d/abc/view');

assert.strictEqual(row[0], 'Test Club I');   // A order#
assert.strictEqual(row[1], 'a@club.com');    // B email
assert.strictEqual(row[5], 'https://nickel.com/a'); // F payment link
assert.strictEqual(row[6], 'https://img/p.png');    // G url1
assert.strictEqual(row[8], 48);              // I qty1
assert.strictEqual(row[9], 42);              // J price1
assert.strictEqual(row[21], 25);             // V shipping
assert.strictEqual(row[23], 150);            // X embroidery
assert.strictEqual(row[24], -40);            // Y art fee (signed)
assert.strictEqual(row[25], 2276);           // Z total
assert.strictEqual(row[36], 'https://x');    // AK product page
assert.strictEqual(row[40], 'Net 30');       // AO payment terms
assert.strictEqual(row[41], '1');            // AP strike emb
assert.strictEqual(row[42], '');             // AQ strike art (false)
assert.strictEqual(row[43], '1');            // AR strike ship
assert.strictEqual(row[45], '(40.00)');      // AT sample reimb
assert.strictEqual(row[46], 'https://drive.google.com/file/d/abc/view'); // AU drive link
assert.strictEqual(row.length, 47);

// No creds => persistOrder degrades gracefully, does not throw, reports status.
(async () => {
  assert.strictEqual(credsPresent(), false, 'test env should have no GOOGLE_SERVICE_ACCOUNT_JSON');
  const oc = await persistOrder({ payload, docType: 'order_confirmation', pdfBuffer: Buffer.from('x') });
  assert.strictEqual(oc.persisted, false);
  assert.strictEqual(oc.status, 'Awaiting Approval');
  const inv = await persistOrder({ payload, docType: 'invoice', pdfBuffer: Buffer.from('x') });
  assert.strictEqual(inv.status, 'Awaiting Payment');
  console.log('googleStore.test.js: all assertions passed');
})();
