# FastField Site Onboarding

Validated against FastField form `1244818` (`Site Onboarding`), version 10.

## Domain identifiers

- `sites.id`: internal Supabase UUID
- `sites.public_id`: immutable external BoilerOps ID; published as `bo_siteid`
- `sites.site_code`: 3–4 character human code such as `CAP`
- `sites.qr_target_url`: stable `/i/site/{public_id}` URL; published as `bo_qrcode`

The QR encodes the stable URL, not the mutable site code or contact details.

## Apply the migrations

Apply in order:

`supabase/migrations/20260813_site_onboarding.sql`

`supabase/migrations/20260814_fastfield_data_table_config.sql`

They create:

- `sites`
- `fastfield_data_tables` for reusable outbound table configuration
- `fastfield_sync_records` for per-entity synchronization state
- `integration_events.result_json`
- the form registry row for FastField form `1244818`

The second migration copies any state from the legacy `fastfield_site_sync`
table and leaves that table in place temporarily for rollback.

The `qr-codes` storage bucket from `20260811_storage_buckets.sql` must also
exist.

## Validated form mapping

| FastField key | BoilerOps field |
| --- | --- |
| `va_loc` | `sites.facility_name` |
| `site_code` | `sites.site_code` |
| `site_id` | `sites.fastfield_source_site_id` |
| `va_contact` | `sites.contact_name` |
| `va_contact_email` | `sites.contact_email` |
| `va_contact_phone` | `sites.contact_phone` |
| `bo_siteid` | `sites.public_id` on update submissions |

New onboarding submissions omit `bo_siteid`. BoilerOps generates it and sends
it to the Site Info Data Table. Update forms must return it.

## Submission flow

Configure the FastField submit action:

`POST https://YOUR-HOST/api/fastfield/submissions`

The endpoint:

1. Stores the original JSON in `integration_events.payload_json`
2. Resolves the form as `site_onboarding`
3. Matches an existing site by `bo_siteid`, then source `site_id`, then
   organization + `site_code`
4. Creates or updates the site
5. Generates a 512px PNG QR in `qr-codes/sites/{public_id}.png`
6. Upserts a Site Info row through the configured FastField endpoint

Successful responses include:

```json
{
  "ok": true,
  "purpose": "site_onboarding",
  "site_public_id": "site_...",
  "fastfield_sync_status": "synced",
  "urls": {
    "site": "https://YOUR-HOST/i/site/site_...",
    "site_qr": "https://YOUR-HOST/i/site/site_.../qr"
  }
}
```

## Site Info Data Table

Set `bo_siteid` as the table’s unique/upsert key.

The outbound row is:

```json
{
  "bo_siteid": "site_...",
  "bo_qrcode": "https://YOUR-HOST/i/site/site_...",
  "site_code": "CAP",
  "va_loc": "Cape Coral VA Medical Center",
  "va_contact": "John Doe",
  "va_contact_email": "johndoe@va.gov",
  "va_contact_phone": "239-555-5555"
}
```

Store credentials in the application environment:

```dotenv
FASTFIELD_API_KEY=
FASTFIELD_SESSION_TOKEN=
FASTFIELD_API_KEY_HEADER=x-api-key
FASTFIELD_SESSION_TOKEN_HEADER=x-session-token
```

Store the table-specific configuration in Supabase:

```sql
update public.fastfield_data_tables
set
  fastfield_table_id = 'YOUR_FASTFIELD_TABLE_ID',
  sync_url = 'YOUR_FASTFIELD_ROW_UPSERT_ENDPOINT',
  http_method = 'POST'
where organization_id = '00000000-0000-4000-8000-000000000001'
  and purpose = 'site_info';
```

FastField publicly documents individual Data Table row modification, but not
the account-specific endpoint/auth contract. Until the configuration row has a
`sync_url`, site creation and QR generation succeed and the generic sync record
is marked pending for follow-up.

## Lookup routes

- Site JSON: `GET /i/site/{public_id}`
- QR PNG: `GET /i/site/{public_id}/qr`

These routes are public in the POC. Before production, decide whether site
contact fields require an authenticated or signed lookup.
