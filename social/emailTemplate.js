// Pure HTML formatting for the review email sent to Matt for each draft.
// Kept separate from socialService.js so it's a plain, testable function (no
// network) — same split as leucrocotta's emailClassifier/nickelParser.

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// { fileName, fileLink, description, linkedin, instagram } -> html string
function buildDraftEmailHtml({ fileName, fileLink, description, linkedin, instagram }) {
  const noteHtml = description
    ? `<p><em>${esc(description)}</em></p>`
    : '<p><em>No description was attached to this file in Drive — add the club/event specifics before posting.</em></p>';

  return [
    `<h2>New social draft: ${esc(fileName)}</h2>`,
    fileLink ? `<p><a href="${esc(fileLink)}">View photo/graphic</a></p>` : '',
    noteHtml,
    '<h3>LinkedIn</h3>',
    `<pre style="white-space:pre-wrap;font-family:inherit">${esc(linkedin)}</pre>`,
    '<h3>Instagram</h3>',
    `<pre style="white-space:pre-wrap;font-family:inherit">${esc(instagram)}</pre>`,
  ].join('\n');
}

module.exports = { buildDraftEmailHtml };
