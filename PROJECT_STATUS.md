# Mayor Agent — Project Status

Order-lifecycle automation for Mayor Clothing. HubSpot is the system of record;
a Google Sheet (the "MO sheet") + Google Drive hold order state and generated
docs; Resend/Gmail send mail; Claude drafts replies. Three repos:

| Repo | What it is | State |
|------|------------|-------|
| `mayor-email-backend` | The agent backend (Express on Render). Webhooks, Hermes doc engine, Leucrocotta inbox agent, newsletter. | **Core code complete, not yet deployed / configured** |
| `mayor-invoice` | Standalone server that renders invoice PDFs from a JSON/HubSpot payload + a customer order portal. | Working, deployable |
| `mayor-tools` | Single-file browser tool (`index.html`) for building invoices by hand. | Working |

---

## Two agents inside the backend

- **Hermes** — document + status engine. A HubSpot deal-property change (or the
  hourly poll) triggers: generate Order Confirmation / Invoice PDF → persist to
  Drive + MO sheet → advance order status (Pending → In Transit → Delivered).
- **Leucrocotta** — inbox agent. Every 15 min it reads unread Gmail, classifies
  each message, and either (a) flips an order to **Pending** when Nickel reports
  payment, or (b) drafts a reply in Mayor's voice for Matt to review, accruing
  per-contact memory in Drive.

---

## ✅ Done (code exists and is wired)

**Email backend plumbing**
- Express app with `/health`, JSON body capture for signature verification, 404 + error handlers (`index.js`)
- HubSpot webhook route → Resend order follow-up email (`webhookRoute.js`, `orderFollowUpEmail.js`)
- "Story of the Month" newsletter endpoint, bearer-authed (`newsletterRoute.js`, `newsletterEmail.js`)
- Shared email layout + rendered HTML previews (`emailLayout.js`, `render-previews.mjs`, `previews/`)

**Hermes**
- `generateDocument` for `order_confirmation` + `invoice`, with the "invoice needs a payment link first" guard and in-process idempotency (`hermesService.js`)
- HubSpot deal → render payload mapping (`hermesMapping.js`)
- PDF rendering (`doc-render.js`)
- Drive + MO-sheet persistence and status transitions (`googleStore.js`)
- Webhook trigger classification (`classifyTriggerEvent`) + central `runAction` dispatch
- Hourly safety-net poll (`runPoll`) exposed at `/hermes/poll`, wired as a Render cron in `render.yaml`

**Leucrocotta**
- Gmail client (list unread, get message/thread, draft, mark read) (`gmailClient.js`)
- Email classifier: nickel-paid vs customer vs ignore (`emailClassifier.js`)
- Deterministic Nickel "paid" parser (`nickelParser.js`)
- Claude voice-drafter (`voiceDrafter.js`) + Drive-backed voice/contact memory (`driveMemory.js`)
- Orchestration: paid → `markPaid`, customer → draft + accrue memory (`leucrocottaService.js`)
- 15-min Render cron at `/leucrocotta/poll` in `render.yaml`

**Tests** (files exist): `googleStore.test.js`, `hermesMapping.test.js`, `hermesService.test.js`, `leucrocotta/leucrocotta.test.js`

**Other repos**: `mayor-invoice` (PDF `/generate` + portal, Render-ready) and `mayor-tools` (browser invoice builder) both functional.

---

## ⬜ To do (before this runs in production)

**1. HubSpot configuration (blocks the whole trigger path)**
- Manually create the four trigger properties on Deals — until they exist, webhooks and the poll silently no-op:
  - `zc_trigger_oc` (bool) — fire Order Confirmation
  - `zd_trigger_invoice` (bool) — fire Invoice
  - `zg_tracking_number` (text) — → In Transit
  - `zf_delivered_date` (date) — → Delivered
- Create the private app, grab `HUBSPOT_TOKEN` + `HUBSPOT_CLIENT_SECRET`, set `HUBSPOT_ORDER_DEAL_STAGE`
- Register the webhook subscription (`deal.propertyChange`) pointing at `/webhooks/hubspot`

**2. Google access (blocks all persistence + memory)**
- Create a service account, set `GOOGLE_SERVICE_ACCOUNT_JSON`. Without it Hermes still renders but reports `persisted:false` and nothing lands in Drive/the sheet.
- Grant **domain-wide delegation** (`gmail.modify`) for `GMAIL_USER` — Leucrocotta can't read/draft mail otherwise
- Set `DRIVE_BRAIN_FOLDER_ID` (Drive folder for docs + memory). `MO_SHEET_ID` is already defaulted.

**3. Claude + Nickel**
- Set `ANTHROPIC_API_KEY` — without it Leucrocotta classifies but won't draft replies
- Set `NICKEL_SENDER` — the classifier can't identify Nickel payment mail without it
- **Tune `nickelParser.js` regexes against a real Nickel "paid" email.** Currently best-effort (marked `ponytail:` in the file); order numbers are free-text so the labeled-reference extraction needs one real sample to trust.

**4. Mail sending**
- Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `BRAND_LOGO_URL`, `INTERNAL_API_KEY`

**5. Deploy**
- Push repo, create the Render web service + two crons from `render.yaml`, fill all `sync:false` env vars in the dashboard
- Smoke-test each endpoint end to end (`/hermes/generate`, `/hermes/poll`, `/leucrocotta/poll`, `/newsletter/send`, webhook)

**6. Loose ends / known shortcuts**
- No `npm test` script — the `.test.js` files exist but aren't wired to a runner. Add one (`node --test`).
- Idempotency is in-memory (`seenKeys`), resets on restart. The MO-sheet row is the persistent backstop; only upgrade to a Drive snapshot if restarts cause real churn.
- `doc-render.js` is duplicated across `mayor-email-backend` and `mayor-invoice`; the 46-column detail-row layout in `googleStore.js` is also duplicated (both marked `ponytail:`). Consolidate only if a divergence actually bites.
- Contact memory is flat `contact-<email>.md` files in Drive — fine until volume makes it slow.

---

## First-run order

1. HubSpot properties + private app + webhook → 2. Google service account + delegation + folder → 3. Env vars in Render → 4. Deploy → 5. Feed a real Nickel email into `nickelParser` and tune → 6. Watch the two cron logs for a full order cycle.
