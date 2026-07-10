// Drafts a customer reply in Mayor's voice using Claude. The one place Leucrocotta
// spends LLM tokens (blueprint §3/§8). Guarded: no ANTHROPIC_API_KEY => enabled()
// false and the caller skips drafting.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-opus-4-8';

function enabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_BASE = `You are Leucrocotta, the inbox assistant for Mayor, a custom clothing company (mayor@mayorclothing.com).
You draft replies to customer emails for Matt to review and send — you never send anything yourself.
Write ONLY the body of the reply email: no subject line, no "Draft:" preamble, no commentary, no sign-off placeholder brackets.
Match Mayor's voice from the style guide below. Be warm, concise, and specific to what the customer asked.
If the email needs information you don't have (pricing, timelines, order status), write a natural reply that acknowledges the ask and says Matt will follow up with specifics — do not invent facts.`;

// { threadText, voice, contactMemory, customerEmail } -> reply body string.
async function draftReply({ threadText = '', voice = '', contactMemory = '', customerEmail = '' }) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env

  const system = [
    SYSTEM_BASE,
    voice ? `\n--- MAYOR VOICE & STYLE ---\n${voice}` : '',
    contactMemory ? `\n--- WHAT WE KNOW ABOUT ${customerEmail} ---\n${contactMemory}` : '',
  ].join('');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    system,
    messages: [{
      role: 'user',
      content: `Draft a reply to the latest message in this email thread:\n\n${threadText}`,
    }],
  });

  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

module.exports = { enabled, draftReply };
