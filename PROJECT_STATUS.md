# Mayor Agent — Project Status

> **⚠️ 2026-07-24 — this doc has drifted; corrections that supersede the text below:**
> - Live MO sheet id is `1FTVqNw9voQ6Bkk1US_nv_PVx50Uc1TWIGyxGUJNknnU` (`MO_SHEET_ID` on Render). The old `152hyxQz…` is the **dead** pre-reorg sheet; services now hard-fail if `MO_SHEET_ID` is unset.
> - **Leucrocotta is Gmail-push-driven**, not a 15-min cron (`/leucrocotta/gmail-webhook/:secret`; a `watch-renew` cron renews the subscription every 6 days). `/leucrocotta/poll` is a manual fallback.
> - Order-doc layout is **58 columns**, unified in **`mo-sheet.js`** (single source of truth, both repos) — the "46-column, duplicated, leave as-is" note is obsolete.
> - **Hermes poll is bounded**: the OC/invoice trigger checkbox is cleared after a successful generate, so the hourly poll no longer re-generates every flagged deal (that was timing the cron out).
> - Status writes are **monotonic** (never regress a paid/shipped order).
> - The inbox agent drafts **one reply per thread** (was one per message → "6 drafts on a 5-cc'd thread") and leaves a Nickel payment for an unknown order **unread** instead of dropping it.
> - Full detail: the `project_mayor_agent.md` agent-memory file.

Order-lifecycle automation for Mayor Clothing. HubSpot is the system of record;
a Google Sheet (the "MO sheet") + Google Drive hold order state and generated
docs; Resend/Gmail send mail; Claude drafts replies. Three repos:

| Repo | What it is | State |
|------|------------|-------|
| `mayor-email-backend` | The agent backend (Express on Render). Webhooks, Hermes doc engine, Leucrocotta inbox agent, newsletter. | **Live and doing real work.** HubSpot + Google config confirmed set on Render (2026-07-21); `hermes-poll` is generating real OC/invoice PDFs every hourly run, `leucrocotta-poll` runs clean every 15 min. |
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

**Retired: automated social drafting poll.** A twice-weekly `/social/poll`
cron drafted LinkedIn/Instagram captions unattended from single photos in a
"Social Inbox" Drive folder. Real use surfaced three problems a batch job
can't solve: (1) multiple photos from one trip need to become *one* combined
post, not one-per-photo; (2) good captions need Matt's own input on the
occasion/context, which means a live conversation, not a fire-and-forget
email; (3) it needs to actually look at photos (recognize a specific trophy,
clubhouse, course), not just read a filename. Replaced by a **Claude Project**
Matt talks to directly — see `social/socials-voice.md` (kept, now the
Project's core knowledge) and `social/claude-project-instructions.md` (the
Project's setup doc). All the poller code (`socialRoute.js`,
`social/socialService.js`, `social/socialDrive.js`, `social/socialQueueSheet.js`,
`social/emailTemplate.js`, `social/contentDrafter.js`) was removed.

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

## ✅ Config — confirmed live (verified via Render API, 2026-07-21)

**1. HubSpot** — `HUBSPOT_TOKEN` + `HUBSPOT_CLIENT_SECRET` set on Render. `hermes-poll` runs are producing real results (e.g. `{"ok":true,"counts":{"generate_oc":2,"generate_invoice":1,...,"errors":0}}` every hourly run) — trigger properties, private app, and webhook are working. `HUBSPOT_ORDER_DEAL_STAGE` was not found in the Render env list; poll is working anyway, so either it's unused in the live code path or has a working default — not investigated further.

**2. Google** — `GOOGLE_SERVICE_ACCOUNT_JSON` and `DRIVE_BRAIN_FOLDER_ID` set. `GMAIL_USER` is not set on Render but doesn't need to be — `gmailClient.js:9` defaults it to `mayor@mayorclothing.com`, and `enabled()` only checks for service-account creds (present). Leucrocotta is actually querying Gmail (`in:inbox is:unread newer_than:2d`) every 15 min; `results: []` in the logs means no matching unread mail at that moment, not that it's disabled.

**3. Claude + Nickel** — `ANTHROPIC_API_KEY` set. `nickelParser.js` tuned against real `support@nickel.com` mail (order ref via `Payment of $X for <ref> from <payer>` phrase + `Order Reference` field backstop), covered by `leucrocotta.test.js`.

**4. Mail sending** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `BRAND_LOGO_URL`, `INTERNAL_API_KEY` all set.

**4b. Social content (Claude Project, not this backend)** — see `social/claude-project-instructions.md`. Note: the retired `social-poll` Render cron job (twice-weekly, hits the now-deleted `/social/poll` route) is still provisioned on Render — should be deleted, it'll just 404 when it fires.

**5. Deploy** — Live on Render (web + `hermes-poll` + `leucrocotta-poll` crons), `/health` verified 200.

**6. Loose ends / known shortcuts**
- No `npm test` script — the `.test.js` files exist but aren't wired to a runner. Add one (`node --test`).
- Idempotency is in-memory (`seenKeys`), resets on restart. The MO-sheet row is the persistent backstop; only upgrade to a Drive snapshot if restarts cause real churn.
- `doc-render.js` is duplicated across `mayor-email-backend` and `mayor-invoice`; the 46-column detail-row layout in `googleStore.js` is also duplicated (both marked `ponytail:`). Consolidate only if a divergence actually bites.
- Contact memory is flat `contact-<email>.md` files in Drive — fine until volume makes it slow.
- Delete the orphaned `social-poll` Render cron (see 4b).
