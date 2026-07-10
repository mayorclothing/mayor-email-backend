const express = require('express');
const { config, assertConfigured } = require('./config');
const { verifyHubspotSignature } = require('./verifyHubspot');
const { getDeal, getContact, getPrimaryContactId, logNoteOnContact, markDealFollowUpSent } = require('./hubspot');
const { sendEmail } = require('./resend');
const { orderFollowUpEmail } = require('./orderFollowUpEmail');
const { classifyTriggerEvent, runAction } = require('./hermesService');

const router = express.Router();
const sentDealIds = new Set();

router.post('/hubspot', async (req, res, next) => {
  try {
    assertConfigured(['hubspot.token', 'hubspot.clientSecret', 'hubspot.orderDealStage', 'resend.apiKey', 'resend.fromEmail']);

    const signature = req.header('X-HubSpot-Signature-v3');
    const timestamp = req.header('X-HubSpot-Request-Timestamp');
    const rawBody = req.rawBody || '';

    const valid = verifyHubspotSignature({
      method: req.method,
      uri: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
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
        continue;
      }

      if (event.subscriptionType !== 'deal.propertyChange' || event.propertyName !== 'dealstage') continue;
      if (event.propertyValue !== config.hubspot.orderDealStage) continue;

      const dealId = String(event.objectId);
      if (sentDealIds.has(dealId)) continue;

      const deal = await getDeal(dealId);
      const contactId = await getPrimaryContactId(deal);
      if (!contactId) continue;

      const contact = await getContact(contactId);
      if (contact.properties?.followup_sent === 'true') {
        sentDealIds.add(dealId);
        continue;
      }

      const email = orderFollowUpEmail({
        firstName: contact.properties?.firstname,
        dealName: deal.properties?.dealname,
      });

      await sendEmail({ to: contact.properties?.email, subject: email.subject, html: email.html });
      await logNoteOnContact(contactId, 'Order follow-up email sent automatically.');
      await markDealFollowUpSent(dealId);

      sentDealIds.add(dealId);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
