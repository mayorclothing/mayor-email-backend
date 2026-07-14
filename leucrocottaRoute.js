const express = require('express');
const { config, timingSafeKeyMatch } = require('./config');
const { runInboxPoll } = require('./leucrocotta/leucrocottaService');

const router = express.Router();

function requireInternalAuth(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!timingSafeKeyMatch(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// POST /leucrocotta/poll — read unread inbox, classify, draft/flip status.
// Wire a Render cron (e.g. every 15 min) to hit this.
router.post('/poll', requireInternalAuth, async (_req, res, next) => {
  try {
    const result = await runInboxPoll();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
