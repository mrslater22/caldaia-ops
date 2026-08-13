-- Generalize outbound FastField Data Table synchronization.
-- This is intentionally additive because 20260813_site_onboarding.sql may
-- already be applied. The site-specific table remains available for rollback.

create table if not exists public.fastfield_data_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purpose text not null,
  name text not null,
  fastfield_table_id text,
  sync_url text,
  http_method text not null default 'POST',
  upsert_key text not null,
  field_mappings_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fastfield_data_tables_organization_purpose_key
    unique (organization_id, purpose),
  constraint fastfield_data_tables_http_method_check
    check (http_method in ('POST', 'PUT', 'PATCH'))
);

create table if not exists public.fastfield_sync_records (
  id uuid primary key default gen_random_uuid(),
  data_table_id uuid not null references public.fastfield_data_tables (id) on delete cascade,
  local_entity_type text not null,
  local_entity_id uuid not null,
  local_public_id text not null,
  external_record_id text,
  payload_hash text,
  status text not null default 'pending',
  last_attempted_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fastfield_sync_records_entity_key
    unique (data_table_id, local_entity_type, local_entity_id),
  constraint fastfield_sync_records_status_check
    check (status in ('pending', 'synced', 'failed', 'disabled'))
);

create index if not exists fastfield_sync_records_local_public_id_idx
  on public.fastfield_sync_records (local_entity_type, local_public_id);

drop trigger if exists fastfield_data_tables_set_updated_at
  on public.fastfield_data_tables;
create trigger fastfield_data_tables_set_updated_at
  before update on public.fastfield_data_tables
  for each row execute function public.set_updated_at();

drop trigger if exists fastfield_sync_records_set_updated_at
  on public.fastfield_sync_records;
create trigger fastfield_sync_records_set_updated_at
  before update on public.fastfield_sync_records
  for each row execute function public.set_updated_at();

alter table public.fastfield_data_tables enable row level security;
alter table public.fastfield_sync_records enable row level security;

drop policy if exists fastfield_data_tables_deny_all
  on public.fastfield_data_tables;
create policy fastfield_data_tables_deny_all
  on public.fastfield_data_tables
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists fastfield_sync_records_deny_all
  on public.fastfield_sync_records;
create policy fastfield_sync_records_deny_all
  on public.fastfield_sync_records
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into public.fastfield_data_tables (
  organization_id,
  purpose,
  name,
  upsert_key,
  field_mappings_json,
  active
)
values (
  '00000000-0000-4000-8000-000000000001',
  'site_info',
  'Site Info',
  'bo_siteid',
  '{
    "bo_siteid": "public_id",
    "bo_qrcode": "qr_target_url",
    "site_code": "site_code",
    "va_loc": "facility_name",
    "va_contact": "contact_name",
    "va_contact_email": "contact_email",
    "va_contact_phone": "contact_phone"
  }'::jsonb,
  true
)
on conflict (organization_id, purpose) do update
set
  name = excluded.name,
  upsert_key = excluded.upsert_key,
  field_mappings_json = excluded.field_mappings_json,
  active = excluded.active;

-- Preserve any FastField table ID already recorded by the site-specific sync.
update public.fastfield_data_tables as config
set fastfield_table_id = legacy.data_table_id
from (
  select data_table_id
  from public.fastfield_site_sync
  where data_table_id is not null
  order by updated_at desc
  limit 1
) as legacy
where config.organization_id = '00000000-0000-4000-8000-000000000001'
  and config.purpose = 'site_info'
  and config.fastfield_table_id is null;

-- Copy existing site sync state without deleting the rollback source.
insert into public.fastfield_sync_records (
  data_table_id,
  local_entity_type,
  local_entity_id,
  local_public_id,
  external_record_id,
  payload_hash,
  status,
  last_attempted_at,
  last_synced_at,
  error_message,
  created_at,
  updated_at
)
select
  config.id,
  'site',
  legacy.site_id,
  site.public_id,
  legacy.external_record_id,
  legacy.payload_hash,
  legacy.status,
  legacy.last_attempted_at,
  legacy.last_synced_at,
  legacy.error_message,
  legacy.created_at,
  legacy.updated_at
from public.fastfield_site_sync as legacy
join public.sites as site on site.id = legacy.site_id
join public.fastfield_data_tables as config
  on config.organization_id = site.organization_id
 and config.purpose = 'site_info'
on conflict (data_table_id, local_entity_type, local_entity_id) do update
set
  local_public_id = excluded.local_public_id,
  external_record_id = excluded.external_record_id,
  payload_hash = excluded.payload_hash,
  status = excluded.status,
  last_attempted_at = excluded.last_attempted_at,
  last_synced_at = excluded.last_synced_at,
  error_message = excluded.error_message,
  updated_at = excluded.updated_at;
