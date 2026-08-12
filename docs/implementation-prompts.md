# Implementation Prompts (Cursor)

Use these prompts after Sprint 0 validation is underway or complete enough to scaffold safely. Prefer sequential execution.

---

## Prompt 1 — Monorepo + ingestion foundation

```
Build the initial BoilerOps monorepo for Caldaia Controls.

Requirements:
- Next.js App Router frontend in `apps/boilerops`
- Node worker service in `apps/worker`
- Shared packages for db, fastfield, ai, auth, core, documents, ui
- Supabase Postgres schema with migrations for organizations, plants, technicians, inspections, inspection_findings, safety_devices, safety_device_history, documents, tickets, ticket_messages, portal_users, device_catalog, device_intelligence, vendor_options, caldaia_inventory, compatible_replacements, integration_events
- Create `/api/fastfield/submissions` endpoint with request logging, idempotency handling, and queue handoff
- Create BullMQ jobs for `ingest_fastfield_submission`, `map_submission_to_domain`, and `sync_report_document`
- Add environment variable scaffolding for Supabase (Postgres + Storage), Redis, OpenAI, FastField credentials
- Add architecture docs and README
- Use TypeScript throughout
- Use clean domain-driven folder structure
- Include basic test coverage for ingestion validation and mapping pipeline
```

Follow the Cursor build order in [development-plan.md](./development-plan.md) for sequencing after scaffold.

---

## Prompt 2 — Client portal MVP

```
Implement the BoilerOps client portal MVP.

Requirements:
- Supabase Auth
- multi-tenant access with row-level security
- pages for dashboard, plants, plant detail, reports, report detail, tickets, ticket detail
- report downloads backed by Supabase Storage signed URLs
- device inventory list for each plant
- internal admin view for ingestion event status and reprocessing
- Tailwind UI with a professional industrial SaaS design
- reusable table and detail components
- server-side data fetching where appropriate
```

Reference [portal-scope.md](./portal-scope.md) and [api-contracts.md](./api-contracts.md).

---

## Prompt 3 — AI device intelligence pipeline

```
Implement the BoilerOps AI device intelligence pipeline.

Requirements:
- normalize raw safety device manufacturer/model names into canonical catalog identities
- create a device catalog matching service with confidence scoring
- add a review queue for low-confidence matches
- add a weekly BullMQ refresh job for device intelligence and vendor options
- store structured outputs for life expectancy range, replacement guidance, vendor options, estimated cost, estimated lead time, and source notes
- never overwrite field-collected truth data
- expose recommendations on the device detail page
- include audit fields for freshness, confidence, and reviewer override
```

Reference [ai-device-intelligence.md](./ai-device-intelligence.md). Start with 2–4 device categories only.

---

## After these prompts

1. Phase 4: QR / prefill (only after inventory quality is solid)  
2. Phase 5: predictive risk + procurement intelligence  
