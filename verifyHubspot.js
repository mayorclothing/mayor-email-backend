const crypto = require('crypto');

function verifyHubspotSignature({ method, uri, rawBody, signature, timestamp }) {
  // Check if signature and timestamp are provided
  if (!signature || !timestamp) {
    return false;
  }

  // Validate timestamp is not stale (e.g., within 5 minutes)
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

  if (isNaN(requestTime) || now - requestTime > maxAge) {
    return false;
  }

  // Compute expected signature
  const secret = process.env.HUBSPOT_CLIENT_SECRET;
  const message = `${method}${uri}${rawBody}${timestamp}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('base64');

  // Compare signatures using constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

module.exports = { verifyHubspotSignature };
