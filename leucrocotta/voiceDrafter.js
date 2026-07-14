// Drafts a customer reply in Mayor's voice using Claude. The one place Leucrocotta
// spends LLM tokens (blueprint §3/§8). Guarded: no ANTHROPIC_API_KEY => enabled()
// false and the caller skips drafting.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';

function enabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_BASE = `You are Matt Bartini, founder and CEO of Mayor, a custom-print clothing company. You email customers from mayor@mayorclothing.com.
You are drafting a reply to a customer email in your OWN voice. This draft will be sent as you, so write entirely in the FIRST PERSON. You ARE Matt — never refer to "Matt" in the third person, and never write "Matt will follow up." If you don't yet have a detail, say something like "I'll get you those specifics shortly" — first person, always.
Write ONLY the body of the reply email: no subject line, no "Draft:" preamble, no commentary, no sign-off placeholder brackets.
Be warm, concise, and specific to what the customer asked. Use the facts, voice, and contact history below.
When it would help you write a more specific, informed reply — for example to reference the customer's club, company, or event — you may use web search to learn about them. Keep it to a few focused searches and only use what is genuinely relevant.
Do not invent facts. If something is not in the facts below, in the thread, or from your research, do not make it up — offer to get it to them.`;

// { threadText, voice, contactMemory, customerEmail } -> reply body string.
async function draftReply({ threadText = '', voice = '', knowledge = '', contactMemory = '', customerEmail = '' }) {
  const client = new Anthropic(); // resolves ANTHROPIC_API_KEY from env

  const system = [
    SYSTEM_BASE,
    knowledge ? `\n--- MAYOR FACTS & POLICIES (use these to answer directly) ---\n${knowledge}` : '',
    voice ? `\n--- MAYOR VOICE & STYLE ---\n${voice}` : '',
    contactMemory ? `\n--- WHAT WE KNOW ABOUT ${customerEmail} ---\n${contactMemory}` : '',
  ].join('');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
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


// Compare the assistant's draft against the reply Matt actually sent, and return
// compact lessons to fold into the brain. No web tool; small + cheap.
async function learnFromReply({ threadText = '', draftBody = '', sentBody = '' }) {
  const client = new Anthropic();
  const system = `You tune an AI email-drafting assistant that writes replies for Matt (founder of Mayor). You are given the assistant's DRAFT and the reply Matt ACTUALLY SENT. Infer what Matt changed and why, so future drafts match him better.
Return ONLY compact JSON: {"voiceLesson":"<one concise, generalizable style/voice lesson, or empty string>","contactLesson":"<one concise durable fact about this customer worth remembering, or empty string>"}.
If the draft and sent reply are essentially the same, return empty strings for both. No text outside the JSON.`;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [{ role: 'user', content: `THREAD:\n${threadText}\n\n--- ASSISTANT DRAFT ---\n${draftBody}\n\n--- WHAT MATT SENT ---\n${sentBody}` }],
  });
  const txt = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  try {
    const j = JSON.parse(txt.replace(/^```json\s*/i, '').replace(/```$/, '').trim());
    return { voiceLesson: String(j.voiceLesson || '').trim(), contactLesson: String(j.contactLesson || '').trim() };
  } catch { return { voiceLesson: '', contactLesson: '' }; }
}

module.exports = { enabled, draftReply, learnFromReply };
