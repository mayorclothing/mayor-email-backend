const { config } = require('./config');

function layout({ preheader = '', bodyHtml = '', ctaLabel, ctaUrl }) {
  const logo = config.brand.logoUrl
    ? `<img src="${config.brand.logoUrl}" alt="${config.brand.name}" style="height:32px;margin-bottom:24px;" />`
    : `<div style="font-size:18px;font-weight:700;margin-bottom:24px;">${config.brand.name}</div>`;

  const cta = ctaLabel && ctaUrl
    ? `<tr><td style="padding-top:28px;">
        <a href="${ctaUrl}" style="background:${config.brand.accentColor};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;display:inline-block;">${ctaLabel}</a>
      </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${config.brand.name}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                ${logo}
                <div style="font-size:15px;line-height:1.6;color:#1a1a1a;">
                  ${bodyHtml}
                </div>
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:24px 32px 32px 32px;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { layout };
