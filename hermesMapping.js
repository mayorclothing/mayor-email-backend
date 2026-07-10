// Maps a HubSpot deal's properties -> the doc-render.js payload (the same shape
// mayor-invoice's /generate consumes). Property names verified against the live
// Mayor account (deals object). Keep this table as the single place to fix names.
//
// New props not yet created in HubSpot (zj_payment_terms, z_crossouts, trigger
// checkboxes) are read defensively: absent => sensible defaults (no strikes,
// default payment terms), so this works before the manual HubSpot config lands.

// Real HubSpot property names, per slot (1..5). The letter prefixes are Matt's
// display-sort convention, not multiple values — one qty + one price per slot.
const QTY_PROPS   = ['k_quantity_1', 'l_quantity_2', 'm_quantity_3', 'z_quantity_4', 'z_quantity_5'];
const PRICE_PROPS = ['n_price_1', 'z_price_2', 'z_price_3', 'z_price_4', 'z_price_5'];

// Every deal property Hermes needs to render a document. Request exactly these.
const INVOICE_PROPERTIES = [
  'order_number', 'club', 'c_billing_address', 'shippingbilling_address', 'ship_date',
  'y_payment_link', 'customer_email', 'product_page',
  'product_1', 'product_2', 'product_3', 'product_4', 'product_5',
  'description_1', 'description_2', 'description_3', 'description_4', 'description_5',
  'sizes_1', 'sizes_2', 'sizes_3', 'sizes_4', 'sizes_5',
  ...QTY_PROPS, ...PRICE_PROPS,
  'za_embroidery', 'zb_art_setup', 'z_sample_reimbursement', 'custom_main_label', 'shipping_cost',
  'zj_payment_terms', 'z_crossouts',
];

// parseFloat that tolerates "$", "," and stray spaces; preserves a leading minus.
function n(v) {
  const parsed = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

// docType from the trigger -> doc-render's `type`.
function docTypeToType(docType) {
  return docType === 'invoice' ? 'invoice' : 'confirmation';
}

// deal = HubSpot deal object ({ properties: {...} }); docType = 'order_confirmation'|'invoice'.
function dealToRenderPayload(deal, docType) {
  const p = deal?.properties || {};

  // Line items: mirror the invoice-generator tab's build (product-as-URL -> image).
  const line_items = [];
  for (let i = 0; i < 5; i++) {
    const qty = n(p[QTY_PROPS[i]]);
    const desc = (p['description_' + (i + 1)] || '').trim();
    if (!qty && !desc) continue;

    const sizes = (p['sizes_' + (i + 1)] || '').trim();
    const fullDesc = sizes ? desc + (desc ? '\n' : '') + sizes : desc;

    const rawProduct = (p['product_' + (i + 1)] || '').trim();
    const isUrl = /^https?:\/\//i.test(rawProduct);
    const price = n(p[PRICE_PROPS[i]]);

    line_items.push({
      product: isUrl ? 'Custom Print Polo' : (rawProduct || 'Custom Print Polo'),
      url: isUrl ? rawProduct : '',
      description: fullDesc,
      quantity: qty,
      orig_price: null,            // HubSpot has no was/now price per slot
      price,
      amount: qty * price,         // doc-render leaves the cell blank if amount is missing
    });
  }

  // Payment links: one field, one or two links separated by " / " => 50/50 labeling.
  const links = String(p.y_payment_link || '').split(' / ').map((s) => s.trim()).filter(Boolean);

  // Cross-outs: multi-select returns as a ";"-separated string of the option labels.
  const crossouts = String(p.z_crossouts || '').split(';').map((s) => s.trim().toLowerCase());

  const emb = n(p.za_embroidery);
  const art = n(p.zb_art_setup);           // signed: negative = art credit
  const label = n(p.custom_main_label);
  const sampleReimb = n(p.z_sample_reimbursement);

  return {
    type: docTypeToType(docType),
    order_number: p.order_number || '',
    club: p.club || '',
    address: p.c_billing_address || '',
    shipping_address: p.shippingbilling_address || '',
    ship_date: p.ship_date || '',
    date_label: 'Ship Date',                // delivery date dropped (blueprint §4.3)
    customer_email: p.customer_email || '',
    product_page: p.product_page || '',
    payment_link: links[0] || '',
    payment_link_2: links[1] || '',
    payment_terms: p.zj_payment_terms || '',
    line_items,
    subtotal: 0,                            // force doc-render to recompute from line items
    total: 0,                               // ditto — line items are the source of truth
    embroidery: emb || null,
    strike_embroidery: crossouts.includes('embroidery'),
    art_setup: art !== 0 ? art : null,
    strike_art: crossouts.includes('art setup'),
    shipping: n(p.shipping_cost),
    strike_shipping: crossouts.includes('shipping'),
    sample_reimbursement: sampleReimb > 0 ? `(${sampleReimb.toFixed(2)})` : null,
    custom_label: label > 0 ? label : null,
  };
}

module.exports = { dealToRenderPayload, INVOICE_PROPERTIES };
