// Social drafting orchestration: for each new file in the Social Inbox Drive
// folder, draft LinkedIn + Instagram captions in Matt's voice, email them to
// him for review, log the draft to the Social Queue sheet, then move the file
// to Posted (that move is the dedup — no separate "seen" tracking needed).
//
// No direct publishing to LinkedIn/Instagram — deliberately out of scope
// (see plan: no approved Meta/LinkedIn app). Matt reviews and posts by hand.

const { config } = require('../config');
const drive = require('./socialDrive');
const drafter = require('./contentDrafter');
const memory = require('../leucrocotta/driveMemory'); // same voice.md brain as email replies
const queue = require('./socialQueueSheet');
const { sendEmail } = require('../resend');
const { buildDraftEmailHtml } = require('./emailTemplate');

async function draftOne(file) {
  const voice = await memory.readVoice();
  const draft = await drafter.draftPost({ voice, fileName: file.name, description: file.description });
  if (!draft.linkedin && !draft.instagram) return { action: 'social_draft', file: file.name, skipped: 'empty draft' };

  await queue.appendDraftRow({ fileName: file.name, linkedin: draft.linkedin, instagram: draft.instagram });

  if (config.social.reviewEmail) {
    await sendEmail({
      to: config.social.reviewEmail,
      subject: `New social draft: ${file.name}`,
      html: buildDraftEmailHtml({
        fileName: file.name,
        fileLink: file.webViewLink,
        description: file.description,
        linkedin: draft.linkedin,
        instagram: draft.instagram,
      }),
    });
  }

  await drive.markProcessed(file.id);
  return { action: 'social_draft', file: file.name, drafted: true };
}

async function runSocialPoll() {
  if (!drive.enabled()) return { skipped: 'social drive not configured', results: [] };
  if (!drafter.enabled()) return { skipped: 'no ANTHROPIC_API_KEY', results: [] };

  const files = await drive.listInboxFiles();
  const results = [];
  for (const file of files) {
    try {
      results.push(await draftOne(file));
    } catch (e) {
      console.error('social draft failed:', e.message);
      results.push({ action: 'error', file: file.name, error: e.message });
    }
  }
  return { skipped: null, results };
}

module.exports = { runSocialPoll };
