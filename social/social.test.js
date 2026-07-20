// Runnable checks for the social agent's deterministic seams. `node social/social.test.js`.
const assert = require('assert');
const { buildDraftEmailHtml } = require('./emailTemplate');
const { buildQueueRow } = require('./socialQueueSheet');

// --- buildDraftEmailHtml ---

let html = buildDraftEmailHtml({
  fileName: 'north-fork-delivery.jpg',
  fileLink: 'https://drive.google.com/file/d/abc/view',
  description: 'North Fork CC, red/white/blue America 250 print',
  linkedin: 'Loved designing this one. #GolfTournaments',
  instagram: 'New drop. #GolfTournaments',
});
assert.ok(html.includes('north-fork-delivery.jpg'));
assert.ok(html.includes('North Fork CC, red/white/blue America 250 print'));
assert.ok(html.includes('Loved designing this one. #GolfTournaments'));
assert.ok(!html.includes('No description was attached'));

// No description => flags it instead of inventing one.
html = buildDraftEmailHtml({ fileName: 'photo.jpg', linkedin: 'x', instagram: 'y' });
assert.ok(html.includes('No description was attached'));

// HTML-escapes untrusted content (Drive file names/descriptions are user input).
html = buildDraftEmailHtml({ fileName: '<script>alert(1)</script>', linkedin: 'x', instagram: 'y' });
assert.ok(!html.includes('<script>alert(1)</script>'));
assert.ok(html.includes('&lt;script&gt;'));

// --- buildQueueRow ---

const row = buildQueueRow({ fileName: 'photo.jpg', linkedin: 'LI text', instagram: 'IG text' });
assert.strictEqual(row.length, 5);
assert.strictEqual(row[1], 'photo.jpg');
assert.strictEqual(row[2], 'LI text');
assert.strictEqual(row[3], 'IG text');
assert.strictEqual(row[4], 'Drafted');
assert.match(row[0], /^\d{4}-\d{2}-\d{2}$/);

// Formula-injection guard: a caption starting with = would be evaluated by
// Sheets under USER_ENTERED — must be prefixed with a text marker.
const guarded = buildQueueRow({ fileName: 'x.jpg', linkedin: '=HYPERLINK("evil")', instagram: 'fine' });
assert.strictEqual(guarded[2], "'=HYPERLINK(\"evil\")");
assert.strictEqual(guarded[3], 'fine');

console.log('social.test.js: all assertions passed');
