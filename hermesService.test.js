// Runnable check for the webhook event -> action classifier. `node hermesService.test.js`.
const assert = require('assert');
const { classifyTriggerEvent, TRIGGER } = require('./hermesService');

const pc = (propertyName, propertyValue, objectId = '123') =>
  ({ subscriptionType: 'deal.propertyChange', propertyName, propertyValue, objectId });

// OC trigger: only on true
assert.deepStrictEqual(classifyTriggerEvent(pc(TRIGGER.oc, 'true')), { action: 'generate_oc', dealId: '123' });
assert.deepStrictEqual(classifyTriggerEvent(pc(TRIGGER.oc, true)), { action: 'generate_oc', dealId: '123' });
assert.strictEqual(classifyTriggerEvent(pc(TRIGGER.oc, 'false')), null);

// Invoice trigger
assert.deepStrictEqual(classifyTriggerEvent(pc(TRIGGER.invoice, 'true')), { action: 'generate_invoice', dealId: '123' });

// Tracking: any non-empty value => in_transit
assert.deepStrictEqual(classifyTriggerEvent(pc(TRIGGER.tracking, '1Z999')), { action: 'in_transit', dealId: '123' });
assert.strictEqual(classifyTriggerEvent(pc(TRIGGER.tracking, '')), null);

// Delivered: presence of a date => delivered
assert.deepStrictEqual(classifyTriggerEvent(pc(TRIGGER.delivered, '2026-07-25')), { action: 'delivered', dealId: '123' });
assert.strictEqual(classifyTriggerEvent(pc(TRIGGER.delivered, '')), null);

// Irrelevant events ignored
assert.strictEqual(classifyTriggerEvent(pc('dealstage', 'appointmentscheduled')), null);
assert.strictEqual(classifyTriggerEvent({ subscriptionType: 'deal.creation', objectId: '1' }), null);
assert.strictEqual(classifyTriggerEvent(undefined), null);

console.log('hermesService.test.js: all assertions passed');
