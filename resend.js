const { Resend } = require('resend');
const { config } = require('./config');

let client;

function getClient() {
  if (!client) client = new Resend(config.resend.apiKey);
  return client;
}

async function sendEmail({ to, subject, html }) {
  return getClient().emails.send({
    from: config.resend.fromEmail,
    reply_to: config.resend.replyTo,
    to,
    subject,
    html,
  });
}

module.exports = { sendEmail };
