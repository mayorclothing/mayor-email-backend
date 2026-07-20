// Shared bearer-key middleware for the internal routes (hermes, newsletter,
// leucrocotta). Constant-time comparison so the key can't be recovered
// byte-by-byte via response timing.
const crypto = require('crypto');
const { config } = require('./config');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireInternalAuth(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!config.internalApiKey || !safeEqual(token, config.internalApiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireInternalAuth };
