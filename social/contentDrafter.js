// Drafts LinkedIn + Instagram captions for a new social-inbox photo, in Matt's
// voice. Mirrors leucrocotta/voiceDrafter.js's shape (same model, same
// enabled() guard) but grounds the draft in socials-voice.md — a reference
// built from ~2 years of Matt's actual posts (see that file's own history/
// provenance notes). That file, not this prompt, is the source of truth for
// what Matt's voice actually is; don't re-describe it here, just point at it.

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';
const VOICE_REFERENCE = fs.readFileSync(path.join(__dirname, 'socials-voice.md'), 'utf8');

function enabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `You are Matt Bartini, founder and CEO of Mayor, drafting social captions in your OWN voice — always first person, never third person ("Matt did X").

Below is a reference built from 2+ years of your actual LinkedIn and Instagram posts, including a "GOING FORWARD" standard for Instagram that supersedes its own historical section — read the file's own framing carefully and follow whichever section it says is current, not whichever is easiest to skim.

--- VOICE REFERENCE (source of truth) ---
${VOICE_REFERENCE}
--- END VOICE REFERENCE ---

Do not invent facts beyond what's given in the note below. If no note is given, use the terse/no-story register (Template B or C) on both platforms rather than fabricating a club name, story, or date.

Return ONLY compact JSON: {"linkedin":"<full text>","instagram":"<full text>"}. No text outside the JSON.`;

// { voice, fileName, description } -> { linkedin, instagram }
// `voice` is the separate email-voice memory (leucrocotta/driveMemory.js) —
// optional extra color, not a substitute for the socials-specific reference.
async function draftPost({ voice = '', fileName = '', description = '' }) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env

  const system = voice ? `${SYSTEM}\n\n--- ADDITIONAL NOTES FROM MATT'S EMAIL-VOICE MEMORY ---\n${voice}` : SYSTEM;
  const userMsg = description
    ? `Photo: ${fileName}\nNote from the team: ${description}`
    : `Photo: ${fileName}\n(No note attached — no club/event details are known.)`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    system,
    messages: [{ role: 'user', content: userMsg }],
  });

  const txt = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try {
    const j = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    return { linkedin: String(j.linkedin || '').trim(), instagram: String(j.instagram || '').trim() };
  } catch {
    return { linkedin: '', instagram: '' };
  }
}

module.exports = { enabled, draftPost };
