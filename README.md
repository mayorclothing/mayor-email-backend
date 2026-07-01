# Mayor Email Backend

Node.js/Express service for Mayor Clothing. HubSpot is the system of record; Resend sends the mail.

1. A HubSpot webhook fires when a Deal reaches the "order placed" stage, triggering an automated follow-up email to the customer.
2. An internal, bearer-authenticated endpoint sends a "Story of the Month" newsletter to a HubSpot list on demand.

All files are flat in the repo root (no subfolders) so the project can be uploaded via GitHub's web uploader.

## Setup

```
npm install
cp .env.example .env
npm run dev
```

## Endpoints

- `GET /health` — health check
- `POST /webhooks/hubspot` — HubSpot webhook target (verifies `X-HubSpot-Signature-v3`)
- `POST /newsletter/send` — bearer-authenticated (`INTERNAL_API_KEY`). Body `{ "testEmail": "you@example.com" }` sends a test copy, or `{ "listId": "123", "story": { ... } }` sends to a full HubSpot list.

## Previews

`node render-previews.mjs` writes rendered HTML previews of both email templates into `previews/`.

## Deploy

Configured for Render via `render.yaml`. Set the required env vars (see `.env.example`) in the Render dashboard.
