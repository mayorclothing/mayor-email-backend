const assert = require('node:assert');
const crypto = require('crypto');
process.env.HUBSPOT_CLIENT_SECRET = 'test-secret';
const { verifyHubspotSignature } = require('./verifyHubspot');

const method = 'POST';
const uri = 'https://mayor-email-backend.onrender.com/webhooks/hubspot';
const rawBody = '[{"objectId":1,"propertyName":"zc_trigger_oc","propertyValue":"true"}]';
const ts = String(Date.now());
const good = crypto.createHmac('sha256', 'test-secret').update(`${method}${uri}${rawBody}${ts}`).digest('base64');

assert.strictEqual(verifyHubspotSignature({ method, uri, rawBody, signature: good, timestamp: ts }), true, 'valid signature should pass');
assert.strictEqual(verifyHubspotSignature({ method, uri, rawBody, signature: 'wrong', timestamp: ts }), false, 'bad signature should fail');
assert.strictEqual(verifyHubspotSignature({ method, uri, rawBody, signature: good, timestamp: '0' }), false, 'stale/replayed timestamp should fail');
assert.strictEqual(verifyHubspotSignature({ method, uri, rawBody, signature: '', timestamp: ts }), false, 'missing signature should fail');

// Guard against regression to the old buggy base (secret prepended to the message).
const buggy = crypto.createHmac('sha256', 'test-secret').update(`test-secret${method}${uri}${rawBody}${ts}`).digest('base64');
assert.strictEqual(verifyHubspotSignature({ method, uri, rawBody, signature: buggy, timestamp: ts }), false, 'old prepended-secret base must not validate');

console.log('verifyHubspot.test.js: all assertions passed');
