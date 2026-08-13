-- Canonical inspectable-target model.
-- Boiler and Plant are target types; inspections are historical events.

create unique index if not exists sites_id_organization_id_key
  on public.sites (id, organization_id);

create table if not exists public.inspection_targets (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  target_type text not null,
  target_code text not null,
  display_name text not null,
  location_description text,
  service_status text not null default 'active',
  legacy_boiler_id uuid unique references public.boilers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_targets_type_check
    check (target_type in ('boiler', 'plant')),
  constraint inspection_targets_code_format_check
    check (target_code ~ '^[A-Z0-9]{2,8}$'),
  constraint inspection_targets_service_status_check
    check (service_status in ('active', 'inactive', 'retired')),
  constraint inspection_targets_site_organization_fkey
    foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete cascade,
  constraint inspection_targets_site_code_key
    unique (site_id, target_code)
);

create unique index if not exists inspection_targets_id_organization_id_key
  on public.inspection_targets (id, organization_id);
create unique index if not exists inspection_targets_id_site_organization_key
  on public.inspection_targets (id, site_id, organization_id);
create index if not exists inspection_targets_organization_id_idx
  on public.inspection_targets (organization_id);
create index if not exists inspection_targets_site_id_idx
  on public.inspection_targets (site_id);
create index if not exists inspection_targets_type_idx
  on public.inspection_targets (target_type);

create table if not exists public.boiler_target_details (
  inspection_target_id uuid primary key
    references public.inspection_targets (id) on delete cascade,
  boiler_number text,
  manufacturer text,
  model text,
  serial_number text,
  manufacture_date date,
  boiler_type text,
  mawp numeric,
  operating_pressure numeric,
  design_pressure numeric,
  capacity numeric,
  fireside_volume numeric,
  control_manufacturer text,
  control_model text,
  control_manufacture_date date,
  burner_manufacturer text,
  burner_model text,
  burner_manufacture_date date,
  burner_fuels text,
  attributes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plant_target_details (
  inspection_target_id uuid primary key
    references public.inspection_targets (id) on delete cascade,
  plant_name text,
  building text,
  room text,
  notes text,
  attributes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.safety_devices (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  inspection_target_id uuid not null,
  device_code text not null,
  device_type text not null,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  set_point text,
  trip_point text,
  location_description text,
  service_status text not null default 'active',
  legacy_device_id uuid unique references public.devices (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint safety_devices_code_format_check
    check (device_code ~ '^[A-Z0-9]{2,8}$'),
  constraint safety_devices_service_status_check
    check (service_status in ('active', 'inactive', 'replaced', 'retired')),
  constraint safety_devices_target_organization_fkey
    foreign key (inspection_target_id, organization_id)
    references public.inspection_targets (id, organization_id)
    on delete cascade,
  constraint safety_devices_target_code_key
    unique (inspection_target_id, device_code)
);

create index if not exists safety_devices_organization_id_idx
  on public.safety_devices (organization_id);
create index if not exists safety_devices_target_id_idx
  on public.safety_devices (inspection_target_id);
create index if not exists safety_devices_type_idx
  on public.safety_devices (device_type);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  inspection_target_id uuid not null,
  inspection_type text not null,
  inspection_date date not null,
  status text not null default 'submitted',
  started_at timestamptz,
  completed_at timestamptz,
  fastfield_submission_id text,
  fastfield_form_id text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_target_site_organization_fkey
    foreign key (inspection_target_id, site_id, organization_id)
    references public.inspection_targets (id, site_id, organization_id)
    on delete cascade,
  constraint inspections_status_check
    check (status in ('draft', 'submitted', 'processed', 'failed', 'void'))
);

create unique index if not exists inspections_fastfield_submission_id_key
  on public.inspections (fastfield_submission_id)
  where fastfield_submission_id is not null;
create index if not exists inspections_target_date_idx
  on public.inspections (inspection_target_id, inspection_date desc);
create index if not exists inspections_site_date_idx
  on public.inspections (site_id, inspection_date desc);

create table if not exists public.safety_test_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  report_section_name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_tests (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  test_definition_id uuid not null
    references public.safety_test_definitions (id),
  status text not null default 'not_recorded',
  result text,
  procedure_reference text,
  diagram_reference text,
  notes text,
  readings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspection_tests_inspection_definition_key
    unique (inspection_id, test_definition_id),
  constraint inspection_tests_status_check
    check (status in ('not_recorded', 'not_applicable', 'in_progress', 'completed'))
);

create index if not exists inspection_tests_inspection_id_idx
  on public.inspection_tests (inspection_id);

create table if not exists public.inspection_test_devices (
  inspection_test_id uuid not null
    references public.inspection_tests (id) on delete cascade,
  safety_device_id uuid not null
    references public.safety_devices (id),
  device_role_code text,
  result text,
  notes text,
  readings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (inspection_test_id, safety_device_id)
);

create index if not exists inspection_test_devices_device_id_idx
  on public.inspection_test_devices (safety_device_id);

create or replace function public.enforce_inspection_target_subtype()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actual_type text;
begin
  select target_type
  into actual_type
  from public.inspection_targets
  where id = new.inspection_target_id;

  if actual_type is distinct from tg_argv[0] then
    raise exception 'Inspection target % must have target_type %',
      new.inspection_target_id, tg_argv[0];
  end if;

  return new;
end;
$$;

drop trigger if exists boiler_target_details_enforce_type
  on public.boiler_target_details;
create trigger boiler_target_details_enforce_type
  before insert or update on public.boiler_target_details
  for each row execute function public.enforce_inspection_target_subtype('boiler');

drop trigger if exists plant_target_details_enforce_type
  on public.plant_target_details;
create trigger plant_target_details_enforce_type
  before insert or update on public.plant_target_details
  for each row execute function public.enforce_inspection_target_subtype('plant');

create or replace function public.enforce_inspection_test_device_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  test_target_id uuid;
  device_target_id uuid;
begin
  select inspection.inspection_target_id
  into test_target_id
  from public.inspection_tests as test
  join public.inspections as inspection on inspection.id = test.inspection_id
  where test.id = new.inspection_test_id;

  select inspection_target_id
  into device_target_id
  from public.safety_devices
  where id = new.safety_device_id;

  if test_target_id is distinct from device_target_id then
    raise exception 'Safety device % does not belong to inspection target %',
      new.safety_device_id, test_target_id;
  end if;

  return new;
end;
$$;

drop trigger if exists inspection_test_devices_enforce_target
  on public.inspection_test_devices;
create trigger inspection_test_devices_enforce_target
  before insert or update on public.inspection_test_devices
  for each row execute function public.enforce_inspection_test_device_target();

drop trigger if exists inspection_targets_set_updated_at
  on public.inspection_targets;
create trigger inspection_targets_set_updated_at
  before update on public.inspection_targets
  for each row execute function public.set_updated_at();

drop trigger if exists boiler_target_details_set_updated_at
  on public.boiler_target_details;
create trigger boiler_target_details_set_updated_at
  before update on public.boiler_target_details
  for each row execute function public.set_updated_at();

drop trigger if exists plant_target_details_set_updated_at
  on public.plant_target_details;
create trigger plant_target_details_set_updated_at
  before update on public.plant_target_details
  for each row execute function public.set_updated_at();

drop trigger if exists safety_devices_set_updated_at
  on public.safety_devices;
create trigger safety_devices_set_updated_at
  before update on public.safety_devices
  for each row execute function public.set_updated_at();

drop trigger if exists inspections_set_updated_at
  on public.inspections;
create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

drop trigger if exists safety_test_definitions_set_updated_at
  on public.safety_test_definitions;
create trigger safety_test_definitions_set_updated_at
  before update on public.safety_test_definitions
  for each row execute function public.set_updated_at();

drop trigger if exists inspection_tests_set_updated_at
  on public.inspection_tests;
create trigger inspection_tests_set_updated_at
  before update on public.inspection_tests
  for each row execute function public.set_updated_at();

alter table public.inspection_targets enable row level security;
alter table public.boiler_target_details enable row level security;
alter table public.plant_target_details enable row level security;
alter table public.safety_devices enable row level security;
alter table public.inspections enable row level security;
alter table public.safety_test_definitions enable row level security;
alter table public.inspection_tests enable row level security;
alter table public.inspection_test_devices enable row level security;

drop policy if exists inspection_targets_deny_all on public.inspection_targets;
create policy inspection_targets_deny_all
  on public.inspection_targets for all to anon, authenticated
  using (false) with check (false);

drop policy if exists boiler_target_details_deny_all on public.boiler_target_details;
create policy boiler_target_details_deny_all
  on public.boiler_target_details for all to anon, authenticated
  using (false) with check (false);

drop policy if exists plant_target_details_deny_all on public.plant_target_details;
create policy plant_target_details_deny_all
  on public.plant_target_details for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_devices_deny_all on public.safety_devices;
create policy safety_devices_deny_all
  on public.safety_devices for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspections_deny_all on public.inspections;
create policy inspections_deny_all
  on public.inspections for all to anon, authenticated
  using (false) with check (false);

drop policy if exists safety_test_definitions_deny_all
  on public.safety_test_definitions;
create policy safety_test_definitions_deny_all
  on public.safety_test_definitions for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_tests_deny_all on public.inspection_tests;
create policy inspection_tests_deny_all
  on public.inspection_tests for all to anon, authenticated
  using (false) with check (false);

drop policy if exists inspection_test_devices_deny_all
  on public.inspection_test_devices;
create policy inspection_test_devices_deny_all
  on public.inspection_test_devices for all to anon, authenticated
  using (false) with check (false);

-- FastField table 2: one flattened row per inspectable Boiler or Plant target.
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
  'inspection_info',
  'Inspection Info',
  'bo_targetid',
  '{
    "bo_targetid": "public_id",
    "bo_siteid": "site.public_id",
    "inspection_scope": "target_type",
    "inspection_code": "target_code",
    "inspection_name": "display_name",
    "location_description": "location_description"
  }'::jsonb,
  true
)
on conflict (organization_id, purpose) do update
set
  name = excluded.name,
  upsert_key = excluded.upsert_key,
  field_mappings_json = excluded.field_mappings_json,
  active = excluded.active;

-- FastField table 3: one flattened row per physical safety device.
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
  'device_info',
  'Device Info',
  'bo_deviceid',
  '{
    "bo_deviceid": "public_id",
    "bo_targetid": "inspection_target.public_id",
    "bo_siteid": "inspection_target.site.public_id",
    "device_code": "device_code",
    "device_type": "device_type",
    "manufacturer": "manufacturer",
    "model": "model",
    "serial_number": "serial_number"
  }'::jsonb,
  true
)
on conflict (organization_id, purpose) do update
set
  name = excluded.name,
  upsert_key = excluded.upsert_key,
  field_mappings_json = excluded.field_mappings_json,
  active = excluded.active;
