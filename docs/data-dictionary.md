# Data Dictionary

Canonical domain entities for BoilerOps. Types are logical; physical DDL lands in `packages/db` migrations during Phase 1.

## organizations

Client organization (tenant).

| Field | Notes |
| --- | --- |
| id | PK |
| name | Display name |
| type | Org classification |
| status | Active / inactive / etc. |
| billing metadata | Billing-related fields (flexible) |
| created_at / updated_at | Timestamps |

## sites

Client facility, such as a VA Medical Center.

| Field | Notes |
| --- | --- |
| id | PK |
| organization_id | FK → organizations |
| public_id | Stable BoilerOps/FastField/QR identifier |
| site_code | 3–4 character human code, such as `CAP` |
| facility_name | |
| site_code | Internal site code |
| address, city, state, zip | Location |
| timezone | |
| contact_name, contact_email, contact_phone | Site contact |
| notes | Free text |
| created_at / updated_at | |

## inspection_targets

Persistent thing that can be selected for inspection. A target is either a
Boiler or a Plant; it is not an inspection event.

| Field | Notes |
| --- | --- |
| id / public_id | Internal PK and stable integration ID |
| organization_id / site_id | Tenant and parent site |
| target_type | `boiler` or `plant` |
| target_code | Human code such as `BLR1` |
| display_name | Form and portal label |
| location_description | Physical location within the site |
| service_status | Active / inactive / retired |
| created_at / updated_at | |

Type-specific fields are stored in one-to-one `boiler_target_details` and
`plant_target_details` tables.

## technicians

| Field | Notes |
| --- | --- |
| id | PK |
| fastfield_user_id | External identity |
| full_name | |
| email | |
| active | |
| created_at / updated_at | |

## inspections

One inspection event.

| Field | Notes |
| --- | --- |
| id | PK |
| site_id | FK → sites |
| inspection_target_id | FK → inspection_targets |
| technician_id | FK → technicians |
| fastfield_submission_id | Idempotency / upsert key |
| fastfield_form_id | Source form |
| inspection_type | |
| inspection_date | |
| status | |
| started_at / completed_at | |
| raw_payload_json | Optional denormalized reference; prefer `integration_events` as source of truth for raw |
| report_document_id | FK → documents |
| created_at / updated_at | |

## inspection_findings

| Field | Notes |
| --- | --- |
| id | PK |
| inspection_id | FK → inspections |
| severity | |
| category | |
| title | |
| description | |
| recommendation | |
| status | |
| created_at | |

## safety_devices

Current physical device installed on an inspectable Boiler or Plant target.

| Field | Notes |
| --- | --- |
| id | PK |
| inspection_target_id | FK → inspection_targets |
| device_code | Human code such as `WL1` |
| device_type | |
| manufacturer | Field-collected |
| model | Field-collected |
| serial_number | |
| install_date | |
| set_point / trip_point | |
| service_status | |
| location_description | |
| normalized_device_key | Link toward catalog |
| created_at / updated_at | |

## safety_test_definitions / inspection_tests / inspection_test_devices

- `safety_test_definitions` is the reusable catalog of approximately 40 test
  and report-section types.
- `inspection_tests` is one activated test/report section during an inspection.
- `inspection_test_devices` links all devices tested in that section.

This produces the hierarchy:

`Inspection → Safety Test / Report Section → Devices Tested`

## safety_device_history

Append-only snapshots across inspections.

| Field | Notes |
| --- | --- |
| id | PK |
| safety_device_id | FK → safety_devices |
| inspection_id | FK → inspections |
| manufacturer, model, serial_number | Observed values |
| install_date, set_point, trip_point | |
| observed_condition | |
| technician_notes | |
| created_at | |

## documents

| Field | Notes |
| --- | --- |
| id | PK |
| organization_id / site_id / inspection_id | Scope |
| document_type | Report, attachment, etc. |
| file_name | |
| storage_bucket | Supabase Storage bucket name |
| storage_path | Object path inside the bucket (replaces `s3_key`) |
| mime_type / file_size / checksum | |
| source_system | e.g. `fastfield` |
| source_reference_id | External doc/submission id |
| created_at | |

## tickets / ticket_messages

Support workflow.

**tickets:** organization_id, site_id, submitted_by_user_id, assigned_to_user_id, subject, description, priority, status, related_device_id, related_inspection_id, timestamps.

**ticket_messages:** ticket_id, author_user_id, body, internal_only, created_at.

## portal_users

| Field | Notes |
| --- | --- |
| id | PK |
| organization_id | Tenant |
| auth_user_id | Supabase Auth user |
| full_name / email | |
| role | Client or mapped internal role |
| active | |
| created_at | |

## device_catalog

Master normalized catalog identity.

| Field | Notes |
| --- | --- |
| id | PK |
| device_type | |
| manufacturer_normalized | |
| model_normalized | |
| product_family | |
| description | |
| normalized_device_key | Stable match key |
| created_at / updated_at | |

## device_intelligence

AI-enriched record (separate from field truth).

| Field | Notes |
| --- | --- |
| id | PK |
| device_catalog_id | FK |
| life_expectancy_years_low / high | |
| source_confidence | |
| summary | |
| replacement_guidance | |
| maintenance_notes | |
| updated_at / refresh_due_at | Freshness |

## vendor_options

| Field | Notes |
| --- | --- |
| id | PK |
| device_catalog_id | FK |
| vendor_name / vendor_part_number / vendor_url | |
| price_estimate | |
| lead_time_estimate_days | |
| availability_status | |
| oem_or_equivalent | |
| last_checked_at | |
| source_notes | Required for claims |

## caldaia_inventory

Caldaia-owned stock (Phase 2+).

sku, quantity_on_hand, warehouse_location, min_stock_level, reorder_level, last_counted_at, device_catalog_id.

## compatible_replacements

source_device_catalog_id → replacement_device_catalog_id, compatibility_type, notes, reviewed_by_human, confidence_score.

## integration_events

Not listed in the original entity summary as a business entity, but required for ingestion:

| Field (planned) | Notes |
| --- | --- |
| id | PK |
| source_system | `fastfield` |
| event_type | submission.created, etc. |
| external_id | Submission ID |
| payload_json | Immutable raw body |
| status | received / processed / failed |
| idempotency_key | Unique |
| error_message | Optional |
| processed_at / created_at | |

## Layering reminder

- Field tables (`safety_devices`, history) = truth from inspections  
- `device_catalog` = normalized identity  
- `device_intelligence` / `vendor_options` = AI layer with confidence + freshness  
