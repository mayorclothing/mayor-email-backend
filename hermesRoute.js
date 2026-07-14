const express = require('express');
const { config, assertConfigured, timingSafeKeyMatch } = require('./config');
const { generateDocument, runPoll } = require('./hermesService');

const router = express.Router();

function requireInternalAuth(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!timingSafeKeyMatch(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /hermes/generate  { dealId, docType: 'order_confirmation'|'invoice' }
// Renders the OC/Invoice PDF from live HubSpot deal props, persists to Drive +
// MO sheet, and returns the PDF (base64) plus the computed status.
router.post('/generate', requireInternalAuth, async (req, res, next) => {
  try {
    const { dealId, docType } = req.body || {};
    if (!dealId) return res.status(400).json({ error: 'dealId is required' });
    if (docType !== 'order_confirmation' && docType !== 'invoice') {
      return res.status(400).json({ error: "docType must be 'order_confirmation' or 'invoice'" });
    }

    assertConfigured(['hubspot.token']);

    const idempotencyKey = req.header('X-Idempotency-Key');
    const result = await generateDocument({ dealId, docType, idempotencyKey });

    const body = { ...result };
    if (result.pdf) { body.pdfBase64 = result.pdf.toString('base64'); delete body.pdf; }
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
});

// POST /hermes/poll — safety-net reconcile of trigger flags. Wire a Render cron
// (hourly) to hit this. Idempotency keeps it cheap alongside the webhook path.
router.post('/poll', requireInternalAuth, async (_req, res, next) => {
  try {
    // Cron hits this hourly. Stay green (200 skipped) until HubSpot is wired up,
    // so a red cron always means a real failure — not "not configured yet".
    if (!config.hubspot.token) {
      return res.status(200).json({ ok: true, skipped: 'hubspot not configured' });
    }
    const counts = await runPoll();
    res.status(200).json({ ok: true, counts });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
