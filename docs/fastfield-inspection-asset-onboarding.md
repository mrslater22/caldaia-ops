# Inspection and Asset onboarding

Site Onboarding remains the reference flow. This document covers the two
new ingest purposes, the DataTables syncs they trigger, and the manual
test Michael runs after the flags are turned on.

No new database migration is required. `inspection_targets`,
`boiler_target_details`, `plant_target_details`, and `assets` already
match this flow. Field names below have **not** been checked against a
live FastField payload. The FastField form ids are unknown and the forms
may not exist yet.

## Purposes

| Purpose | Writes | Parent | Stable id |
| --- | --- | --- | --- |
| `inspection_onboarding` | `inspection_targets` plus `boiler_target_details` or `plant_target_details` | Site, by `bo_siteid` (`sites.public_id`), then `site_code` | `bo_targetid` (`inspection_targets.public_id`) |
| `asset_onboarding` | `assets` | Inspection target, by `bo_targetid`. `bo_siteid` must match that target's site when it is sent | `bo_assetid` (`assets.public_id`) |

A missing parent, an unknown `bo_targetid` / `bo_assetid`, or a missing
required key fails the integration event and does not insert a row.
Nothing is created without its parent.

Canonical keys live in:

- `apps/boilerops/src/lib/fastfield/inspection-onboarding-mapper.ts`
- `apps/boilerops/src/lib/fastfield/asset-onboarding-mapper.ts`

Admin → FastField forms `field_mappings_json` can point a domain field at
a different payload key. The canonical key is still accepted.

Inspection keys: `bo_targetid`, `bo_siteid`, `site_code`,
`inspection_scope` (`boiler` or `plant`), `inspection_code` (2–8 letters
or digits), `inspection_name`.

Asset keys: `bo_assetid`, `bo_targetid`, `bo_siteid`, `asset_code` (2–8
letters or digits), `asset_category` (`safety` or `measurement`; blank
defaults to `safety`), `asset_classification`, `asset_nomenclature`,
`asset_name`, `manufacturer`, `model`, `serial_number`.

`asset_classification` is required because `assets.asset_classification`
is not nullable. The first submission omits `bo_targetid` / `bo_assetid`.
BoilerOps generates them. A later submission that sends an id BoilerOps
does not know is rejected instead of creating a second row.

## Registration before the form exists

Admin → FastField forms includes `inspection_onboarding` and
`asset_onboarding`. Leave the FastField form ID blank. The row is stored
as `pending:inspection_onboarding` or `pending:asset_onboarding`. Ingest
matches the registered **name** until the real id is saved on that same
row. Set the name to the FastField form name.

An unregistered form is not processed as boiler onboarding. The raw JSON
is stored on `integration_events` with status `unprocessed` and a reason
in `error_message`. `POST /api/fastfield/submissions` returns HTTP 201
with `ok: true`, `purpose: "unprocessed"`, and that reason in `warning`.

## DataTables sync

These use DataTables API v3 (`FastField-API-Key` and
`X-Gatekeeper-SessionToken`), the same client as Site Info. They do not
use the legacy site-table projector. Each sync is off until its flag is
true **and** its field map is non-empty. A sync failure is recorded on
the webhook warning and does not change the HTTP status of ingest.

The table is resolved by `listId` from `GET /datatables/list`. Display
names are translated to `config.fields[].key` before lookup, PUT, and
POST. PUT sends the full merged row. A configured display name that is
missing from `config.fields` writes nothing.

| Setting | Inspection Info | Asset Info |
| --- | --- | --- |
| Enable (default off) | `FASTFIELD_INSPECTION_INFO_SYNC_ENABLED=true` | `FASTFIELD_ASSET_INFO_SYNC_ENABLED=true` |
| Table name | `FASTFIELD_INSPECTION_INFO_TABLE_NAME` (default `Inspection Info`) | `FASTFIELD_ASSET_INFO_TABLE_NAME` (default `Asset Info`) |
| listId | `FASTFIELD_INSPECTION_INFO_LIST_ID` (default `d529b806-e0bb-497c-b852-cfec14c7102b`) | `FASTFIELD_ASSET_INFO_LIST_ID` (default `2182c9f7-8045-4418-9bb1-eaddb13c097d`) |
| Key column | `FASTFIELD_INSPECTION_INFO_KEY_COLUMN` (default `bo_targetid`) | `FASTFIELD_ASSET_INFO_KEY_COLUMN` (default `bo_assetid`) |
| Field map | `FASTFIELD_INSPECTION_INFO_FIELD_MAP` | `FASTFIELD_ASSET_INFO_FIELD_MAP` |

Suggested maps, not applied until set:

```json
{
  "bo_targetid": "bo_targetid",
  "bo_siteid": "bo_siteid",
  "inspection_scope": "inspection_scope",
  "inspection_code": "inspection_code",
  "inspection_name": "inspection_name"
}
```

```json
{
  "bo_assetid": "bo_assetid",
  "bo_targetid": "bo_targetid",
  "bo_siteid": "bo_siteid",
  "asset_code": "asset_code",
  "asset_category": "asset_category",
  "asset_classification": "asset_classification",
  "asset_nomenclature": "asset_nomenclature",
  "asset_name": "asset_name",
  "manufacturer": "manufacturer",
  "model": "model",
  "serial_number": "serial_number"
}
```

After persist, ingest writes the generated ids onto the payload:
`bo_targetid` and `bo_siteid` for a target; `bo_assetid`, `bo_targetid`,
and `bo_siteid` for an asset. Reprocess runs the same sync. Credentials
are the Site Info set (`FASTFIELD_API_KEY`, and either
`FASTFIELD_SESSION_TOKEN` or `FASTFIELD_USERNAME` plus
`FASTFIELD_PASSWORD`). Do not set a developer-portal subscription key.

Site Info's suggested map is now identity, including `bo_qrcode`. See
[fastfield-site-info-sync.md](./fastfield-site-info-sync.md).

## Enable steps

Do this on the deployment under test. Leave production flags off until
the preview check below passes. Do not paste secrets into git, tickets,
or logs.

1. Register **Inspection Onboarding** with purpose `inspection_onboarding`
   and **Asset Onboarding** with purpose `asset_onboarding`. Leave the
   form id blank if the FastField form does not exist yet. Set each name
   to the form name FastField will send.
2. Confirm Site Info is ready if this test should also check `bo_siteid`
   and `bo_qrcode`:
   - `FASTFIELD_SITE_INFO_SYNC_ENABLED=true`
   - `FASTFIELD_SITE_INFO_KEY_COLUMN=site_code`
   - `FASTFIELD_SITE_INFO_FIELD_MAP` set to the identity map in
     [fastfield-site-info-sync.md](./fastfield-site-info-sync.md)
3. Set the Inspection Info and Asset Info variables in the table above.
   Use the suggested maps only after the column display names on those
   tables match. A wrong display name fails that sync and writes nothing.
4. Redeploy so the process sees the new env. Flags accept `true`, `1`,
   `yes`, or `on`.

## End-to-end check

Order matters. Each step uses the id the previous step published.

1. **Site TST1.** Submit Site Onboarding with `site_code` `TST1` and a
   facility name in `va_loc`. Ingest returns `purpose: "site_onboarding"`
   and a `site_public_id`. In FastField Site Info, the row for `TST1`
   has `bo_siteid` equal to that public id and `bo_qrcode` equal to
   `https://<host>/i/site/<bo_siteid>`. `site_info_sync.status` is
   `created` or `updated`. A skipped sync means the flag or map is still
   empty.
2. **Target BLR1.** Submit Inspection Onboarding with `bo_siteid` from
   step 1 (or `site_code` `TST1`), `inspection_scope` `boiler`,
   `inspection_code` `BLR1`, and `inspection_name` `Boiler 1`. The
   response `target_public_id` is new. Inspection Info has one row whose
   `bo_targetid` is that id and whose `bo_siteid` is the site from step 1.
   Submitting again with the same code updates that row. An unknown
   `bo_siteid` leaves no target.
3. **Asset SV1.** Submit Asset Onboarding with `bo_targetid` from step 2,
   `bo_siteid` from step 1, `asset_code` `SV1`, and an
   `asset_classification`. The response `asset_public_ids` has one id.
   Asset Info has one row with that `bo_assetid`, the step 2
   `bo_targetid`, and the step 1 `bo_siteid`. A missing target creates
   no asset.

Also send one submission for a form that is not registered. The response
is HTTP 201, `ok: true`, `purpose: "unprocessed"`, and the warning says
it was not processed as boiler onboarding. Admin → Submissions shows
status `unprocessed` and the raw payload. No boiler row is created.

## Rollback

1. Unset `FASTFIELD_INSPECTION_INFO_SYNC_ENABLED` and
   `FASTFIELD_ASSET_INFO_SYNC_ENABLED`, or set them to `false`. Redeploy.
   Ingest still saves Supabase rows for registered forms, and the
   DataTables calls stop. Site Info is unchanged if its own flag stays on.
2. To stop the new forms from writing Supabase, open Admin → FastField
   forms, uncheck Active on those registrations, and save. Ingest then
   stores a later submission as `unprocessed` instead of creating targets
   or assets. Name matching ignores inactive rows.
3. Rows already written in Supabase and FastField stay. This change does
   not delete them. Turn the flags back on to resume upserts; the key
   columns keep the sync from inserting a second row for the same id.
