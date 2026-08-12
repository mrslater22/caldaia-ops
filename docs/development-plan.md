# BoilerOps Intelligence Platform — Development Plan

**Owner:** Caldaia Controls  
**Repo:** `caldaia-ops`  
**Status:** POC in progress (onboarding ingest + admin); Sprint 0 still open  
**Last updated:** 2026-08-11

## 1. Vision

BoilerOps is the foundation of a multi-tenant SaaS platform for industrial boiler operations — not a FastField extension.

### Near-term goals

1. Receive inspection data from FastField into an operational database
2. Maintain a living inventory of plant safety devices
3. Store inspection reports and expose them through a client portal
4. Add support-ticket workflows
5. Enrich each device with AI-generated replacement intelligence
6. Lay groundwork for predictive maintenance, procurement intelligence, and operational analytics

### Long-term vision

Multi-tenant SaaS for industrial boiler operations, compliance, inventory intelligence, and replacement planning.

### Strategic split

| Layer | System | Role |
| --- | --- | --- |
| Field execution | FastField | Mobile forms, offline use, dispatch, report generation |
| System of record | BoilerOps | Plants, equipment, history, portal, tickets, AI, analytics |

Do **not** replace FastField in Phase 1. Keep it as the field collection layer; BoilerOps owns durable operational data.

## 2. Recommended stack

| Concern | Choice |
| --- | --- |
| Frontend | Next.js (App Router) + TypeScript + Tailwind |
| Portal hosting | Vercel |
| API | Next.js route handlers (light) + dedicated worker for jobs |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| File storage | Supabase Storage (not AWS S3) |
| Background jobs | BullMQ + Redis (Upstash or managed) |
| AI | OpenAI first, provider abstraction for Claude later |
| Monitoring | Sentry + structured logs + uptime |
| Email | Postmark or Resend |
| Ticketing | In-platform first; Zendesk/Freshdesk later optional |
| Search | Postgres full text first; OpenSearch only if needed |

**Why:** Modern SaaS shape, strong relational fit for plant/device/inspection graphs, durable documents in the same Supabase project (Postgres + Storage), durable job processing, and no AI vendor lock-in.

## 3. Platform modules

### Phase 1

- **FastField Integration Layer** — ingest, normalize, Postgres + Supabase Storage
- **Operational Data Core** — plants, clients, inspections, devices, findings, documents
- **Client Portal v1** — login, reports, inventory, tickets
- **AI Device Intelligence Worker** — normalize names, life expectancy, vendors, price/lead time, replacements

### Phase 2

- Caldaia internal inventory management
- Inspection assist / QR preload workflow

### Phase 3

- Predictive risk engine
- Procurement intelligence

## 4. Architecture (core flow)

```
Technician → FastField → webhook/direct-post → /api/fastfield/submissions
  → raw payload (immutable) → BullMQ jobs
  → map to domain → upsert Postgres
  → sync PDF/media → Supabase Storage
  → enqueue AI enrichment (new/changed devices)
  → Client Portal (reports, inventory, tickets)
  → Weekly refresh of device intelligence
```

### Service boundaries

| Service | Tech |
| --- | --- |
| Web app / portal | Next.js |
| API / ingestion | Next.js route handlers (initial) |
| Worker | Node.js + BullMQ |
| Database | Supabase Postgres |
| Blob storage | Supabase Storage |
| Queue | Redis |

Detailed diagrams and contracts: [architecture.md](./architecture.md), [api-contracts.md](./api-contracts.md).

## 5. Sprint 0 — FastField validation (blocker)

Public FastField capabilities (offline forms, dispatch, QR/barcode/NFC, caching, data tables, PDF/Word reports, webhooks, direct post, API, automation) are **not** the same as confirmed account behavior.

Validate before build:

- [ ] Exact webhook payload structure
- [ ] Auth model for API endpoints
- [ ] PDF retrieval via API vs workflow-only delivery
- [ ] Whether edits emit update events
- [ ] Document ID / submission ID exposure
- [ ] Dynamic prefill or dispatch token generation
- [ ] QR → form launch with parameters
- [ ] Programmatic refresh of cached data tables
- [ ] Rate limits and retry behavior
- [ ] Attachment download flow

**Deliverables:** integration matrix, field→DB mapping spec, data dictionary, tenant/role matrix.  
See [fastfield-integration.md](./fastfield-integration.md).

## 6. Multi-tenant access

- Caldaia Controls = platform operator tenant
- Each client organization = tenant
- Plants belong to a client tenant
- **RLS enforced in Supabase**

### Roles

**Internal:** `platform_admin`, `operations_manager`, `project_lead`, `field_technician`, `support_agent`, `inventory_manager`  
**Client:** `client_admin`, `plant_manager`, `read_only_viewer`

Clients see only their org’s plants, reports, tickets, and inventory. Internal roles see across tenants by permission.

## 7. MVP definition

**In MVP**

- FastField submission ingestion
- Normalized inspection + device storage
- Supabase Storage–backed report storage
- Client portal auth
- Reports browser/download
- Plant inventory browser
- Support tickets
- Initial AI device intelligence on a **limited** device class set (2–4 categories)

**Out of MVP**

- Full predictive maintenance engine
- Advanced procurement analytics
- Broad vendor automation across all device classes
- Full dispatch orchestration replacement inside BoilerOps

### Device intelligence MVP focus

Start with 2–4 of:

- Pressure safety valves
- Low water cutoffs
- Flame safeguard controls
- Pressure switches
- Temperature / limit controls
- Gas train safety components

Make catalog quality excellent before expanding.

## 8. Implementation roadmap

| Phase | Goals | Key deliverables |
| --- | --- | --- |
| **Sprint 0** | Validate FastField; taxonomy; stakeholder portal requirements | Integration matrix, mapping spec, data dictionary, role matrix |
| **Phase 1** | System of record | Schema, migrations, ingestion API, jobs, admin reconciliation |
| **Phase 2** | Client portal v1 | Auth, RLS, reports, inventory, tickets |
| **Phase 3** | AI device intelligence | Catalog, enrichment workers, review queue, portal recommendations |
| **Phase 4** | QR / technician assist | QR service, plant launch endpoint, prefill/dispatch workflow |
| **Phase 5** | Predictive + procurement | Scoring, stocking, EOL forecast, multi-site analytics |

### Cursor build order

1. Monorepo scaffold  
2. Postgres schema + migrations  
3. FastField ingestion endpoint  
4. Raw event logging + idempotency  
5. Submission→domain mapper  
6. Supabase Storage document storage  
7. Admin inspection review  
8. Portal auth + tenant access  
9. Reports list/detail  
10. Plant inventory pages  
11. Ticketing module  
12. Worker queue + job dashboard  
13. Device normalization pipeline  
14. AI enrichment pipeline  
15. Vendor options + replacement UI  
16. QR / prefill workflow  
17. Analytics + internal inventory planning  

Ready-to-run implementation prompts: [implementation-prompts.md](./implementation-prompts.md).

## 9. Engineering rules

1. Keep raw FastField payloads **immutable**
2. Keep field-collected data **separate** from AI-enriched data
3. Make every ingestion job **idempotent**
4. Add **nightly reconciliation** even if webhooks work
5. Use **public IDs** for QR and portal URLs (never internal numeric IDs)
6. Enforce tenant isolation at the **database** layer
7. Track document provenance and versioning
8. Store confidence and freshness for AI outputs
9. Human review queue for low-confidence catalog matches
10. Design every module for future multi-client SaaS expansion

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| FastField API differs from marketing | Sprint 0 matrix + polling fallback |
| Inconsistent manufacturer/model names | Normalization + review queue + aliases |
| AI hallucinated vendor/replacement data | Source-backed structured output + confidence + human approval |
| Portal document access security | Signed URLs + RLS + tenant isolation + audit logs |
| Device history corruption from re-imports | Idempotency keys + snapshots + append-only history |
| Portal sprawl too early | Keep v1 to reports, inventory, tickets |

## 11. Definition of success

**After Phases 1–2**

- Inspection data reaches BoilerOps automatically
- Every inspection report visible in the client portal
- Every plant has a living device inventory
- Clients self-serve reports and inventory
- Support requests tied to plants and devices
- Caldaia owns the historical data layer

**After Phase 3**

- Project leads see replacement options when a device fails
- Device data enriched weekly
- Caldaia can identify parts worth stocking
- BoilerOps becomes a differentiated intelligence platform

## 12. Related docs

| Doc | Purpose |
| --- | --- |
| [architecture.md](./architecture.md) | Flows, services, storage, QR strategy |
| [data-dictionary.md](./data-dictionary.md) | Entities and fields |
| [fastfield-integration.md](./fastfield-integration.md) | Ingestion options, Sprint 0 checklist |
| [api-contracts.md](./api-contracts.md) | Planned endpoints |
| [ai-device-intelligence.md](./ai-device-intelligence.md) | AI pipeline and guardrails |
| [portal-scope.md](./portal-scope.md) | Portal v1/v2 pages and workflows |
| [implementation-prompts.md](./implementation-prompts.md) | Cursor build prompts |
| [runbooks/README.md](./runbooks/README.md) | Operational runbooks (stub) |
