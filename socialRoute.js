const express = require('express');
const { runSocialPoll } = require('./social/socialService');
const { requireInternalAuth } = require('./internalAuth');

const router = express.Router();

// POST /social/poll — draft LinkedIn/Instagram captions for new Social Inbox
// photos and email them to Matt for review. Wire a Render cron to hit this.
router.post('/poll', requireInternalAuth, async (_req, res, next) => {
  try {
    const result = await runSocialPoll();
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
