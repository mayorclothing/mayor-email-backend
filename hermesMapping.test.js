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
    payment_terms: 'Due on receipt.',
    unstrike: '',
  },
};

const p = dealToRenderPayload(deal, 'invoice');

// Doc type + split payment link
assert.strictEqual(p.type, 'invoice');
assert.strictEqual(p.payment_link, 'https://nickel.com/a');
assert.strictEqual(p.payment_link_2, 'https://nickel.com/b');

// Two line items built; empty slots skipped
assert.strictEqual(p.line_items.length, 2);
// Slot 1: product is a URL => image url set, product name defaulted; desc + sizes now separate
assert.strictEqual(p.line_items[0].url, 'https://img.example.com/polo.png');
assert.strictEqual(p.line_items[0].product, 'Custom Print Polo');
assert.strictEqual(p.line_items[0].description, 'Navy piqué');
assert.strictEqual(p.line_items[0].sizes, 'S-24 M-16 L-8');
assert.strictEqual(p.line_items[0].quantity, 48);
assert.strictEqual(p.line_items[0].price, 42);
assert.strictEqual(p.line_items[0].amount, 2016); // qty*price, must not be blank
// Slot 2: non-URL product kept, no sizes
assert.strictEqual(p.line_items[1].product, 'Custom Cap');
assert.strictEqual(p.line_items[1].url, '');
assert.strictEqual(p.line_items[1].description, 'White');
assert.strictEqual(p.line_items[1].sizes, '');

// Fees + cross-outs
assert.strictEqual(p.embroidery, 150);
assert.strictEqual(p.strike_embroidery, true);
assert.strictEqual(p.art_setup, -40);
assert.strictEqual(p.strike_art, true);
assert.strictEqual(p.shipping, 25);
assert.strictEqual(p.strike_shipping, false);
assert.strictEqual(p.payment_terms, 'Due on receipt.');
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
// Default (no Unstrike): embroidery + art setup struck, shipping charged.
assert.strictEqual(empty.strike_embroidery, true);
assert.strictEqual(empty.strike_art, true);
assert.strictEqual(empty.strike_shipping, false);
// Unstrike flips items from default: Embroidery/Art -> charged; Shipping -> struck.
const uns = dealToRenderPayload({ properties: { unstrike: 'Embroidery; Shipping' } }, 'invoice');
assert.strictEqual(uns.strike_embroidery, false);
assert.strictEqual(uns.strike_art, true);
assert.strictEqual(uns.strike_shipping, true);

// Property list covers all 5 slots of qty + price
assert.ok(INVOICE_PROPERTIES.includes('z_quantity_5'));
assert.ok(INVOICE_PROPERTIES.includes('z_price_5'));

console.log('hermesMapping.test.js: all assertions passed');
