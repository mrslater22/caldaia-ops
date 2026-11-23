# FastField site info Data Table sync

BoilerOps can upsert one row in the FastField Data Table named **site info**
from an inbound submission. The call uses DataTables API v3
(`https://api.fastfieldforms.com/services/v3`). It is off by default and does
not change submission ingest until it is configured and explicitly enabled.

This is separate from the legacy projector in
`apps/boilerops/src/lib/fastfield/site-table-sync.ts`, which still posts the
BoilerOps site row to `fastfield_data_tables.sync_url`. The column names in
that table (`bo_siteid`, `va_loc`, and the rest) are **not** assumed to be
the site info columns for this sync.

## Where it runs

After a submission is stored and the domain write succeeds,
`ingestFastFieldSubmission` and `reprocessIntegrationEvent` call
`syncSiteInfoFromSubmission`. That includes site onboarding, boiler
onboarding, and High Pressure device submissions.

High Pressure copies `site_visit_id` (and blank site fields) onto the
top-level payload before this sync runs, so the field map can write the
new visit ID column. The map is still empty until you set it. Admin →
Sites does not call this sync. See [hp-device-e2e-test.md](./hp-device-e2e-test.md).

The credential section below still matches the client on this branch
(`Ocp-Apim-Subscription-Key` and a bearer user token). The gateway ignores
that subscription header. For the High Pressure site table write, use the
auth vars in the High Pressure checklist (`FASTFIELD_API_KEY`,
`FASTFIELD_USERNAME`, `FASTFIELD_PASSWORD`, and maybe
`FASTFIELD_SESSION_TOKEN`) and merge the DataTables auth-fix PR first.
This branch does not change the client.

- A skipped or failed sync does not change the HTTP status of
  `POST /api/fastfield/submissions`. The response field `site_info_sync`
  reports `skipped`, `updated`, `created`, or `failed`. A failure is also
  appended to `warning` and stored on `integration_events.result_json`.
- A duplicate webhook for a submission id that was already stored does not
  run the sync again. Reprocess does.
- There is no outbound `GET /submissions` client in this app. The payload is
  the JSON FastField already posted to `/api/fastfield/submissions`.

## What Michael must fill in

The site key column and the submission-to-column map are unknown. Both are
placeholders. Until they are set, the sync logs a no-op and makes no
FastField call, even if the enable flag is on.

Fill these in either place. Env overrides the module.

| Setting | Module constant | Env var |
| --- | --- | --- |
| Enable (default off) | — | `FASTFIELD_SITE_INFO_SYNC_ENABLED=true` |
| Table name | `SITE_INFO_TABLE_NAME` (`site info`) | `FASTFIELD_SITE_INFO_TABLE_NAME` |
| Site key column | `SITE_INFO_KEY_COLUMN` (empty) | `FASTFIELD_SITE_INFO_KEY_COLUMN` |
| Field map | `SITE_INFO_FIELD_MAP` (empty) | `FASTFIELD_SITE_INFO_FIELD_MAP` |

Module file: `apps/boilerops/src/lib/fastfield/site-info-sync-config.ts`.

1. **Table name.** Confirm the exact `name` from `GET /datatables/list`,
   including capitalization and spaces. The code default is `site info`.
   Matching is case-sensitive.
2. **Key column.** The exact site info **column display name** that
   identifies one site. Not `fields[].key`. Leave it blank until you know it.
3. **Field map.** JSON object whose keys are site info column display names
   and whose values are top-level submission field keys:

   ```json
   {"Column display name":"submission_field_key"}
   ```

   On insert, every required column must be present. Lookup-key columns are
   required by FastField. Omitted non-required columns are stored as null.
   On update, values from the map replace the existing row and every other
   existing column is sent back unchanged. A blank or missing submission
   field does not clear a column.
4. **Credentials**, in the server environment only (Vercel / `.env.local`),
   never in git. The DataTables gateway reads `FastField-API-Key`. It does
   not read `Ocp-Apim-Subscription-Key` or `?subscription-key=`.

   | Variable | Role |
   | --- | --- |
   | `FASTFIELD_API_KEY` | Required. Sent as `FastField-API-Key` on `/authenticate` and every DataTables call. This is the same variable the legacy projector reads. |
   | `FASTFIELD_USERNAME` | FastField portal email. With the password, HTTP Basic user on `POST /authenticate`. |
   | `FASTFIELD_PASSWORD` | HTTP Basic password on `POST /authenticate`. Set both username and password, or neither. |
   | `FASTFIELD_SESSION_TOKEN` | Optional pre-issued session. Sent as `X-Gatekeeper-SessionToken` until a DataTables call returns HTTP 401. Same variable the legacy projector reads. |

   Session precedence, per process:

   1. Cached `sessionToken` from `POST /services/v3/authenticate` in this
      process. When the JSON includes `sessionExpiration` or `sessionExpires`
      (ISO-8601 or epoch seconds/milliseconds), the cache is refreshed 60
      seconds before that time. When those fields are absent, the token stays
      cached until a DataTables call returns HTTP 401.
   2. Otherwise, if `FASTFIELD_SESSION_TOKEN` is set, send it and do not call
      `/authenticate` yet. It has no known expiry.
   3. Otherwise `POST /authenticate` with `FastField-API-Key` and
      `Authorization: Basic` of `FASTFIELD_USERNAME:FASTFIELD_PASSWORD`.
      The response field used is `sessionToken`. The body is not logged.

   On HTTP 401 from a DataTables call the rejected token is dropped. If
   username and password are set, the client calls `/authenticate` once and
   retries that DataTables call once. A second 401 fails the sync and does
   not write a row. `/authenticate` itself is not retried. If the only
   session source was `FASTFIELD_SESSION_TOKEN`, that 401 is returned
   immediately, because a new session cannot be created.

   `FASTFIELD_API_KEY_HEADER` and `FASTFIELD_SESSION_TOKEN_HEADER` apply only
   to the legacy projector (`x-api-key` and `x-session-token` by default).
   The DataTables client does not use those names.

   Already set in Vercel Preview and Production for the projector:
   `FASTFIELD_API_KEY` and `FASTFIELD_SESSION_TOKEN`. Not set there, and
   required before this client can mint its own session:
   `FASTFIELD_USERNAME` and `FASTFIELD_PASSWORD`. This change does not write
   either environment.

   Ignored, and safe to delete: `FASTFIELD_SUBSCRIPTION_KEY`,
   `FASTFIELD_USER_TOKEN`, `FASTFIELD_GATEKEEPER_SESSION_TOKEN`. An earlier
   client sent those as `Ocp-Apim-Subscription-Key`, `Authorization: Bearer`,
   and an optional gatekeeper value. The gateway does not read the
   subscription key. The long primary key is not a session token.

   These are not `FASTFIELD_WEBHOOK_SECRET`.
5. Set `FASTFIELD_SITE_INFO_SYNC_ENABLED=true` only after 1–4 are known.
   Accepted values: `true`, `1`, `yes`, `on`. A missing API key or session
   source fails that sync with an error naming the missing variables and
   does not call FastField. Ingest still returns success.

`FASTFIELD_DATATABLES_BASE_URL` defaults to
`https://api.fastfieldforms.com/services/v3`.

## Behavior

1. Resolve a session as described above, then `GET /datatables/list` and
   cache `dataTableId` (or `id` if that is all the list body provides) for
   the configured name. A 401 on any DataTables call refreshes the session
   once when username and password are set, then retries that call once.
2. `POST /datatables/{tableId}/items/lookup` with
   `{ "data": { "<key column>": <value> } }`.
3. A single row with an id and a column object is a hit. The submission
   values are merged onto that full object and sent as
   `PUT /datatables/{tableId}/items` with `{ "id", "data" }`. A partial `data`
   object is never sent. FastField nulls omitted non-required columns.
4. HTTP 404, 204, an empty list, or a "not found" message is treated as a
   miss. `POST /datatables/{tableId}/items` inserts `{ "data" }`. This 404
   assumption is provisional until a real miss body is logged.
5. Any other lookup result (for example HTTP 400 because the column is not a
   lookup key) pages `GET /datatables/{tableId}/items?pageSize=100&pageNumber=`.
   Page 1 is requested first. Page 0 is probed once because the start index
   is not documented; a non-2xx on that probe is ignored. A short page or a
   repeated page ends the scan. If the scan cannot be finished (HTTP error or
   50 full pages), nothing is written.
6. More than one matching row fails the sync and does not write.
7. The first success body and the first error body for each operation are
   logged once per process with scalar values replaced by type tags
   (`<string len=N>`, `<number>`, `<boolean>`). Secrets and row values are
   not written to the log. Use those lines to tighten the parsers.

Submission fields are read from the top level of the webhook JSON. A
one-element array is unwrapped. Nested form objects are not searched.

## Remaining race

Inside one Node process, upserts for the same key are serialized, so the
second request sees the row the first request created.

Two instances can both observe "no row" and both `POST`. Create DataTable
Item has no documented idempotency key. A retried webhook for a submission
that was already stored does not run the sync again; use Admin → Submissions
→ Reprocess, which looks up before it writes.

## How to verify against the real API

Do this only after the secrets are in the server environment. Do not paste
secrets into the repo, into logs, or into this doc. The automated tests mock
`fetch` and do not call FastField.

1. Create a session, then list tables. Use placeholders here. Do not paste
   real keys, passwords, or session tokens into the repo, a ticket, or logs.
   `YOUR_API_KEY` is the `FASTFIELD_API_KEY` value (the API token the gateway
   accepts as `FastField-API-Key`). `user@example.com` is the FastField
   portal email.

   ```bash
   curl -sS -X POST \
     "https://api.fastfieldforms.com/services/v3/authenticate" \
     -H "FastField-API-Key: YOUR_API_KEY" \
     -H "Authorization: Basic $(printf '%s' 'user@example.com:YOUR_PASSWORD' | base64)" \
     -H "Accept: application/json"

   curl -sS "https://api.fastfieldforms.com/services/v3/datatables/list" \
     -H "FastField-API-Key: YOUR_API_KEY" \
     -H "X-Gatekeeper-SessionToken: YOUR_SESSION_TOKEN" \
     -H "Accept: application/json"
   ```

   Copy `sessionToken` from the first JSON into `YOUR_SESSION_TOKEN` in the
   shell only. Do not send `Ocp-Apim-Subscription-Key`, `Authorization: Bearer`,
   or `?subscription-key=`. A list call with only `FastField-API-Key` gets
   past the gateway and then returns 401 until the session header is present.
   Compare the logged `first list success response shape` line with the
   property names the parser expects (`name`, `dataTableId`).

2. Pick the key column from the portal or from that list payload's field
   display names. Confirm whether it is a lookup key. Set the env vars, then
   look up a known value:

   ```bash
   curl -sS -X POST "https://api.fastfieldforms.com/services/v3/datatables/TABLE_ID/items/lookup" \
     -H "FastField-API-Key: YOUR_API_KEY" \
     -H "X-Gatekeeper-SessionToken: YOUR_SESSION_TOKEN" \
     -H "Accept: application/json" \
     -H "Content-Type: application/json" \
     -d '{"data":{"YOUR_KEY_COLUMN":"YOUR_VALUE"}}'
   ```

   Record the status and the redacted shape (keys only) for a hit and for a
   miss before enabling the flag.

3. Page items once and note whether rows live on `pageNumber=0` or `1`, and
   whether the body is a bare array or wrapped (`items`, `data`, …):

   ```bash
   curl -sS "https://api.fastfieldforms.com/services/v3/datatables/TABLE_ID/items?pageSize=100&pageNumber=1" \
     -H "FastField-API-Key: YOUR_API_KEY" \
     -H "X-Gatekeeper-SessionToken: YOUR_SESSION_TOKEN" \
     -H "Accept: application/json"
   ```

4. Deploy with the flag still off and submit a form. Ingest should succeed
   and `site_info_sync.status` should be `skipped`.
5. Set the flag to `true`. Submit one site whose row already exists and one
   that does not. Server logs should show `updated` or `created`, plus one
   redacted shape line per operation. In FastField, confirm the existing row
   kept columns that were not in the map, and that a retry or reprocess did
   not add a second row.
6. If PUT returns 422, a required column is missing or a value has the wrong
   type. Add that column to the map. Do not send a partial row to "fix" it.

## Open questions

- Which column is the site key, and which submission fields map to which
  display names?
- Exact JSON for list, lookup hit, lookup miss, and paged items, including
  the no-match status. The parsers are defensive on purpose.
- Whether `pageNumber` is 0-based or 1-based, and what the last page looks like.
- Whether a lookup HTTP 404 always means "no row", or sometimes "this column
  is not a lookup key".
- Which columns are required on insert. The map has to include them or POST
  returns 422.
