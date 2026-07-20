const express = require('express');
const { config, assertConfigured } = require('./config');
const { verifyHubspotSignature } = require('./verifyHubspot');
const { classifyTriggerEvent, runAction } = require('./hermesService');

const router = express.Router();

// HubSpot deal-property-change webhook. Sole job: drive the Hermes document /
// status triggers (OC, Invoice, tracking -> In Transit, delivered -> Delivered).
// The old order-placed follow-up email was removed per business decision — the
// only automatic customer email is handled elsewhere — so this route no longer
// depends on HUBSPOT_ORDER_DEAL_STAGE or Resend.
router.post('/hubspot', async (req, res, next) => {
  try {
    assertConfigured(['hubspot.token', 'hubspot.clientSecret']);

    const signature = req.header('X-HubSpot-Signature-v3');
    const timestamp = req.header('X-HubSpot-Request-Timestamp');
    const rawBody = req.rawBody || '';

    const valid = verifyHubspotSignature({
      method: req.method,
      uri: `${config.publicBaseUrl}${req.originalUrl}`,
      rawBody,
      signature,
      timestamp,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Invalid HubSpot signature' });
    }

    const events = Array.isArray(req.body) ? req.body : [];

    for (const event of events) {
      // Hermes fast-path: OC/Invoice generation + tracking/delivered status.
      const trigger = classifyTriggerEvent(event);
      if (trigger) {
        try {
          await runAction(trigger);
        } catch (err) {
          console.error(`Hermes trigger ${trigger.action} failed for deal ${trigger.dealId}:`, err.message);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
