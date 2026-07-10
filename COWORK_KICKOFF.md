# Cowork Session Kickoff — Finish the Mayor Agent

Paste this as the opening message of the cowork session. It tells you (the agent) the mission, the current state, and the exact remaining work.

---

## Mission

The Mayor Clothing order-automation system is **built, tested, and deployed**. All that's left is wiring external services (Google, HubSpot, Claude, Resend) so it does real work instead of returning `skipped`. Your job: drive that configuration to done, verify each step, and confirm a full order cycle works end to end.

## Read first

Three repos on the **mayorclothing** GitHub org. Start in `mayor-email-backend`:
- `HANDOFF.md` — full operational handoff for all three repos (same file in each).
- `PROJECT_STATUS.md` — detailed done vs. to-do.
Read both before acting. Don't re-derive what they already cover.

## Current state (don't re-verify unless something looks off)

- `mayor-email-backend` is live: `https://mayor-email-backend.onrender.com` (web + `hermes-poll` hourly + `leucrocotta-poll` every 15 min).
- `/health` → 200. Both polls return `200 skipped` — **by design** until configured (green = healthy, red = real failure).
- Code is complete and tested (`npm test` = 4 suites pass; PDF rendering + all endpoints verified). **You should not need to change code** — if you think you do, stop and flag it.

## The work — ordered, with acceptance criteria

Each item has a **[HUMAN]** part (Marcus, in a console/admin UI) and/or an **[AGENT]** part (you, via MCP connectors or the Render/GitHub CLIs). Do the agent parts; for human parts, produce exact click-by-click instructions and the precise value to paste, then wait.

### 1. Google service account  → unlocks all persistence + the Leucrocotta inbox agent
- **[HUMAN]** Create a service account in Google Cloud, download the JSON key, enable Drive + Sheets + Gmail APIs, and grant **domain-wide delegation** with scope `https://www.googleapis.com/auth/gmail.modify` for `mayor@mayorclothing.com` in the Workspace admin console.
- **[HUMAN]** Set on Render: `GOOGLE_SERVICE_ACCOUNT_JSON` (backend) and `GOOGLE_SERVICE_ACCOUNT` (mayor-invoice) — ⚠️ **different var names, same JSON**. Set `DRIVE_BRAIN_FOLDER_ID` to a Drive folder the service account can write to.
- **Done when**: `POST /leucrocotta/poll` (with the API key) returns results instead of `{"skipped":"gmail not configured"}`, and a Hermes generate persists to Drive (`persisted:true`).

### 2. HubSpot  → unlocks Hermes document generation
- **[HUMAN or AGENT via HubSpot MCP]** Create 4 Deal properties: `zc_trigger_oc` (bool), `zd_trigger_invoice` (bool), `zg_tracking_number` (text), `zf_delivered_date` (date). If you have the HubSpot connector, you may be able to create these directly — do so and confirm.
- **[HUMAN]** Create a HubSpot private app with deal/contact read scopes; set `HUBSPOT_TOKEN`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_ORDER_DEAL_STAGE` on Render.
- **[HUMAN]** Register a `deal.propertyChange` webhook → `https://mayor-email-backend.onrender.com/webhooks/hubspot`.
- **Done when**: `POST /hermes/poll` returns `{"ok":true,"counts":{…}}` instead of `{"skipped":"hubspot not configured"}`, and toggling `zc_trigger_oc` on a test deal produces an Order Confirmation PDF in Drive.

### 3. Claude API  → Leucrocotta drafts replies
- **[HUMAN]** Set `ANTHROPIC_API_KEY` on Render.
- **Done when**: a test customer email in the inbox produces a Gmail **draft** in Mayor's voice after a poll.

### 4. Resend  → outbound mail
- **[HUMAN]** Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `BRAND_LOGO_URL`.
- **Done when**: `POST /newsletter/send` with `{"testEmail":"…"}` delivers.

### 5. Invoice portal (mayor-invoice)
- **[HUMAN]** Set `JWT_SECRET` (required in prod; defaults to a placeholder) and `GOOGLE_SERVICE_ACCOUNT` on the `mayor-invoice` service.
- **Done when**: `/portal/login` authenticates a test user from the MO sheet's `Users` tab.

## Verification you can run yourself

The API key (`INTERNAL_API_KEY`) is set on Render; ask Marcus for it, then:
```
curl -s https://mayor-email-backend.onrender.com/health
curl -s -X POST https://mayor-email-backend.onrender.com/hermes/poll      -H "Authorization: Bearer <KEY>"
curl -s -X POST https://mayor-email-backend.onrender.com/leucrocotta/poll -H "Authorization: Bearer <KEY>"
```
Watch the Render cron logs after each config change — a green run with real counts (not `skipped`) is the signal.

## Guardrails

- **Don't touch code** unless a real bug surfaces; this is a config task. If you find one, fix minimally and run `npm test`.
- **Secrets**: never paste real keys into the repo, commits, or chat logs. They belong only in Render env vars.
- **Push access** is org-gated: `gh auth login` as `mayorclothing` (not `marcusgafford` → 403), then `gh auth setup-git`.
- Work top-down (Google first — it unblocks the most). After each item, run its "Done when" check before moving on. Report what's green and what's still `skipped`.

## First move

Confirm you can reach the repos and read `HANDOFF.md` + `PROJECT_STATUS.md`, then tell Marcus which items you can do via connectors vs. which need him in a console — and start on #1.
