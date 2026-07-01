const { layout } = require('./emailLayout');

function orderFollowUpEmail({ firstName, dealName }) {
  const name = firstName || 'there';

  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hey ${name},</p>
    <p style="margin:0 0 16px 0;">Thanks so much for placing your order${dealName ? ` for <strong>${dealName}</strong>` : ''}! I'm genuinely excited to get this made for you.</p>
    <p style="margin:0 0 16px 0;">I'll be hands-on with your order from here through delivery, so if anything comes up along the way, you're talking directly to me.</p>
    <p style="margin:0;">Message me and I'll create a custom print your members will love wearing all year long!</p>
  `;

  return {
    subject: 'Your Mayor Clothing order is in the works',
    html: layout({
      preheader: 'Thanks for your order — here is what happens next.',
      bodyHtml,
    }),
  };
}

module.exports = { orderFollowUpEmail };
