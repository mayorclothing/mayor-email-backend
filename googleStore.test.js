// Runnable check for the MO-sheet row layout + no-creds guard.
// `node googleStore.test.js`. No network: persistOrder must no-op without creds.
const assert = require('assert');
const { buildDetailRow, persistOrder, credsPresent } = require('./googleStore');

// Row must place fields at the exact indices portal.js parseSheetRow reads.
const payload = {
  order_number: 'Test Club I', customer_email: 'a@club.com', club: 'Test GCC',
  address: '123 Main St', ship_date: '2026-07-20', payment_link: 'https://nickel.com/a',
  line_items: [
    { url: 'https://img/p.png', description: 'Navy', sizes: 'S-24 M-16 L-8', quantity: 48, price: 42, orig_price: null },
    { url: '', description: 'White', sizes: '', quantity: 12, price: 0, orig_price: null },
  ],
  shipping: 25, subtotal: 2016, embroidery: 150, art_setup: -40, total: 2276,
  product_page: 'https://x', shipping_address: '', date_label: 'Ship Date',
  payment_link_2: 'https://nickel.com/b', payment_terms: 'Net 30',
  strike_embroidery: true, strike_art: false, strike_shipping: true,
  custom_label: null, sample_reimbursement: '(40.00)',
};

const row = buildDetailRow(payload, 'https://drive.google.com/file/d/abc/view');

// New HubSpot-mirrored layout, 4 blocks (see portal.js parseSheetRow, A=0..BA=52).
assert.strictEqual(row[0], 'Test Club I');           // A  order#
assert.strictEqual(row[1], 'Test GCC');              // B  club
assert.strictEqual(row[2], '123 Main St');           // C  address
assert.strictEqual(row[3], '');                      // D  shipping_address
assert.strictEqual(row[4], '2026-07-20');            // E  ship_date
assert.strictEqual(row[5], 'https://nickel.com/a');  // F  payment_link
assert.strictEqual(row[6], 'https://nickel.com/b');  // G  payment_link_2
assert.strictEqual(row[7], 'a@club.com');            // H  customer_email
assert.strictEqual(row[8], 'https://x');             // I  product_page
assert.strictEqual(row[9], 'https://img/p.png');     // J  product_1 (url)
assert.strictEqual(row[14], 'Navy');                 // O  description_1
assert.strictEqual(row[15], 'White');                // P  description_2
assert.strictEqual(row[19], 'S-24 M-16 L-8');        // T  sizes_1
assert.strictEqual(row[20], '');                     // U  sizes_2
assert.strictEqual(row[24], 48);                     // Y  quantity_1
assert.strictEqual(row[29], 42);                     // AD price_1
assert.strictEqual(row[34], 150);                    // AI embroidery
assert.strictEqual(row[35], -40);                    // AJ art_setup (signed)
assert.strictEqual(row[36], '(40.00)');              // AK sample_reimbursement
assert.strictEqual(row[38], 25);                     // AM shipping
assert.strictEqual(row[39], 'Net 30');               // AN payment_terms
assert.strictEqual(row[40], 2016);                   // AO subtotal
assert.strictEqual(row[41], 2276);                   // AP total
assert.strictEqual(row[43], '1');                    // AR strike_embroidery
assert.strictEqual(row[44], '');                     // AS strike_art (false)
assert.strictEqual(row[45], '1');                    // AT strike_shipping
assert.strictEqual(row[52], 'https://drive.google.com/file/d/abc/view'); // BA drive_pdf_link
assert.strictEqual(row.length, 53);

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
