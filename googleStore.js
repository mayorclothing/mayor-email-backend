// Drive + MO-sheet persistence for Hermes.
//
// Writes to the SAME Google Sheet the live orders portal (mayor-invoice/portal.js)
// reads, and uploads the rendered PDF to Drive (newest-only). Guarded: with no
// GOOGLE_SERVICE_ACCOUNT_JSON it no-ops and reports { persisted:false } so the
// /hermes/generate endpoint still works before the service account is set up.
//
// ponytail: the 46-column detail-row layout below is duplicated from
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

// The portal's detail tabs expect this exact column order (see portal.js
// parseSheetRow, cols A=0..AT=45). Drive link is appended at AU=46 (unread by
// the portal, so safe). Mirrors mayor-invoice appendOrderToSheet's rowData.
function buildDetailRow(p, driveLink) {
  const items = p.line_items || [];
  const get = (i, key) => (items[i] ? (items[i][key] || '') : '');
  return [
    p.order_number || '', p.customer_email || '', p.club || '',
    p.address || '', p.ship_date || '', p.payment_link || '',
    get(0, 'url'), get(0, 'description'), get(0, 'quantity'), get(0, 'price'), get(0, 'orig_price') || '',
    get(1, 'url'), get(1, 'description'), get(1, 'quantity'), get(1, 'price'), get(1, 'orig_price') || '',
    get(2, 'url'), get(2, 'description'), get(2, 'quantity'), get(2, 'price'), get(2, 'orig_price') || '',
    p.shipping || '', p.subtotal || '', p.embroidery || '',
    (p.art_setup != null ? parseFloat(String(p.art_setup).replace(/[$,\s]/g, '')) || '' : ''), p.total || '',
    get(3, 'url'), get(3, 'description'), get(3, 'quantity'), get(3, 'price'), get(3, 'orig_price') || '',
    get(4, 'url'), get(4, 'description'), get(4, 'quantity'), get(4, 'price'), get(4, 'orig_price') || '',
    p.product_page || '',
    p.shipping_address || '',
    p.date_label || 'Ship Date',
    p.payment_link_2 || '',
    p.payment_terms || '',
    p.strike_embroidery ? '1' : '',
    p.strike_art ? '1' : '',
    p.strike_shipping ? '1' : '',
    p.custom_label || '',
    p.sample_reimbursement || '',
    driveLink || '', // AU=46 — new: Drive PDF link
  ];
}

// Upsert keyed on order_number in column A (skip header row 1). Returns 1-based row.
async function writeRow(sheets, tab, orderNumber, rowData) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A:A` });
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
    const infoRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Order Info!A:A' });
    const infoOrders = (infoRes.data.values || []).map((r) => String(r[0] || ''));
    const infoIdx = infoOrders.findIndex((o, i) => i > 0 && o === String(orderNumber));
    if (infoIdx < 1) {
      await writeRow(sheets, 'Order Info', orderNumber,
        [orderNumber, payload.customer_email || '', payload.club || '', payload.ship_date || '', status, '', '', ''].map(sheetSafe));
    } else if (docType === 'invoice') {
      // Advance status to Awaiting Payment when the invoice is generated.
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
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Order Info!A:A' });
    const col = res.data.values || [];
    const idx = col.findIndex((r, i) => i > 0 && String(r[0]) === String(orderNumber));
    if (idx < 1) return { updated: false, status, skipped: 'order not found' };
    const row = idx + 1;

    const data = [{ range: `Order Info!E${row}`, values: [[sheetSafe(status)]] }];
    if (tracking != null && tracking !== '') data.push({ range: `Order Info!F${row}`, values: [[sheetSafe(tracking)]] });
    if (deliveredDate != null && deliveredDate !== '') data.push({ range: `Order Info!G${row}`, values: [[sheetSafe(deliveredDate)]] });

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
