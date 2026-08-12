# Architecture

## Product architecture principle

```
FastField  →  field execution (forms, offline, dispatch, PDF generation)
BoilerOps  →  system of record + portal + tickets + AI intelligence
```

BoilerOps must not depend on FastField as the long-term document or inventory store of record.

## Core data flow

1. Field technician completes inspection in FastField.
2. FastField sends submission data to BoilerOps ingestion (`POST /api/fastfield/submissions`).
3. Ingestion validates auth/signature and stores the **raw** payload in `integration_events`.
4. A BullMQ job transforms the payload into domain entities.
5. PDF report and media are copied to Supabase Storage; metadata written to `documents`.
6. Structured data is upserted into Postgres (inspections, findings, devices, history).
7. New/changed devices enqueue AI enrichment jobs.
8. Portal exposes reports, inventory, and tickets to clients.
9. Weekly workers refresh device intelligence and vendor options.
10. Nightly reconciliation polls FastField to correct drift (even when webhooks work).

## Recommended service boundaries

| Boundary | Responsibility | Runtime |
| --- | --- | --- |
| `apps/portal` | Client + internal UI, light API routes | Next.js on Vercel |
| `apps/worker` | Background jobs (ingest map, Storage sync, AI) | Node.js + BullMQ |
| `packages/db` | Schema, migrations, typed queries | Shared |
| `packages/fastfield` | Clients, validators, mappers | Shared |
| `packages/ai` | Provider abstraction, prompts, tools | Shared |
| `packages/core` | Domain services | Shared |
| `packages/documents` | Supabase Storage helpers, checksums, signed URLs | Shared |
| `packages/auth` | Auth + RBAC helpers | Shared |
| `packages/ui` | Shared UI components | Shared |
| `packages/observability` | Logging, tracing, Sentry | Shared |

## Repository structure

```
boilerops/
  apps/
    portal/                 # Next.js app
    worker/                 # BullMQ worker service
  packages/
    db/
    ui/
    fastfield/
    ai/
    core/
    documents/
    auth/
    observability/
  infrastructure/
    docker/
    terraform/
  docs/
    architecture.md
    fastfield-integration.md
    data-dictionary.md
    api-contracts.md
    runbooks/
  .env.example
  pnpm-workspace.yaml
  turbo.json
```

## Storage design

### Postgres (Supabase)

Authoritative structured data: orgs, plants, inspections, devices, tickets, catalog, AI outputs, integration events.

### Supabase Storage

Durable blobs: inspection PDFs, attachments, ticket attachments. Metadata and provenance live in `documents` (Postgres). Use private buckets and short-lived signed URLs for portal downloads.

POC implication: no AWS S3 credentials; service-role uploads to a `reports` (or similar) bucket in the same Supabase project.

Every report should carry:

- `organization_id`, `plant_id`, `inspection_id`
- `inspection_type`, `inspection_date`, `version`
- `source_system`, `checksum`, `uploaded_at`

### Why not FastField-only documents

- Portal must not depend on third-party availability
- Controlled access and normalized metadata
- Easier future migrations
- Lifecycle rules, backups, analytics pipelines

## Ingestion design (dual mode)

### Option A — Event-driven (preferred)

Webhooks / direct-post → ingestion API → queue → transform → Supabase Storage + Postgres.

### Option B — Scheduled pull (fallback + always-on reconciliation)

Poll every ~15 minutes for new/updated submissions; store sync cursor; pull details/docs; upsert.

**Rule:** Implement the pipeline so both push and pull feed the same idempotent transform path. Nightly reconciliation is mandatory.

## Idempotency and immutability

- Raw payloads in `integration_events` are append-only / immutable.
- Reprocessing clones or references the same raw event; it does not mutate it.
- Domain upserts key on FastField submission IDs + stable device keys.
- `safety_device_history` is append-only snapshots — never rewrite history rows for “corrections”; add new snapshots.

## AI data layering (critical)

Keep three layers separate:

1. **Field-collected truth** — what technicians recorded
2. **Normalized catalog mapping** — canonical manufacturer/model identity
3. **AI-enriched recommendations** — life expectancy, vendors, pricing, stocking

AI must never overwrite audited field data.

## QR / prefill (Phase 4)

QR encodes a stable BoilerOps public URL, e.g.:

`https://portal.caldaiacontrols.com/i/plant/{plant_public_id}`

Flow:

1. Scan QR → resolve plant
2. Load latest approved inspection context + current inventory
3. Redirect into FastField launch (prefill params) **or** dispatch task with prior data
4. Form opens with known device details filled

**Rule:** Ship only after inventory normalization is trustworthy. Prefer dispatch fallback if dynamic prefill is limited.

## Observability

- Sentry for errors
- Structured logs with `organization_id`, `plant_id`, `submission_id`, `job_id`
- Uptime checks on ingestion and portal
- Job dashboard for queue depth, failures, retries

## Environment scaffolding (planned)

Supabase URL/keys (including Storage), Redis URL, OpenAI (and future Claude) keys, FastField credentials/webhook secret, Postmark/Resend, Sentry DSN.
