# FastField Integration

## Strategy

Keep FastField for field collection. BoilerOps becomes the system of record.

Public product signals (offline forms, dispatch, QR/barcode/NFC, local cache/autofill, data tables, custom PDF/Word reports, webhooks, direct post, API, workflow automation) inform the design — but **account-level behavior must be validated in Sprint 0**.

## Preferred path: event-driven ingestion

```
FastField completion
  → webhook / direct-post
  → POST /api/fastfield/submissions
  → validate shared secret / signature
  → store raw payload in integration_events
  → queue ingest_fastfield_submission
  → map_submission_to_domain
  → sync_report_document (Supabase Storage)
  → optional AI jobs for new/changed devices
```

### Why preferred

- Near real-time portal updates
- Better for alerting and failed-device workflows
- Cleaner automation surface

## Fallback + safety net: scheduled pull

If webhook coverage is incomplete, or always as reconciliation:

1. Poll every 15 minutes for new/updated submissions
2. Persist sync cursor
3. Pull details and documents
4. Upsert through the **same** mapping pipeline
5. Run nightly full reconciliation to reduce drift

## Job types (ingestion-related)

| Job | Purpose |
| --- | --- |
| `ingest_fastfield_submission` | Accept event, persist raw, kick mapping |
| `map_submission_to_domain` | Map to inspection, findings, devices, history |
| `extract_devices_from_submission` | Device upsert + change detection |
| `sync_report_document` | Fetch/copy PDF + attachments to Supabase Storage |
| (reconciliation) | Cursor-based pull / nightly drift correction |

## Mapping targets

Each validated submission should produce or update:

- `inspections` (keyed by `fastfield_submission_id`)
- `inspection_findings`
- `safety_devices` (current inventory upsert)
- `safety_device_history` (append snapshot)
- `documents` metadata + Supabase Storage objects
- `technicians` (if user identity present)

## Sprint 0 validation matrix

Treat each item as pass / fail / workaround before Phase 1 coding of mappers.

| Capability | Question | Status | Notes / workaround |
| --- | --- | --- | --- |
| Webhook payload | Exact JSON shape for completed submissions? | TBD | |
| Auth | Signature, shared secret, IP allowlist, OAuth? | TBD | |
| Report PDFs | Retrievable via API, or only workflow delivery? | TBD | |
| Updates | Do submission edits emit new events? | TBD | |
| IDs | How are document IDs and submission IDs exposed? | TBD | |
| Prefill | Can external prefill / dispatch tokens be generated dynamically? | TBD | |
| QR launch | Can QR scanning launch a form instance with parameters? | TBD | |
| Data tables | Can cached tables be refreshed programmatically? | TBD | |
| Limits | Rate limits and recommended retry behavior? | TBD | |
| Attachments | Download auth flow and URL lifetime? | TBD | |

## Sprint 0 deliverables

1. **FastField integration matrix** (table above, filled)
2. **Field-to-database mapping spec** (form fields → columns)
3. **Data dictionary** alignment with real form taxonomy
4. **Tenant/role matrix** for portal access

## Design rules

- Raw payloads are immutable once stored
- Ingestion is idempotent on FastField submission ID (+ event type if updates exist)
- Push and pull share one transform path
- Nightly reconciliation is not optional
- Do not block Phase 1 portal work on QR/prefill; that is Phase 4

## Inventory of current forms (to complete)

Document during Sprint 0:

- Form names / FastField form IDs
- Inspection types
- Report templates
- Device tables / repeating sections
- Required vs optional fields
- Known data quality issues (manufacturer spelling variance, etc.)
