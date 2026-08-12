# Runbooks

Operational runbooks will live here as the platform comes online.

## Planned runbooks

| Runbook | Status |
| --- | --- |
| FastField webhook failure / replay | Stub |
| Reprocess `integration_events` | Stub |
| Nightly reconciliation failure | Stub |
| Supabase Storage signed URL / document access issues | Stub |
| BullMQ stuck jobs / DLQ | Stub |
| AI refresh job failure | Stub |
| Tenant onboarding | Stub |

## Immediate ops notes

- Prefer `POST /api/internal/reprocess/:eventId` over mutating raw payloads
- Always investigate FastField vs BoilerOps drift via reconciliation before “fixing” domain rows by hand
- Document downloads must use signed URLs — never public bucket ACLs for client reports
