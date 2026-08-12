# FastField Prefill JSON Contract (POC assumption)

QR codes encode these URLs (FastField / scanner GETs them and expects JSON):

- Boiler: `{APP_URL}/i/boiler/{public_id}`
- Device: `{APP_URL}/i/device/{public_id}`

## Boiler response

```json
{
  "ok": true,
  "resource": "boiler",
  "public_id": "blr_…",
  "boiler": {
    "public_id": "blr_…",
    "facility_name": "…",
    "site_code": null,
    "boiler_tag": null,
    "manufacturer": null,
    "model": null,
    "serial_number": null,
    "address": null,
    "city": null,
    "state": null,
    "zip": null,
    "contact_name": null,
    "contact_email": null,
    "contact_phone": null,
    "notes": null,
    "onboarded_at": null
  },
  "devices": [
    {
      "public_id": "dev_…",
      "device_type": "PSV",
      "manufacturer": null,
      "model": null,
      "serial_number": null,
      "location_description": null,
      "service_status": "active"
    }
  ]
}
```

## Device response

```json
{
  "ok": true,
  "resource": "device",
  "public_id": "dev_…",
  "device": { "…device fields…" },
  "boiler": { "…parent boiler fields…" },
  "last_test": {
    "tested_at": "2026-07-01T12:00:00Z",
    "technician_name": null,
    "result": null,
    "notes": null,
    "readings": {}
  }
}
```

`last_test` is `null` when no prior test exists.

## Error shape

```json
{ "ok": false, "error": "Device not found." }
```

## Setup checklist

1. Paste Supabase URL + anon + service role keys into `apps/boilerops/.env.local`
2. Run `supabase/migrations/20260731_poc_schema.sql` in the Supabase SQL Editor
3. Restart `npm run dev`
4. Confirm FastField maps this JSON into form fields (adjust field names if their mapper needs a flatter shape)
