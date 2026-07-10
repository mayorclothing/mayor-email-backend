# Mayor Agent — Handoff

For whoever picks this up next. Pairs with `PROJECT_STATUS.md` (detailed done/to-do list). This doc is the operational "how it runs and how to finish it."

## What it is

Order-lifecycle automation for Mayor Clothing. HubSpot is the system of record; a Google Sheet ("MO sheet") + Google Drive hold order state and generated docs; Resend/Gmail send mail; Claude drafts replies.

Three repos, all on the **mayorclothing** GitHub org:

| Repo | Role |
|------|------|
| `mayor-email-backend` | The agent. Express service on Render. **This is the live one.** |
| `mayor-invoice` | Standalone invoice-PDF server + customer portal. |
| `mayor-tools` | Single-file browser invoice builder (`index.html`). |

Inside the backend are two sub-agents:
- **Hermes** — a HubSpot deal-property change (or the hourly poll) generates an Order Confirmation / Invoice PDF, persists it to Drive + the MO sheet, and advances order status (Pending → In Transit → Delivered).
- **Leucrocotta** — every 15 min reads unread Gmail, classifies each message, and either flips an order to **Pending** when Nickel reports payment, or drafts a reply in Mayor's voice for Matt to review (accruing per-contact memory in Drive).

## Current state (verified working)

- **Deployed & live**: `https://mayor-email-backend.onrender.com` — web service + `hermes-poll` (hourly) + `leucrocotta-poll` (every 15 min) crons.
- `/health` → `200 {"status":"ok"}`. Both crons authenticate and return `200 skipped` because external services aren't configured yet — **this is by design** (green = healthy, red = real failure).
- All code is tested: `npm test` (4 suites pass), all 26 files syntax-clean, endpoints exercised end-to-end, PDF rendering produces valid PDFs.
- **The only thing standing between "skipped" and "doing real work" is external configuration** — no code is missing.

## Run it locally

```
npm install
cp .env.example .env      # fill in what you have
npm run dev               # node --watch index.js
npm test                  # node --test
```

With no env vars it still boots; polls just report `skipped`. Quick smoke test:

```
INTERNAL_API_KEY=testkey PORT=4123 node index.js &
curl -s localhost:4123/health
curl -s -X POST localhost:4123/hermes/poll -H "Authorization: Bearer testkey"
curl -s -X POST localhost:4123/leucrocotta/poll -H "Authorization: Bearer testkey"
```

## Deploy / repo access

- Blueprint is `render.yaml` (web + 2 crons). To ship changes: push to `main`, then Render auto-deploys the web service; sync the blueprint if you changed cron config.
- **Push access**: the repos live under the `mayorclothing` org. Auth as that account: `gh auth login` (device flow), then `gh auth setup-git`. `gh` is installed at `C:\Program Files\GitHub CLI\gh.exe`. `marcusgafford` alone gets a 403.
- `INTERNAL_API_KEY` is a made-up shared secret. It must be set **identically** on all three Render services (web + both crons). `sync:false` means Render does NOT auto-fill the crons — enter each by hand. If it's blank on the web service, the auth check rejects everything (401).

## What's left — configuration only (in priority order)

Everything below is dashboard/console work, not code. Full detail in `PROJECT_STATUS.md`.

1. **Google service account** — set `GOOGLE_SERVICE_ACCOUNT_JSON`, grant Gmail **domain-wide delegation** (`gmail.modify`) for `mayor@mayorclothing.com`, set `DRIVE_BRAIN_FOLDER_ID`. Unlocks all persistence + the entire Leucrocotta inbox agent. (`MO_SHEET_ID` already defaulted.)
2. **HubSpot** — create the 4 trigger properties on Deals (`zc_trigger_oc`, `zd_trigger_invoice`, `zg_tracking_number`, `zf_delivered_date`), create a private app, set `HUBSPOT_TOKEN` / `HUBSPOT_CLIENT_SECRET` / `HUBSPOT_ORDER_DEAL_STAGE`, and register a `deal.propertyChange` webhook → `/webhooks/hubspot`. Until the properties exist, triggers + poll silently no-op.
3. **Claude** — set `ANTHROPIC_API_KEY` so Leucrocotta drafts replies (without it, it classifies but won't draft).
4. **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `BRAND_LOGO_URL`.

As each is added the corresponding poll stops saying `skipped` and starts acting.

## Gotchas found while building (save yourself the debugging)

- **Nickel emails** come from `support@nickel.com` (NOT `notify@`) and are **HTML-only**; `gmailClient` strips tags and collapses whitespace to one line, so the parser sees a single line — never anchor regexes on newlines. Order ref lives in the phrase `Payment of $X for <ref> from <payer>` (subject + body) and a labeled `Order Reference` field. Some Nickel subjects have an **empty** ref (`for  from …`) — those can't be tied to an order and correctly no-op. `NICKEL_SENDER` defaults to `support@nickel.com`.
- **Cron `fromService` host wiring failed** (curl exit 7 — couldn't connect). The cron `startCommand`s now hardcode the public URL instead. If you re-introduce `fromService`, verify `$POLL_HOST` resolves to a bare hostname with no scheme.
- **curl exit codes** from cron logs: `7` = can't connect (wrong/empty host), `22` = HTTP 4xx/5xx (`-f`), most often `401` (key mismatch) or `500` (missing config on `/hermes/generate`).
- **Idempotency** (Hermes) is in-memory and resets on restart; the persistent backstop is the MO-sheet row, which the poll gates on. Fine unless restarts cause churn.
- `doc-render.js` is duplicated between `mayor-email-backend` and `mayor-invoice`; the MO-sheet detail-row layout is duplicated inside `googleStore.js`. Left as-is (marked `ponytail:`) — consolidate only if they diverge.

## Key files

- `index.js` — app wiring / route mounts
- `hermesService.js` — doc generation, status transitions, webhook classification, poll
- `hermesMapping.js` — HubSpot deal → render payload
- `doc-render.js` — PDF rendering (pdfkit)
- `googleStore.js` — Drive + MO-sheet persistence
- `leucrocotta/` — inbox agent (`gmailClient`, `emailClassifier`, `nickelParser`, `voiceDrafter`, `driveMemory`, `leucrocottaService`)
- `render.yaml` — Render blueprint
- `.env.example` — every env var with notes
