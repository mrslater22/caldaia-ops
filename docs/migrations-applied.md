# Migrations applied

This file tracks which migrations have been applied to which environment.
It is a hand-kept record, separate from the Supabase CLI history table
(`supabase_migrations.schema_migrations`).

Migrations that predate this log are marked **unknown / not tracked here**.

| Migration | Environment | Applied at | Applied by | Method | Verification |
| --- | --- | --- | --- | --- | --- |
| Earlier migrations through `supabase/migrations/20260817_asset_model_rename.sql` | unknown / not tracked here | unknown / not tracked here | unknown / not tracked here | unknown / not tracked here | unknown / not tracked here |
| `supabase/migrations/20261123_site_visits.sql` | Caldaia production | 2026-11-23, about 9:31 AM ET (14:31 UTC) | Michael Slater | By hand in the Supabase SQL editor. No seed data was loaded. | Afterward, `pg_tables` showed `site_visits`, `site_visit_device_tests`, and `site_visit_reports`, each with `rowsecurity = true`. |

## Before the next production push

`20261123_site_visits.sql` was run by hand, so
`supabase_migrations.schema_migrations` probably does not record version
`20261123`. Before anyone runs `supabase db push` or migration up against
production, mark that version applied so it is not run twice:

```bash
supabase migration repair --status applied 20261123
```

That repair has not been run. This note only documents the step.
