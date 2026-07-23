// Drive + MO-sheet persistence for Hermes.
//
// Writes to the SAME Google Sheet the live orders portal (mayor-invoice/portal.js)
// reads, and uploads the rendered PDF to Drive (newest-only). Guarded: with no
// GOOGLE_SERVICE_ACCOUNT_JSON it no-ops and reports { persisted:false } so the
// /hermes/generate endpoint still works before the service account is set up.
//
// ponytail: the 53-column detail-row layout below is duplicated from
// mayor-invoice (appendOrderToSheet + portal.js parseSheetRow). If that layout
// changes there, update it here too. The clean fix is a shared `mo-sheet.js`
// module (like doc-render.js); not worth it until the schema actually churns.

const { google } = require('googleapis');
const { Readable } = require('stream');

const SHEET_ID = process.env.MO_SHEET_ID || '152hyxQz87IwPYl2lgBCm6pKKSjYl1hoL-AuZu-wODbo';
const DRIVE_FOLDER_ID = process.env.DRIVE_BRAIN_FOLDER_ID || '';
const SHEET_CREDS = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT || '{}');

// Neutralize spreadsheet formula injection: a value starting with = + - @ (or a
// leading control char) is prefixed with a single quote so Sheets treats it as text.
function sheetSafe(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function credsPresent() {
  return !!SHEET_CREDS.client_email;
}

// Order status is monotonic — automated writes (invoice regen, tracking, delivered,
// paid, and the hourly poll) must only move it FORWARD. Without this, regenerating
// an invoice for an already-paid/delivered order silently resets it to Awaiting
// Payment. Rank blank/unknown as 0 so a first write always lands.
const STATUS_RANK = {
  'awaiting approval': 1, 'awaiting payment': 2, 'pending': 3, 'paid': 3,
  'in transit': 4, 'shipped': 4, 'delivered': 5,
};
const statusRank = (s) => STATUS_RANK[String(s || '').trim().toLowerCase()] || 0;

function getClients() {
  // Service accounts have no Drive storage quota, so acting as the SA's own
  // identity can't create files ("Service Accounts do not have storage quota").
  // Impersonate the Workspace user (same domain-wide delegation the Gmail client
  // uses) so Drive/Sheets act as mayor@, who has quota and owns the brain folder.
  const auth = new google.auth.JWT({
    email: SHEET_CREDS.client_email,
    key: SHEET_CREDS.private_key,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
    subject: process.env.GMAIL_USER || 'mayor@mayorclothing.com',
  });
  return { sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }) };
}

// The portal's detail tabs mirror the HubSpot "Deals" tab's column order and
// names exactly (see portal.js parseSheetRow, cols A=0..BF=57), with a few
// fields the Deals tab has no slot for appended at the end (orig_price x5,
// drive_pdf_link) and print_background inserted after product_page. Order
// Number lives at F=5 here, not A — Deal ID takes column A instead. Mirrors
// mayor-invoice appendOrderToSheet's rowData exactly — keep the two in lockstep.
// hermesMapping.js deliberately zeroes payload.subtotal/total ("force doc-render
// to recompute from line items") so the PDF always shows the right numbers even
// when they weren't passed in cleanly. But doc-render.js only computes that
// fallback for its own rendering -- it never hands the number back -- so the
// sheet was being written with blank Subtotal Price/Total on every Hermes-
// generated order. Mirrors doc-render.js's exact fallback formula so the sheet
// gets the same numbers the PDF shows, instead of blanks.
function effectiveSubtotalAndTotal(p) {
  const items = p.line_items || [];
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,()\s]/g, '')); return isNaN(n) ? 0 : n; };
  const artSigned = (v) => {
    const s = String(v == null ? '' : v).trim();
    const magnitude = num(s);
    return (s.startsWith('-') || s.startsWith('(')) ? -Math.abs(magnitude) : magnitude;
  };
  const calcSubtotal = items.reduce((s, i) => s + (parseFloat(String(i.amount).replace(/[$,]/g, '')) || (Number(i.quantity) * Number(i.price)) || 0), 0);
  const subtotal = p.subtotal && Number(p.subtotal) > 0 ? Number(p.subtotal) : calcSubtotal;
  const embForTotal = p.strike_embroidery ? 0 : num(p.embroidery);
  const artForTotal = p.strike_art ? 0 : artSigned(p.art_setup);
  const shipForTotal = p.strike_shipping ? 0 : num(p.shipping);
  const reimbForTotal = num(p.sample_reimbursement);
  const customForTotal = num(p.custom_label);
  const total = p.total && Number(p.total) > 0
    ? Number(p.total)
    : subtotal + shipForTotal + customForTotal + embForTotal + artForTotal - reimbForTotal;
  return { subtotal, total };
}

function buildDetailRow(p, driveLink) {
  const items = p.line_items || [];
  const get = (i, key) => (items[i] ? (items[i][key] || '') : '');
  const subtotalQty = p.subtotal_quantity != null ? p.subtotal_quantity : items.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
  const { subtotal: effSubtotal, total: effTotal } = effectiveSubtotalAndTotal(p);
  return [
    p.deal_id || '', p.deal_name || '', p.deal_stage || '', p.tracking_number || '',
    p.customer_email || '', p.order_number || '', p.product_page || '',
    p.print_background || '',
    p.club || '', p.shipping_address || '', p.address || '',
    p.ship_date || '', p.in_hand_date || '', p.payment_terms || '',
    // Products/Description/Sizes/Quantity/Price x5 — mirrors the Deals tab's own
    // quirky ordering (slots 4/5 group Product/Description/Sizes together,
    // then their Quantity/Price come after slot 5's Sizes).
    get(0, 'url'), get(0, 'description'), get(0, 'sizes'), get(0, 'quantity'), get(0, 'price'),
    get(1, 'url'), get(1, 'description'), get(1, 'sizes'), get(1, 'quantity'), get(1, 'price'),
    get(2, 'url'), get(2, 'description'), get(2, 'sizes'), get(2, 'quantity'), get(2, 'price'),
    get(3, 'url'), get(3, 'description'), get(3, 'sizes'),
    get(4, 'url'), get(4, 'description'), get(4, 'sizes'),
    get(3, 'quantity'), get(3, 'price'), get(4, 'quantity'), get(4, 'price'),
    subtotalQty || '', effSubtotal || '',
    p.embroidery || '',
    (p.art_setup != null ? parseFloat(String(p.art_setup).replace(/[$,\s]/g, '')) || '' : ''),
    p.sample_reimbursement || '', p.custom_label || '', p.shipping || '', effTotal || '',
    p.payment_link || '', p.payment_link_2 || '',
    p.strike_embroidery ? '1' : '', p.strike_art ? '1' : '', p.strike_shipping ? '1' : '',
    get(0, 'orig_price') || '', get(1, 'orig_price') || '', get(2, 'orig_price') || '', get(3, 'orig_price') || '', get(4, 'orig_price') || '',
    driveLink || '', // BF=57 — Drive PDF link (drive_pdf_link)
  ];
}

// Pre-registers a customer in the Users sheet (A=email, B=passwordHash, C=club)
// the moment their order is created, so they can log into the portal (via
// "create account", which just sets a password on this row) without needing
// someone to notice and backfill it by hand later. Mirrors mayor-invoice's own
// upsertUserEmail (index.js) -- that one only runs for orders generated through
// mayor-invoice's manual /generate endpoint, not the automated Hermes/HubSpot path.
async function upsertUserEmail(sheets, email, club) {
  if (!email) return;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Users!A:C' });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => r[0] && r[0].toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'Users!A:C', valueInputOption: 'USER_ENTERED',
        resource: { values: [[email, '', club || ''].map(sheetSafe)] },
      });
    } else if (!rows[idx][2] && club) {
      // Existing user row but missing club — fill it in
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `Users!C${idx + 1}`,
        valueInputOption: 'USER_ENTERED', resource: { values: [[club]] },
      });
    }
  } catch (e) {
    console.error('upsertUserEmail failed:', e.message);
  }
}

// Upsert keyed on order_number in column A (skip header row 1). Returns 1-based row.
async function writeRow(sheets, tab, orderNumber, rowData) {
  // Order Info keys on column A; Order Confirmations/Invoices key on F (Order
  // Number, per the Deals-mirrored layout — Deal ID takes column A there).
  const keyCol = tab === 'Order Info' ? 'A' : 'F';
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!${keyCol}:${keyCol}` });
  const col = res.data.values || [];
  const existingIdx = col.findIndex((r, i) => i > 0 && String(r[0]) === String(orderNumber));
  let targetRow;
  if (existingIdx > 0) {
    targetRow = existingIdx + 1;
  } else {
    let firstEmpty = col.length + 1;
    for (let i = 1; i < col.length; i++) {
      if (!col[i] || !col[i][0] || col[i][0].trim() === '') { firstEmpty = i + 1; break; }
    }
    targetRow = firstEmpty;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: [rowData.map(sheetSafe)] },
  });
  return targetRow;
}

// Newest-only: overwrite the existing PDF of this name in the folder, else create.
async function uploadPdfToDrive(drive, orderNumber, docType, pdfBuffer) {
  if (!DRIVE_FOLDER_ID) return { fileId: null, pdfUrl: null };
  const name = `${orderNumber} - ${docType === 'invoice' ? 'Invoice' : 'Order Confirmation'}.pdf`;
  const media = { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) };
  const q = `name = '${name.replace(/'/g, "\\'")}' and '${DRIVE_FOLDER_ID}' in parents and trashed = false`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });

  let fileId;
  if (list.data.files && list.data.files.length) {
    fileId = list.data.files[0].id;
    await drive.files.update({ fileId, media });
  } else {
    const created = await drive.files.create({
      requestBody: { name, parents: [DRIVE_FOLDER_ID], mimeType: 'application/pdf' },
      media,
      fields: 'id',
    });
    fileId = created.data.id;
  }
  return { fileId, pdfUrl: `https://drive.google.com/file/d/${fileId}/view` };
}

// Orchestrator. payload = doc-render payload; docType = 'order_confirmation'|'invoice'.
// Returns { persisted, status, driveFileId, pdfUrl } — never throws (logs + degrades).
async function persistOrder({ payload, docType, pdfBuffer }) {
  const status = docType === 'invoice' ? 'Awaiting Payment' : 'Awaiting Approval';
  if (!credsPresent()) {
    return { persisted: false, status, driveFileId: null, pdfUrl: null, skipped: 'no google credentials' };
  }
  try {
    const { sheets, drive } = getClients();
    const orderNumber = payload.order_number || '';

    const { fileId, pdfUrl } = await uploadPdfToDrive(drive, orderNumber, docType, pdfBuffer);

    // Order Info: the row the portal lists. New order => seed it; keep status current.
    // Read A:E so we know the current status and never move it backward (F3).
    const infoRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Order Info!A:E' });
    const infoRows = infoRes.data.values || [];
    const infoIdx = infoRows.findIndex((r, i) => i > 0 && String(r[0] || '') === String(orderNumber));
    if (infoIdx < 1) {
      await writeRow(sheets, 'Order Info', orderNumber,
        [orderNumber, payload.club || '', payload.ship_date || '', payload.customer_email || '', status, '', '', ''].map(sheetSafe));
      // customer_email can be a comma/semicolon list (see portal.js emailInList) --
      // pre-register each address so every recipient can log in, not just the first.
      const emails = String(payload.customer_email || '').split(/[,;]+/).map((e) => e.trim()).filter(Boolean);
      for (const email of emails) await upsertUserEmail(sheets, email, payload.club);
    } else if (docType === 'invoice' && statusRank(status) > statusRank(infoRows[infoIdx][4])) {
      // Advance to Awaiting Payment only if the order isn't already further along
      // (paid/in transit/delivered) — regenerating an invoice must not regress it.
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `Order Info!E${infoIdx + 1}`,
        valueInputOption: 'USER_ENTERED', resource: { values: [[status]] },
      });
    }

    // Detail row for the portal's document view.
    const tab = docType === 'invoice' ? 'Invoices' : 'Order Confirmations';
    await writeRow(sheets, tab, orderNumber, buildDetailRow(payload, pdfUrl));

    return { persisted: true, status, driveFileId: fileId, pdfUrl };
  } catch (e) {
    console.error('persistOrder failed:', e.message);
    return { persisted: false, status, driveFileId: null, pdfUrl: null, error: e.message };
  }
}

// Status-only transition on the Order Info row (portal reads E=status, F=tracking,
// G=delivered). Used by the tracking/delivered triggers. No-op without creds or if
// the order row doesn't exist yet. Returns { updated, status }.
async function setOrderStatus({ orderNumber, status, tracking, deliveredDate }) {
  if (!credsPresent()) return { updated: false, status, skipped: 'no google credentials' };
  try {
    const { sheets } = getClients();
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Order Info!A:E' });
    const col = res.data.values || [];
    const idx = col.findIndex((r, i) => i > 0 && String(r[0]) === String(orderNumber));
    if (idx < 1) return { updated: false, status, skipped: 'order not found' };
    const row = idx + 1;

    // Status is monotonic — only write E if it moves forward (F3). Tracking number
    // and delivered date are data, not status, so they always write.
    const data = [];
    if (statusRank(status) > statusRank(col[idx][4])) data.push({ range: `Order Info!E${row}`, values: [[sheetSafe(status)]] });
    if (tracking != null && tracking !== '') data.push({ range: `Order Info!F${row}`, values: [[sheetSafe(tracking)]] });
    if (deliveredDate != null && deliveredDate !== '') data.push({ range: `Order Info!G${row}`, values: [[sheetSafe(deliveredDate)]] });
    if (data.length === 0) return { updated: false, status, skipped: 'no forward change' };

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { valueInputOption: 'USER_ENTERED', data },
    });
    return { updated: true, status };
  } catch (e) {
    console.error('setOrderStatus failed:', e.message);
    return { updated: false, status, error: e.message };
  }
}

module.exports = { persistOrder, setOrderStatus, buildDetailRow, credsPresent };
