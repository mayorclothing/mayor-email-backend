// Runnable check for the HubSpot->render mapping. No framework: `node hermesMapping.test.js`.
const assert = require('assert');
const { dealToRenderPayload, INVOICE_PROPERTIES } = require('./hermesMapping');

const deal = {
  properties: {
    order_number: 'Test Club I',
    club: 'Test Golf & Country Club',
    c_billing_address: '123 Main St\nAtlanta, GA 30307',
    shippingbilling_address: '',
    ship_date: '2026-07-20',
    y_payment_link: 'https://nickel.com/a / https://nickel.com/b',
    customer_email: 'a@club.com, b@club.com',
    product_page: 'https://mayorclothing.com/x',
    product_1: 'https://img.example.com/polo.png', // URL => treated as image
    description_1: 'Navy piqué',
    sizes_1: 'S-24 M-16 L-8',
    k_quantity_1: '48',
    n_price_1: '42',
    product_2: 'Custom Cap',
    description_2: 'White',
    l_quantity_2: '12',
    z_price_2: '0',
    za_embroidery: '150',
    zb_art_setup: '-40',           // art credit stays negative
    z_sample_reimbursement: '40',
    custom_main_label: '0',
    shipping_cost: '25',
    zj_payment_terms: '',
    z_crossouts: 'Embroidery;Shipping',
  },
};

const p = dealToRenderPayload(deal, 'invoice');

// Doc type + split payment link
assert.strictEqual(p.type, 'invoice');
assert.strictEqual(p.payment_link, 'https://nickel.com/a');
assert.strictEqual(p.payment_link_2, 'https://nickel.com/b');

// Two line items built; empty slots skipped
assert.strictEqual(p.line_items.length, 2);
// Slot 1: product is a URL => image url set, product name defaulted, desc+sizes joined
assert.strictEqual(p.line_items[0].url, 'https://img.example.com/polo.png');
assert.strictEqual(p.line_items[0].product, 'Custom Print Polo');
assert.strictEqual(p.line_items[0].description, 'Navy piqué\nS-24 M-16 L-8');
assert.strictEqual(p.line_items[0].quantity, 48);
assert.strictEqual(p.line_items[0].price, 42);
assert.strictEqual(p.line_items[0].amount, 2016); // qty*price, must not be blank
// Slot 2: non-URL product kept, no sizes
assert.strictEqual(p.line_items[1].product, 'Custom Cap');
assert.strictEqual(p.line_items[1].url, '');

// Fees + cross-outs
assert.strictEqual(p.embroidery, 150);
assert.strictEqual(p.strike_embroidery, true);
assert.strictEqual(p.art_setup, -40);
assert.strictEqual(p.strike_art, false);
assert.strictEqual(p.shipping, 25);
assert.strictEqual(p.strike_shipping, true);
assert.strictEqual(p.sample_reimbursement, '(40.00)');
assert.strictEqual(p.custom_label, null); // 0 => omitted

// Force-recompute sentinels
assert.strictEqual(p.subtotal, 0);
assert.strictEqual(p.total, 0);

// order_confirmation maps to 'confirmation'
assert.strictEqual(dealToRenderPayload(deal, 'order_confirmation').type, 'confirmation');

// Empty deal => empty-but-valid payload, no throw
const empty = dealToRenderPayload({ properties: {} }, 'invoice');
assert.strictEqual(empty.line_items.length, 0);
// Default (no z_crossouts) strikes embroidery + art setup, matching the original tool.
assert.strictEqual(empty.strike_embroidery, true);
assert.strictEqual(empty.strike_art, true);
assert.strictEqual(empty.strike_shipping, false);
// Explicit z_crossouts takes full control.
const explicit = dealToRenderPayload({ properties: { z_crossouts: 'Shipping' } }, 'invoice');
assert.strictEqual(explicit.strike_embroidery, false);
assert.strictEqual(explicit.strike_art, false);
assert.strictEqual(explicit.strike_shipping, true);

// Property list covers all 5 slots of qty + price
assert.ok(INVOICE_PROPERTIES.includes('z_quantity_5'));
assert.ok(INVOICE_PROPERTIES.includes('z_price_5'));

console.log('hermesMapping.test.js: all assertions passed');
