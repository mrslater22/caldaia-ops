# FastField → BoilerOps onboarding ingest

## Endpoint

`POST /api/fastfield/submissions`

Example local URL: `http://localhost:3000/api/fastfield/submissions`  
FastField needs a **public HTTPS** URL (tunnel or deployed host), not localhost.

## What it does

1. Authenticates (optional shared secret)
2. Stores immutable raw JSON in `integration_events`
3. Maps payload into `boilers` + `devices`
4. Assigns QR public IDs (`blr_…`, `dev_…`)
5. Returns those IDs and QR lookup URLs

## Auth (optional for POC)

Set `FASTFIELD_WEBHOOK_SECRET` in `.env.local`. Then send one of:

- Header `x-boilerops-secret: <secret>`
- Header `x-api-key: <secret>`
- HTTP Basic Auth with that secret as the password

If the env var is empty, requests are accepted (POC only).

## Capture a sample (before mapping)

`POST /api/fastfield/sample`

Example: `https://boilerops.vercel.app/api/fastfield/sample`

Stores raw JSON only (no boiler/device create). View it at **Admin → FastField sample**.

## FastField form setup

1. Form Builder → **Delivery**
2. Drag **HTTP/HTTPS** into **Form Submit Actions**
3. Format: **JSON**
4. URL: `https://YOUR-PUBLIC-HOST/api/fastfield/submissions`
5. Save / publish

## Response shape

```json
{
  "ok": true,
  "duplicate": false,
  "event_id": "…",
  "submission_id": "…",
  "boiler_public_id": "blr_…",
  "device_public_ids": ["dev_…"],
  "urls": {
    "boiler": "https://…/i/boiler/blr_…",
    "devices": ["https://…/i/device/dev_…"]
  }
}
```

## Field mapping

Mapper accepts common aliases (`facility_name`, `boiler_tag`, `devices[]`, etc.).  
Once your real FastField keys are known, we tighten `onboarding-mapper.ts`.

## Manual test

```bash
curl -X POST http://localhost:3000/api/fastfield/submissions ^
  -H "Content-Type: application/json" ^
  -d "{\"submissionId\":\"test-001\",\"facility_name\":\"Demo Hospital\",\"boiler_tag\":\"B-1\",\"devices\":[{\"device_type\":\"PSV\",\"manufacturer\":\"Conbraco\",\"model\":\"10-600\"}]}"
```
