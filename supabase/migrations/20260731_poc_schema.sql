-- BoilerOps POC schema
-- Run in Supabase SQL Editor (or via CLI migration).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizations (tenants)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'client',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Boilers (facility / plant units for POC)
-- QR: /i/boiler/{public_id}
-- ---------------------------------------------------------------------------
create table if not exists public.boilers (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  facility_name text not null,
  site_code text,
  boiler_tag text,
  manufacturer text,
  model text,
  serial_number text,
  address text,
  city text,
  state text,
  zip text,
  timezone text default 'America/New_York',
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  onboarded_at timestamptz,
  fastfield_submission_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boilers_organization_id_idx on public.boilers (organization_id);
create index if not exists boilers_fastfield_submission_id_idx on public.boilers (fastfield_submission_id);

-- ---------------------------------------------------------------------------
-- Devices identified during boiler onboarding
-- QR: /i/device/{public_id}
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  boiler_id uuid not null references public.boilers (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  equipment_group text,
  device_type text not null,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  set_point text,
  trip_point text,
  location_description text,
  service_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_boiler_id_idx on public.devices (boiler_id);
create index if not exists devices_organization_id_idx on public.devices (organization_id);
create index if not exists devices_device_type_idx on public.devices (device_type);

-- ---------------------------------------------------------------------------
-- Field tests (last test details for device prefill)
-- ---------------------------------------------------------------------------
create table if not exists public.device_tests (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  boiler_id uuid not null references public.boilers (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tested_at timestamptz not null default now(),
  technician_name text,
  result text,
  notes text,
  readings_json jsonb not null default '{}'::jsonb,
  fastfield_submission_id text,
  created_at timestamptz not null default now()
);

create index if not exists device_tests_device_id_tested_at_idx
  on public.device_tests (device_id, tested_at desc);

-- ---------------------------------------------------------------------------
-- Raw FastField events (immutable)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'fastfield',
  event_type text not null,
  external_id text,
  idempotency_key text not null unique,
  payload_json jsonb not null,
  status text not null default 'received',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists integration_events_status_idx on public.integration_events (status);
create index if not exists integration_events_external_id_idx on public.integration_events (external_id);

-- ---------------------------------------------------------------------------
-- Helpers: public_id generation
-- ---------------------------------------------------------------------------
create or replace function public.generate_public_id(prefix text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := prefix || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    if prefix = 'blr' and not exists (select 1 from public.boilers where public_id = candidate) then
      return candidate;
    end if;
    if prefix = 'dev' and not exists (select 1 from public.devices where public_id = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

drop trigger if exists boilers_set_updated_at on public.boilers;
create trigger boilers_set_updated_at
  before update on public.boilers
  for each row execute function public.set_updated_at();

drop trigger if exists devices_set_updated_at on public.devices;
create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (enabled; deny anon/authenticated — Next.js uses service role)
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.boilers enable row level security;
alter table public.devices enable row level security;
alter table public.device_tests enable row level security;
alter table public.integration_events enable row level security;

create policy organizations_deny_all
  on public.organizations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy boilers_deny_all
  on public.boilers
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy devices_deny_all
  on public.devices
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy device_tests_deny_all
  on public.device_tests
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy integration_events_deny_all
  on public.integration_events
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Seed a demo organization for POC (safe to re-run)
insert into public.organizations (id, name, type, status)
values (
  '00000000-0000-4000-8000-000000000001',
  'Caldaia Demo Client',
  'client',
  'active'
)
on conflict (id) do nothing;
