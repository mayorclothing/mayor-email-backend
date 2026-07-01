import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { orderFollowUpEmail } = require('./orderFollowUpEmail.js');
const { newsletterEmail } = require('./newsletterEmail.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'previews');

fs.mkdirSync(outDir, { recursive: true });

const previews = {
  'order-follow-up.html': orderFollowUpEmail({ firstName: 'Jordan', dealName: 'Lakeside FC Spring Order' }).html,
  'newsletter.html': newsletterEmail({
    teamName: 'Lakeside FC',
    summary: 'Lakeside FC brought their club colors to life with a custom print polo their whole team wears with pride.',
    ctaUrl: 'https://example.com',
  }).html,
};

for (const [filename, html] of Object.entries(previews)) {
  fs.writeFileSync(path.join(outDir, filename), html, 'utf8');
  console.log(`Wrote ${path.join('previews', filename)}`);
}
