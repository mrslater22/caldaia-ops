# API Contracts (planned)

Contracts to implement across phases. Auth: Supabase session for portal; shared secret / signature for FastField; internal role checks for ops routes.

## Internal / ingestion

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/fastfield/submissions` | Receive webhook/direct-post; validate; log; queue |
| POST | `/api/fastfield/reconcile` | Trigger pull/reconciliation run |
| GET | `/api/internal/ingestion-events` | List/filter integration events |
| POST | `/api/internal/reprocess/:eventId` | Re-queue mapping without mutating raw payload |

### `POST /api/fastfield/submissions`

**Requirements**

- Validate shared secret / signature when available
- Persist immutable raw payload to `integration_events`
- Idempotent on FastField submission ID (+ event type if applicable)
- Enqueue `ingest_fastfield_submission`
- Return quickly (202/200) — heavy work in worker

## Portal

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/plants` | List plants for tenant |
| GET | `/api/plants/:id` | Plant detail (public or internal id strategy TBD; prefer public id) |
| GET | `/api/plants/:id/inspections` | Inspection history |
| GET | `/api/plants/:id/devices` | Current safety-device inventory |
| GET | `/api/inspections/:id` | Inspection detail |
| GET | `/api/inspections/:id/report` | Signed URL / download for report |
| GET | `/api/devices/:id` | Device detail |
| GET | `/api/devices/:id/recommendations` | AI recommendations + vendor options |
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Create ticket |
| POST | `/api/tickets/:id/messages` | Add message |

All portal routes enforce tenant isolation (RLS + app checks).

## Internal ops

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/internal/device-review-queue` | Low-confidence catalog matches |
| POST | `/api/internal/device-review-queue/:id/approve` | Approve/override match |
| GET | `/api/internal/inventory-recommendations` | Stocking candidates |

## Phase 4 (planned)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/i/plant/{plant_public_id}` | QR launch resolver → FastField prefill/dispatch |

## Error / security conventions

- Never leak cross-tenant data in error messages
- Document downloads via short-lived Supabase Storage signed URLs
- Audit access to sensitive documents where practical
- Rate-limit ingestion and ticket creation
