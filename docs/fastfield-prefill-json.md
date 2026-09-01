# FastField Prefill JSON Contract (POC assumption)

QR codes encode these URLs (FastField / scanner GETs them and expects JSON):

- Boiler: `{APP_URL}/i/boiler/{public_id}`
- Asset: `{APP_URL}/i/asset/{public_id}`

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
  "assets": [
    {
      "public_id": "asset_…",
      "asset_code": "SV1",
      "asset_category": "safety",
      "asset_classification": "Steam Safety Valve",
      "asset_nomenclature": "SVB",
      "asset_name": "Boiler Steam Safety Valve",
      "manufacturer": null,
      "model": null,
      "serial_number": null,
      "location_description": null,
      "service_status": "active"
    }
  ]
}
```

## Asset response

```json
{
  "ok": true,
  "resource": "asset",
  "public_id": "asset_…",
  "asset": { "…asset fields…" },
  "inspection_target": null,
  "boiler": { "…parent boiler fields…" },
  "last_observation": {
    "observed_at": "2026-07-01T12:00:00Z",
    "technician_name": null,
    "result": null,
    "notes": null,
    "readings": {}
  }
}
```

`last_observation` is `null` when no prior observation exists.

## Error shape

```json
{ "ok": false, "error": "Asset not found." }
```

## Setup checklist

1. Paste Supabase URL + anon + service role keys into `apps/boilerops/.env.local`
2. Run `supabase/migrations/20260731_poc_schema.sql` in the Supabase SQL Editor
3. Restart `npm run dev`
4. Confirm FastField maps this JSON into form fields (adjust field names if their mapper needs a flatter shape)
