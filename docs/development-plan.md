# BoilerOps Intelligence Platform — Development Plan

**Owner:** Caldaia Controls  
**Repo:** `caldaia-ops`  
**Status:** Operational foundation in progress; inspection-job thin slice implemented and Sprint 0 validation still open
**Last updated:** 2026-08-15

## 1. Vision

BoilerOps is the foundation of a multi-tenant SaaS platform for industrial boiler operations — not a FastField extension.

### Near-term goals

1. Receive inspection data from FastField into an operational database
2. Maintain a living inventory of plant safety devices
3. Plan inspection jobs and generate field-technician job packets with QR codes
4. Store test results and observations at the physical-device level
5. Assemble Boiler and Plant submissions into one final client report package
6. Store inspection reports and expose them through a client portal
7. Add support-ticket workflows
8. Enrich each device with AI-generated replacement intelligence
9. Lay groundwork for predictive maintenance, procurement intelligence, and operational analytics

### Long-term vision

Multi-tenant SaaS for industrial boiler operations, compliance, inventory intelligence, and replacement planning.

### Strategic split

| Layer | System | Role |
| --- | --- | --- |
| Field execution | FastField | Blank mobile forms, offline use, QR scanning, test collection |
| System of record | BoilerOps | Sites, assets, inspection jobs, device history, final report packages, portal, tickets, AI, analytics |

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
- **Operational Data Core** — sites, inspectable Plant/Boiler targets, devices, inspection jobs, tests, findings, documents
- **Asset Onboarding + Administration** — Site, Inspection Target, and Device management with permanent QR codes
- **Inspection Job Planning** — job number, target/device/test scope, technician packet, job QR
- **Device-Level History** — append-only observations and test results across jobs
- **Report Package Builder** — combine multiple Boiler and Plant inspections into one versioned client report
- **Client Portal v1** — login, reports, inventory, tickets
- **AI Device Intelligence Worker** — normalize names, life expectancy, vendors, price/lead time, replacements

### Phase 2

- Caldaia internal inventory management
- Expanded inspection workflow automation and technician assistance

### Phase 3

- Predictive risk engine
- Procurement intelligence

## 4. Architecture (core flow)

```
Administrator → create inspection job → generate job_num + scoped job packet
  → Job QR + permanent Site / Plant / Boiler / Device QR codes
Technician → blank FastField form → scan Job QR → scan permanent asset QRs
  → FastField webhook/direct-post → /api/fastfield/submissions
  → raw payload (immutable) → BullMQ jobs
  → validate job/site/target/device scan chain
  → map tests and observations to physical devices → upsert Postgres
  → combine completed target inspections → versioned final report package
  → sync PDF/media → Supabase Storage
  → enqueue AI enrichment (new/changed devices)
  → Client Portal (reports, inventory, tickets)
  → Weekly refresh of device intelligence
```

### Inspection job and report-package workflow

1. An administrator creates an inspection job before the field visit.
2. BoilerOps generates the immutable job identity and human-readable
   `job_num`.
3. The administrator selects the Site, Plant and Boiler targets, required
   devices, and expected safety tests.
4. BoilerOps produces a job-summary document containing:
   - Job QR code
   - Permanent Site QR code
   - Permanent Plant and Boiler QR codes
   - Permanent Device QR codes grouped beneath their targets
5. The technician launches a blank FastField form and scans in this order:
   - Job QR
   - Site QR
   - Plant or Boiler target QR
   - Applicable Device QRs inside the test sections
6. FastField stores hidden BoilerOps IDs with the form and submits the completed
   target inspection.
7. BoilerOps verifies that every scanned entity belongs to the open job scope.
8. Device results are stored against the physical device and retained
   historically.
9. A typical medical-center package tracks approximately three Boiler
   inspections and one Plant inspection.
10. When all required inspections are complete, BoilerOps assembles one final
    report package, removing the current manual document-merging step.

Permanent asset QRs remain valid for the life of the asset. The Job QR is
specific to one inspection/report package and may be closed or expired.

### Implemented beyond-POC foundation

Migration `20260816_operational_workflow_foundation.sql` and the corresponding
admin workflow now provide:

- Atomic `YYYY-####` job-number allocation by organization and year
- Inspection jobs scoped to one Site and one or more Boiler/Plant targets
- Job QR generation, private storage, public lookup, and administration
- Versioned safety-test definitions and typed question metadata
- Structured test-level and device-level answers
- Append-only device observations and inspection certifications
- Versioned report-package records that can include multiple inspections

The current working slice stops before technician job-summary PDF generation,
FastField job-prefill validation, production inspection-form mapping, scope
validation during ingestion, and final PDF rendering.

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

Validate before production rollout:

- [x] Exact Site and Boiler Onboarding webhook payload structures
- [ ] Exact Plant, Device, Boiler Inspection, and Plant Inspection payload structures
- [ ] Auth model for API endpoints
- [ ] PDF retrieval via API vs workflow-only delivery
- [ ] Whether edits emit update events
- [ ] Document ID / submission ID exposure
- [ ] Blank-form QR scan → Data Table lookup → multi-field prefill
- [ ] Repeating-section behavior when multiple Device QRs are scanned
- [ ] Job QR prefill behavior and hidden BoilerOps ID persistence
- [ ] Programmatic Data Table row create/update/upsert API
- [ ] Programmatic refresh of cached Data Tables
- [ ] Rate limits and retry behavior
- [ ] Attachment download flow

**Deliverables:** integration matrix, field→DB mapping spec, data dictionary, tenant/role matrix.  
See [fastfield-integration.md](./fastfield-integration.md).

## 6. Multi-tenant access

- Caldaia Controls = platform operator tenant
- Each client organization = tenant
- Sites belong to a client tenant
- Inspectable Plant/Boiler targets and physical devices belong to Sites
- Inspection jobs and report packages are scoped to one Site and tenant
- **RLS enforced in Supabase**

### Roles

**Internal:** `platform_admin`, `operations_manager`, `project_lead`, `field_technician`, `support_agent`, `inventory_manager`  
**Client:** `client_admin`, `plant_manager`, `read_only_viewer`

Clients see only their organization’s Sites, assets, reports, tickets, and
inventory. Internal roles see across tenants by permission.

## 7. MVP definition

**In MVP**

- FastField submission ingestion
- Site, Plant/Boiler target, and Device onboarding
- Administrator-created inspection jobs and generated job numbers
- Job-summary document with Job and permanent asset QR codes
- Normalized inspection, test-section, and device-level result storage
- Historical observations for every physical safety device
- Validation of submitted IDs against the planned job scope
- Consolidated, versioned report package built from multiple target submissions
- Supabase Storage–backed report storage
- Client portal auth
- Reports browser/download
- Site and asset inventory browser
- Support tickets
- Initial AI device intelligence on a **limited** device class set (2–4 categories)

**Out of MVP**

- Full predictive maintenance engine
- Advanced procurement analytics
- Broad vendor automation across all device classes
- Replacement of FastField as the field-form platform

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
| **Sprint 0** | Validate FastField forms, QR/Data Table behavior, taxonomy, and account API | Integration matrix, captured payloads, mapping specs, role matrix |
| **Phase 1** | Asset system of record | Site/target/device schema, onboarding, permanent QRs, ingestion, admin management |
| **Phase 2** | Inspection jobs + reporting | Job planning, job QR, field packet, scan validation, device history, consolidated report builder |
| **Phase 3** | Client portal v1 | Auth, RLS, reports, inventory, tickets |
| **Phase 4** | AI device intelligence | Catalog, enrichment workers, review queue, portal recommendations |
| **Phase 5** | Predictive + procurement | Scoring, stocking, EOL forecast, multi-site analytics |

### Cursor build order

1. Monorepo scaffold
2. Postgres schema + migrations
3. FastField ingestion endpoint
4. Raw event logging + idempotency
5. Site onboarding + administration + permanent Site QR
6. Plant/Boiler inspection-target onboarding + permanent target QRs
7. Device onboarding + permanent Device QRs
8. FastField Site/Inspection/Device Data Table synchronization
9. Inspection-job schema + admin planning workflow
10. Job number + Job QR + technician job-summary document
11. Blank-form QR prefill workflow validation
12. Inspection/test/device-history mapper
13. Job completeness tracking + consolidated report builder
14. Supabase Storage document versioning
15. Admin inspection review and reconciliation
16. Portal auth + tenant access
17. Reports, inventory, and ticketing pages
18. Worker queue + job dashboard
19. Device normalization and AI enrichment
20. Vendor options, analytics, and inventory planning

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
11. Keep permanent asset QRs separate from inspection-specific Job QRs
12. Store stable BoilerOps IDs in hidden FastField fields
13. Reject or quarantine submissions whose Site, target, or Device IDs are not
    part of the referenced inspection job
14. Store device observations append-only; do not rebuild history from the
    current inventory record
15. Version generated job summaries and final report packages

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| FastField API differs from marketing | Sprint 0 matrix + polling fallback |
| Data Table POST creates duplicates | Require proven native upsert or find-by-BoilerOps-ID then update/create |
| Technician scans an asset outside the job | Validate every submitted ID against the inspection-job scope |
| One target form is missing from a report package | Track required targets/tests and block final generation until complete or explicitly waived |
| QR packet exposes unauthorized data | Use opaque public IDs, scoped Job QR access, expiration, and minimal prefill payloads |
| Inconsistent manufacturer/model names | Normalization + review queue + aliases |
| AI hallucinated vendor/replacement data | Source-backed structured output + confidence + human approval |
| Portal document access security | Signed URLs + RLS + tenant isolation + audit logs |
| Device history corruption from re-imports | Idempotency keys + snapshots + append-only history |
| Portal sprawl too early | Keep v1 to reports, inventory, tickets |

## 11. Definition of success

**After Phases 1–2**

- Inspection data reaches BoilerOps automatically
- Administrators create jobs and issue QR-based technician packets
- Boiler and Plant forms are validated against their planned job scope
- Device-level results and observations remain historically accessible
- Approximately three Boiler inspections and one Plant inspection can be
  assembled into one versioned client report without manual merging
- Every final inspection report package is visible in the client portal
- Every Site has a living target and device inventory
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
| [fastfield-submission-implementation-pattern.md](./fastfield-submission-implementation-pattern.md) | Repeatable form-ingestion implementation pattern |
| [api-contracts.md](./api-contracts.md) | Planned endpoints |
| [ai-device-intelligence.md](./ai-device-intelligence.md) | AI pipeline and guardrails |
| [portal-scope.md](./portal-scope.md) | Portal v1/v2 pages and workflows |
| [implementation-prompts.md](./implementation-prompts.md) | Cursor build prompts |
| [runbooks/README.md](./runbooks/README.md) | Operational runbooks (stub) |
