const crypto = require('crypto');
const express = require('express');
const { runInboxPoll } = require('./leucrocotta/leucrocottaService');
const gmail = require('./leucrocotta/gmailClient');
const { requireInternalAuth } = require('./internalAuth');

const router = express.Router();

// POST /leucrocotta/poll — manual fallback, kept but no longer scheduled now
// that push notifications drive the inbox check.
router.post('/poll', requireInternalAuth, async (_req, res, next) => {
  try {
    const result = await runInboxPoll();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// POST /leucrocotta/watch — (re)register Gmail push notifications. Expires
// after 7 days max; wire a Render cron every 6 days to call this.
router.post('/watch', requireInternalAuth, async (_req, res, next) => {
  try {
    const result = await gmail.watch();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// POST /leucrocotta/gmail-webhook/:secret — Pub/Sub push target. Pub/Sub
// can't send our normal Bearer header, so the secret lives in the path;
// timing-safe compare since this is public-internet-facing.
router.post('/gmail-webhook/:secret', async (req, res) => {
  const expected = process.env.LEUCROCOTTA_WEBHOOK_SECRET || '';
  const given = req.params.secret || '';
  const ok = expected && Buffer.from(given).length === Buffer.from(expected).length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return res.sendStatus(404); // don't confirm the route exists to a bad guess

  try {
    await runInboxPoll();
  } catch (e) {
    console.error('Leucrocotta webhook poll failed:', e.message);
  }
  res.sendStatus(204); // ack regardless — poll only acts on unread mail, safe to retry-or-not
});

module.exports = router;
