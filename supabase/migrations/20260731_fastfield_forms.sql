-- FastField form registry + field mapping for typed ingest

create table if not exists public.fastfield_forms (
  id uuid primary key default gen_random_uuid(),
  fastfield_form_id text not null unique,
  name text not null,
  purpose text not null default 'boiler_onboarding',
  -- raw form definition / field list from FastField (or manual paste)
  schema_json jsonb not null default '{}'::jsonb,
  -- maps FastField field keys -> BoilerOps domain paths
  -- e.g. { "facility_name": "Facility Name", "devices": "Safety Devices" }
  field_mappings_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  notes text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fastfield_forms_purpose_idx
  on public.fastfield_forms (purpose);

drop trigger if exists fastfield_forms_set_updated_at on public.fastfield_forms;
create trigger fastfield_forms_set_updated_at
  before update on public.fastfield_forms
  for each row execute function public.set_updated_at();

alter table public.fastfield_forms enable row level security;

create policy fastfield_forms_deny_all
  on public.fastfield_forms
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Link integration events to registered form when known
alter table public.integration_events
  add column if not exists fastfield_form_id text;

create index if not exists integration_events_fastfield_form_id_idx
  on public.integration_events (fastfield_form_id);
