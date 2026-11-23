-- High Pressure device visits.
-- A visit is keyed by the FastField site visit ID. Each device submission
-- attaches one test. One report row per visit lists those tests.
--
-- This file was not applied to a shared, staging, or production database.
-- Review it and apply it yourself before the client test.

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  site_id uuid not null,
  external_visit_id text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_visits_site_organization_fkey
    foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete cascade,
  constraint site_visits_org_external_key
    unique (organization_id, external_visit_id),
  constraint site_visits_status_check
    check (status in ('open', 'report_ready'))
);

create unique index if not exists site_visits_id_site_organization_key
  on public.site_visits (id, site_id, organization_id);
create index if not exists site_visits_site_id_idx
  on public.site_visits (site_id, created_at desc);

create table if not exists public.site_visit_device_tests (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  site_visit_id uuid not null,
  organization_id uuid not null,
  site_id uuid not null,
  device_type text not null,
  asset_key text not null,
  inspection_target_id uuid not null,
  target_public_id text not null,
  fastfield_submission_id text not null,
  fastfield_form_id text,
  mapped_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_visit_device_tests_visit_scope_fkey
    foreign key (site_visit_id, site_id, organization_id)
    references public.site_visits (id, site_id, organization_id)
    on delete cascade,
  constraint site_visit_device_tests_target_scope_fkey
    foreign key (inspection_target_id, site_id, organization_id)
    references public.inspection_targets (id, site_id, organization_id),
  constraint site_visit_device_tests_submission_key
    unique (fastfield_submission_id),
  constraint site_visit_device_tests_asset_key
    unique (site_visit_id, device_type, asset_key),
  constraint site_visit_device_tests_type_check
    check (device_type in ('high_pressure', 'low_pressure'))
);

create index if not exists site_visit_device_tests_visit_id_idx
  on public.site_visit_device_tests (site_visit_id, created_at);

create table if not exists public.site_visit_reports (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  site_visit_id uuid not null,
  organization_id uuid not null,
  site_id uuid not null,
  status text not null default 'ready',
  device_test_count integer not null default 0,
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_visit_reports_visit_key
    unique (site_visit_id),
  constraint site_visit_reports_visit_scope_fkey
    foreign key (site_visit_id, site_id, organization_id)
    references public.site_visits (id, site_id, organization_id)
    on delete cascade,
  constraint site_visit_reports_status_check
    check (status = 'ready'),
  constraint site_visit_reports_count_check
    check (device_test_count >= 0)
);

create index if not exists site_visit_reports_site_id_idx
  on public.site_visit_reports (site_id, created_at desc);

drop trigger if exists site_visits_set_updated_at on public.site_visits;
create trigger site_visits_set_updated_at
  before update on public.site_visits
  for each row execute function public.set_updated_at();

drop trigger if exists site_visit_device_tests_set_updated_at
  on public.site_visit_device_tests;
create trigger site_visit_device_tests_set_updated_at
  before update on public.site_visit_device_tests
  for each row execute function public.set_updated_at();

drop trigger if exists site_visit_reports_set_updated_at
  on public.site_visit_reports;
create trigger site_visit_reports_set_updated_at
  before update on public.site_visit_reports
  for each row execute function public.set_updated_at();

alter table public.site_visits enable row level security;
alter table public.site_visit_device_tests enable row level security;
alter table public.site_visit_reports enable row level security;

drop policy if exists site_visits_deny_all on public.site_visits;
create policy site_visits_deny_all
  on public.site_visits
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists site_visit_device_tests_deny_all
  on public.site_visit_device_tests;
create policy site_visit_device_tests_deny_all
  on public.site_visit_device_tests
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists site_visit_reports_deny_all
  on public.site_visit_reports;
create policy site_visit_reports_deny_all
  on public.site_visit_reports
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.site_visits is
  'One field visit at a site, keyed by the FastField site visit ID.';
comment on column public.site_visits.external_visit_id is
  'The site visit ID from the device form. This is the value written back to the FastField site table.';
comment on table public.site_visit_device_tests is
  'One device-form submission attached to a site visit. Unique per submission and per visit, device type, and asset.';
comment on table public.site_visit_reports is
  'One ready report shell per visit. Lists the device tests. This is not a generated PDF report package.';
