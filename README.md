# Caldaia Ops / BoilerOps

BoilerOps Intelligence Platform for **Caldaia Controls** — system of record, client portal, and AI device intelligence on top of FastField field inspections.

## Status

Planning docs are in place. **POC portal scaffold** lives in `apps/portal` with super admin login.

From the repo root:

```bash
npm install --prefix apps/portal
npm run dev
```

Or from the app folder:

```bash
cd apps/portal
npm install
npm run dev
```

Sign in with credentials from `apps/portal/.env.local`.

## Docs

Start here: **[docs/development-plan.md](./docs/development-plan.md)**

| Doc | Description |
| --- | --- |
| [Development plan](./docs/development-plan.md) | Vision, stack, roadmap, MVP, risks |
| [Architecture](./docs/architecture.md) | Flows, services, storage, QR strategy |
| [FastField integration](./docs/fastfield-integration.md) | Ingestion + Sprint 0 checklist |
| [Data dictionary](./docs/data-dictionary.md) | Domain entities |
| [API contracts](./docs/api-contracts.md) | Planned endpoints |
| [AI device intelligence](./docs/ai-device-intelligence.md) | Enrichment pipeline |
| [Portal scope](./docs/portal-scope.md) | Portal + tickets |
| [Implementation prompts](./docs/implementation-prompts.md) | Cursor build prompts |

## Strategy in one line

**FastField** for field execution + **BoilerOps** for system of record, portal, and intelligence + **AI workers** for enrichment and future predictive insights.

## Next step

Complete Sprint 0 validation in [docs/fastfield-integration.md](./docs/fastfield-integration.md), then run Prompt 1 from [docs/implementation-prompts.md](./docs/implementation-prompts.md).
