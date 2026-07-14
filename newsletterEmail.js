const { layout } = require('./emailLayout');

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const httpsOnly = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

const DEFAULT_STORY = {
  title: 'Story of the Month',
  teamName: '',
  summary: 'Every month we highlight a team, club, or organization that brought their vision to life with a custom Mayor Clothing print.',
  imageUrl: '',
  ctaLabel: 'See the design',
  ctaUrl: '',
};

function newsletterEmail(story = {}) {
  const merged = { ...DEFAULT_STORY, ...story };

  const safeImg = httpsOnly(merged.imageUrl);
  const image = safeImg
    ? `<img src="${esc(safeImg)}" alt="${esc(merged.teamName || merged.title)}" style="width:100%;border-radius:8px;margin:16px 0;" />`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">${esc(merged.title)}</p>
    <h1 style="margin:0 0 16px 0;font-size:20px;">${esc(merged.teamName || merged.title)}</h1>
    ${image}
    <p style="margin:0;">${esc(merged.summary)}</p>
  `;

  return {
    subject: `${merged.title}${merged.teamName ? `: ${merged.teamName}` : ''}`,
    html: layout({
      preheader: merged.summary,
      bodyHtml,
      ctaLabel: merged.ctaUrl ? merged.ctaLabel : undefined,
      ctaUrl: merged.ctaUrl || undefined,
    }),
  };
}

module.exports = { newsletterEmail };
