# Caldaia Ops / BoilerOps

BoilerOps Intelligence Platform for **Caldaia Controls** — system of record, client portal, and AI device intelligence on top of FastField field inspections.

Planned production URL: **https://boilerops.caldaiacontrols.com**

## Status

Planning docs are in place. The Next.js app lives in `apps/boilerops` with super admin login.

From the repo root:

```bash
npm install
npm run dev
```

Or from the app folder:

```bash
cd apps/boilerops
npm install
npm run dev
```

Sign in with credentials from `apps/boilerops/.env.local`.

## Vercel

Set this in the **Vercel dashboard** (not in `vercel.json` — `rootDirectory` is not a valid config key):

1. **Settings → General → Root Directory** = `apps/boilerops`
2. **Settings → Build & Development**
   - Framework: Next.js
   - Build Command: default (`npm run build` / `next build`) — do not override
   - Output Directory: leave default (do **not** set `.next` or `apps/boilerops/.next`)

Required env vars in Vercel (same as `apps/boilerops/.env.example`): `AUTH_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_QR_BUCKET`.

When the subdomain is ready, set `NEXT_PUBLIC_APP_URL=https://boilerops.caldaiacontrols.com` in Vercel and attach the domain to the project.

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
