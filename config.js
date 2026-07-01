require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  hubspot: {
    token: process.env.HUBSPOT_TOKEN || '',
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    orderDealStage: process.env.HUBSPOT_ORDER_DEAL_STAGE || '',
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || '',
    replyTo: process.env.RESEND_REPLY_TO || '',
  },
  brand: {
    accentColor: process.env.BRAND_ACCENT_COLOR || '#1a1a1a',
    name: process.env.BRAND_NAME || 'Mayor Clothing',
    logoUrl: process.env.BRAND_LOGO_URL || '',
  },
};

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function assertConfigured(keys) {
  const missing = keys.filter((key) => {
    const value = getByPath(config, key);
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    const error = new Error(`Missing required configuration: ${missing.join(', ')}`);
    error.status = 500;
    throw error;
  }
}

module.exports = { config, assertConfigured };
