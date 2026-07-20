const express = require('express');
const { assertConfigured } = require('./config');
const { getListMemberEmails } = require('./hubspot');
const { sendEmail } = require('./resend');
const { newsletterEmail } = require('./newsletterEmail');
const { requireInternalAuth } = require('./internalAuth');

const router = express.Router();

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post('/send', requireInternalAuth, async (req, res, next) => {
  try {
    assertConfigured(['resend.apiKey', 'resend.fromEmail']);

    const { testEmail, listId, story } = req.body || {};
    const email = newsletterEmail(story);

    if (testEmail) {
      await sendEmail({ to: testEmail, subject: email.subject, html: email.html });
      return res.status(200).json({ sent: 1, failed: 0 });
    }

    if (!listId) {
      return res.status(400).json({ error: 'listId or testEmail is required' });
    }

    const emails = await getListMemberEmails(listId);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((to) => sendEmail({ to, subject: email.subject, html: email.html }))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') sent += 1;
        else failed += 1;
      }

      if (i + BATCH_SIZE < emails.length) await sleep(BATCH_DELAY_MS);
    }

    res.status(200).json({ sent, failed });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
