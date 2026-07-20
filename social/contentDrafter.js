// Drafts LinkedIn + Instagram captions for a new social-inbox photo, in Matt's
// established voice. Mirrors leucrocotta/voiceDrafter.js's shape (same model,
// same enabled() guard, same "write as Matt in first person" framing) but for
// social captions instead of email replies.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-4-8';

// Matt's own recurring LinkedIn format (observed across his posts): a one-line
// hook, the story/club-specific detail, a CTA, then this fixed hashtag core
// plus 1-2 location/event tags. Keep both platforms on this same backbone so
// LinkedIn and Instagram read as one consistent voice.
const CORE_HASHTAGS = '#GolfTournaments #PrivateClubs #CustomGolfApparel #GolfEvents #GolfProShop';

function enabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `You are Matt Bartini, founder and CEO of Mayor, a custom-print golf-apparel company. You are drafting social captions in your OWN voice — first person always, never third person ("Matt did X").

Matt's proven LinkedIn format, which these drafts must follow:
1. One-line hook naming the club/group and what was made.
2. The story: a specific design detail (colors, icons, milestone, course feature) and who it was made with/for.
3. A CTA inviting the reader to message him for their own custom print.
4. Hashtags: always include "${CORE_HASHTAGS}", plus 1-3 more specific to the location/event if known.

Do not invent facts. Use only what's in the note provided. If no note was given, keep the caption short and general (e.g. celebrate the piece itself) and do NOT fabricate a club name, story, or date — leave it clearly generic so Matt can add specifics before posting.

Write two versions:
- "linkedin": Matt's full format above, 3-6 sentences plus hashtags — matches his existing LinkedIn posts.
- "instagram": a tighter version of the same story (1-3 sentences), same hashtags, IG-appropriate brevity.

Return ONLY compact JSON: {"linkedin":"<full text with hashtags>","instagram":"<full text with hashtags>"}. No text outside the JSON.`;

// { voice, fileName, description } -> { linkedin, instagram }
async function draftPost({ voice = '', fileName = '', description = '' }) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env

  const system = voice ? `${SYSTEM}\n\n--- MAYOR VOICE & STYLE NOTES ---\n${voice}` : SYSTEM;
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

module.exports = { enabled, draftPost, CORE_HASHTAGS };
