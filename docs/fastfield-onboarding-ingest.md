# FastField → BoilerOps onboarding ingest

## Endpoint

`POST /api/fastfield/submissions`

Example local URL: `http://localhost:3000/api/fastfield/submissions`  
FastField needs a **public HTTPS** URL (tunnel or deployed host), not localhost.

## What it does

1. Authenticates the required shared secret
2. Stores immutable raw JSON in `integration_events`
3. Maps payload into `boilers` + `legacy_assets`
4. Assigns QR public IDs (`blr_…`, `dev_…`)
5. Returns those IDs and QR lookup URLs

## Auth (required)

`FASTFIELD_WEBHOOK_SECRET` is required in every environment: local `.env.local`, and each Vercel environment (Preview and Production). Generate a unique random value per environment. An empty or missing secret does not accept requests.

The same check applies to:

- `POST /api/fastfield/submissions`
- `POST /api/fastfield/sample`

FastField must send that exact value on every POST. Do not put the secret in the URL; query parameters are ignored. Use one of:

- Header `x-boilerops-secret: <secret>` (preferred)
- Header `x-api-key: <secret>`
- Header `x-fastfield-secret: <secret>`
- HTTP Basic Auth with that secret as the password (the username is ignored; a colon inside the password is preserved)

The comparison uses `crypto.timingSafeEqual` on equal-length buffers. A missing or wrong secret returns HTTP 401. The response body does not explain which check failed.

In production (`NODE_ENV=production`), a missing or empty secret fails closed. The request is rejected and the server logs that `FASTFIELD_WEBHOOK_SECRET` is not configured. That log does not include the secret or the value FastField sent. `FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV` is ignored in production.

### Local development bypass

Unauthenticated local requests require an explicit opt-in. Set:

```dotenv
FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV=true
```

The flag is honored only when `NODE_ENV` is not `production` and `FASTFIELD_WEBHOOK_SECRET` is unset. If the secret is set, it is always required, including in development. Leave the flag unset unless you intentionally want open local webhooks. Do not set it in Vercel.

## Capture a sample (before mapping)

`POST /api/fastfield/sample`

Example: `https://boilerops.vercel.app/api/fastfield/sample`

Uses the same secret check as submissions. Stores raw JSON only (no boiler/asset create). View it at **Admin → FastField sample**.

## FastField form setup

1. Form Builder → **Delivery**
2. Drag **HTTP/HTTPS** into **Form Submit Actions**
3. Format: **JSON**
4. URL: `https://YOUR-PUBLIC-HOST/api/fastfield/submissions`
5. Authentication: send `FASTFIELD_WEBHOOK_SECRET`
   - Preferred: custom header `x-boilerops-secret`
   - Or HTTP Basic Auth password (username can be any placeholder, for example `fastfield`)
6. Save / publish

Do not append the secret as a query parameter.

## Response shape

```json
{
  "ok": true,
  "duplicate": false,
  "event_id": "…",
  "submission_id": "…",
  "boiler_public_id": "blr_…",
  "asset_public_ids": ["asset_…"],
  "urls": {
    "boiler": "https://…/i/boiler/blr_…",
    "assets": ["https://…/i/asset/asset_…"]
  }
}
```

## Field mapping

Mapper accepts common aliases (`facility_name`, `boiler_tag`, `assets[]`, etc.).
Once your real FastField keys are known, we tighten `onboarding-mapper.ts`.

## Manual test

```bash
curl -X POST http://localhost:3000/api/fastfield/submissions ^
  -H "Content-Type: application/json" ^
  -H "x-boilerops-secret: YOUR_SECRET" ^
  -d "{\"submissionId\":\"test-001\",\"facility_name\":\"Demo Hospital\",\"boiler_tag\":\"B-1\",\"assets\":[{\"asset_category\":\"safety\",\"asset_classification\":\"Steam Safety Valve\",\"manufacturer\":\"Conbraco\",\"model\":\"10-600\"}]}"
```

Replace `YOUR_SECRET` with `FASTFIELD_WEBHOOK_SECRET`. For a local server with no secret configured, set `FASTFIELD_WEBHOOK_ALLOW_INSECURE_DEV=true` instead of sending the header. That flag has no effect in production.
