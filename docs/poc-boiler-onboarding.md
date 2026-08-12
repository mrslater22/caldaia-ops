# POC Slice — Boiler Onboarding → QR → Field Test Prefill

## Goal

Prove the loop:

1. FastField **boiler onboarding** form submits to BoilerOps
2. BoilerOps stores boiler + identified devices
3. BoilerOps generates QR codes for **(a) the boiler** and **(b) each device**
4. Field tech scans QR when testing → API returns boiler/device details (+ last test for devices)
5. FastField field-testing form is prefilled to avoid re-entry

## Current status

| Item | Status |
| --- | --- |
| Next.js portal scaffold (`apps/portal`) | Done |
| Super admin login (env credentials + JWT cookie) | Done |
| Supabase schema migration | Ready to run (`supabase/migrations/20260731_poc_schema.sql`) |
| QR JSON APIs `/i/boiler/{id}` + `/i/device/{id}` | Implemented (needs Supabase keys) |
| FastField onboarding webhook | Done — `POST /api/fastfield/submissions` |
| QR generation / printable sheets | Next after ingest |

## Naming

POC tables use **`boilers`** (maps to “plant” in the long-term model). Devices live in **`devices`**. QR public IDs look like `blr_…` / `dev_…`.

## Prefill assumption

FastField is assumed to GET the QR URL and consume a **JSON** body. Contract: [fastfield-prefill-json.md](./fastfield-prefill-json.md). We can flatten or reshape once you confirm their mapper.

## Open setup steps for you

1. Run `supabase/migrations/20260731_fastfield_forms.sql`
2. Get FastField **form ID** + field schema (see [fastfield-form-schema.md](./fastfield-form-schema.md))
3. Register them in Admin → FastField forms
4. Point onboarding form HTTP/HTTPS delivery at public `/api/fastfield/submissions`
5. Manage results in Admin → Submissions
