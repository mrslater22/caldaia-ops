# High Pressure device form — end-to-end test

Use this on 23 Nov 2026. It covers the live test, the checklist, and the
Low Pressure plan. Low Pressure is not implemented.

BoilerOps branch: `cursor/hp-device-visit-ingest-6bfe`, based on `main`
after PR #8 (merge `a4651c0`). Do not merge this yourself until the
migration below is approved.

## What the test proves

1. The tech opens the High Pressure form, not one combined form.
2. Scanning the site QR (or an equivalent lookup) fills the site fields.
3. The submission includes a site visit ID and the boiler or plant asset ID.
4. BoilerOps creates one visit for that site visit ID, links the site, and
   attaches the device test.
5. A second device with the same site visit ID joins the same visit and the
   same site report. A repeated webhook does not create a second visit or test.
6. The FastField site info table can store that visit ID, when the DataTables
   v3 sync is configured. The visit is still created in BoilerOps if that
   sync is off.

The site report row is the list of device tests for the visit. It is not a
PDF, and it is not an `inspection_job` / `report_packages` record.

## How this fits PR #8 and the legacy projector

Two different writers touch FastField site data. This change uses one and
leaves the other alone.

| Path | Code | When it runs | Visit ID |
| --- | --- | --- | --- |
| DataTables v3 upsert | `site-info-sync.ts` (PR #8, already on main and in production) | After `POST /api/fastfield/submissions` stores a new submission | Yes, if the field map includes the new column and the sync is enabled |
| Legacy projector | `site-table-sync.ts` `syncSiteToFastField` | Admin → Sites create, update, and Sync, and site-onboarding ingest | No. A visit does not exist when an admin creates a site. This payload is still `bo_siteid`, `va_loc`, and the other configured columns posted to `fastfield_data_tables.sync_url` |

High Pressure reuses the PR #8 upsert. After the visit is saved, ingest
copies `site_visit_id` onto the top-level JSON and calls the existing
`syncSiteInfoFromSubmission`. This branch does not change the DataTables
client. The client on this branch still sends `Ocp-Apim-Subscription-Key`,
which the gateway ignores. A separate auth-fix PR replaces that with
`FastField-API-Key`, `POST /services/v3/authenticate` (HTTP Basic
email:password), and the returned `sessionToken` as
`X-Gatekeeper-SessionToken`. The FastField site table write for this test
depends on that auth-fix PR being merged first. The visit in BoilerOps does
not.

The live field map in `site-info-sync-config.ts` is still empty, so the
sync stays a no-op until the flag, key column, and field map are set on a
deployment that includes the auth fix.

Do not replace the legacy projector today. Admin → Sites must keep working
for site create and QR generation. Do not expect that screen to write the
visit ID column.

## Prerequisites

1. Apply `supabase/migrations/20261123_site_visits.sql` to the database this
   deployment uses. See the checklist. The app returns a database error on
   the High Pressure path until that table exists. Other forms do not query
   the new tables.
2. Deploy this branch (Vercel preview is enough for the afternoon). Point
   the FastField webhook at that deployment.
3. A site already exists in BoilerOps. Note its public id (`site_...`) and
   site code. The QR URL is `{NEXT_PUBLIC_APP_URL}/i/site/{public_id}`.
4. `FASTFIELD_WEBHOOK_SECRET` is already set. FastField must send it.
5. Decide the shared site visit ID for the test before the first device,
   for example `VISIT-2026-11-23-CAP`. Put that same value on every device.
   A blank visit ID mints a `visit_...` id, but the next device only joins
   that visit if the form reads the value back from the site table. Do not
   depend on that round trip until the sync checklist is proven.

**Applied to prod 2026-11-23.** Michael Slater applied
`supabase/migrations/20261123_site_visits.sql` by hand in the Supabase SQL
editor at about 9:31 AM ET (14:31 UTC). `pg_tables` then showed
`site_visits`, `site_visit_device_tests`, and `site_visit_reports`, each
with `rowsecurity = true`. No seed data was loaded. Record:
[migrations-applied.md](./migrations-applied.md).

## FastField form setup

Create one form named **High Pressure**. Purpose in BoilerOps, if you
register it, is `high_pressure` (Admin → FastField forms now lists that
purpose). Registration is optional for this test: the form name
`High Pressure` is enough. Also accepted: `High Pressure Device`,
`High Pressure Test`, or `FASTFIELD_HP_FORM_ID`.

If you register the form and leave the purpose on `boiler_onboarding`, a
name match still ingests it as High Pressure and the response warning says
the purpose was overridden. Set the purpose to `high_pressure` anyway.

### Field keys

Create these field keys. Labels can differ. Keys are case-sensitive at the
top level of the webhook JSON. A one-element array is accepted. If FastField
nests answers under `fields`, `formData`, `answers`, `data`, or `form`,
BoilerOps reads one level down and copies the values it needs back to the
top level before the site-table upsert.

| FastField field key | Required | What it is |
| --- | --- | --- |
| `site_visit_id` | Yes for a multi-device visit | Shared visit key. Same value on every device tested in the visit |
| `asset_id` | Yes | Boiler or plant being tested. Use `BLR1`-style target code, or an existing `target_...` public id |
| `asset_type` | No | `boiler` (default) or `plant` |
| `bo_siteid` | Yes, unless `site_code` is filled | BoilerOps site public id, `site_...` |
| `site_code` | Fallback | 3–4 character site code, such as `CAP` |
| `facility_name` | No | Facility name from the site lookup |
| `address`, `city`, `state`, `zip` | No | Site address |
| `contact_name`, `contact_email`, `contact_phone` | No | Site contact |

Override keys with `FASTFIELD_HP_FIELD_MAP` or the form registry
`field_mappings_json`. Both are JSON objects of **domain field → FastField
key**:

```json
{"siteVisitId":"site_visit_id","assetId":"asset_id","sitePublicId":"bo_siteid"}
```

Domain names are `siteVisitId`, `assetId`, `assetType`, `sitePublicId`,
`siteCode`, `facilityName`, `address`, `city`, `state`, `zip`,
`contactName`, `contactEmail`, `contactPhone`.

If you change `siteVisitId`, the site-info field map must use that same
submission key as the value for the visit ID column.

### QR code: what it encodes, and what fills the form

The printed site QR encodes only this URL:

`{NEXT_PUBLIC_APP_URL}/i/site/{site_public_id}`

Production today is `https://boilerops.vercel.app/i/site/{site_public_id}`
when `NEXT_PUBLIC_APP_URL` is that host. The QR does **not** embed the
field values. Opening the URL returns JSON:

```json
{
  "ok": true,
  "kind": "site",
  "site": {
    "boilerops_site_id": "site_...",
    "site_code": "CAP",
    "facility_name": "...",
    "address": "...",
    "city": "...",
    "state": "...",
    "zip": "...",
    "contact": { "name": "...", "email": "...", "phone": "..." }
  }
}
```

FastField will not call that URL by itself. For the form:

1. Add a barcode / QR field.
2. Add a lookup on the site info data table, or a calculation that takes
   the last path segment of the scanned URL and writes it to `bo_siteid`.
3. Map the lookup columns onto `bo_siteid`, `site_code`, `facility_name`,
   and the contact fields using the keys in the table above.
4. Map the site info visit ID column onto `site_visit_id` when that column
   already has a value. For the first device of the afternoon, type the
   shared visit ID if the column is still empty.

Fallback if the scan does not fill fields: type `bo_siteid` and
`site_visit_id`, or use the curl script below. Do not change the QR
encoding today. Existing printed codes stay valid.

### Site info visit ID column

The live Site Info table has no visit ID column. Add one whose **display
name** is `Site Visit ID`, unless you set `FASTFIELD_HP_VISIT_ID_COLUMN`
to a different display name. Text is enough. The column is not a lookup
key. The site key column is `site_code`.

Do not put that display name in `FASTFIELD_SITE_INFO_FIELD_MAP` until the
column is on the table. A missing display name fails the sync and does
not write a row. The code default does not write the column by itself.

## Submit and what to check

1. Submit device 1 with `site_visit_id` `VISIT-2026-11-23-CAP` and
   `asset_id` `BLR1` (or a real target code / `target_...` id).
2. Submit device 2 with the same `site_visit_id` and a different `asset_id`.
3. Submit device 1 again, or resend the same webhook.

### Webhook response

`POST /api/fastfield/submissions` returns `201` the first time and `200`
with `"duplicate": true` for the same submission id.

| Field | Device 1 | Device 2 | Same submission again |
| --- | --- | --- | --- |
| `purpose` | `high_pressure` | `high_pressure` | `high_pressure` |
| `site_visit_id` | the shared id | the same id | the same id |
| `visit_created` | `true` | `false` | `false` |
| `device_test_created` | `true` | `true` | `false` |
| `report_status` | `ready` | `ready` | `ready` |
| `report_device_count` | `1` | `2` | unchanged |
| `visit_public_id` | one id | the same id | the same id |
| `report_public_id` | one id | the same id | the same id |

`target_created` is `true` only when that asset id was not already an
inspection target on the site. An unknown `target_...` id fails the
submission. A short code such as `BLR1` is reused or created.
`asset_type` `plant` creates a plant target; otherwise the new target is
a boiler.

`site_info_sync.status` is `skipped` until the checklist vars are set.
The visit, asset, and report still save. The warning says the visit ID
column was not written. After the vars are set, a new submission (or
Admin → Submissions → Reprocess) should show `updated` or `created`.

A failed High Pressure event can be retried with the same webhook. A
processed submission is not written again.

### BoilerOps

Admin → Site visits:

- One card titled with the site visit ID.
- Site code and facility name.
- Status `report_ready`.
- Report status `ready` and a device count of 2 after the second device.
- One row per asset. The target public id is `target_...`.

Admin → Submissions shows `event_type` `high_pressure`.

There is no PDF. `report_packages` stays empty. That is expected today.

### FastField site table

After a successful `site_info_sync` of `updated` or `created`, the site row
keyed by the site id has `Site Visit ID` equal to the submitted
`site_visit_id` (or the minted `visit_...` id if the form left it blank).
Other columns already on the row stay as they were, except columns included
in the field map, which take the submission values.

If sync is still skipped, paste the `site_visit_id` from the webhook into
the column by hand before the next device relies on the lookup.

## Curl without a device

Replace the host, the site public id, and the secret. Do not commit the
secret. The header is `x-boilerops-secret`. `x-api-key` and HTTP Basic
password are also accepted. Do not put the secret in the URL.

```bash
export APP_URL="https://YOUR-PREVIEW-OR-PRODUCTION-HOST"
export FASTFIELD_WEBHOOK_SECRET="the-value-already-in-vercel"
export SITE_PUBLIC_ID="site_..."

curl -sS -D - \
  -H "content-type: application/json" \
  -H "x-boilerops-secret: ${FASTFIELD_WEBHOOK_SECRET}" \
  -d @- \
  "$APP_URL/api/fastfield/submissions" <<JSON
{
  "submissionId": "hp-demo-001",
  "formId": "hp-demo-form",
  "formName": "High Pressure",
  "bo_siteid": "${SITE_PUBLIC_ID}",
  "site_code": "CAP",
  "facility_name": "Demo facility",
  "site_visit_id": "VISIT-2026-11-23-CAP",
  "asset_id": "BLR1",
  "asset_type": "boiler"
}
JSON
```

Second device:

```bash
curl -sS \
  -H "content-type: application/json" \
  -H "x-boilerops-secret: ${FASTFIELD_WEBHOOK_SECRET}" \
  -d @- \
  "$APP_URL/api/fastfield/submissions" <<JSON
{
  "submissionId": "hp-demo-002",
  "formName": "High Pressure",
  "bo_siteid": "${SITE_PUBLIC_ID}",
  "site_visit_id": "VISIT-2026-11-23-CAP",
  "asset_id": "BLR2",
  "asset_type": "boiler"
}
JSON
```

Send the first body again. Expect `"duplicate": true` and the same
`visit_public_id`. Then open Admin → Site visits.

`formId` in the sample does not have to be the real FastField id while the
form name is `High Pressure`. Set `FASTFIELD_HP_FORM_ID` to the real id
once you have it, and put that id in `formId`.

## Pre-client-test checklist

### FastField

- [ ] Form name is exactly `High Pressure` (or you set `FASTFIELD_HP_FORM_ID`).
- [ ] Field keys match the table above, or `FASTFIELD_HP_FIELD_MAP` matches the keys you actually created.
- [ ] `asset_id` is the boiler or plant, not a safety-device serial.
- [ ] QR field stores the scan. A lookup or calculation writes `bo_siteid` from the last URL segment (`site_...`).
- [ ] Lookup fills `site_code`, `facility_name`, and the contact fields.
- [ ] `site_visit_id` is a lookup from the site info visit column, and you also type a shared value for the first device.
- [ ] Data table column display name is `Site Visit ID` (text), or you set `FASTFIELD_HP_VISIT_ID_COLUMN` to the real display name.
- [ ] Webhook URL is `https://HOST/api/fastfield/submissions` on the deployment that contains this branch.
- [ ] Header `x-boilerops-secret` is the existing `FASTFIELD_WEBHOOK_SECRET`. No secret in the URL.
- [ ] A Low Pressure form is not pointed at this webhook yet.

### Env var names

Values stay in Vercel. Do not paste them into git, chat, or this doc.

Already present (leave them):

| Name | HP test |
| --- | --- |
| `FASTFIELD_WEBHOOK_SECRET` | Required. Already set. Inbound webhook only |
| `FASTFIELD_API_KEY` | Already set. Required for the FastField site table write after the auth-fix PR is merged. Sent as `FastField-API-Key` |
| `FASTFIELD_SESSION_TOKEN` | Already set. The auth-fix may send this as `X-Gatekeeper-SessionToken` when it does not log in for a new token. Keep it. Confirm against that PR |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `AUTH_SECRET` | Required to open Admin → Site visits. Already set |
| Supabase URL and service role | Required. Already set |

Do not set `FASTFIELD_SUBSCRIPTION_KEY`, `FASTFIELD_USER_TOKEN`, or
`FASTFIELD_GATEKEEPER_SESSION_TOKEN` for this test. `Ocp-Apim-Subscription-Key`
is ignored by the gateway. This High Pressure branch still calls the
existing DataTables client and does not change that auth. The site table
write works only after the auth-fix PR is merged and deployed with this
branch.

Missing today. Set only what the column says, and only on the deployment
that contains the auth fix.

| Name | HP visit in BoilerOps | FastField visit ID column |
| --- | --- | --- |
| `FASTFIELD_USERNAME` | Not required | Required after the auth-fix merge. FastField account email. HTTP Basic username for `POST /services/v3/authenticate` |
| `FASTFIELD_PASSWORD` | Not required | Required after the auth-fix merge. HTTP Basic password for that login. The response `sessionToken` is sent as `X-Gatekeeper-SessionToken` |
| `FASTFIELD_SITE_INFO_SYNC_ENABLED` | Not required. Leave unset and the column is skipped | Required. Set to `true` only after the auth-fix is deployed and the key column and field map below are confirmed |
| `FASTFIELD_SITE_INFO_KEY_COLUMN` | Not required | `site_code`. That display name is the live lookup key. The code default is already `site_code` |
| `FASTFIELD_SITE_INFO_FIELD_MAP` | Not required | Required before the flag. JSON below. Do not include `Site Visit ID` until that column exists |
| `FASTFIELD_SITE_INFO_TABLE_NAME` | Not required | Optional. Default is `Site Info`. Matching ignores case and surrounding spaces |
| `FASTFIELD_DATATABLES_BASE_URL` | Not required | Optional. Default `https://api.fastfieldforms.com/services/v3` |
| `FASTFIELD_HP_FORM_ID` | Optional | Optional |
| `FASTFIELD_HP_FORM_NAME` | Optional extra accepted name | Optional |
| `FASTFIELD_HP_FIELD_MAP` | Optional | Optional. If you change `siteVisitId`, the field map value must use that new submission key |
| `FASTFIELD_HP_VISIT_ID_COLUMN` | Optional. Changes the warning text and the column name you document. Default `Site Visit ID` | Optional. Does not write the column by itself |

Field map for the live display names. Keys are column display names.
`site_id`, `job_num`, and `bo_qrcode` are on the table and are left out
because the submission does not carry them. Add `"Site Visit ID":
"site_visit_id"` only after that column exists. Until then the map must
not name it, or the sync fails and writes nothing.

```json
{
  "site_code": "site_code",
  "bo_siteid": "bo_siteid",
  "va_loc": "facility_name",
  "va_contact": "contact_name",
  "va_contact_email": "contact_email",
  "va_contact_phone": "contact_phone"
}
```

`FASTFIELD_SITE_INFO_KEY_COLUMN=site_code` pairs with that map. High
Pressure still finds the BoilerOps site by `bo_siteid` first. `site_code`
is copied onto the site-info payload only when the form already sent it,
so a submission that has only `bo_siteid` will skip the `site_code` lookup.

On update, mapped columns overwrite and every other column already on the
row is sent back. A blank submission field does not clear a column. On
insert, FastField requires every required column, so a site that has no
row yet needs those columns in the map.

### DataTables auth for the site table write

The gateway ignores `Ocp-Apim-Subscription-Key`. Do not create
`FASTFIELD_SUBSCRIPTION_KEY`, `FASTFIELD_USER_TOKEN`, or
`FASTFIELD_GATEKEEPER_SESSION_TOKEN` for this test.

The auth-fix PR, which is separate from this branch, logs in with:

| Name | Role |
| --- | --- |
| `FASTFIELD_API_KEY` | `FastField-API-Key`. Already in Vercel |
| `FASTFIELD_USERNAME` | Email for `POST /services/v3/authenticate`, HTTP Basic user. Not in Vercel yet |
| `FASTFIELD_PASSWORD` | HTTP Basic password for that login. Not in Vercel yet |
| `FASTFIELD_SESSION_TOKEN` | Maybe. Already in Vercel. Use it if the auth-fix accepts a stored session token instead of logging in every time |

The returned `sessionToken` is sent as `X-Gatekeeper-SessionToken`.

This High Pressure branch only calls `syncSiteInfoFromSubmission`. It does
not edit `datatables/client.ts`. Until the auth-fix PR is merged into the
deployment you test, `site_info_sync` cannot update the FastField visit ID
column. The BoilerOps visit, asset, and report do not need that PR.

Admin → Sites still uses the legacy projector (`x-api-key` and
`x-session-token` from `FASTFIELD_API_KEY` and `FASTFIELD_SESSION_TOKEN`).
That button still does not write the visit ID. Leave it alone during the
test. `docs/fastfield-site-info-sync.md` still describes the old
subscription-key client. Follow this checklist for the afternoon test, not
that section.

### Migration to approve and apply

Apply this file only:

`supabase/migrations/20261123_site_visits.sql`

It adds `site_visits`, `site_visit_device_tests`, and `site_visit_reports`,
with RLS denied for `anon` and `authenticated`. The app uses the service
role. `device_type` allows `low_pressure` so the next form does not need
another migration for that check. No Low Pressure code reads the table yet.

**Applied to prod 2026-11-23.** See Prerequisites and
[migrations-applied.md](./migrations-applied.md). No other shared or
staging database is recorded here. For any other project, apply this file
in the Supabase SQL editor, or with the Supabase CLI, the same way previous
migrations were applied. If the Vercel preview uses the production Supabase
project, the schema change is already on that project.

No earlier migration needs to be re-applied.

### Deploy

1. Open the Vercel deployment for this branch. Do not wait on a merge if
   the preview can reach the same Supabase project you migrated. The
   FastField visit ID column still needs the DataTables auth-fix PR merged
   into that same deployment. The BoilerOps visit does not.
2. Confirm the preview has `FASTFIELD_WEBHOOK_SECRET`, the Supabase
   service role, and, once the auth-fix is included, `FASTFIELD_API_KEY`,
   `FASTFIELD_USERNAME`, `FASTFIELD_PASSWORD`, and `FASTFIELD_SESSION_TOKEN`
   if that PR uses the stored token. Preview env is separate from
   Production unless the variables are shared.
3. Point the FastField High Pressure delivery at
   `https://PREVIEW-OR-PRODUCTION/api/fastfield/submissions` with the secret
   header.
4. Run the curl script once. Then run the phone only if curl shows one
   visit.
5. Do not click Admin → Sites → Sync during the test if that data table
   row has a `sync_url`. That button runs the legacy projector and does
   not send the visit ID. A partial post can disturb the site row the v3
   upsert is maintaining.

### Risks and fallbacks

| Risk | What you will see | Fallback |
| --- | --- | --- |
| Migration not applied | HTTP 500, relation `site_visits` does not exist | Apply the migration. Boiler and site onboarding are unaffected |
| Site was never created in BoilerOps | HTTP 500, unknown site id | Create the site in Admin → Sites first. Use its public id as `bo_siteid` |
| QR scan does not fill fields | Empty `bo_siteid` | Type the public id, or use curl. Do not reprint QR codes today |
| Two devices submit a blank visit ID before the column is written | Two visits | Type one shared `site_visit_id` on every device for this test |
| Auth-fix PR is not merged yet | Visit exists. Site table visit ID column does not update. `site_info_sync` is `skipped` or `failed` | Expected until that PR is deployed. Paste the visit ID into the FastField column by hand if the next form must look it up |
| Site-info flag, key column, or field map still unset | Visit exists, `site_info_sync` is `skipped` | The BoilerOps half of the test still passes. Set those only on the deployment that includes the auth fix |
| Wrong column display name | Sync `failed`, often HTTP 400 or 422 | Leave the flag off, fix the JSON keys, Reprocess one submission |
| Legacy Sync button during the test | Site row changes without the visit ID | Do not press it until the test is over |
| Same submission retried after success | `duplicate: true` | Expected. Use a new `submissionId` for the next device |
| Failed event retried | High Pressure failures are tried again | Other forms still treat any stored submission id as a duplicate. Use Reprocess for those |
| Asset id `target_...` does not exist | HTTP 500, unknown asset id | Use the real target public id, or a short code such as `BLR1` to create one |
| Low Pressure form hits the same URL | HTTP 500, not implemented | Keep that form off the webhook |

## Low Pressure plan (no code in this change)

Reuse the High Pressure path. Do not copy the webhook, the visit tables,
or the site-info call.

1. Add one catalog entry next to High Pressure in
   `device-form-config.ts` with `deviceType` and `purpose` `low_pressure`,
   form names `Low Pressure`, `Low Pressure Device`, and `Low Pressure Test`,
   and its own field-key object. Default the keys to the same placeholders
   unless the Low Pressure form uses different FastField keys.
2. Env prefix `FASTFIELD_LP_FORM_ID`, `FASTFIELD_LP_FORM_NAME`,
   `FASTFIELD_LP_FIELD_MAP`. No new site-info client and no new visit table.
   The `device_type` check already allows `low_pressure`.
3. `recordDeviceVisit` already keys the test by visit, device type, and
   asset. An HP test and an LP test for the same boiler on the same visit
   are two tests and one report. A second LP submission for that asset is
   ignored.
4. The site visit ID is the same field and the same FastField column.
   Device 1 can be High Pressure and device 2 Low Pressure.
5. Register the form with purpose `low_pressure`. Until that catalog entry
   exists, a form named Low Pressure is rejected on purpose so it cannot
   fall through to boiler onboarding.
6. Differences to confirm before building it: the real form id, any field
   key that is not shared with High Pressure, whether `asset_type` should
   default to `plant`, and which extra test readings to store. Store extra
   readings on `mapped_json` first. Do not add PDF generation or a new
   report table for Low Pressure.
7. Add the form name to the same identification tests and one visit that
   holds one High Pressure test and one Low Pressure test.

## Assumptions

- The asset id is the boiler or plant (`inspection_targets`), not a row in
  `assets` (safety devices on a target).
- One visit is shared by every device tested under that site visit ID,
  including a future Low Pressure form.
- The report is complete enough for this test when it lists the submitted
  devices. BoilerOps does not know how many devices the site was supposed
  to have, so it does not wait for a "last device" signal.
- A short new asset code creates a shell target when none exists, so the
  afternoon test is not blocked on a separate target-setup screen.
- Column display names `bo_siteid`, `va_loc`, and `Site Visit ID` are
  suggestions. They are not confirmed against the live table.
- Webhook answers are top-level, matching site onboarding, with one nested
  wrapper tolerated.
- Admin → Sites keeps using the legacy projector.

## Open questions

- What is the exact site info table name and the site key column display
  name from `GET /datatables/list`?
- Is the new column's display name acceptable as `Site Visit ID`?
- What is the High Pressure form id once the form exists?
- Should a blank visit ID keep minting `visit_...`, or should a missing
  visit ID fail the submission so two devices cannot split by accident?
- When is a visit finished, as opposed to "ready with the devices seen so
  far"?
- Should the QR later encode the site public id or a JSON object, instead
  of only the URL? Not changed today.
- Does the auth-fix PR read a stored `FASTFIELD_SESSION_TOKEN`, or does
  it always log in with `FASTFIELD_USERNAME` and `FASTFIELD_PASSWORD`?
