-- Site onboarding domain model and FastField synchronization state.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_code text not null,
  facility_name text not null,
  address text,
  city text,
  state text,
  zip text,
  timezone text not null default 'America/New_York',
  contact_name text,
  contact_email text,
  contact_phone text,
  fastfield_source_site_id text,
  last_fastfield_submission_id text,
  qr_target_url text not null,
  qr_storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sites_site_code_format_check
    check (site_code ~ '^[A-Z0-9]{3,4}$'),
  constraint sites_organization_site_code_key
    unique (organization_id, site_code)
);

create unique index if not exists sites_organization_fastfield_source_site_id_key
  on public.sites (organization_id, fastfield_source_site_id)
  where fastfield_source_site_id is not null;

create index if not exists sites_organization_id_idx
  on public.sites (organization_id);

create table if not exists public.fastfield_site_sync (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null unique references public.sites (id) on delete cascade,
  data_table_id text,
  external_record_id text,
  payload_hash text,
  status text not null default 'pending',
  last_attempted_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fastfield_site_sync_status_check
    check (status in ('pending', 'synced', 'failed', 'disabled'))
);

alter table public.integration_events
  add column if not exists result_json jsonb;

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

drop trigger if exists fastfield_site_sync_set_updated_at on public.fastfield_site_sync;
create trigger fastfield_site_sync_set_updated_at
  before update on public.fastfield_site_sync
  for each row execute function public.set_updated_at();

alter table public.sites enable row level security;
alter table public.fastfield_site_sync enable row level security;

drop policy if exists sites_deny_all on public.sites;
create policy sites_deny_all
  on public.sites
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists fastfield_site_sync_deny_all on public.fastfield_site_sync;
create policy fastfield_site_sync_deny_all
  on public.fastfield_site_sync
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into public.fastfield_forms (
  fastfield_form_id,
  name,
  purpose,
  field_mappings_json,
  active,
  notes,
  last_synced_at
)
values (
  '1244818',
  'Site Onboarding',
  'site_onboarding',
  '{
    "facility_name": "va_loc",
    "site_code": "site_code",
    "source_site_id": "site_id",
    "contact_name": "va_contact",
    "contact_email": "va_contact_email",
    "contact_phone": "va_contact_phone",
    "boilerops_site_id": "bo_siteid"
  }'::jsonb,
  true,
  'Validated from Site Onboarding form version 10 sample captured 2026-08-13.',
  now()
)
on conflict (fastfield_form_id) do update
set
  name = excluded.name,
  purpose = excluded.purpose,
  field_mappings_json = excluded.field_mappings_json,
  active = excluded.active,
  notes = excluded.notes,
  last_synced_at = excluded.last_synced_at;
