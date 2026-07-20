const crypto = require('crypto');
const { config } = require('./config');

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// HubSpot v3 signature: HMAC-SHA256(clientSecret, method + uri + body + timestamp),
// base64. The secret is the HMAC key only — it is NOT prepended to the base string.
function verifyHubspotSignature({ method, uri, rawBody, signature, timestamp }) {
  if (!signature || !timestamp) return false;

  const age = Date.now() - Number(timestamp);
  if (!Number.isFinite(age) || age < 0 || age > REPLAY_WINDOW_MS) return false;

  const base = `${method}${uri}${rawBody}${timestamp}`;
  const expected = crypto.createHmac('sha256', config.hubspot.clientSecret).update(base).digest('base64');

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = { verifyHubspotSignature, REPLAY_WINDOW_MS };
