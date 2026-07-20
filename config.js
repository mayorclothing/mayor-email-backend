require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  // Public URL of this service, used to build the exact URI HubSpot signed.
  // Never derive it from the Host header — that's attacker-influenced.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://mayor-email-backend.onrender.com',
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
  social: {
    inboxFolderId: process.env.SOCIAL_INBOX_FOLDER_ID || '',
    postedFolderId: process.env.SOCIAL_POSTED_FOLDER_ID || '',
    queueSheetId: process.env.SOCIAL_QUEUE_SHEET_ID || '',
    reviewEmail: process.env.SOCIAL_REVIEW_EMAIL || '',
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
