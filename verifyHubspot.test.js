const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret';
const { verifyHubspotSignature } = require('./verifyHubspot');

const SECRET = 'test-client-secret';
const METHOD = 'POST';
const URI = 'https://mayor-email-backend.onrender.com/webhooks/hubspot';
const BODY = '[{"objectId":123,"propertyName":"zc_trigger_oc","propertyValue":"true","subscriptionType":"deal.propertyChange"}]';

function sign(base) {
  return crypto.createHmac('sha256', SECRET).update(base).digest('base64');
}

test('accepts a signature built per the HubSpot v3 spec (method+uri+body+timestamp)', () => {
  const timestamp = String(Date.now());
  const signature = sign(`${METHOD}${URI}${BODY}${timestamp}`);
  assert.strictEqual(
    verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY, signature, timestamp }),
    true
  );
});

test('regression: the old secret-prefixed base string must NOT verify', () => {
  const timestamp = String(Date.now());
  const signature = sign(`${SECRET}${METHOD}${URI}${BODY}${timestamp}`);
  assert.strictEqual(
    verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY, signature, timestamp }),
    false
  );
});

test('rejects a stale timestamp (replay window)', () => {
  const timestamp = String(Date.now() - 6 * 60 * 1000);
  const signature = sign(`${METHOD}${URI}${BODY}${timestamp}`);
  assert.strictEqual(
    verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY, signature, timestamp }),
    false
  );
});

test('rejects a tampered body', () => {
  const timestamp = String(Date.now());
  const signature = sign(`${METHOD}${URI}${BODY}${timestamp}`);
  assert.strictEqual(
    verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY + 'x', signature, timestamp }),
    false
  );
});

test('rejects missing signature or timestamp', () => {
  assert.strictEqual(verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY, signature: '', timestamp: String(Date.now()) }), false);
  assert.strictEqual(verifyHubspotSignature({ method: METHOD, uri: URI, rawBody: BODY, signature: 'abc', timestamp: '' }), false);
});
